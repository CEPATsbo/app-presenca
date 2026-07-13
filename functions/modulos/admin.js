const { onCall, HttpsError, onRequest } = require("firebase-functions/v2/https");
const { onDocumentWritten, onDocumentCreated } = require("firebase-functions/v2/firestore");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const admin = require("firebase-admin");
const webpush = require("web-push");
const cors = require("cors")({ origin: true });
const sharp = require('sharp');
const bwipjs = require('bwip-js');

const db = admin.firestore();
const storage = admin.storage();
const REGIAO = 'southamerica-east1';
const OPCOES_FUNCAO = { region: REGIAO };
const OPCOES_FUNCAO_SAOPAULO = { region: REGIAO, timeZone: 'America/Sao_Paulo' };

// --- FUNÇÕES AUXILIARES ---
function configurarWebPush() {
    try {
        const publicKey = process.env.VAPID_PUBLIC_KEY;
        const privateKey = process.env.VAPID_PRIVATE_KEY;
        if (publicKey && privateKey) {
            webpush.setVapidDetails("mailto:cepaulodetarso.sbo@gmail.com", publicKey, privateKey);
            return true;
        }
        return false;
    } catch (error) { return false; }
}

async function enviarNotificacoesParaTodos(titulo, corpo) {
    if (!configurarWebPush()) return { successCount: 0, failureCount: 0, totalCount: 0 };
    const inscricoesSnapshot = await db.collection('inscricoes').get();
    if (inscricoesSnapshot.empty) return { successCount: 0, totalCount: 0, failureCount: 0 };
    const payload = JSON.stringify({ title: titulo, body: corpo });
    let successCount = 0; let failureCount = 0;
    const sendPromises = inscricoesSnapshot.docs.map(doc => {
        return webpush.sendNotification(doc.data(), payload)
            .then(() => { successCount++; })
            .catch(error => {
                failureCount++;
                if (error.statusCode === 410 || error.statusCode === 404) return doc.ref.delete();
            });
    });
    await Promise.all(sendPromises);
    return { successCount, failureCount, totalCount: inscricoesSnapshot.size };
}

// LÓGICA ATUALIZADA PARA MÚLTIPLOS CARGOS (ARRAY)
const gerenciarPapel = async (uid, novoPapel, acao) => {
    if (!uid) throw new HttpsError('invalid-argument', 'UID não fornecido.');
    
    // 1. Busca os claims atuais do usuário no Auth
    const userRecord = await admin.auth().getUser(uid);
    let claims = userRecord.customClaims || {};
    
    // 2. Lê a lista atual (e converte do formato antigo, se necessário)
    let roles = claims.roles || (claims.role ? [claims.role] : []);
    
    // 3. Adiciona ou remove da lista
    if (acao === 'adicionar') {
        if (!roles.includes(novoPapel)) roles.push(novoPapel);
        
        // MANTÉM AS FLAGS DO MÓDULO EDUCACIONAL INTACTAS
        if (['dirigente-escola', 'secretario-escola', 'facilitador'].includes(novoPapel)) {
            claims[novoPapel.replace('-', '_')] = true;
            if (['dirigente-escola', 'secretario-escola'].includes(novoPapel)) claims['facilitador'] = true;
        }
    } else if (acao === 'remover') {
        roles = roles.filter(r => r !== novoPapel);
        
        /// REMOVE AS FLAGS DO MÓDULO EDUCACIONAL COM SEGURANÇA
        if (['dirigente-escola', 'secretario-escola', 'facilitador'].includes(novoPapel)) {
            delete claims[novoPapel.replace('-', '_')];
            
            // Se perdeu o cargo principal da escola, checamos se ele ainda tem o outro antes de tirar o acesso de facilitador
            if (['dirigente-escola', 'secretario-escola'].includes(novoPapel)) {
                const aindaEDirigente = roles.includes('dirigente-escola');
                const aindaESecretario = roles.includes('secretario-escola');
                
                if (!aindaEDirigente && !aindaESecretario) {
                    delete claims['facilitador'];
                    roles = roles.filter(r => r !== 'facilitador');
                }
            }
        }
    }
    
    // 4. Limpa a string legada e salva a nova lista
    delete claims.role;
    claims.roles = roles;
    
    await admin.auth().setCustomUserClaims(uid, claims);
    
    // 5. Sincroniza no Firestore usando ArrayUnion ou ArrayRemove
    const userQuery = await db.collection('voluntarios').where('authUid', '==', uid).limit(1).get();
    if (!userQuery.empty) {
        const operacaoBD = acao === 'adicionar' 
            ? admin.firestore.FieldValue.arrayUnion(novoPapel) 
            : admin.firestore.FieldValue.arrayRemove(novoPapel);
            
        await userQuery.docs[0].ref.update({ roles: operacaoBD });
        
        const textoAcao = acao === 'adicionar' ? 'atribuído' : 'revogado';
        return { message: `Cargo '${novoPapel}' ${textoAcao} com sucesso!`, success: true };
    }
    
    return { message: "Papel atualizado no Auth, mas documento de voluntário não encontrado para sincronizar no BD.", success: true };
};

// --- EXPORTAÇÕES (ROBÓS ADMIN) ---
const definirSuperAdmin = onRequest(OPCOES_FUNCAO, async (req, res) => {
    if (req.query.senha !== "amorcaridade") return res.status(401).send('Não autorizado.');
    const email = req.query.email;
    try {
        const user = await admin.auth().getUserByEmail(email);
        
        let claims = user.customClaims || {};
        let roles = claims.roles || (claims.role ? [claims.role] : []);
        if (!roles.includes('super-admin')) roles.push('super-admin');
        delete claims.role;
        claims.roles = roles;
        
        await admin.auth().setCustomUserClaims(user.uid, claims);
        
        const snapshot = await db.collection('voluntarios').where('authUid', '==', user.uid).get();
        if (!snapshot.empty) {
            await snapshot.docs[0].ref.update({ roles: admin.firestore.FieldValue.arrayUnion('super-admin') });
        }
        return res.status(200).send(`Sucesso! ${email} é Super Admin.`);
    } catch (e) { return res.status(500).send(e.message); }
});

// PROMOÇÕES (Usando a nova função gerenciarPapel com 'adicionar')
const promoverParaDiretor = onCall(OPCOES_FUNCAO, async (req) => { return await gerenciarPapel(req.data.uid, 'diretor', 'adicionar'); });
const promoverParaTesoureiro = onCall(OPCOES_FUNCAO, async (req) => { return await gerenciarPapel(req.data.uid, 'tesoureiro', 'adicionar'); });
const promoverParaConselheiro = onCall(OPCOES_FUNCAO, async (req) => { return await gerenciarPapel(req.data.uid, 'conselheiro', 'adicionar'); });
const promoverParaProdutorEvento = onCall(OPCOES_FUNCAO, async (req) => { return await gerenciarPapel(req.data.uid, 'produtor-evento', 'adicionar'); });
const promoverParaIrradiador = onCall(OPCOES_FUNCAO, async (req) => { return await gerenciarPapel(req.data.uid, 'irradiador', 'adicionar'); });
const promoverParaBibliotecario = onCall(OPCOES_FUNCAO, async (req) => { return await gerenciarPapel(req.data.uid, 'bibliotecario', 'adicionar'); });
const promoverParaRecepcionista = onCall(OPCOES_FUNCAO, async (req) => { return await gerenciarPapel(req.data.uid, 'recepcionista', 'adicionar'); });
const promoverParaEntrevistador = onCall(OPCOES_FUNCAO, async (req) => { return await gerenciarPapel(req.data.uid, 'entrevistador', 'adicionar'); });
const promoverParaDirigenteEscola = onCall(OPCOES_FUNCAO, async (req) => { return await gerenciarPapel(req.data.uid, 'dirigente-escola', 'adicionar'); });
const promoverParaSecretarioEscola = onCall(OPCOES_FUNCAO, async (req) => { return await gerenciarPapel(req.data.uid, 'secretario-escola', 'adicionar'); });

// REVOGAÇÕES (Usando a nova função gerenciarPapel com 'remover')
const revogarAcessoDiretor = onCall(OPCOES_FUNCAO, async (req) => { return await gerenciarPapel(req.data.uid, 'diretor', 'remover'); });
const revogarAcessoTesoureiro = onCall(OPCOES_FUNCAO, async (req) => { return await gerenciarPapel(req.data.uid, 'tesoureiro', 'remover'); });
const revogarAcessoConselheiro = onCall(OPCOES_FUNCAO, async (req) => { return await gerenciarPapel(req.data.uid, 'conselheiro', 'remover'); });
const revogarAcessoProdutorEvento = onCall(OPCOES_FUNCAO, async (req) => { return await gerenciarPapel(req.data.uid, 'produtor-evento', 'remover'); });
const revogarAcessoIrradiador = onCall(OPCOES_FUNCAO, async (req) => { return await gerenciarPapel(req.data.uid, 'irradiador', 'remover'); });
const revogarAcessoBibliotecario = onCall(OPCOES_FUNCAO, async (req) => { return await gerenciarPapel(req.data.uid, 'bibliotecario', 'remover'); });
const revogarAcessoRecepcionista = onCall(OPCOES_FUNCAO, async (req) => { return await gerenciarPapel(req.data.uid, 'recepcionista', 'remover'); });
const revogarAcessoEntrevistador = onCall(OPCOES_FUNCAO, async (req) => { return await gerenciarPapel(req.data.uid, 'entrevistador', 'remover'); });
const revogarAcessoDirigenteEscola = onCall(OPCOES_FUNCAO, async (req) => { return await gerenciarPapel(req.data.uid, 'dirigente-escola', 'remover'); });
const revogarAcessoSecretarioEscola = onCall(OPCOES_FUNCAO, async (req) => { return await gerenciarPapel(req.data.uid, 'secretario-escola', 'remover'); });

const sincronizarStatusVoluntario = onDocumentWritten({ ...OPCOES_FUNCAO, document: 'presencas/{presencaId}' }, async (event) => {
    const d = event.data.after.data(); if (!d || d.status !== 'presente') return null;
    const snap = await db.collection('voluntarios').where('nome', '==', d.nome).limit(1).get();
    if (!snap.empty) return snap.docs[0].ref.update({ ultimaPresenca: d.data, statusVoluntario: 'ativo' });
});

const atribuirCodigoVoluntario = onDocumentCreated({ ...OPCOES_FUNCAO, document: 'voluntarios/{voluntarioId}' }, async (event) => {
    const snap = event.data; if (!snap || snap.data().codigoVoluntario) return null;
    const counterRef = db.doc('counters/voluntarios');
    return db.runTransaction(async (t) => {
        const doc = await t.get(counterRef);
        let next = (doc.exists && doc.data().lastCode ? doc.data().lastCode : 1000) + 1;
        t.update(snap.ref, { codigoVoluntario: next }); t.set(counterRef, { lastCode: next }, { merge: true });
    });
});

const atribuirCodigosVoluntarios = onCall(OPCOES_FUNCAO, async (request) => {
    const snap = await db.collection('voluntarios').get();
    const semCodigo = snap.docs.filter(doc => !doc.data().codigoVoluntario);
    if (semCodigo.length === 0) return { message: "Todos os voluntários já possuem código." };
    const counterRef = db.doc('counters/voluntarios');
    await db.runTransaction(async (t) => {
        const cDoc = await t.get(counterRef);
        let next = cDoc.exists ? cDoc.data().lastCode : 1000;
        semCodigo.forEach(doc => { next++; t.update(doc.ref, { codigoVoluntario: next }); });
        t.set(counterRef, { lastCode: next }, { merge: true });
    });
    return { message: `${semCodigo.length} códigos atribuídos com sucesso!`, success: true };
});

const gerarCracha = onCall({ ...OPCOES_FUNCAO, memory: '1GiB', timeoutSeconds: 120 }, async (req) => {
    const { nomeParaCracha, codigoVoluntario } = req.data;
    const bucket = admin.storage().bucket();
    const [template] = await bucket.file('template_cracha.png').download();
    
    const barcode = await bwipjs.toBuffer({ bcid: 'code128', text: String(codigoVoluntario), scale: 3, height: 12, includetext: true, textcolor: '56ad59', barcolor: '56ad59' });
    const textoSvg = Buffer.from(`<svg width="1011" height="150"><text x="50%" y="50%" font-family="sans-serif" font-size="70" font-weight="bold" fill="#56ad59" text-anchor="middle" dominant-baseline="middle">${nomeParaCracha.toUpperCase()}</text></svg>`);
    
    const final = await sharp(template).composite([{ input: textoSvg, top: 380, left: 0 }, { input: barcode, top: 510, left: 425 }]).png().toBuffer();
    return { imageBase64: final.toString('base64'), success: true };
});

const atualizarNomesParaCracha = onDocumentWritten({ ...OPCOES_FUNCAO, document: 'voluntarios/{voluntarioId}' }, async (event) => {
    const d = event.data.after.data(); if (!d || !d.nome) return null;
    const pNome = d.nome.trim().split(' ')[0];
    return event.data.after.ref.update({ primeiroNome: pNome, nomeParaCracha: pNome });
});

const enviarNotificacaoImediata = onRequest(OPCOES_FUNCAO, (req, res) => {
    cors(req, res, async () => {
        if (req.method !== 'POST') return res.status(405).send('Método não permitido');
        try {
            const result = await enviarNotificacoesParaTodos(req.body.titulo, req.body.corpo);
            res.status(200).json(result);
        } catch (e) {
            res.status(500).send(e.message);
        }
    });
});

const verificarAgendamentosAgendados = onSchedule({ ...OPCOES_FUNCAO_SAOPAULO, schedule: 'every 1 hours' }, async (event) => {
    const agora = admin.firestore.Timestamp.now();
    const snap = await db.collection('notificacoes_agendadas').where('status', '==', 'pendente').where('enviarEm', '<=', agora).get();
    for (const doc of snap.docs) {
        await enviarNotificacoesParaTodos(doc.data().titulo, doc.data().corpo);
        await doc.ref.update({ status: 'enviada' });
    }
});

const verificarInatividadeVoluntarios = onSchedule({ ...OPCOES_FUNCAO_SAOPAULO, schedule: '5 4 * * *' }, async () => {
    const dataLimite = new Date(); dataLimite.setDate(dataLimite.getDate() - 45);
    const limiteStr = dataLimite.toISOString().split('T')[0];
    const snap = await db.collection('voluntarios').where('statusVoluntario', '==', 'ativo').where('ultimaPresenca', '<', limiteStr).get();
    const batch = db.batch(); snap.forEach(doc => batch.update(doc.ref, { statusVoluntario: 'inativo' }));
    await batch.commit();
});

const registrarLogDeAcesso = onCall(OPCOES_FUNCAO, async (req) => {
    await db.collection('log_auditoria').add({ acao: req.data.acao, autor: req.auth.uid, timestamp: admin.firestore.FieldValue.serverTimestamp() });
    return { success: true, message: "Log registrado." };
});

const uploadAtaParaStorage = onCall(OPCOES_FUNCAO, async (req) => {
    const buffer = Buffer.from(req.data.fileData.split(',')[1], 'base64');
    const file = storage.bucket().file(`atas/${Date.now()}-${req.data.fileName}`);
    await file.save(buffer, { metadata: { contentType: req.data.fileType }, public: true });
    await db.collection('atas').add({ titulo: req.data.tituloAta, fileUrl: file.publicUrl(), criadoEm: admin.firestore.FieldValue.serverTimestamp() });
    return { success: true, message: "Ata enviada com sucesso!" };
});

const backfillNomesCracha = onCall(OPCOES_FUNCAO, async () => {
    const snap = await db.collection('voluntarios').get();
    const batch = db.batch();
    snap.forEach(doc => { const pNome = (doc.data().nome || "").split(' ')[0]; batch.update(doc.ref, { primeiroNome: pNome, nomeParaCracha: pNome }); });
    await batch.commit(); 
    return { success: true, message: "Sincronização de nomes concluída!" };
});

const resetarTasvAnual = onSchedule({ ...OPCOES_FUNCAO_SAOPAULO, schedule: '0 4 1 1 *' }, async () => {
    const snap = await db.collection('voluntarios').get();
    const batch = db.batch(); snap.forEach(doc => batch.update(doc.ref, { tasvAssinadoAno: null }));
    await batch.commit();
});



// --- NOTIFICAÇÃO DE ANIVERSARIANTES VIA TELEGRAM ---
const notificarAniversariosTelegram = onSchedule({ ...OPCOES_FUNCAO_SAOPAULO, schedule: '0 8 * * *' }, async () => {
    // 1. Obtém a data de hoje no fuso horário de Brasília/São Paulo no formato DD/MM
    const hoje = new Date();
    const dataBrasil = new Date(hoje.toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
    
    const dia = String(dataBrasil.getDate()).padStart(2, '0');
    const mes = String(dataBrasil.getMonth() + 1).padStart(2, '0');
    const aniversarioHojeStr = `${dia}/${mes}`;

    console.log(`[Aniversários] Buscando voluntários ativos para hoje: ${aniversarioHojeStr}`);

    try {
        // 2. Busca no Firestore apenas os voluntários ativos que fazem aniversário hoje
        const snapshot = await db.collection('voluntarios')
            .where('aniversario', '==', aniversarioHojeStr)
            .where('statusVoluntario', '==', 'ativo')
            .get();

        if (snapshot.empty) {
            console.log('[Aniversários] Nenhum voluntário ativo aniversariando hoje.');
            return;
        }

        // 3. Monta o cabeçalho do aviso para o Telegram
        let textoTelegram = "🎂 *ANIVERSARIANTES DO DIA - CEPAT*\n\n";
        textoTelegram += "Toque no link abaixo de cada nome para abrir o WhatsApp na conversa com a linda mensagem espírita de aniversário pronta para o disparo:\n\n";

        snapshot.forEach((docSnap) => {
            const v = docSnap.data();
            
            if (v.telefone) {
                const telefoneLimpo = v.telefone.replace(/\D/g, '');
                const primeiroNome = v.nome.split(' ')[0];
                
                // --- MENSAGEM ESPÍRITA DE ANIVERSÁRIO ---
                const msgWhatsApp = `Olá, ${primeiroNome}!\n\n` +
                    `Que a paz de Jesus esteja em seu coração nesta data tão bonita! 🕊️✨\n\n` +
                    `Celebrar o seu aniversário é render graças a Deus pelo dom precioso da vida e pela oportunidade bendita de estarmos juntos na Seara do Bem. Nós da casa agradecemos imensamente pela sua dedicação, pelo carinho do seu trabalho e por toda a luz que você espalha entre nós.\n\n` +
                    `Que os bons Espíritos envolveram você e sua família em vibrações de muita harmonia, saúde, amor e renovação espiritual para este novo ano de bênçãos e realizações.\n\n` +
                    `Parabéns e um abraço fraterno de todos nós! 🎂🌟`;
                
                // Codifica o texto para formato de URL do WhatsApp
                const linkWhatsApp = `https://wa.me/${telefoneLimpo}?text=${encodeURIComponent(msgWhatsApp)}`;
                
                textoTelegram += `👤 *${v.nome}* (${v.aniversario})\n`;
                textoTelegram += `👉 [CLIQUE AQUI PARA ENVIAR O PARABÉNS](${linkWhatsApp})\n\n`;
            } else {
                textoTelegram += `👤 *${v.nome}* (${v.aniversario})\n`;
                textoTelegram += `⚠️ *Aviso:* Este voluntário está sem telefone cadastrado para gerar o link.\n\n`;
            }
        });

        // 4. Envia o resumo matinal para o Telegram do celular da entidade
        const TELEGRAM_TOKEN = 'SEU_TOKEN_DO_BOTFATHER_AQUI'; // Insira o Token aqui
        const CHAT_ID = 'ID_DO_CELULAR_DA_CASA_AQUI';         // Insira o ID aqui

        const urlTelegram = `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`;
        
        // Uso do fetch nativo (suportado por padrão no Node 18+ do Firebase Functions v2)
        const resposta = await fetch(urlTelegram, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: CHAT_ID,
                text: textoTelegram,
                parse_mode: 'Markdown',
                disable_web_page_preview: true // Evita carregar card de preview da web para o link ficar limpo
            })
        });

        const resultado = await resposta.json();
        if (resultado.ok) {
            console.log('[Aniversários] Alerta matinal com os links enviado com sucesso ao Telegram da casa!');
        } else {
            console.error('[Aniversários] Falha na resposta da API do Telegram:', resultado);
        }

    } catch (erro) {
        console.error('[Aniversários] Erro na execução da rotina de agendamento:', erro);
    }
});


// EXPORTAÇÕES
module.exports = {
    definirSuperAdmin,
    promoverParaDiretor,
    promoverParaTesoureiro,
    promoverParaConselheiro,
    promoverParaProdutorEvento,
    promoverParaIrradiador,
    promoverParaBibliotecario,
    promoverParaRecepcionista,
    promoverParaEntrevistador,
    promoverParaDirigenteEscola,
    promoverParaSecretarioEscola,
    revogarAcessoDiretor,
    revogarAcessoTesoureiro,
    revogarAcessoConselheiro,
    revogarAcessoProdutorEvento,
    revogarAcessoIrradiador,
    revogarAcessoBibliotecario,
    revogarAcessoRecepcionista,
    revogarAcessoEntrevistador,
    revogarAcessoDirigenteEscola,
    revogarAcessoSecretarioEscola,
    sincronizarStatusVoluntario,
    atribuirCodigoVoluntario,
    atribuirCodigosVoluntarios,
    gerarCracha,
    atualizarNomesParaCracha,
    enviarNotificacaoImediata,
    verificarAgendamentosAgendados,
    verificarInatividadeVoluntarios,
    registrarLogDeAcesso,
    uploadAtaParaStorage,
    backfillNomesCracha,
    resetarTasvAnual,
    notificarAniversariosTelegram
};