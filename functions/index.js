// Forçando deploy geral - v1.3
// ===================================================================
// IMPORTAÇÕES (Atualizadas para a nova sintaxe v2)
// ===================================================================
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { onDocumentCreated, onDocumentWritten } = require("firebase-functions/v2/firestore");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { onRequest } = require("firebase-functions/v2/https");
const { defineString } = require("firebase-functions/params");

const admin = require("firebase-admin");
const webpush = require("web-push");
const cors = require("cors")({ origin: true });
const Fuse = require("fuse.js");
const axios = require("axios");
const sharp = require('sharp');
const bwipjs = require('bwip-js');

admin.initializeApp();
const db = admin.firestore();
const storage = admin.storage();

const REGIAO = 'southamerica-east1';
const OPCOES_FUNCAO = { region: REGIAO };
const OPCOES_FUNCAO_SAOPAULO = { region: REGIAO, timeZone: 'America/Sao_Paulo' };

// ### AJUSTE: Removidas as consts defineString para VAPID ###
// Elas serão lidas do process.env (arquivo .env.voluntarios-ativos-cepat)

// --- FUNÇÕES AUXILIARES ---

function configurarWebPush() {
    try {
        // ### AJUSTE: Lendo chaves do process.env ###
        const publicKey = process.env.VAPID_PUBLIC_KEY;
        const privateKey = process.env.VAPID_PRIVATE_KEY;
        // ### FIM DO AJUSTE ###

        if (publicKey && privateKey) {
            webpush.setVapidDetails("mailto:cepaulodetarso.sbo@gmail.com", publicKey, privateKey);
            console.log("Web Push configurado com sucesso."); // Log de sucesso
            return true;
        }
        console.error("ERRO CRÍTICO: Chaves VAPID (VAPID_PUBLIC_KEY ou VAPID_PRIVATE_KEY) não encontradas no process.env.");
        return false;
    } catch (error) {
        console.error("ERRO CRÍTICO ao configurar web-push:", error);
        return false;
    }
}

async function enviarNotificacoesParaTodos(titulo, corpo) {
    if (!configurarWebPush()) { 
        console.error("Envio cancelado: Configuração do Web Push falhou.");
        return { successCount: 0, failureCount: 0, totalCount: 0 }; 
    }
    const inscricoesSnapshot = await db.collection('inscricoes').get();
    if (inscricoesSnapshot.empty) { 
        console.log("Nenhuma inscrição encontrada para enviar notificações.");
        return { successCount: 0, totalCount: 0, failureCount: 0 }; 
    }
    
    const payload = JSON.stringify({ title: titulo, body: corpo });
    let successCount = 0; 
    let failureCount = 0;
    
    const sendPromises = inscricoesSnapshot.docs.map(doc => {
        const subscriptionData = doc.data();
        return webpush.sendNotification(subscriptionData, payload)
            .then(() => {
                successCount++;
            })
            .catch(error => { 
                failureCount++;
                console.warn(`Falha ao enviar para ${doc.id.substring(0, 10)}...:`, error.statusCode);
                // Se a inscrição expirou ou é inválida (404 ou 410), remove do banco
                if (error.statusCode === 410 || error.statusCode === 404) { 
                    console.log(`Removendo inscrição expirada: ${doc.id}`);
                    return doc.ref.delete(); 
                }
            });
    });
    
    await Promise.all(sendPromises);
    console.log(`Resultado do envio: ${successCount} sucessos, ${failureCount} falhas, de ${inscricoesSnapshot.size} total.`);
    return { successCount, failureCount, totalCount: inscricoesSnapshot.size };
}

// ### FUNÇÃO promoverUsuario MANTIDA COMO NO SEU ORIGINAL (LÓGICA DE ROLE ÚNICO) ###
const promoverUsuario = async (uid, novoPapel) => {
    if (!uid) return;
    try {
        // Define o 'role' principal
        let claims = { role: novoPapel };
        // Adiciona claims booleanos para cargos específicos (se aplicável)
        if (['dirigente-escola', 'secretario-escola', 'facilitador' /* adicione outros se precisar */].includes(novoPapel)) {
             claims[novoPapel.replace('-', '_')] = true; // Ex: secretario_escola = true (Firebase não aceita '-' em nomes de claims)
             // Considerar se facilitador deve ser sempre true para quem tem cargos educacionais
             if (['dirigente-escola', 'secretario-escola'].includes(novoPapel)) {
                 claims['facilitador'] = true; // Garante que dirigente/secretário também tenham claim 'facilitador'
             }
        } else if (novoPapel === 'voluntario') {
             // Ao revogar, remove todos os claims booleanos relacionados a cargos (exceto 'role')
             // Esta é uma lógica simplificada que você tinha, vamos mantê-la.
             // Se precisar de revogação granular (remover só 1 cargo de vários), precisaríamos de 'revogarCargo'
             claims = { role: 'voluntario' }; 
        }

        await admin.auth().setCustomUserClaims(uid, claims);
        console.log(`Claims definidos para ${uid}:`, claims);

        // Atualiza o campo 'role' no Firestore (mantém simples por enquanto)
        const userQuery = await db.collection('voluntarios').where('authUid', '==', uid).limit(1).get();
        if (!userQuery.empty) {
            await userQuery.docs[0].ref.update({ role: novoPapel }); // Sobrescreve o role
            console.log(`Campo 'role' no Firestore atualizado para ${uid} como ${novoPapel}`);
        }
    } catch (error) {
        console.error(`Erro ao promover/definir claims para ${uid} como ${novoPapel}:`, error);
        // Lançar o erro ou tratar conforme necessário
        throw new HttpsError('internal', `Falha ao definir cargo/claims para ${novoPapel}.`);
    }
};

function calcularCicloVibracoes(dataBase) {
    const agora = new Date(dataBase);
    const proximaQuinta = new Date(agora);
    proximaQuinta.setUTCHours(proximaQuinta.getUTCHours() - 3);
    const diaDaSemana = proximaQuinta.getDay();
    let diasAteProximaQuinta = (4 - diaDaSemana + 7) % 7;
    if (diasAteProximaQuinta === 0 && agora.getTime() > proximaQuinta.getTime()) {
        diasAteProximaQuinta = 7;
    }
    proximaQuinta.setDate(proximaQuinta.getDate() + diasAteProximaQuinta);
    proximaQuinta.setHours(19, 20, 0, 0);
    const dataFimCiclo = new Date(proximaQuinta);
    const dataArquivamento = new Date(dataFimCiclo);
    dataArquivamento.setDate(dataArquivamento.getDate() + 21);
    return {
        dataFimCiclo: admin.firestore.Timestamp.fromDate(dataFimCiclo),
        dataArquivamento: admin.firestore.Timestamp.fromDate(dataArquivamento)
    };
}


// --- FUNÇÕES PRINCIPAIS ---

exports.sincronizarStatusVoluntario = onDocumentWritten({ ...OPCOES_FUNCAO, document: 'presencas/{presencaId}' }, async (event) => {
    const dadosPresenca = event.data.after.exists ? event.data.after.data() : null;
    if (!dadosPresenca || dadosPresenca.status !== 'presente') { return null; }
    const dadosAntigos = event.data.before.exists ? event.data.before.data() : null;
    if (dadosAntigos && dadosAntigos.status === 'presente') { return null; }
    const voluntariosRef = db.collection('voluntarios');
    const q = voluntariosRef.where('nome', '==', dadosPresenca.nome).limit(1);
    const snapshot = await q.get();
    if (snapshot.empty) { return null; }
    return snapshot.docs[0].ref.update({ ultimaPresenca: dadosPresenca.data, statusVoluntario: 'ativo' });
});

exports.definirSuperAdmin = onRequest(OPCOES_FUNCAO, async (req, res) => {
    if (req.query.senha !== "amorcaridade") { return res.status(401).send('Acesso não autorizado.'); }
    const email = req.query.email;
    if (!email) { return res.status(400).send('Forneça um parâmetro de email.'); }
    try {
        const user = await admin.auth().getUserByEmail(email);
        await admin.auth().setCustomUserClaims(user.uid, { role: 'super-admin' });
        const q = db.collection('voluntarios').where('authUid', '==', user.uid);
        const snapshot = await q.get();
        if (!snapshot.empty) { await snapshot.docs[0].ref.update({ role: 'super-admin' }); }
        return res.status(200).send(`Sucesso! O usuário ${email} agora é Super Admin.`);
    } catch (error) { return res.status(500).send(`Erro: ${error.message}`); }
});

// ### AJUSTE: ADICIONADA 'promoverParaDiretor' ###
exports.promoverParaDiretor = onCall(OPCOES_FUNCAO, async (request) => {
    if (request.auth.token.role !== 'super-admin') { throw new HttpsError('permission-denied', 'Apenas o Super Admin pode promover usuários.'); }
    const uidParaPromover = request.data.uid;
    if (!uidParaPromover) { throw new HttpsError('invalid-argument', 'O UID do usuário é necessário.'); }
    await promoverUsuario(uidParaPromover, 'diretor');
    return { success: true, message: 'Usuário promovido a Diretor(a) com sucesso.' };
});

exports.promoverParaTesoureiro = onCall(OPCOES_FUNCAO, async (request) => {
    if (request.auth.token.role !== 'super-admin') { throw new HttpsError('permission-denied', 'Apenas o Super Admin pode promover usuários.'); }
    const uidParaPromover = request.data.uid;
    if (!uidParaPromover) { throw new HttpsError('invalid-argument', 'O UID do diretor é necessário.'); }
    await promoverUsuario(uidParaPromover, 'tesoureiro');
    return { success: true, message: 'Usuário promovido a tesoureiro com sucesso.' };
});

exports.promoverParaConselheiro = onCall(OPCOES_FUNCAO, async (request) => {
    if (request.auth.token.role !== 'super-admin') { throw new HttpsError('permission-denied', 'Apenas o Super Admin pode promover usuários.'); }
    const conselheirosQuery = db.collection('voluntarios').where('role', '==', 'conselheiro');
    const conselheirosSnapshot = await conselheirosQuery.get();
    if (conselheirosSnapshot.size >= 5) { throw new HttpsError('failed-precondition', 'O limite de 5 conselheiros já foi atingido.'); }
    const uidParaPromover = request.data.uid;
    if (!uidParaPromover) { throw new HttpsError('invalid-argument', 'O UID do usuário é necessário.'); }
    await promoverUsuario(uidParaPromover, 'conselheiro');
    return { success: true, message: 'Usuário promovido a conselheiro com sucesso.' };
});

exports.promoverParaProdutorEvento = onCall(OPCOES_FUNCAO, async (request) => {
    if (request.auth.token.role !== 'super-admin') { throw new HttpsError('permission-denied', 'Apenas o Super Admin pode promover usuários.'); }
    const uidParaPromover = request.data.uid;
    if (!uidParaPromover) { throw new HttpsError('invalid-argument', 'O UID do usuário é necessário.'); }
    await promoverUsuario(uidParaPromover, 'produtor-evento');
    return { success: true, message: 'Usuário promovido a Produtor de Evento com sucesso.' };
});

exports.promoverParaIrradiador = onCall(OPCOES_FUNCAO, async (request) => {
    if (request.auth.token.role !== 'super-admin') { throw new HttpsError('permission-denied', 'Apenas o Super Admin pode promover usuários.'); }
    const uidParaPromover = request.data.uid;
    if (!uidParaPromover) { throw new HttpsError('invalid-argument', 'O UID do usuário é necessário.'); }
    await promoverUsuario(uidParaPromover, 'irradiador');
    return { success: true, message: 'Usuário promovido a Irradiador com sucesso.' };
});

exports.promoverParaBibliotecario = onCall(OPCOES_FUNCAO, async (request) => {
    if (request.auth.token.role !== 'super-admin') { throw new HttpsError('permission-denied', 'Apenas o Super Admin pode promover usuários.'); }
    const uidParaPromover = request.data.uid;
    if (!uidParaPromover) { throw new HttpsError('invalid-argument', 'O UID do usuário é necessário.'); }
    await promoverUsuario(uidParaPromover, 'bibliotecario');
    return { success: true, message: 'Usuário promovido a Bibliotecário(a) com sucesso.' };
});

exports.promoverParaRecepcionista = onCall(OPCOES_FUNCAO, async (request) => {
    if (request.auth.token.role !== 'super-admin') { throw new HttpsError('permission-denied', 'Apenas o Super Admin pode promover usuários.'); }
    const uidParaPromover = request.data.uid;
    if (!uidParaPromover) { throw new HttpsError('invalid-argument', 'O UID do usuário é necessário.'); }
    await promoverUsuario(uidParaPromover, 'recepcionista');
    return { success: true, message: 'Usuário promovido a Recepcionista com sucesso.' };
});

exports.promoverParaEntrevistador = onCall(OPCOES_FUNCAO, async (request) => {
    if (request.auth.token.role !== 'super-admin') { throw new HttpsError('permission-denied', 'Apenas o Super Admin pode promover usuários.'); }
    const uidParaPromover = request.data.uid;
    if (!uidParaPromover) { throw new HttpsError('invalid-argument', 'O UID do usuário é necessário.'); }
    await promoverUsuario(uidParaPromover, 'entrevistador');
    return { success: true, message: 'Usuário promovido a Entrevistador(a) com sucesso.' };
});

// ### AJUSTE 1 DE 2: NOVAS FUNÇÕES DE PROMOÇÃO ADICIONADAS ###
exports.promoverParaDirigenteEscola = onCall(OPCOES_FUNCAO, async (request) => {
    if (request.auth.token.role !== 'super-admin') { throw new HttpsError('permission-denied', 'Apenas o Super Admin pode promover usuários.'); }
    const uidParaPromover = request.data.uid;
    if (!uidParaPromover) { throw new HttpsError('invalid-argument', 'O UID do usuário é necessário.'); }
    await promoverUsuario(uidParaPromover, 'dirigente-escola');
    return { success: true, message: 'Usuário promovido a Dirigente de Escola com sucesso.' };
});

exports.promoverParaSecretarioEscola = onCall(OPCOES_FUNCAO, async (request) => {
    if (request.auth.token.role !== 'super-admin') { throw new HttpsError('permission-denied', 'Apenas o Super Admin pode promover usuários.'); }
    const uidParaPromover = request.data.uid;
    if (!uidParaPromover) { throw new HttpsError('invalid-argument', 'O UID do usuário é necessário.'); }
    await promoverUsuario(uidParaPromover, 'secretario-escola');
    return { success: true, message: 'Usuário promovido a Secretário(a) de Escola com sucesso.' };
});
// ### FIM DO AJUSTE 1 ###

exports.revogarAcessoDiretor = onCall(OPCOES_FUNCAO, async (request) => {
    if (request.auth.token.role !== 'super-admin') { throw new HttpsError('permission-denied', 'Apenas o Super Admin pode revogar acesso.'); }
    const uidParaRevogar = request.data.uid;
    if (!uidParaRevogar) { throw new HttpsError('invalid-argument', 'O UID do diretor é necessário.'); }
    await promoverUsuario(uidParaRevogar, 'voluntario');
    return { success: true, message: 'Acesso de diretor revogado com sucesso.' };
});

// ### AJUSTE: ADICIONADA 'revogarAcessoTesoureiro' ###
exports.revogarAcessoTesoureiro = onCall(OPCOES_FUNCAO, async (request) => {
    if (request.auth.token.role !== 'super-admin') { throw new HttpsError('permission-denied', 'Apenas o Super Admin pode revogar acesso.'); }
    const uidParaRevogar = request.data.uid;
    if (!uidParaRevogar) { throw new HttpsError('invalid-argument', 'O UID do tesoureiro é necessário.'); }
    await promoverUsuario(uidParaRevogar, 'voluntario');
    return { success: true, message: 'Acesso de Tesoureiro revogado com sucesso.' };
});

exports.revogarAcessoConselheiro = onCall(OPCOES_FUNCAO, async (request) => {
    if (request.auth.token.role !== 'super-admin') { throw new HttpsError('permission-denied', 'Apenas o Super Admin pode revogar acesso.'); }
    const uidParaRevogar = request.data.uid;
    if (!uidParaRevogar) { throw new HttpsError('invalid-argument', 'O UID do conselheiro é necessário.'); }
    await promoverUsuario(uidParaRevogar, 'voluntario');
    return { success: true, message: 'Acesso de conselheiro revogado com sucesso.' };
});

exports.revogarAcessoProdutorEvento = onCall(OPCOES_FUNCAO, async (request) => {
    if (request.auth.token.role !== 'super-admin') { throw new HttpsError('permission-denied', 'Apenas o Super Admin pode revogar acesso.'); }
    const uidParaRevogar = request.data.uid;
    if (!uidParaRevogar) { throw new HttpsError('invalid-argument', 'O UID do usuário é necessário.'); }
    await promoverUsuario(uidParaRevogar, 'voluntario');
    return { success: true, message: 'Acesso de Produtor de Evento revogado com sucesso.' };
});

exports.revogarAcessoIrradiador = onCall(OPCOES_FUNCAO, async (request) => {
    if (request.auth.token.role !== 'super-admin') { throw new HttpsError('permission-denied', 'Apenas o Super Admin pode revogar acesso.'); }
    const uidParaRevogar = request.data.uid;
    if (!uidParaRevogar) { throw new HttpsError('invalid-argument', 'O UID do usuário é necessário.'); }
    await promoverUsuario(uidParaRevogar, 'voluntario');
    return { success: true, message: 'Acesso de Irradiador revogado com sucesso.' };
});

exports.revogarAcessoBibliotecario = onCall(OPCOES_FUNCAO, async (request) => {
    if (request.auth.token.role !== 'super-admin') { throw new HttpsError('permission-denied', 'Apenas o Super Admin pode revogar acesso.'); }
    const uidParaRevogar = request.data.uid;
    if (!uidParaRevogar) { throw new HttpsError('invalid-argument', 'O UID do usuário é necessário.'); }
    await promoverUsuario(uidParaRevogar, 'voluntario');
    return { success: true, message: 'Acesso de Bibliotecário(a) revogado com sucesso.' };
});

exports.revogarAcessoRecepcionista = onCall(OPCOES_FUNCAO, async (request) => {
    if (request.auth.token.role !== 'super-admin') { throw new HttpsError('permission-denied', 'Apenas o Super Admin pode revogar acesso.'); }
    const uidParaRevogar = request.data.uid;
    if (!uidParaRevogar) { throw new HttpsError('invalid-argument', 'O UID do usuário é necessário.'); }
    await promoverUsuario(uidParaRevogar, 'voluntario');
    return { success: true, message: 'Acesso de Recepcionista revogado com sucesso.' };
});

exports.revogarAcessoEntrevistador = onCall(OPCOES_FUNCAO, async (request) => {
    if (request.auth.token.role !== 'super-admin') { throw new HttpsError('permission-denied', 'Apenas o Super Admin pode revogar acesso.'); }
    const uidParaRevogar = request.data.uid;
    if (!uidParaRevogar) { throw new HttpsError('invalid-argument', 'O UID do usuário é necessário.'); }
    await promoverUsuario(uidParaRevogar, 'voluntario');
    return { success: true, message: 'Acesso de Entrevistador(a) revogado com sucesso.' };
});

// ### AJUSTE 2 DE 2: NOVAS FUNÇÕES DE REVOGAÇÃO ADICIONADAS ###
exports.revogarAcessoDirigenteEscola = onCall(OPCOES_FUNCAO, async (request) => {
    if (request.auth.token.role !== 'super-admin') { throw new HttpsError('permission-denied', 'Apenas o Super Admin pode revogar acesso.'); }
    const uidParaRevogar = request.data.uid;
    if (!uidParaRevogar) { throw new HttpsError('invalid-argument', 'O UID do usuário é necessário.'); }
    await promoverUsuario(uidParaRevogar, 'voluntario');
    return { success: true, message: 'Acesso de Dirigente de Escola revogado com sucesso.' };
});

exports.revogarAcessoSecretarioEscola = onCall(OPCOES_FUNCAO, async (request) => {
    if (request.auth.token.role !== 'super-admin') { throw new HttpsError('permission-denied', 'Apenas o Super Admin pode revogar acesso.'); }
    const uidParaRevogar = request.data.uid;
    if (!uidParaRevogar) { throw new HttpsError('invalid-argument', 'O UID do usuário é necessário.'); }
    await promoverUsuario(uidParaRevogar, 'voluntario');
    return { success: true, message: 'Acesso de Secretário(a) de Escola revogado com sucesso.' };
});
// ### FIM DO AJUSTE 2 ###

exports.registrarVotoConselho = onCall(OPCOES_FUNCAO, async (request) => {
    if (!request.auth) { throw new HttpsError('unauthenticated', 'A função deve ser chamada por um usuário autenticado.'); }
    const userRole = request.auth.token.role;
    if (!['conselheiro', 'super-admin'].includes(userRole)) { throw new HttpsError('permission-denied', 'Apenas membros do conselho ou super-admin podem votar.'); }
    const { balanceteId, voto, mensagem } = request.data;
    if (!balanceteId || !voto) { throw new HttpsError('invalid-argument', 'ID do balancete e voto são obrigatórios.'); }
    
    const balanceteRef = db.collection('balancetes').doc(balanceteId);
    const autor = { uid: request.auth.uid, nome: request.auth.token.name || request.auth.token.email };
    
    try {
        const balanceteDoc = await balanceteRef.get();
        if (!balanceteDoc.exists) { throw new HttpsError('not-found', 'Balancete não encontrado.'); }
        const balanceteData = balanceteDoc.data();
        if (balanceteData.status !== 'em revisão') { throw new HttpsError('failed-precondition', 'Este balancete não está mais aberto para revisão.'); }
        if (balanceteData.aprovacoes && balanceteData.aprovacoes[autor.uid]) { throw new HttpsError('already-exists', 'Você já votou neste balancete.'); }
        
        let updateData = {};
        let logAcao = "VOTOU_BALANCETE";
        let logDetalhes = {};

        if (voto === 'aprovado') {
            const campoAprovacao = `aprovacoes.${autor.uid}`;
            updateData[campoAprovacao] = { nome: autor.nome, data: admin.firestore.FieldValue.serverTimestamp() };
            logDetalhes = { voto: 'APROVADO' };
        } else if (voto === 'reprovado') {
            if (!mensagem) { throw new HttpsError('invalid-argument', 'Uma mensagem com a ressalva é obrigatória para reprovar.'); }
            updateData.status = 'com_ressalva';
            updateData.mensagens = admin.firestore.FieldValue.arrayUnion({ autor, texto: mensagem, data: new Date(), isResposta: false });
            logDetalhes = { voto: 'REPROVADO', ressalva: mensagem };
        }
        
        await balanceteRef.update(updateData);

        // --- AJUSTE AQUI: O 'balanceteId' agora é um campo de nível superior ---
        await db.collection('log_auditoria').add({
            acao: logAcao,
            autor: autor,
            timestamp: admin.firestore.FieldValue.serverTimestamp(),
            balanceteId: balanceteId, // Campo principal para a busca
            detalhes: logDetalhes
        });

        return { success: true, message: 'Ação registrada com sucesso!' };
    } catch (error) {
        console.error("Erro interno ao registrar voto:", error);
        throw new HttpsError('internal', 'Ocorreu um erro interno ao processar seu voto.');
    }
});

exports.verificarAprovacaoFinal = onDocumentWritten({ ...OPCOES_FUNCAO, document: 'balancetes/{balanceteId}' }, async (event) => {
    if (!event.data.after.exists) return null;
    const balanceteNovo = event.data.after.data();
    if (balanceteNovo.status !== 'em revisão') { return null; }
    
    const totalAprovacoes = Object.keys(balanceteNovo.aprovacoes || {}).length;
    
    // A regra de 3 votos para aprovação automática
    if (totalAprovacoes >= 3) {
        await event.data.after.ref.update({ status: 'aprovado' });

        // --- AJUSTE AQUI: O 'balanceteId' agora é um campo de nível superior ---
        await db.collection('log_auditoria').add({
            acao: "BALANCETE_APROVADO_AUTO",
            autor: { nome: 'SISTEMA' },
            timestamp: admin.firestore.FieldValue.serverTimestamp(),
            balanceteId: event.params.balanceteId, // Campo principal
            detalhes: { totalVotos: totalAprovacoes }
        });
    }
    return null;
});

exports.enviarNotificacaoImediata = onRequest(OPCOES_FUNCAO, (req, res) => {
    cors(req, res, async () => {
        if (req.method !== 'POST') { return res.status(405).send({ error: 'Método não permitido!' }); }
        if (!configurarWebPush()) { return res.status(500).json({ error: 'Falha na configuração VAPID.' }); }
        try {
            const { titulo, corpo } = req.body;
            if (!titulo || !corpo) { return res.status(400).json({ error: 'Título e corpo são obrigatórios.' }); }
            const resultado = await enviarNotificacoesParaTodos(titulo, corpo);
            return res.status(200).json(resultado);
        } catch (error) { return res.status(500).json({ error: 'Erro interno no servidor.' }); }
    });
});

exports.verificarAgendamentosAgendados = onSchedule({ ...OPCOES_FUNCAO_SAOPAULO, schedule: 'every 1 hours' }, async (event) => {
    if (!configurarWebPush()) { return null; }
    const agoraSP = new Date();
    const agoraTimestamp = admin.firestore.Timestamp.fromDate(agoraSP);
    const agendamentosRef = db.collection('notificacoes_agendadas');
    const unicosSnap = await agendamentosRef.where('tipo', '==', 'unico').where('status', '==', 'pendente').where('enviarEm', '<=', agoraTimestamp).get();
    for (const doc of unicosSnap.docs) {
        await enviarNotificacoesParaTodos(doc.data().titulo, doc.data().corpo);
        await doc.ref.update({ status: 'enviada' });
    }
    const diaDaSemana = agoraSP.getDay();
    const minutosAgora = agoraSP.getHours() * 60 + agoraSP.getMinutes();
    const hojeFormatado = new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'America/Sao_Paulo' }).format(agoraSP);
    const recorrentesSnap = await agendamentosRef.where('tipo', '==', 'recorrente').where('diaDaSemana', '==', diaDaSemana).get();
    for (const doc of recorrentesSnap.docs) {
        const agendamento = doc.data();
        const [horaAgendada, minutoAgendado] = agendamento.hora.split(':').map(Number);
        const minutosAgendados = horaAgendada * 60 + minutoAgendado;
        if (minutosAgora >= minutosAgendados && agendamento.ultimoEnvio !== hojeFormatado) {
            await enviarNotificacoesParaTodos(agendamento.titulo, agendamento.corpo);
            await doc.ref.update({ ultimoEnvio: hojeFormatado });
        }
    }
    return null;
});

exports.verificarInatividadeVoluntarios = onSchedule({ ...OPCOES_FUNCAO_SAOPAULO, schedule: '5 4 * * *' }, async (event) => {
    const dataLimite = new Date();
    dataLimite.setDate(dataLimite.getDate() - 45);
    const dataLimiteFormatada = dataLimite.toISOString().split('T')[0];
    const q = db.collection('voluntarios').where('statusVoluntario', '==', 'ativo').where('ultimaPresenca', '<', dataLimiteFormatada);
    const snapshot = await q.get();
    if (snapshot.empty) { return null; }
    const batch = db.batch();
    snapshot.forEach(doc => { batch.update(doc.ref, { statusVoluntario: 'inativo' }); });
    await batch.commit();
    return null;
});

exports.resetarTasvAnual = onSchedule({ ...OPCOES_FUNCAO_SAOPAULO, schedule: '0 4 1 1 *' }, async (event) => {
    const voluntariosRef = db.collection('voluntarios');
    const snapshot = await voluntariosRef.get();
    if (snapshot.empty) { return null; }
    const batch = db.batch();
    snapshot.forEach(doc => { batch.update(doc.ref, { tasvAssinadoAno: null }); });
    await batch.commit();
    return null;
});

exports.arquivarVibracoesConcluidas = onSchedule({ ...OPCOES_FUNCAO_SAOPAULO, schedule: '30 22 * * 4' }, async (event) => {
    console.log("Iniciando o arquivamento de pedidos de vibração concluídos.");
    const agora = admin.firestore.Timestamp.now();
    const colecoes = ['encarnados', 'desencarnados'];
    let totalArquivado = 0;
    for (const nomeColecao of colecoes) {
        const colecaoRef = db.collection(nomeColecao);
        const historicoRef = db.collection('historico_vibracoes');
        const snapshot = await colecaoRef.where('dataArquivamento', '<=', agora).get();
        if (snapshot.empty) {
            console.log(`Nenhum documento para arquivar na coleção '${nomeColecao}'.`);
            continue;
        }
        const batch = db.batch();
        snapshot.forEach(doc => {
            const dados = doc.data();
            const semanaDeReferencia = new Intl.DateTimeFormat('en-CA').format(dados.dataArquivamento.toDate());
            const dadosParaHistorico = { ...dados, tipo: nomeColecao.slice(0, -1), semanaDeReferencia, arquivadoEm: admin.firestore.FieldValue.serverTimestamp() };
            const novoHistoricoRef = historicoRef.doc();
            batch.set(novoHistoricoRef, dadosParaHistorico);
            batch.delete(doc.ref);
        });
        await batch.commit();
        console.log(`${snapshot.size} docs da coleção '${nomeColecao}' foram arquivados.`);
        totalArquivado += snapshot.size;
    }
    console.log(`Arquivamento concluído. Total: ${totalArquivado} documentos.`);
    return null;
});

exports.ativarNovosPedidos = onSchedule({ ...OPCOES_FUNCAO_SAOPAULO, schedule: '31 22 * * 4' }, async (event) => {
    console.log("Iniciando a ativação de novos pedidos de vibração.");
    const colecoes = ['encarnados', 'desencarnados'];
    const promises = [];
    for (const colecao of colecoes) {
        const q = db.collection(colecao).where('status', '==', 'pendente');
        const snapshotPromise = q.get().then(snapshot => {
            if (snapshot.empty) {
                console.log(`Nenhum pedido pendente em '${colecao}'.`);
                return;
            }
            const batch = db.batch();
            snapshot.forEach(doc => {
                batch.update(doc.ref, { status: 'ativo' });
            });
            return batch.commit().then(() => {
                console.log(`${snapshot.size} pedidos em '${colecao}' foram ativados.`);
            });
        });
        promises.push(snapshotPromise);
    }
    await Promise.all(promises);
    return null;
});

exports.enviarPedidoVibracao = onCall(OPCOES_FUNCAO, async (request) => {
    const { nome, endereco, tipo } = request.data;
    if (!nome || !tipo || (tipo === 'encarnado' && !endereco)) { throw new HttpsError('invalid-argument', 'Dados do pedido incompletos.'); }
    const agoraSP = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
    const diaDaSemana = agoraSP.getDay();
    const horas = agoraSP.getHours();
    const minutos = agoraSP.getMinutes();
    let statusFinal = 'ativo';
    if (diaDaSemana === 4 && ((horas === 19 && minutos >= 21) || (horas > 19 && horas < 22) || (horas === 22 && minutos <= 30))) {
        statusFinal = 'pendente';
    }
    const { dataArquivamento } = calcularCicloVibracoes(agoraSP);
    const colecaoAlvo = tipo === 'encarnado' ? 'encarnados' : 'desencarnados';
    const dadosParaSalvar = { nome: nome.trim(), dataCriacao: admin.firestore.FieldValue.serverTimestamp(), status: statusFinal, dataArquivamento: dataArquivamento };
    if (tipo === 'encarnado') { dadosParaSalvar.endereco = endereco.trim(); }
    try {
        await db.collection(colecaoAlvo).add(dadosParaSalvar);
        return { success: true, message: 'Pedido enviado com sucesso!' };
    } catch (error) {
        console.error("Erro ao salvar pedido de vibração:", error);
        throw new HttpsError('internal', 'Ocorreu um erro ao salvar o pedido.');
    }
});

exports.registrarLogDeAcesso = onCall(OPCOES_FUNCAO, async (request) => {
    if (!request.auth) { throw new HttpsError('unauthenticated', 'A função deve ser chamada por um usuário autenticado.'); }
    const { acao, detalhes } = request.data;
    if (!acao) { throw new HttpsError('invalid-argument', 'A ação é obrigatória para o log.'); }
    const autor = { uid: request.auth.uid, nome: request.auth.token.name || request.auth.token.email };
    try {
        await db.collection('log_auditoria').add({ acao, autor, detalhes: detalhes || {}, timestamp: admin.firestore.FieldValue.serverTimestamp() });
        return { success: true };
    } catch (error) {
        console.error("Erro ao registrar log de acesso:", error);
        throw new HttpsError('internal', 'Não foi possível registrar o log.');
    }
});

  exports.registrarVendaCantina = onCall(OPCOES_FUNCAO, async (request) => {
    if (!request.auth) { throw new HttpsError('unauthenticated', 'A função deve ser chamada por um usuário autenticado.'); }
    const permissoes = ['super-admin', 'diretor', 'tesoureiro', 'conselheiro', 'produtor-evento'];
    if (!permissoes.includes(request.auth.token.role)) { throw new HttpsError('permission-denied', 'Permissão negada.'); }

    // ### MUDANÇA AQUI: Removemos eventoId e eventoTitulo ###
    const { total, itens, tipoVenda, comprador } = request.data;
    
    // ### MUDANÇA AQUI: A validação foi atualizada ###
    if (total === undefined || !itens || !tipoVenda) { throw new HttpsError('invalid-argument', 'Dados da venda incompletos.'); }
    
    if (tipoVenda === 'prazo' && !comprador) { throw new HttpsError('invalid-argument', 'Dados do comprador são obrigatórios para registrar pendência.'); }
    
    // ### MUDANÇA AQUI: eventoId e eventoTitulo removidos do objeto de dados ###
    const vendaData = { 
        total, 
        itens, 
        registradoPor: { uid: request.auth.uid, nome: request.auth.token.name || request.auth.token.email }, 
        registradoEm: admin.firestore.FieldValue.serverTimestamp() 
    };

    try {
        if (tipoVenda === 'vista') {
            await db.collection('cantina_vendas_avista').add(vendaData);
        } else if (tipoVenda === 'prazo') {
            vendaData.compradorId = comprador.id; // Pode ser null se for externo
            vendaData.compradorNome = comprador.nome;
            vendaData.compradorTipo = comprador.tipo; // 'voluntario' ou 'externo'
            vendaData.status = 'pendente'; // pendente, pago
            await db.collection('contas_a_receber').add(vendaData);
        }
        return { success: true, message: 'Venda registrada com sucesso!' };
    } catch (error) {
        console.error("Erro ao registrar venda da cantina:", error);
        throw new HttpsError('internal', 'Ocorreu um erro ao salvar a venda.');
    }
});

exports.buscarDadosLivroPorISBN = onCall(OPCOES_FUNCAO, async (request) => {
    const permissoes = ['super-admin', 'tesoureiro', 'diretor', 'bibliotecario'];
    if (!request.auth || !permissoes.includes(request.auth.token.role)) { throw new HttpsError('permission-denied', 'Você não tem permissão para executar esta ação.'); }
    const isbn = request.data.isbn;
    if (!isbn) { throw new HttpsError('invalid-argument', 'O código ISBN é obrigatório.'); }
    try {
        const url = `https://www.googleapis.com/books/v1/volumes?q=isbn:${isbn}`;
        const response = await axios.get(url);
        if (response.data.totalItems > 0) {
            const book = response.data.items[0].volumeInfo;
            return {
                titulo: book.title || '',
                autor: book.authors ? book.authors.join(', ') : '',
                editora: book.publisher || '',
                anoPublicacao: book.publishedDate ? book.publishedDate.substring(0, 4) : ''
            };
        } else {
            throw new HttpsError('not-found', 'Nenhum livro encontrado com este ISBN.');
        }
    } catch (error) {
        console.error("Erro ao buscar dados do livro na API do Google:", error);
        throw new HttpsError('internal', 'Não foi possível buscar os dados do livro.');
    }
});

exports.registrarVendaBiblioteca = onCall(OPCOES_FUNCAO, async (request) => {
    if (!request.auth) { throw new HttpsError('unauthenticated', 'A função deve ser chamada por um usuário autenticado.'); }
    const permissoes = ['super-admin', 'tesoureiro', 'diretor', 'bibliotecario'];
    if (!permissoes.includes(request.auth.token.role)) { throw new HttpsError('permission-denied', 'Permissão negada.'); }
    const { total, itens, tipoVenda, comprador } = request.data;
    if (total === undefined || !itens || itens.length === 0 || !tipoVenda) { throw new HttpsError('invalid-argument', 'Dados da venda incompletos.'); }
    if (tipoVenda === 'prazo' && !comprador) { throw new HttpsError('invalid-argument', 'Dados do comprador são obrigatórios para registrar pendência.'); }
    try {
        await db.runTransaction(async (transaction) => {
            const docsLivros = await Promise.all(itens.map(item => transaction.get(db.collection('biblioteca_livros').doc(item.id))));
            for (let i = 0; i < docsLivros.length; i++) {
                const docLivro = docsLivros[i];
                if (!docLivro.exists) throw new HttpsError('not-found', `O livro "${itens[i].titulo}" não foi encontrado.`);
                if (docLivro.data().quantidade < itens[i].qtd) throw new HttpsError('failed-precondition', `Estoque insuficiente para "${itens[i].titulo}".`);
            }
            docsLivros.forEach((docLivro, i) => transaction.update(docLivro.ref, { quantidade: admin.firestore.FieldValue.increment(-itens[i].qtd) }));
            const vendaData = { total, itens, tipoVenda, registradoPor: { uid: request.auth.uid, nome: request.auth.token.name || request.auth.token.email }, registradoEm: admin.firestore.FieldValue.serverTimestamp() };
            if (tipoVenda === 'vista') {
                transaction.set(db.collection('biblioteca_vendas_avista').doc(), vendaData);
            } else {
                vendaData.compradorId = comprador.id;
                vendaData.compradorNome = comprador.nome;
                vendaData.compradorTipo = comprador.tipo;
                vendaData.status = 'pendente';
                transaction.set(db.collection('biblioteca_contas_a_receber').doc(), vendaData);
            }
        });
        return { success: true, message: 'Venda da biblioteca registrada com sucesso!' };
    } catch (error) {
        console.error("Erro ao registrar venda da biblioteca:", error);
        if (error instanceof HttpsError) { throw error; }
        throw new HttpsError('internal', 'Ocorreu um erro ao salvar a venda.');
    }
});

exports.gerenciarEmprestimoBiblioteca = onCall(OPCOES_FUNCAO, async (request) => {
    if (!request.auth) { throw new HttpsError('unauthenticated', 'A função deve ser chamada por um usuário autenticado.'); }
    const permissoes = ['super-admin', 'diretor', 'bibliotecario'];
    if (!permissoes.includes(request.auth.token.role)) { throw new HttpsError('permission-denied', 'Permissão negada.'); }
    const { acao, livroId, leitor, emprestimoId } = request.data;
    const livroRef = db.collection('biblioteca_livros').doc(livroId);
    if (acao === 'emprestar') {
        if (!livroId || !leitor) throw new HttpsError('invalid-argument', 'Dados do empréstimo incompletos.');
        await db.runTransaction(async (transaction) => {
            const livroDoc = await transaction.get(livroRef);
            if (!livroDoc.exists || livroDoc.data().finalidade !== 'Empréstimo') throw new HttpsError('failed-precondition', 'Este livro não é para empréstimo.');
            if (livroDoc.data().quantidade < 1) throw new HttpsError('failed-precondition', 'Não há cópias disponíveis.');
            const emprestimoData = { livroId, livroTitulo: livroDoc.data().titulo, leitor: { id: leitor.id || null, nome: leitor.nome, tipo: leitor.tipo }, dataEmprestimo: admin.firestore.FieldValue.serverTimestamp(), status: 'emprestado' };
            transaction.set(db.collection('biblioteca_emprestimos').doc(), emprestimoData);
            transaction.update(livroRef, { quantidade: admin.firestore.FieldValue.increment(-1) });
        });
        return { success: true, message: 'Empréstimo registrado com sucesso!' };
    } else if (acao === 'devolver') {
        if (!emprestimoId || !livroId) throw new HttpsError('invalid-argument', 'Dados da devolução incompletos.');
        const emprestimoRef = db.collection('biblioteca_emprestimos').doc(emprestimoId);
        await db.runTransaction(async (transaction) => {
            const emprestimoDoc = await transaction.get(emprestimoRef);
            if (!emprestimoDoc.exists || emprestimoDoc.data().status !== 'emprestado') throw new HttpsError('failed-precondition', 'Este empréstimo não está ativo.');
            transaction.update(emprestimoRef, { status: 'devolvido', dataDevolucao: admin.firestore.FieldValue.serverTimestamp() });
            transaction.update(livroRef, { quantidade: admin.firestore.FieldValue.increment(1) });
        });
        return { success: true, message: 'Devolução registrada com sucesso!' };
    }
    throw new HttpsError('invalid-argument', 'Ação desconhecida.');
});

exports.gerarRelatorioBiblioteca = onCall(OPCOES_FUNCAO, async (request) => {
    if (!request.auth) { throw new HttpsError('unauthenticated', 'A função deve ser chamada por um usuário autenticado.'); }
    const permissoes = ['super-admin', 'diretor', 'bibliotecario'];
    if (!permissoes.includes(request.auth.token.role)) { throw new HttpsError('permission-denied', 'Permissão negada.'); }
    const { ano, mes } = request.data;
    if (!ano || !mes) { throw new HttpsError('invalid-argument', 'Mês e ano são obrigatórios.'); }
    const inicioDoMes = new Date(ano, mes - 1, 1);
    const fimDoMes = new Date(ano, mes, 0, 23, 59, 59);
    try {
        const qVista = db.collection('biblioteca_vendas_avista').where('registradoEm', '>=', inicioDoMes).where('registradoEm', '<=', fimDoMes);
        const qPrazo = db.collection('biblioteca_contas_a_receber').where('registradoEm', '>=', inicioDoMes).where('registradoEm', '<=', fimDoMes);
        const qEmprestimos = db.collection('biblioteca_emprestimos').where('dataEmprestimo', '>=', inicioDoMes).where('dataEmprestimo', '<=', fimDoMes);
        const [snapshotVista, snapshotPrazo, snapshotEmprestimos] = await Promise.all([qVista.get(), qPrazo.get(), qEmprestimos.get()]);
        const vendasVista = snapshotVista.docs.map(doc => ({ ...doc.data(), registradoEm: doc.data().registradoEm.toDate().toISOString() }));
        const vendasPrazo = snapshotPrazo.docs.map(doc => ({ ...doc.data(), registradoEm: doc.data().registradoEm.toDate().toISOString() }));
        const emprestimos = snapshotEmprestimos.docs.map(doc => ({ ...doc.data(), dataEmprestimo: doc.data().dataEmprestimo.toDate().toISOString(), dataDevolucao: doc.data().dataDevolucao ? doc.data().dataDevolucao.toDate().toISOString() : null }));
        return { vendas: [...vendasVista, ...vendasPrazo], emprestimos: emprestimos };
    } catch (error) {
        console.error("Erro ao gerar relatório da biblioteca:", error);
        throw new HttpsError('internal', 'Ocorreu um erro ao buscar os dados do relatório.');
    }
});

exports.atribuirCodigoVoluntario = onDocumentCreated({ ...OPCOES_FUNCAO, document: 'voluntarios/{voluntarioId}' }, async (event) => {
    const snap = event.data;
    if (!snap) return null;
    const dados = snap.data();
    if (dados.codigoVoluntario) return null;
    const counterRef = db.doc('counters/voluntarios');
    return db.runTransaction(async (transaction) => {
        const counterDoc = await transaction.get(counterRef);
        let nextCode = 1001;
        if (counterDoc.exists && counterDoc.data().lastCode) {
            nextCode = counterDoc.data().lastCode + 1;
        }
        transaction.update(snap.ref, { codigoVoluntario: nextCode });
        transaction.set(counterRef, { lastCode: nextCode }, { merge: true });
    });
});

// ROBO 2: Função para atribuir códigos a TODOS os voluntários existentes que ainda não têm um. (VERSÃO CORRIGIDA)
exports.atribuirCodigosVoluntarios = onCall(OPCOES_FUNCAO, async (request) => {
    const permissoes = ['super-admin', 'diretor', 'tesoureiro'];
    if (!request.auth || !permissoes.includes(request.auth.token.role)) {
        throw new HttpsError('permission-denied', 'Permissão negada.');
    }

    const voluntariosRef = db.collection('voluntarios');
    const counterRef = db.doc('counters/voluntarios');

    try {
        // 1. Pega TODOS os voluntários
        const snapshot = await voluntariosRef.get();
        
        // 2. Filtra na memória para encontrar apenas aqueles onde o campo 'codigoVoluntario' não existe.
        const voluntariosSemCodigo = snapshot.docs.filter(doc => !doc.data().codigoVoluntario);

        if (voluntariosSemCodigo.length === 0) {
            throw new HttpsError('not-found', 'Todos os voluntários já possuem um código.');
        }

        let voluntariosProcessados = 0;
        await db.runTransaction(async (transaction) => {
            const counterDoc = await transaction.get(counterRef);
            let nextCode = counterDoc.exists && counterDoc.data().lastCode ? counterDoc.data().lastCode : 1000;

            voluntariosSemCodigo.forEach(doc => {
                nextCode++;
                transaction.update(doc.ref, { codigoVoluntario: nextCode });
                voluntariosProcessados++;
            });

            if (voluntariosProcessados > 0) {
                transaction.set(counterRef, { lastCode: nextCode }, { merge: true });
            }
        });

        return { success: true, message: `${voluntariosProcessados} voluntários foram atualizados com novos códigos.` };
    } catch (error) {
        console.error("Erro ao atribuir códigos:", error);
        if (error instanceof HttpsError) { throw error; }
        throw new HttpsError('internal', 'Ocorreu um erro ao processar os voluntários.');
    }
});

exports.uploadAtaParaStorage = onCall(OPCOES_FUNCAO, async (request) => {
    if (!request.auth) { throw new HttpsError('unauthenticated', 'A função deve ser chamada por um usuário autenticado.'); }
    const permissoes = ['super-admin', 'diretor', 'tesoureiro'];
    if (!permissoes.includes(request.auth.token.role)) { throw new HttpsError('permission-denied', 'Permissão negada.'); }
    const { fileName, fileType, fileData, tituloAta, dataReuniao } = request.data;
    if (!fileName || !fileType || !fileData || !tituloAta || !dataReuniao) { throw new HttpsError('invalid-argument', 'Dados incompletos para o upload.'); }
    try {
        const bucket = storage.bucket();
        const filePath = `atas/${Date.now()}-${fileName}`;
        const file = bucket.file(filePath);
        const buffer = Buffer.from(fileData.split(',')[1], 'base64');
        await file.save(buffer, { metadata: { contentType: fileType }, public: true });
        const publicUrl = file.publicUrl();
        await db.collection('atas').add({
            titulo: tituloAta,
            dataReuniao: new Date(dataReuniao),
            storagePath: filePath,
            fileUrl: publicUrl,
            enviadoPor: { uid: request.auth.uid, nome: request.auth.token.name || request.auth.token.email },
            criadoEm: admin.firestore.FieldValue.serverTimestamp()
        });
        return { success: true, message: 'Ata arquivada com sucesso!' };
    } catch (error) {
        console.error("Erro ao fazer upload para o Firebase Storage:", error);
        throw new HttpsError('internal', 'Não foi possível enviar o arquivo.');
    }
});

// ===================================================================
// ===== NOVAS FUNÇÕES PARA GERAÇÃO DE CRACHÁS =======================
// ===================================================================

// ROBO DE NOMES: Roda sempre que um voluntário é criado ou seu nome é alterado.
exports.atualizarNomesParaCracha = onDocumentWritten({ ...OPCOES_FUNCAO, document: 'voluntarios/{voluntarioId}' }, async (event) => {
    const dadosNovos = event.data.after.data();
    const dadosAntigos = event.data.before ? event.data.before.data() : null;

    // Se o documento foi apagado ou o nome não mudou, não faz nada.
    if (!event.data.after.exists || (dadosAntigos && dadosNovos.nome === dadosAntigos.nome)) {
        return null;
    }

    const nomeCompleto = dadosNovos.nome;
    if (!nomeCompleto) return null;

    const partesNome = nomeCompleto.trim().split(' ');
    const primeiroNome = partesNome[0];

    // Encontra todos os voluntários com o mesmo primeiro nome
    const voluntariosComMesmoNomeRef = db.collection('voluntarios').where('primeiroNome', '==', primeiroNome);
    const snapshot = await voluntariosComMesmoNomeRef.get();

    const batch = db.batch();

    if (snapshot.size <= 1 && !snapshot.empty) {
        // Se só há um (ou nenhum) com este primeiro nome, o nome do crachá é só o primeiro nome
        const doc = snapshot.docs[0];
        batch.update(doc.ref, { nomeParaCracha: primeiroNome });

    } else if (snapshot.size > 1) {
        // Se há múltiplos, atualiza todos para "PrimeiroNome Sobrenome"
        snapshot.docs.forEach(doc => {
            const v = doc.data();
            const partes = v.nome.trim().split(' ');
            const pNome = partes[0];
            const uNome = partes.length > 1 ? partes[partes.length - 1] : '';
            const nomeCracha = `${pNome} ${uNome}`.trim();
            batch.update(doc.ref, { nomeParaCracha: nomeCracha });
        });
    }
    
    // Atualiza o campo 'primeiroNome' do voluntário atual para futuras buscas
    batch.update(event.data.after.ref, { primeiroNome: primeiroNome });
    
    return batch.commit();
});

// FUNÇÃO DE GERAÇÃO: Cria a imagem do crachá sob demanda
exports.gerarCracha = onCall({ ...OPCOES_FUNCAO, memory: '1GiB' }, async (request) => {
    const { nomeParaCracha, codigoVoluntario } = request.data;
    if (!nomeParaCracha || !codigoVoluntario) {
        throw new HttpsError('invalid-argument', 'Nome e código são obrigatórios.');
    }

    try {
        const bucket = storage.bucket();
        
        // Baixar template e fonte do Firebase Storage
        const [templateBuffer] = await bucket.file('template_cracha.png').download();
        const [fonteBuffer] = await bucket.file('fonte_cracha.ttf').download();

        // Gerar código de barras em memória
        const barcodePngBuffer = await bwipjs.toBuffer({
            bcid: 'code128',
            text: String(codigoVoluntario),
            scale: 3,
            height: 12,
            includetext: true,
            textxalign: 'center',
            textcolor: '56ad59', // Verde do seu design
            barcolor: '56ad59'
        });

        // Criar o texto do nome como um SVG para ter mais controle
        const textoSvg = `
        <svg width="1011" height="150">
          <style>
            .title { fill: #56ad59; font-size: 70px; font-weight: bold; font-family: "CrachaFont"; }
          </style>
          <text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" class="title">${nomeParaCracha.toUpperCase()}</text>
        </svg>`;
        const textoBuffer = Buffer.from(textoSvg);

        // Usar Sharp para compor a imagem final
        const crachaFinalBuffer = await sharp(templateBuffer)
            .composite([
                { input: textoBuffer, top: 380, left: 0 },
                { input: barcodePngBuffer, top: 510, left: 425 } // Posições ajustadas
            ])
            .png()
            .toBuffer();

        // Retornar a imagem como uma string Base64
        return { success: true, imageBase64: crachaFinalBuffer.toString('base64') };

    } catch (error) {
        console.error("Erro ao gerar crachá:", error);
        throw new HttpsError('internal', 'Não foi possível gerar a imagem do crachá.');
    }
});


// FUNÇÃO UTILITÁRIA: Roda uma vez para criar nomes para voluntários antigos
exports.backfillNomesCracha = onCall(OPCOES_FUNCAO, async (request) => {
    // ... (código da função de backfill - incluirei no arquivo completo)
    // Este código garante que todos os voluntários existentes tenham o campo `nomeParaCracha`
    const snapshot = await db.collection('voluntarios').get();
    const grupos = {};
    
    // Agrupa voluntários por primeiro nome
    snapshot.docs.forEach(doc => {
        const nome = doc.data().nome;
        if (!nome) return;
        const primeiroNome = nome.trim().split(' ')[0];
        if (!grupos[primeiroNome]) {
            grupos[primeiroNome] = [];
        }
        grupos[primeiroNome].push({ id: doc.id, ...doc.data() });
    });

    const batch = db.batch();
    let atualizacoes = 0;

    // Determina o nome para o crachá
    for (const primeiroNome in grupos) {
        const voluntarios = grupos[primeiroNome];
        
        // Atualiza o campo 'primeiroNome' para todos para consistência
        voluntarios.forEach(v => {
            const docRef = db.collection('voluntarios').doc(v.id);
            batch.update(docRef, { primeiroNome: primeiroNome });
        });

        if (voluntarios.length === 1) {
            const docRef = db.collection('voluntarios').doc(voluntarios[0].id);
            batch.update(docRef, { nomeParaCracha: primeiroNome });
            atualizacoes++;
        } else {
            voluntarios.forEach(v => {
                const docRef = db.collection('voluntarios').doc(v.id);
                const partes = v.nome.trim().split(' ');
                const uNome = partes.length > 1 ? partes[partes.length - 1] : '';
                const nomeCracha = `${primeiroNome} ${uNome}`.trim();
                batch.update(docRef, { nomeParaCracha: nomeCracha });
                atualizacoes++;
            });
        }
    }

    await batch.commit();
    return { success: true, message: `${atualizacoes} voluntários foram processados.` };
});

// #####################################################################
// ## INÍCIO DO BLOCO DO MÓDULO EDUCACIONAL (VERSÃO FINAL E UNIFICADA v2)
// #####################################################################

const aulasEAE = [
    { numeroDaAula: 1, titulo: "Aula inaugural", ano: 1 },
    { numeroDaAula: 2, titulo: "A Criação", ano: 1 },
    { numeroDaAula: 3, titulo: "O nosso Planeta", ano: 1 },
    { numeroDaAula: 4, titulo: "As raças primitivas", ano: 1 },
    { numeroDaAula: 5, titulo: "Constituição Geográfica da Terra", ano: 1 },
    { numeroDaAula: 6, titulo: "Civilização da Mesopotâmia", ano: 1 },
    { numeroDaAula: 7, titulo: "Missão Planetária de Moisés/Preparação dos Hebreus no deserto", ano: 1 },
    { numeroDaAula: 8, titulo: "Introdução ao Processo de Reforma Íntima", ano: 1 },
    { numeroDaAula: 9, titulo: "O Decálogo/Regresso a Canaã/A morte de Moisés", ano: 1 },
    { numeroDaAula: 10, titulo: "O governo dos Juízes/O governo dos Reis até Salomão", ano: 1 },
    { numeroDaAula: 11, titulo: "Separação dos Reinos/Sua Destruição/O período do cativeiro até a rec de Jerusalém", ano: 1 },
    { numeroDaAula: 12, titulo: "História de Israel e dominação estrangeira", ano: 1 },
    { numeroDaAula: 13, titulo: "Implantação do Caderno de Temas", ano: 1 },
    { numeroDaAula: 14, titulo: "O nascimento e controvérsias doutrinárias", ano: 1 },
    { numeroDaAula: 15, titulo: "Os reis magos e o exílio no estrangeiro", ano: 1 },
    { numeroDaAula: 16, titulo: "Infância e juventude do Messias", ano: 1 },
    { numeroDaAula: 17, titulo: "Jerusalém e o grande templo/Reis e líderes", ano: 1 },
    { numeroDaAula: 18, titulo: "As seitas nacionais/Os costumes da época", ano: 1 },
    { numeroDaAula: 19, titulo: "A Fraternidade Essênia", ano: 1 },
    { numeroDaAula: 20, titulo: "O precursor", ano: 1 },
    { numeroDaAula: 21, titulo: "O início da tarefa pública/Os primeiros discípulos", ano: 1 },
    { numeroDaAula: 22, titulo: "A volta a Jerusalém e as escolas rabínicas", ano: 1 },
    { numeroDaAula: 23, titulo: "Promoção do candidato ao grau de aprendiz", ano: 1 },
    { numeroDaAula: 24, titulo: "Implantação da Caderneta Pessoal", ano: 1 },
    { numeroDaAula: 25, titulo: "Regresso à Galiléia/A morte de João Batista", ano: 1 },
    { numeroDaAula: 26, titulo: "Os trabalhos na Galiléia", ano: 1 },
    { numeroDaAula: 27, titulo: "As parábolas. Introdução. (I) Usos e costumes sociais", ano: 1 },
    { numeroDaAula: 28, titulo: "Pregações e curas", ano: 1 },
    { numeroDaAula: 29, titulo: "Hostilidades do Sinédrio", ano: 1 },
    { numeroDaAula: 30, titulo: "O desenvolvimento da pregação", ano: 1 },
    { numeroDaAula: 31, titulo: "As parábolas. (II) Domésticas e Familiares. Distribuição do 1º teste", ano: 1 },
    { numeroDaAula: 32, titulo: "Implantação das Caravanas de Evangelização e Auxílio", ano: 1 },
    { numeroDaAula: 33, titulo: "O quadro dos apóstolos e a consagração", ano: 1 },
    { numeroDaAula: 34, titulo: "Excursões ao estrangeiro", ano: 1 },
    { numeroDaAula: 35, titulo: "As parábolas. (III) Vida rural", ano: 1 },
    { numeroDaAula: 36, titulo: "O Sermão do Monte", ano: 1 },
    { numeroDaAula: 37, titulo: "A gênese da alma", ano: 1 },
    { numeroDaAula: 38, titulo: "Atos finais na Galiléia", ano: 1 },
    { numeroDaAula: 39, titulo: "Últimos dias em Jerusalém", ano: 1 },
    { numeroDaAula: 40, titulo: "Encerramento da Tarefa Planetária", ano: 1 },
    { numeroDaAula: 41, titulo: "Prisão e entrega aos romanos. Distribuição do 2º teste", ano: 1 },
    { numeroDaAula: 42, titulo: "O tribunal judaíco", ano: 1 },
    { numeroDaAula: 43, titulo: "O julgamento de Pilatos", ano: 1 },
    { numeroDaAula: 44, titulo: "O Calvário", ano: 1 },
    { numeroDaAula: 45, titulo: "Ressurreição", ano: 1 },
    { numeroDaAula: 46, titulo: "Exame espiritual", ano: 1 },
    { numeroDaAula: 47, titulo: "Exame espiritual", ano: 1 },
    { numeroDaAula: 48, titulo: "Passagem para o grau de servidor/Inscrição para o Curso de Médiuns", ano: 2 },
    { numeroDaAula: 49, titulo: "Evolução do Homem animal para o homem espiritual", ano: 2 },
    { numeroDaAula: 50, titulo: "Interpretação do Sermão do Monte", ano: 2 },
    { numeroDaAula: 51, titulo: "Interpretação do Sermão do Monte", ano: 2 },
    { numeroDaAula: 52, titulo: "Interpretação do Sermão do Monte", ano: 2 },
    { numeroDaAula: 53, titulo: "Interpretação do Sermão do Monte", ano: 2 },
    { numeroDaAula: 54, titulo: "Fundação da igreja cristã", ano: 2 },
    { numeroDaAula: 55, titulo: "Ascensão", ano: 2 },
    { numeroDaAula: 56, titulo: "Vida Plena – Conceito", ano: 2 },
    { numeroDaAula: 57, titulo: "Instituição dos diáconos. Distribuição do 3º teste", ano: 2 },
    { numeroDaAula: 58, titulo: "A conversão de Paulo", ano: 2 },
    { numeroDaAula: 59, titulo: "O apóstolo Paulo e suas pregações", ano: 2 },
    { numeroDaAula: 60, titulo: "Paulo defende-se em Jerusalém", ano: 2 },
    { numeroDaAula: 61, titulo: "Os apóstolos que mais se destacaram e seus principais atos", ano: 2 },
    { numeroDaAula: 62, titulo: "Preconceito – Definição", ano: 2 },
    { numeroDaAula: 63, titulo: "Preconceito / Vivência (Exercício de Vida Plena)", ano: 2 },
    { numeroDaAula: 64, titulo: "O estudo das epístolas", ano: 2 },
    { numeroDaAula: 65, titulo: "A predestinação segundo a doutrina de Paulo", ano: 2 },
    { numeroDaAula: 66, titulo: "Justificação dos pecados", ano: 2 },
    { numeroDaAula: 67, titulo: "Continuação das epístolas", ano: 2 },
    { numeroDaAula: 68, titulo: "Vícios e defeitos – Conceitos", ano: 2 },
    { numeroDaAula: 69, titulo: "A doutrina de Tiago sobre a salvação", ano: 2 },
    { numeroDaAula: 70, titulo: "A doutrina de Pedro, João e Judas", ano: 2 },
    { numeroDaAula: 71, titulo: "O apocalipse de João", ano: 2 },
    { numeroDaAula: 72, titulo: "O apocalipse de João. Distrib. do 4º teste", ano: 2 },
    { numeroDaAula: 73, titulo: "Vícios e defeitos / Vivência (Exercício de Vida Plena)", ano: 2 },
    { numeroDaAula: 74, titulo: "Ciência e Religião", ano: 2 },
    { numeroDaAula: 75, titulo: "Pensamento e Vontade", ano: 2 },
    { numeroDaAula: 76, titulo: "Lei de Ação e Reação", ano: 2 },
    { numeroDaAula: 77, titulo: "Amor como lei soberana, o valor científico da prece, lei da solidariedade", ano: 2 },
    { numeroDaAula: 78, titulo: "A Medicina Psicossomática", ano: 2 },
    { numeroDaAula: 79, titulo: "Exercício de Vida Plena", ano: 2 },
    { numeroDaAula: 80, titulo: "Curas e milagres do Evangelho", ano: 2 },
    { numeroDaAula: 81, titulo: "Cosmogonias e concepções do Universo", ano: 2 },
    { numeroDaAula: 82, titulo: "Estudos dos seres e das formas", ano: 2 },
    { numeroDaAula: 83, titulo: "Evolução nos diferentes reinos/Histórico da evolução dos seres vivos", ano: 2 },
    { numeroDaAula: 84, titulo: "Leis universais", ano: 2 },
    { numeroDaAula: 85, titulo: "Exercício de Vida Plena", ano: 2 },
    { numeroDaAula: 86, titulo: "O Plano Divino / A Lei da Evolução. Distrib. do 5º teste", ano: 2 },
    { numeroDaAula: 87, titulo: "A Lei do Trabalho / A Lei da Justiça", ano: 2 },
    { numeroDaAula: 88, titulo: "A Lei do Amor", ano: 2 },
    { numeroDaAula: 89, titulo: "Amor a Deus, ao próximo e aos inimigos", ano: 2 },
    { numeroDaAula: 90, titulo: "A filosofia da dor", ano: 2 },
    { numeroDaAula: 91, titulo: "Normas da vida espiritual", ano: 2 },
    { numeroDaAula: 92, titulo: "Exame espiritual", ano: 2 },
    { numeroDaAula: 93, titulo: "Exame espiritual", ano: 2 },
    { numeroDaAula: 94, titulo: "Estrutura da Aliança e de um Centro Espírtia. Como abrir um Centro Espírita", ano: 3 },
    { numeroDaAula: 95, titulo: "Nova frente de trabalho", ano: 3 },
    { numeroDaAula: 96, titulo: "Evolução Anímica (I)", ano: 3 },
    { numeroDaAula: 97, titulo: "Evolução Anímica (II)", ano: 3 },
    { numeroDaAula: 98, titulo: "Categoria dos mundos", ano: 3 },
    { numeroDaAula: 99, titulo: "Imortalidade", ano: 3 },
    { numeroDaAula: 100, titulo: "A Fraternidade do Trevo e FDJ", ano: 3 },
    { numeroDaAula: 101, titulo: "Reencarnação", ano: 3 },
    { numeroDaAula: 102, titulo: "Exercício de Vida Plena", ano: 3 },
    { numeroDaAula: 103, titulo: "Regras para a educação. Conduta e aperfeiçoamento dos seres", ano: 3 },
    { numeroDaAula: 104, titulo: "Regras para a educação. Conduta e aperfeiçoamento dos seres", ano: 3 },
    { numeroDaAula: 105, titulo: "Regras para a educação. Conduta e aperfeiçoamento dos seres", ano: 3 },
    { numeroDaAula: 106, titulo: "O papel do discípulo. Distrib. do 6º teste", ano: 3 },
    { numeroDaAula: 107, titulo: "O cristão no lar", ano: 3 },
    { numeroDaAula: 108, titulo: "O cristão no meio religioso e no meio profano", ano: 3 },
    { numeroDaAula: 109, titulo: "Os recursos do cristão", ano: 3 },
    { numeroDaAula: 110, titulo: "Exercício de Vida Plena", ano: 3 },
    { numeroDaAula: 111, titulo: "Iniciação espiritual", ano: 3 },
    { numeroDaAula: 112, titulo: "Estudo do perispírito / Centros de força", ano: 3 },
    { numeroDaAula: 113, titulo: "Regras de conduta", ano: 3 },
    { numeroDaAula: 114, titulo: "O espírito e o sexo", ano: 3 },
    { numeroDaAula: 115, titulo: "Problemas da propagação do Espiritismo", ano: 3 },
    { numeroDaAula: 116, titulo: "Exame espiritual", ano: 3 },
    { numeroDaAula: 117, titulo: "Exame espiritual", ano: 3 },
    { numeroDaAula: 118, titulo: "Exame espiritual. Devolução das cadernetas.Esclarecimentos sobre o período probatório de três meses após o estudo de O Livro dos Espíritos", ano: 3 },
    { numeroDaAula: 119, titulo: "Metodologia de estudo e distribuição dos capítulos entre os alunos", ano: 3 },
    { numeroDaAula: 120, titulo: "Introdução e Prolegômenos", ano: 3 },
    { numeroDaAula: 121, titulo: "Livro I (Cap. 1 a 4) – Das Causas Primárias: Deus / Dos Elementos Gerais do Universo / Da Criação / Do Princípio Vital", ano: 3 },
    { numeroDaAula: 122, titulo: "Livro II (Cap. 1 e 2) – Do mundo Espírita ou Mundo dos Espíritos: Dos Espíritos / Da Encarnação dos Espíritos", ano: 3 },
    { numeroDaAula: 123, titulo: "Livro II (Cap. 3 e 4) – Da Volta do Espírito, extinta a vida corpórea, à vida espiritual / Da Pluralidade das existências", ano: 3 },
    { numeroDaAula: 124, titulo: "Livro II (Cap. 5) – Considerações sobre a Pluralidade das existências", ano: 3 },
    { numeroDaAula: 125, titulo: "Livro II (Cap. 6) – Da Vida Espírita", ano: 3 },
    { numeroDaAula: 126, titulo: "Livro II (Cap. 7) – Da Volta do Espírito à vida corporal", ano: 3 },
    { numeroDaAula: 127, titulo: "Livro II (Cap. 8) – Da Emancipação da Alma", ano: 3 },
    { numeroDaAula: 128, titulo: "Livro II (Cap. 9) – Da Intervenção dos Espíritos no mundo corporal", ano: 3 },
    { numeroDaAula: 129, titulo: "Livro II (Cap. 10 e 11) – Das ocupações e missões dos Espíritos / Dos Três Reinos", ano: 3 },
    { numeroDaAula: 130, titulo: "Livro III (Cap. 1 a 3) – Das Leis Morais: Da Lei Divina ou Natural / Da Lei de Adoração / Da Lei do Trabalho", ano: 3 },
    { numeroDaAula: 131, titulo: "Livro III (Cap. 4 a 7) – Da Lei da Reprodução / Da Lei de Conservação / Da Lei de Destruição / Da Lei de Sociedade", ano: 3 },
    { numeroDaAula: 132, titulo: "Livro III (Cap. 8 a 10) – Da Lei do Progresso / Da Lei de Igualdade / Da Lei de Liberdade", ano: 3 },
    { numeroDaAula: 133, titulo: "Livro III (Cap. 11 e 12) – Da Lei de Justiça, de Amor e de Caridade / Da Perfeição Moral", ano: 3 },
    { numeroDaAula: 134, titulo: "Livro IV (Cap 1) – Das Esperanças e Consolações: Das Penas e Gozos Terrestres", ano: 3 },
    { numeroDaAula: 135, titulo: "Livro IV ( Cap 2 ) e Conclusão – Das Penas e Gozos Futuros", ano: 3 },
    { numeroDaAula: 136, titulo: "Confraternização pela conclusão das atividades presenciais", ano: 3 }
];

/**
 * ROBÔ 1: Cadastra automaticamente as aulas da EAE.
 */
exports.cadastrarAulasEAEAutomaticamente = onDocumentCreated({ ...OPCOES_FUNCAO, document: 'cursos/{cursoId}' }, async (event) => {
    // Código desta função (sem alterações)
    const snap = event.data;
    if (!snap) return null;
    const dadosCurso = snap.data();
    if (dadosCurso.isEAE !== true) { return null; }
    const cursoId = event.params.cursoId;
    const curriculoRef = db.collection('cursos').doc(cursoId).collection('curriculo');
    const batch = db.batch();
    aulasEAE.forEach(aula => {
        const novaAulaRef = curriculoRef.doc();
        batch.set(novaAulaRef, { numeroDaAula: aula.numeroDaAula, titulo: aula.titulo, ano: aula.ano });
    });
    try {
        await batch.commit();
        console.log(`Sucesso! Aulas da EAE cadastradas para o curso:`, cursoId);
    } catch (error) {
        console.error("Erro ao cadastrar aulas da EAE:", error);
    }
    return null;
});

/**
 * ROBÔ 2: Gera o cronograma inicial quando uma nova turma é criada.
 */
exports.gerarCronogramaAutomaticamente = onDocumentCreated({ ...OPCOES_FUNCAO, document: 'turmas/{turmaId}' }, async (event) => {
    // Código desta função (sem alterações)
    const snap = event.data;
    if (!snap) return null;
    const dadosTurma = snap.data();
    const turmaId = event.params.turmaId;
    const { cursoId, dataInicio, diaDaSemana } = dadosTurma;
    if (!cursoId || !dataInicio || diaDaSemana === undefined) return null;
    try {
        const aulasGabaritoRef = db.collection('cursos').doc(cursoId).collection('curriculo');
        const aulasSnapshot = await aulasGabaritoRef.orderBy('numeroDaAula').get();
        if (aulasSnapshot.empty) return null;
        let dataAtual = dataInicio.toDate();
        // LINHA NOVA (com getUTCDay):
while (dataAtual.getUTCDay() !== diaDaSemana) { dataAtual.setDate(dataAtual.getDate() + 1); }
        const cronogramaRef = db.collection('turmas').doc(turmaId).collection('cronograma');
        const batch = db.batch();
        aulasSnapshot.forEach(doc => {
            const novaAulaCronogramaRef = cronogramaRef.doc();
            batch.set(novaAulaCronogramaRef, { ...doc.data(), gabaritoAulaId: doc.id, dataAgendada: admin.firestore.Timestamp.fromDate(dataAtual), status: 'agendada', isExtra: false });
            dataAtual.setDate(dataAtual.getDate() + 7);
        });
        await batch.commit();
        console.log(`SUCESSO! Cronograma gerado para a turma ${turmaId}.`);
    } catch (error) {
        console.error(`Erro CRÍTICO ao gerar cronograma para a turma ${turmaId}:`, error);
    }
    return null;
});

// ==========================================================
// ## FUNÇÃO recalcularCronogramaCompleto CORRIGIDA ##
// ==========================================================
exports.recalcularCronogramaCompleto = onDocumentWritten({ ...OPCOES_FUNCAO, document: 'turmas/{turmaId}/{subcolecao}/{docId}' }, async (event) => {

    const { turmaId, subcolecao } = event.params;

    // Só reage a mudanças em cronograma ou recessos
    if (subcolecao !== "cronograma" && subcolecao !== "recessos") {
        return null;
    }

    // Ignora a criação inicial de aulas REGULARES para evitar loop com o robô 2
    const dadosDepois = event.data.after.data();
    const isCreation = !event.data.before.exists;
    const isAulaRegular = dadosDepois && dadosDepois.isExtra !== true;

    if (subcolecao === "cronograma" && isCreation && isAulaRegular) {
        console.log(`CRIAÇÃO de aula regular ${dadosDepois?.numeroDaAula}. Robô Recalcular ignora.`);
        return null;
    }

    console.log(`Gatilho de reajuste válido para turma ${turmaId} (mudança em ${subcolecao}, Doc: ${event.params.docId}). Iniciando recálculo...`);

    try {
        const turmaRef = db.collection("turmas").doc(turmaId);
        const turmaDoc = await turmaRef.get();
        if (!turmaDoc.exists) {
             console.warn(`Turma ${turmaId} não encontrada. Abortando recálculo.`);
             return null;
        }

        const turmaData = turmaDoc.data();
        // Garante que temos os dados necessários
        if (!turmaData.dataInicio || turmaData.diaDaSemana === undefined) {
            console.warn(`Turma ${turmaId} sem data de início ou dia da semana definidos. Abortando recálculo.`);
            return null;
        }
        const dataInicio = turmaData.dataInicio.toDate();
        const diaDaSemana = turmaData.diaDaSemana;

        // Busca todas as aulas normais, extras e recessos
        const [aulasNormaisSnap, aulasExtrasSnap, recessosSnap] = await Promise.all([
            turmaRef.collection("cronograma").where("isExtra", "==", false).orderBy("numeroDaAula").get(),
            turmaRef.collection("cronograma").where("isExtra", "==", true).get(),
            turmaRef.collection("recessos").get(),
        ]);

        // ### AJUSTE NA COMPARAÇÃO DE DATAS ###
        // Função auxiliar para obter YYYY-MM-DD de um Date object (considerando UTC para evitar fuso)
        const toYYYYMMDD = (date) => {
            const d = new Date(date); // Cria cópia para não modificar original
            const year = d.getUTCFullYear();
            const month = String(d.getUTCMonth() + 1).padStart(2, '0');
            const day = String(d.getUTCDate()).padStart(2, '0');
            return `${year}-${month}-${day}`;
        };

        // Cria um SET (conjunto) de strings YYYY-MM-DD das datas ocupadas por aulas extras
        const datasOcupadasExtras = new Set(
            aulasExtrasSnap.docs.map(doc => toYYYYMMDD(doc.data().dataAgendada.toDate()))
        );
        console.log(`Datas ocupadas por aulas extras (YYYY-MM-DD):`, Array.from(datasOcupadasExtras));

        // Cria array de períodos de recesso (comparação mantém objetos Date por enquanto)
        const periodosRecesso = recessosSnap.docs.map(doc => ({
             // Zera a hora para comparar apenas dias
            inicio: new Date(doc.data().dataInicio.toDate().setUTCHours(0, 0, 0, 0)),
            fim: new Date(doc.data().dataFim.toDate().setUTCHours(0, 0, 0, 0)),
        }));
        console.log(`Períodos de Recesso (UTC):`, periodosRecesso);


        const batch = db.batch();
        let dataAulaAtual = new Date(dataInicio.getTime()); // Começa na data de início da turma
        let aulasAtualizadasCount = 0;

        // Loop pelas AULAS NORMAIS em ordem
        for (const aulaDoc of aulasNormaisSnap.docs) {
            const aulaDataOriginal = aulaDoc.data();

            // Encontra o próximo dia da semana correto (ou a própria data de início se for o dia certo)
            while (dataAulaAtual.getDay() !== diaDaSemana) {
                dataAulaAtual.setDate(dataAulaAtual.getDate() + 1);
            }
             // Zera a hora para garantir consistência na comparação
            dataAulaAtual.setUTCHours(0,0,0,0);


            // Verifica se a data atual está ocupada (extra ou recesso)
            let dataValidaEncontrada = false;
            while (!dataValidaEncontrada) {
                 // Converte dataAulaAtual para string YYYY-MM-DD para checar no Set
                const dataAtualStr = toYYYYMMDD(dataAulaAtual);
                let isDataOcupada = datasOcupadasExtras.has(dataAtualStr);

                // Compara dataAulaAtual (já zerada) com os períodos de recesso (também zerados)
                let isRecesso = periodosRecesso.some(p => dataAulaAtual >= p.inicio && dataAulaAtual <= p.fim);

                if (isDataOcupada || isRecesso) {
                    console.log(`Data ${dataAtualStr} pulada (Ocupada=${isDataOcupada}, Recesso=${isRecesso}) para aula ${aulaDataOriginal.numeroDaAula}.`);
                    // Se ocupada, avança 7 dias e RECOMEÇA a verificação para a nova data
                    dataAulaAtual.setDate(dataAulaAtual.getDate() + 7);
                    dataAulaAtual.setUTCHours(0,0,0,0); // Zera hora novamente
                } else {
                    // Data válida!
                    dataValidaEncontrada = true;
                }
            }

            // Compara a nova data calculada com a data atual no Firestore
            const dataAgendadaAtualNoFirestore = aulaDataOriginal.dataAgendada.toDate();
            // Compara apenas YYYY-MM-DD para evitar atualizações desnecessárias por causa de hora/fuso
            if (toYYYYMMDD(dataAulaAtual) !== toYYYYMMDD(dataAgendadaAtualNoFirestore)) {
                console.log(`Atualizando data da aula ${aulaDataOriginal.numeroDaAula} (${aulaDataOriginal.titulo}) para ${toYYYYMMDD(dataAulaAtual)}`);
                batch.update(aulaDoc.ref, { dataAgendada: admin.firestore.Timestamp.fromDate(dataAulaAtual) });
                aulasAtualizadasCount++;
            } else {
                 console.log(`Data da aula ${aulaDataOriginal.numeroDaAula} (${toYYYYMMDD(dataAulaAtual)}) já está correta. Nenhuma atualização necessária.`);
            }


            // Avança 7 dias para a PRÓXIMA aula normal
            dataAulaAtual.setDate(dataAulaAtual.getDate() + 7);
        }
        // ### FIM DO AJUSTE NA COMPARAÇÃO ###


        if (aulasAtualizadasCount > 0) {
            await batch.commit();
            console.log(`SUCESSO! ${aulasAtualizadasCount} aulas do cronograma da turma ${turmaId} foram reajustadas.`);
        } else {
            console.log(`Nenhuma data precisou ser alterada para a turma ${turmaId}.`);
        }

    } catch (error) {
        console.error(`ERRO CRÍTICO ao recalcular cronograma da turma ${turmaId}:`, error);
        // Considerar logar o erro em uma coleção específica para monitoramento
    }
    return null; // Encerra a função
});

// ==========================================================
// ## FIM DA FUNÇÃO recalcularCronogramaCompleto CORRIGIDA ##
// ==========================================================
// VERSÃO NOVA E CORRIGIDA (COM JUSTIFICADO E ABONO DE AULA EXTRA)
exports.calcularFrequencia = onDocumentWritten({ ...OPCOES_FUNCAO, document: 'turmas/{turmaId}/frequencias/{frequenciaId}' }, async (event) => {
    const turmaId = event.params.turmaId;
    const dadosFrequencia = event.data.after.exists ? event.data.after.data() : event.data.before.data();
    
    const participanteId = dadosFrequencia.participanteId;     // ID do Voluntário (ex: xYz987)
    const participanteDocId = dadosFrequencia.participanteDocId; // ID do Documento na subcoleção (ex: aBc123)

    if (!participanteId || !participanteDocId) {
        console.log("IDs de participante não encontrados no gatilho de frequência.");
        return null;
    }

    try {
        const turmaRef = db.collection('turmas').doc(turmaId);
        const turmaSnap = await turmaRef.get();
        if (!turmaSnap.exists) { return null; }
        const turmaData = turmaSnap.data();
        const anoAtual = turmaData.anoAtual || 1;
        
        const cronogramaRef = turmaRef.collection('cronograma');
        
        // 1. Busca todas as aulas que já foram marcadas como 'realizada'
        const aulasRealizadasSnapshot = await cronogramaRef.where('status', '==', 'realizada').get();
        
        const idsAulasRegularesDadas = [];
        const idsAulasExtrasDadas = [];
        
        aulasRealizadasSnapshot.forEach(doc => {
            const aula = doc.data();
            if (aula.isExtra === true) {
                // Lista de Aulas EXTRAS que foram dadas
                idsAulasExtrasDadas.push(doc.id);
            } else {
                // Lista de Aulas REGULARES que foram dadas
                idsAulasRegularesDadas.push(doc.id);
            }
        });

        // O denominador da frequência são apenas as aulas regulares
        const totalAulasDadas = idsAulasRegularesDadas.length;
        
        const participanteRef = turmaRef.collection('participantes').doc(participanteDocId); 
        
        if (totalAulasDadas === 0) {
            // Se nenhuma aula regular foi dada, zera a frequência e sai
            await participanteRef.set({ avaliacoes: { [anoAtual]: { notaFrequencia: 0 } } }, { merge: true });
            console.log(`Total de aulas dadas é 0 para ${participanteDocId}. Frequência definida como 0.`);
            return null;
        }
        
        // 2. Busca TODAS as frequências do aluno (presente, ausente, justificado)
        const frequenciasRef = turmaRef.collection('frequencias');
        const frequenciasSnapshot = await frequenciasRef
            .where('participanteId', '==', participanteId)
            .get();
        
        let presencasValidas = 0;
        let abonosExtras = 0;

        frequenciasSnapshot.forEach(doc => {
            const freq = doc.data();
            const aulaId = freq.aulaId;
            const status = freq.status;

            // ### MUDANÇA 1: "Justificado" (J) conta como presença ###
            // Se a aula for REGULAR...
            if (idsAulasRegularesDadas.includes(aulaId)) {
                // ...e o status for 'presente' OU 'justificado'
                if (status === 'presente' || status === 'justificado') {
                    presencasValidas++;
                }
            }

            // ### MUDANÇA 2: Presença em Aula EXTRA abona falta ###
            // Se a aula for EXTRA...
            if (idsAulasExtrasDadas.includes(aulaId)) {
                // ...e o status for 'presente' (justificado em extra não abona)
                if (status === 'presente') {
                    abonosExtras++;
                }
            }
        });
        
        // 3. Cálculo Final da Frequência
        let presencasEfetivas = presencasValidas + abonosExtras;
        
        // Limita o total de presenças ao total de aulas (para não dar > 100%)
        if (presencasEfetivas > totalAulasDadas) {
            presencasEfetivas = totalAulasDadas;
        }
        
        const porcentagemFrequencia = Math.round((presencasEfetivas / totalAulasDadas) * 100);
        
        // 4. Recálculo das Médias da EAE (como antes)
        const participanteSnap = await participanteRef.get();
        if(!participanteSnap.exists) {
            console.error(`Falha CRÍTICA: Documento do participante ${participanteDocId} não encontrado para atualização.`);
            return null;
        }
        
        const dadosParticipante = participanteSnap.data();
        const avaliacoes = dadosParticipante.avaliacoes || {};
        const avaliacaoDoAno = avaliacoes[anoAtual] || {};

        const notaFreqConvertida = porcentagemFrequencia >= 80 ? 10 : (porcentagemFrequencia >= 60 ? 5 : 1);
        const mediaAT = (notaFreqConvertida + (avaliacaoDoAno.notaCadernoTemas || 0)) / 2;
        const mediaRI = ((avaliacaoDoAno.notaCadernetaPessoal || 0) + (avaliacaoDoAno.notaTrabalhos || 0) + (avaliacaoDoAno.notaExameEspiritual || 0)) / 3;
        const mediaFinal = (mediaAT + mediaRI) / 2;
        const statusAprovacao = (mediaFinal >= 5 && mediaRI >= 6) ? "Aprovado" : "Reprovado";

        // 5. Atualiza o documento do participante
        await participanteRef.update({
            [`avaliacoes.${anoAtual}.notaFrequencia`]: porcentagemFrequencia,
            [`avaliacoes.${anoAtual}.mediaAT`]: parseFloat(mediaAT.toFixed(1)),
            [`avaliacoes.${anoAtual}.mediaRI`]: parseFloat(mediaRI.toFixed(1)),
            [`avaliacoes.${anoAtual}.mediaFinal`]: parseFloat(mediaFinal.toFixed(1)),
            [`avaliacoes.${anoAtual}.statusAprovacao`]: statusAprovacao
        });
        
        console.log(`Frequência de ${participanteDocId} atualizada para ${porcentagemFrequencia}% (${presencasEfetivas} efetivas / ${totalAulasDadas} aulas dadas)`);
        
    } catch (error) {
        console.error(`Erro ao calcular frequência para turma ${turmaId}, participante ${participanteDocId}:`, error);
    }
    return null;
});

// ==========================================================
// ## FUNÇÃO matricularNovoAluno CORRIGIDA ##
// ==========================================================
exports.matricularNovoAluno = onCall(OPCOES_FUNCAO, async (request) => {
    // 1. Verificação de autenticação básica
    if (!request.auth) {
        throw new HttpsError('unauthenticated', 'A função deve ser chamada por um usuário autenticado.');
    }

    const { turmaId, nome, endereco, telefone, nascimento } = request.data;
    if (!turmaId || !nome) {
        throw new HttpsError('invalid-argument', 'O ID da turma e o nome do aluno são obrigatórios.');
    }

    const callerAuthUid = request.auth.uid; // UID do Auth de quem está chamando
    const callerClaims = request.auth.token || {}; // Claims de quem está chamando

    try {
        // 2. Busca o ID do documento Firestore do chamador
        const callerQuery = await db.collection('voluntarios').where('authUid', '==', callerAuthUid).limit(1).get();
        if (callerQuery.empty) {
            throw new HttpsError('not-found', 'Seu perfil de voluntário não foi encontrado para verificar permissão.');
        }
        const callerFirestoreId = callerQuery.docs[0].id; // ID do documento (ex: 1QZSUQu...)

        // 3. Busca dados da turma
        const turmaRef = db.collection('turmas').doc(turmaId);
        const turmaDoc = await turmaRef.get();

        if (!turmaDoc.exists) {
            throw new HttpsError('not-found', 'A turma especificada não foi encontrada.');
        }
        const turmaData = turmaDoc.data();

        // 4. Verificação de segurança CORRIGIDA
        const isAdminGlobal = ['super-admin', 'diretor', 'tesoureiro'].some(role => callerClaims[role] === true || callerClaims.role === role);
        const isEducacionalAdminRole = callerClaims['dirigente-escola'] === true || callerClaims['secretario-escola'] === true || callerClaims.role === 'dirigente-escola' || callerClaims.role === 'secretario-escola';
        const isFacilitatorInTurma = (turmaData.facilitadoresIds || []).includes(callerFirestoreId); // Compara ID do Firestore

        const temPermissao = isAdminGlobal || (isFacilitatorInTurma && isEducacionalAdminRole);

        console.log(`Verificando permissão matricularNovoAluno: isAdminGlobal=${isAdminGlobal}, isEducacionalAdminRole=${isEducacionalAdminRole}, isFacilitatorInTurma=${isFacilitatorInTurma} (Caller Firestore ID: ${callerFirestoreId}, Turma Facilitadores: ${turmaData.facilitadoresIds})`);

        if (!temPermissao) {
            console.error(`Permissão negada para matricularNovoAluno. User: ${callerFirestoreId}, Turma: ${turmaId}`);
            throw new HttpsError('permission-denied', 'Você não tem permissão para inscrever alunos nesta turma (Admin Global ou Admin Educacional da Turma necessário).');
        }

        // 5. Se a segurança passou, executa a tarefa
        console.log(`Permissão concedida. Cadastrando aluno "${nome}" na turma ${turmaId}.`);

        // Cria o registro na coleção 'alunos' (ou pode criar direto em 'voluntarios'?)
        // Vamos manter a criação em 'alunos' por enquanto, como estava
        const novoAlunoRef = await db.collection("alunos").add({
            nome,
            endereco: endereco || '',
            telefone: telefone || '',
            nascimento: nascimento || '',
            criadoEm: admin.firestore.FieldValue.serverTimestamp()
        });

        // Inscreve o aluno na subcoleção 'participantes' da turma
        const novoParticipante = {
            participanteId: novoAlunoRef.id, // ID do doc em 'alunos'
            nome: nome,
            inscritoEm: admin.firestore.FieldValue.serverTimestamp(),
            origem: 'aluno', // Marca como origem 'aluno'
            avaliacoes: {} // Inicializa avaliações
        };

        if (turmaData.isEAE) {
            novoParticipante.grau = 'Aluno'; // Grau inicial padrão
            const anoAtual = turmaData.anoAtual || 1;
            novoParticipante.avaliacoes[anoAtual] = { // Estrutura inicial de notas
               notaFrequencia: 0, mediaRI: 0, mediaFinal: 0, statusAprovacao: 'Em Andamento'
            };
        }

        await turmaRef.collection("participantes").add(novoParticipante);

        return { success: true, message: `Aluno "${nome}" cadastrado e inscrito com sucesso!` };

    } catch (error) {
        console.error("Erro na função matricularNovoAluno:", error);
        if (error instanceof HttpsError) {
            throw error;
        }
        throw new HttpsError('internal', 'Ocorreu um erro interno ao processar a matrícula.');
    }
});
// ==========================================================
// ## FIM DA FUNÇÃO matricularNovoAluno CORRIGIDA ##
// ==========================================================

// ===================================================================
// ## NOVO ROBÔ DE PROMOÇÃO DE ALUNO PARA VOLUNTÁRIO ##
// ===================================================================
exports.promoverAlunoParaVoluntario = onCall(OPCOES_FUNCAO, async (request) => {
    // 1. Verificações de segurança
    if (!request.auth) {
        throw new HttpsError('unauthenticated', 'A função deve ser chamada por um usuário autenticado.');
    }

    const { turmaId, participanteDocId } = request.data;
    if (!turmaId || !participanteDocId) {
        throw new HttpsError('invalid-argument', 'O ID da turma e do participante são obrigatórios.');
    }

    const userAuthUid = request.auth.uid;
    const userRole = request.auth.token.role;

    try {
        const turmaRef = db.collection('turmas').doc(turmaId);
        const turmaDoc = await turmaRef.get();
        if (!turmaDoc.exists) {
            throw new HttpsError('not-found', 'A turma não foi encontrada.');
        }

        const turmaData = turmaDoc.data();
        const isAdmin = ['super-admin', 'dirigente-escola', 'secretario-escola', 'diretor', 'tesoureiro'].includes(userRole);
        
        // Busca o ID do usuário (facilitador) a partir do authUid
        const facilitadorQuery = await db.collection('voluntarios').where('authUid', '==', userAuthUid).limit(1).get();
        const facilitadorId = !facilitadorQuery.empty ? facilitadorQuery.docs[0].id : null;

        const isFacilitator = turmaData.facilitadoresIds && facilitadorId && turmaData.facilitadoresIds.includes(facilitadorId);

        if (!isAdmin && !isFacilitator) {
            throw new HttpsError('permission-denied', 'Você não tem permissão para promover alunos nesta turma.');
        }

        // 2. Lógica da Promoção
        const participanteRef = turmaRef.collection('participantes').doc(participanteDocId);
        const participanteDoc = await participanteRef.get();
        if (!participanteDoc.exists || participanteDoc.data().origem !== 'aluno') {
            throw new HttpsError('failed-precondition', 'Este participante não é um aluno ou não foi encontrado.');
        }

        const alunoId = participanteDoc.data().participanteId;
        const alunoRef = db.collection('alunos').doc(alunoId);
        const alunoDoc = await alunoRef.get();
        if (!alunoDoc.exists) {
            throw new HttpsError('not-found', 'O registro original do aluno não foi encontrado.');
        }

        // Copia os dados para um novo registro de voluntário
        const alunoData = alunoDoc.data();
        const novoVoluntarioRef = await db.collection('voluntarios').add({
            nome: alunoData.nome,
            endereco: alunoData.endereco || '',
            telefone: alunoData.telefone || '',
            nascimento: alunoData.nascimento || '',
            statusVoluntario: 'ativo',
            criadoEm: admin.firestore.FieldValue.serverTimestamp()
            // O código de voluntário será atribuído por outra função que já existe
        });

        // 3. Atualiza o registro do participante na turma
        await participanteRef.update({
            origem: 'voluntario',
            participanteId: novoVoluntarioRef.id // Agora aponta para o novo registro em 'voluntarios'
        });
        
        return { success: true, message: `Aluno "${alunoData.nome}" promovido para voluntário com sucesso!` };

    } catch (error) {
        console.error("Erro na função promoverAlunoParaVoluntario:", error);
        if (error instanceof HttpsError) { throw error; }
        throw new HttpsError('internal', 'Ocorreu um erro interno ao processar a promoção.');
    }
});

exports.importarFeriadosNacionais = onCall(OPCOES_FUNCAO, async (request) => {
    // 1. Segurança: Ver se o usuário está logado e tem permissão para *chamar* a função
    if (!request.auth) {
        throw new HttpsError('unauthenticated', 'A função deve ser chamada por um usuário autenticado.');
    }
    const permissoes = ['super-admin', 'diretor', 'tesoureiro', 'conselheiro', 'produtor-evento'];
    const userRole = request.auth.token.role;
    if (!permissoes.includes(userRole)) {
        throw new HttpsError('permission-denied', 'Você não tem permissão para executar esta ação.');
    }

    console.log(`Iniciando importação de feriados a pedido de: ${request.auth.token.name}`);

    try {
        const anoAtual = new Date().getFullYear();
        const anoSeguinte = anoAtual + 1;
        const eventosRef = db.collection('eventos');

        // 2. Buscar feriados na API (Ano atual e próximo)
        const [respAtual, respSeguinte] = await Promise.all([
            axios.get(`https://brasilapi.com.br/api/feriados/v1/${anoAtual}`),
            axios.get(`https://brasilapi.com.br/api/feriados/v1/${anoSeguinte}`)
        ]);
        
        const feriadosApi = [...respAtual.data, ...respSeguinte.data]
                            .filter(f => f.type === 'national'); // Apenas nacionais

        // 3. Buscar feriados JÁ CADASTRADOS no seu Firestore
        const snapshotExistentes = await eventosRef.where('tipo', '==', 'feriado').get();
        const datasExistentes = new Set();
        snapshotExistentes.forEach(doc => {
            // Converte o Timestamp para o formato 'YYYY-MM-DD' em UTC para comparação
            const dataStr = doc.data().dataInicio.toDate().toISOString().split('T')[0];
            datasExistentes.add(dataStr);
        });

        // 4. Filtrar: Pegar apenas os feriados da API que NÃO existem no seu DB
        const feriadosParaImportar = feriadosApi.filter(f => !datasExistentes.has(f.date));

        if (feriadosParaImportar.length === 0) {
            console.log("Nenhum feriado novo encontrado para importar.");
            return { success: true, message: `Nenhum feriado nacional novo encontrado para ${anoAtual} ou ${anoSeguinte}. O banco de dados já está atualizado.` };
        }

        // 5. Preparar e salvar os novos feriados em lote
        const batch = db.batch();
        feriadosParaImportar.forEach(feriado => {
            const novoFeriadoRef = eventosRef.doc(); // Cria uma nova referência de documento
            const novoFeriado = {
                titulo: feriado.name,
                detalhes: "Feriado Nacional",
                // Salva no fuso UTC (meio-dia) como já fazemos
                dataInicio: admin.firestore.Timestamp.fromDate(new Date(feriado.date + 'T12:00:00Z')), 
                dataFim: null,
                tipo: 'feriado',
                status: 'ativo',
                criadoEm: admin.firestore.FieldValue.serverTimestamp(),
                // Usa o nome do USUÁRIO QUE CLICOU no botão
                criadoPor: request.auth.token.name || request.auth.token.email
            };
            batch.set(novoFeriadoRef, novoFeriado);
        });

        await batch.commit();

        console.log(`Sucesso: ${feriadosParaImportar.length} feriados importados.`);
        return { success: true, message: `Sucesso! ${feriadosParaImportar.length} novos feriados nacionais foram importados.` };

    } catch (error) {
        console.error("Erro CRÍTICO ao importar feriados:", error);
        if (error instanceof HttpsError) {
            throw error;
        }
        throw new HttpsError('internal', 'Ocorreu um erro no servidor ao buscar ou salvar os feriados.');
    }

    });

// ===================================================================
// ## INÍCIO: FUNÇÕES PARA O PORTAL "CEPAT - AO VIVO" ##
// ===================================================================

/**
 * GATILHO (Trigger): Atualiza a contagem da Fila VL em tempo real.
 * Acionado sempre que um documento é escrito (criado, mudado, deletado) 
 * na fila do VL.
 */
exports.atualizarContagemFilaVL = onDocumentWritten({ ...OPCOES_FUNCAO, document: 'fila_atendimento_vl/{docId}' }, async (event) => {
    
    // 1. Define a consulta: Contar quantos na fila estão "Aguardando"
    const q_fila_vl = db.collection('fila_atendimento_vl').where('status', '==', 'Aguardando');
    
    // 2. Executa a contagem (usando a sintaxe do Admin SDK)
    const snapshot = await q_fila_vl.count().get();
    const count = snapshot.data().count;

    // 3. Atualiza o "Placar"
    const placarRef = db.doc('estatisticas/ao-vivo');
    
    console.log(`Gatilho Fila VL: Contagem atualizada para ${count}`);
    
    // Usa .set() com { merge: true } para criar o documento se não existir
    // ou apenas atualizar este campo se já existir.
    return placarRef.set({
        total_fila_vl: count
    }, { merge: true });
});


/**
 * AGENDADA (Scheduled): Recalcula os totais estratégicos a cada 10 minutos.
 * Roda automaticamente e atualiza os totais "frios" 
 * (Assistidos, Ativos VL) para garantir que o placar esteja sempre correto.
 */
exports.recontarTotaisEstatisticos = onSchedule({ ...OPCOES_FUNCAO_SAOPAULO, schedule: 'every 10 minutes' }, async (event) => {
    
    console.log("Iniciando recontagem agendada dos totais...");

    try {
        // 1. Define as consultas de contagem
        const q_assistidos = db.collection('assistidos');
        const q_ativos_vl = db.collection('tratamentos_vl').where('status', '==', 'ativo');
        
        // 2. Cria as "promessas" de contagem
        const assistidosPromise = q_assistidos.count().get();
        const ativosVlPromise = q_ativos_vl.count().get();
        
        // 3. Executa todas as contagens em paralelo
        const [assistidosSnap, ativosVlSnap] = await Promise.all([
            assistidosPromise,
            ativosVlPromise
        ]);

        // 4. Extrai os números
        const total_assistidos = assistidosSnap.data().count;
        const total_ativos_vl = ativosVlSnap.data().count;

        // 5. Atualiza o "Placar" com todos os dados de uma vez
        const placarRef = db.doc('estatisticas/ao-vivo');
        
        await placarRef.set({
            total_assistidos: total_assistidos,
            total_ativos_vl: total_ativos_vl,
            ultimaAtualizacao: admin.firestore.FieldValue.serverTimestamp() // Adiciona um carimbo de data/hora
        }, { merge: true }); // Merge: true para não apagar a contagem da fila

        console.log(`Recontagem concluída: Assistidos=${total_assistidos}, Ativos VL=${total_ativos_vl}`);
        return null;

    } catch (error) {
        console.error("Erro na recontagem agendada:", error);
        return null;
    }
});

// ===================================================================
// ## FIM: FUNÇÕES PARA O PORTAL "CEPAT - AO VIVO" ##
// ===================================================================
