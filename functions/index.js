const functions = require("firebase-functions");
const admin = require("firebase-admin");
const webpush = require("web-push");
const cors = require("cors")({ origin: true });
const Fuse = require("fuse.js");
const stream = require('stream');

admin.initializeApp();
const db = admin.firestore();
const storage = admin.storage();
const REGIAO = 'southamerica-east1';

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

function configurarWebPush() {
    try {
        const vapidConfig = functions.config().vapid;
        if (vapidConfig && vapidConfig.public_key && vapidConfig.private_key) {
            webpush.setVapidDetails("mailto:cepaulodetarso.sbo@gmail.com", vapidConfig.public_key, vapidConfig.private_key);
            return true;
        } else {
            console.error("ERRO CRÍTICO: As chaves VAPID não estão configuradas no ambiente.");
            return false;
        }
    } catch (error) {
        console.error("ERRO ao ler a configuração VAPID:", error);
        return false;
    }
}

async function enviarNotificacoesParaTodos(titulo, corpo) {
    if (!configurarWebPush()) { return { successCount: 0, failureCount: 0, totalCount: 0 }; }
    const inscricoesSnapshot = await db.collection('inscricoes').get();
    if (inscricoesSnapshot.empty) { return { successCount: 0, totalCount: inscricoesSnapshot.size }; }
    const payload = JSON.stringify({ title: titulo, body: corpo });
    let successCount = 0; let failureCount = 0;
    const sendPromises = inscricoesSnapshot.docs.map(doc => {
        return webpush.sendNotification(doc.data(), payload)
            .then(() => successCount++)
            .catch(error => { failureCount++; if (error.statusCode === 410) { return doc.ref.delete(); } });
    });
    await Promise.all(sendPromises);
    return { successCount, failureCount, totalCount: inscricoesSnapshot.size };
}

exports.sincronizarStatusVoluntario = functions.region(REGIAO).firestore.document('presencas/{presencaId}').onWrite(async (change, context) => {
    const dadosPresenca = change.after.exists ? change.after.data() : null;
    const dadosAntigos = change.before.exists ? change.before.data() : null;
    if (!dadosPresenca || dadosPresenca.status !== 'presente') { return null; }
    if (dadosAntigos && dadosAntigos.status === 'presente') { return null; }
    const nomeVoluntario = dadosPresenca.nome;
    const dataPresenca = dadosPresenca.data;
    const voluntariosRef = db.collection('voluntarios');
    const q = voluntariosRef.where('nome', '==', nomeVoluntario).limit(1);
    const snapshot = await q.get();
    if (snapshot.empty) { return null; }
    const voluntarioDocRef = snapshot.docs[0].ref;
    try {
        await voluntarioDocRef.update({ ultimaPresenca: dataPresenca, statusVoluntario: 'ativo' });
    } catch (error) { console.error(`SINCRONIZADOR: Erro ao atualizar a ficha de '${nomeVoluntario}':`, error); }
    return null;
});

exports.definirSuperAdmin = functions.region(REGIAO).https.onRequest(async (req, res) => {
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

exports.convidarDiretor = functions.region(REGIAO).https.onCall(async (data, context) => {
    if (context.auth.token.role !== 'super-admin') { throw new functions.https.HttpsError('permission-denied', 'Apenas o super-admin pode executar esta ação.'); }
    const { email, nome } = data;
    if (!email || !nome) { throw new functions.https.HttpsError('invalid-argument', 'Email e nome são obrigatórios.'); }
    try {
        const userRecord = await admin.auth().createUser({ email, displayName: nome });
        await admin.auth().setCustomUserClaims(userRecord.uid, { role: 'diretor' });
        const linkDeReset = await admin.auth().generatePasswordResetLink(email);
        console.log(`IMPORTANTE: Envie este link para ${nome} (${email}) para definir a senha: ${linkDeReset}`);
        const voluntariosRef = db.collection('voluntarios');
        const voluntariosSnapshot = await voluntariosRef.get();
        const listaDeVoluntarios = voluntariosSnapshot.docs.map(d => ({ id: d.id, ...d.data() }));
        const fuse = new Fuse(listaDeVoluntarios, { keys: ['nome'], includeScore: true, threshold: 0.4 });
        const resultados = fuse.search(nome);
        if (resultados.length > 0 && resultados[0].score < 0.3) {
            await voluntariosRef.doc(resultados[0].item.id).update({ email, authUid: userRecord.uid, role: 'diretor' });
        } else {
            await voluntariosRef.doc(userRecord.uid).set({ nome, email, authUid: userRecord.uid, role: 'diretor', statusVoluntario: 'ativo', criadoEm: admin.firestore.FieldValue.serverTimestamp() });
        }
        return { success: true, message: `Diretor ${nome} convidado com sucesso!` };
    } catch (error) {
        if (error.code === 'auth/email-already-exists') throw new functions.https.HttpsError('already-exists', 'Este email já está em uso.');
        throw new functions.https.HttpsError('internal', 'Ocorreu um erro ao criar o novo diretor.');
    }
});

exports.promoverParaTesoureiro = functions.region(REGIAO).https.onCall(async (data, context) => {
    if (context.auth.token.role !== 'super-admin') { throw new functions.https.HttpsError('permission-denied', 'Apenas o Super Admin pode promover usuários.'); }
    const uidParaPromover = data.uid;
    if (!uidParaPromover) { throw new functions.https.HttpsError('invalid-argument', 'O UID do diretor é necessário.'); }
    try {
        await admin.auth().setCustomUserClaims(uidParaPromover, { role: 'tesoureiro' });
        const userQuery = await db.collection('voluntarios').where('authUid', '==', uidParaPromover).limit(1).get();
        if (!userQuery.empty) { await userQuery.docs[0].ref.update({ role: 'tesoureiro' }); }
        return { success: true, message: 'Usuário promovido a tesoureiro com sucesso.' };
    } catch (error) { console.error("Erro ao promover para tesoureiro:", error); throw new functions.https.HttpsError('internal', 'Erro interno ao tentar promover o usuário.'); }
});

exports.promoverParaConselheiro = functions.region(REGIAO).https.onCall(async (data, context) => {
    if (context.auth.token.role !== 'super-admin') { 
        throw new functions.https.HttpsError('permission-denied', 'Apenas o Super Admin pode promover usuários.'); 
    }
    const conselheirosQuery = db.collection('voluntarios').where('role', '==', 'conselheiro');
    const conselheirosSnapshot = await conselheirosQuery.get();
    if (conselheirosSnapshot.size >= 5) {
        throw new functions.https.HttpsError('failed-precondition', 'O limite de 5 conselheiros já foi atingido. Não é possível promover um novo membro.');
    }
    const uidParaPromover = data.uid;
    if (!uidParaPromover) { 
        throw new functions.https.HttpsError('invalid-argument', 'O UID do usuário é necessário.'); 
    }
    try {
        await admin.auth().setCustomUserClaims(uidParaPromover, { role: 'conselheiro' });
        const userQuery = await db.collection('voluntarios').where('authUid', '==', uidParaPromover).limit(1).get();
        if (!userQuery.empty) { 
            await userQuery.docs[0].ref.update({ role: 'conselheiro' }); 
        }
        return { success: true, message: 'Usuário promovido a conselheiro com sucesso.' };
    } catch (error) { 
        console.error("Erro ao promover para conselheiro:", error); 
        throw new functions.https.HttpsError('internal', 'Erro interno ao tentar promover o usuário.'); 
    }
});

exports.promoverParaProdutorEvento = functions.region(REGIAO).https.onCall(async (data, context) => {
    if (context.auth.token.role !== 'super-admin') { 
        throw new functions.https.HttpsError('permission-denied', 'Apenas o Super Admin pode promover usuários.'); 
    }
    const uidParaPromover = data.uid;
    if (!uidParaPromover) { 
        throw new functions.https.HttpsError('invalid-argument', 'O UID do usuário é necessário.'); 
    }
    try {
        await admin.auth().setCustomUserClaims(uidParaPromover, { role: 'produtor-evento' });
        const userQuery = await db.collection('voluntarios').where('authUid', '==', uidParaPromover).limit(1).get();
        if (!userQuery.empty) { 
            await userQuery.docs[0].ref.update({ role: 'produtor-evento' }); 
        }
        return { success: true, message: 'Usuário promovido a Produtor de Evento com sucesso.' };
    } catch (error) { 
        console.error("Erro ao promover para Produtor de Evento:", error); 
        throw new functions.https.HttpsError('internal', 'Erro interno ao tentar promover o usuário.'); 
    }
});

exports.revogarAcessoDiretor = functions.region(REGIAO).https.onCall(async (data, context) => {
    if (context.auth.token.role !== 'super-admin') { throw new functions.https.HttpsError('permission-denied', 'Apenas o Super Admin pode revogar acesso.'); }
    const uidParaRevogar = data.uid;
    if (!uidParaRevogar) { throw new functions.https.HttpsError('invalid-argument', 'O UID do diretor é necessário.'); }
    try {
        await admin.auth().setCustomUserClaims(uidParaRevogar, { role: 'voluntario' });
        const userQuery = await db.collection('voluntarios').where('authUid', '==', uidParaRevogar).limit(1).get();
        if (!userQuery.empty) { await userQuery.docs[0].ref.update({ role: 'voluntario' }); }
        return { success: true, message: 'Acesso de diretor revogado com sucesso.' };
    } catch (error) { console.error("Erro ao revogar acesso de diretor:", error); throw new functions.https.HttpsError('internal', 'Erro interno ao tentar revogar o acesso.'); }
});

exports.revogarAcessoConselheiro = functions.region(REGIAO).https.onCall(async (data, context) => {
    if (context.auth.token.role !== 'super-admin') {
        throw new functions.https.HttpsError('permission-denied', 'Apenas o Super Admin pode revogar acesso de conselheiros.');
    }
    const uidParaRevogar = data.uid;
    if (!uidParaRevogar) {
        throw new functions.https.HttpsError('invalid-argument', 'O UID do conselheiro é necessário.');
    }
    try {
        await admin.auth().setCustomUserClaims(uidParaRevogar, { role: 'voluntario' });
        const userQuery = await db.collection('voluntarios').where('authUid', '==', uidParaRevogar).limit(1).get();
        if (!userQuery.empty) {
            await userQuery.docs[0].ref.update({ role: 'voluntario' });
        }
        return { success: true, message: 'Acesso de conselheiro revogado com sucesso. O usuário agora é um voluntário padrão.' };
    } catch (error) {
        console.error("Erro ao revogar acesso de conselheiro:", error);
        throw new functions.https.HttpsError('internal', 'Erro interno ao tentar revogar o acesso do conselheiro.');
    }
});

exports.registrarVotoConselho = functions.region(REGIAO).https.onCall(async (data, context) => {
    if (!context.auth) { throw new functions.https.HttpsError('unauthenticated', 'A função deve ser chamada por um usuário autenticado.'); }
    const userRole = context.auth.token.role;
    if (!['conselheiro', 'super-admin'].includes(userRole)) { throw new functions.https.HttpsError('permission-denied', 'Apenas membros do conselho ou super-admin podem votar.'); }
    const { balanceteId, voto, mensagem } = data;
    if (!balanceteId || !voto) { throw new functions.https.HttpsError('invalid-argument', 'ID do balancete e voto são obrigatórios.'); }
    const balanceteRef = db.collection('balancetes').doc(balanceteId);
    const logAuditoriaCollection = db.collection('log_auditoria');
    const autor = { uid: context.auth.uid, nome: context.auth.token.name || context.auth.token.email };
    try {
        const balanceteDoc = await balanceteRef.get();
        if (!balanceteDoc.exists) { throw new functions.https.HttpsError('not-found', 'Balancete não encontrado.'); }
        const balanceteData = balanceteDoc.data();
        if (balanceteData.status !== 'em revisão') { throw new functions.https.HttpsError('failed-precondition', 'Este balancete não está mais aberto para revisão.'); }
        if (balanceteData.aprovacoes && balanceteData.aprovacoes[autor.uid]) { throw new functions.https.HttpsError('already-exists', 'Você já votou neste balancete.'); }
        let updateData = {};
        let logDetalhes = {};
        if (voto === 'aprovado') {
            const campoAprovacao = `aprovacoes.${autor.uid}`;
            updateData[campoAprovacao] = { nome: autor.nome, data: admin.firestore.FieldValue.serverTimestamp() };
            logDetalhes = { balanceteId, voto: 'APROVADO' };
        } else if (voto === 'reprovado') {
            if (!mensagem) { throw new functions.https.HttpsError('invalid-argument', 'Uma mensagem com a ressalva é obrigatória para reprovar.'); }
            updateData.status = 'com_ressalva';
            updateData.mensagens = admin.firestore.FieldValue.arrayUnion({ autor, texto: mensagem, data: new Date(), isResposta: false });
            logDetalhes = { balanceteId, voto: 'REPROVADO', ressalva: mensagem };
        }
        await balanceteRef.update(updateData);
        await logAuditoriaCollection.add({ acao: "VOTOU_BALANCETE", autor, timestamp: admin.firestore.FieldValue.serverTimestamp(), detalhes: logDetalhes });
        return { success: true, message: 'Ação registrada com sucesso!' };
    } catch (error) {
        console.error("Erro interno ao registrar voto do conselho:", error);
        throw new functions.https.HttpsError('internal', 'Ocorreu um erro interno ao processar seu voto.');
    }
});

exports.verificarAprovacaoFinal = functions.region(REGIAO).firestore.document('balancetes/{balanceteId}').onUpdate(async (change, context) => {
    const balanceteNovo = change.after.data();
    const balanceteAntigo = change.before.data();
    if (balanceteNovo.status !== 'em revisão') { return null; }
    const aprovacoesNovas = balanceteNovo.aprovacoes || {};
    const aprovacoesAntigas = balanceteAntigo.aprovacoes || {};
    if (Object.keys(aprovacoesNovas).length === Object.keys(aprovacoesAntigas).length) { return null; }
    const NUMERO_DE_VOTOS_PARA_APROVAR = 3;
    const totalAprovacoes = Object.keys(aprovacoesNovas).length;
    if (totalAprovacoes >= NUMERO_DE_VOTOS_PARA_APROVAR) {
        await db.collection('balancetes').doc(context.params.balanceteId).update({ status: 'aprovado' });
        await db.collection('log_auditoria').add({ acao: "BALANCETE_APROVADO_AUTO", autor: { nome: 'SISTEMA' }, timestamp: admin.firestore.FieldValue.serverTimestamp(), detalhes: { balanceteId: context.params.balanceteId, totalVotos: totalAprovacoes } });
    }
    return null;
});

exports.enviarNotificacaoImediata = functions.region(REGIAO).https.onRequest((req, res) => {
    cors(req, res, async () => {
        if (req.method !== 'POST') { return res.status(405).send({ error: 'Método não permitido!' });}
        if (!configurarWebPush()) { return res.status(500).json({ error: 'Falha na configuração VAPID.' });}
        try {
            const { titulo, corpo } = req.body;
            if (!titulo || !corpo) { return res.status(400).json({ error: 'Título e corpo são obrigatórios.' }); }
            const resultado = await enviarNotificacoesParaTodos(titulo, corpo);
            return res.status(200).json(resultado);
        } catch (error) { return res.status(500).json({ error: 'Erro interno no servidor.' }); }
    });
});

exports.verificarAgendamentosAgendados = functions.region(REGIAO).pubsub.schedule('every 1 hours').timeZone('America/Sao_Paulo').onRun(async (context) => {
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

exports.verificarInatividadeVoluntarios = functions.region(REGIAO).pubsub.schedule('5 4 * * *').timeZone('America/Sao_Paulo').onRun(async (context) => {
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

exports.resetarTasvAnual = functions.region(REGIAO).pubsub.schedule('0 4 1 1 *').timeZone('America/Sao_Paulo').onRun(async (context) => {
    const voluntariosRef = db.collection('voluntarios');
    const snapshot = await voluntariosRef.get();
    if (snapshot.empty) { return null; }
    const batch = db.batch();
    snapshot.forEach(doc => { batch.update(doc.ref, { tasvAssinadoAno: null }); });
    await batch.commit();
    return null;
});

exports.arquivarVibracoesConcluidas = functions.region(REGIAO).pubsub.schedule('30 22 * * 4').timeZone('America/Sao_Paulo').onRun(async (context) => {
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

exports.ativarNovosPedidos = functions.region(REGIAO).pubsub.schedule('31 22 * * 4').timeZone('America/Sao_Paulo').onRun(async (context) => {
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

// ===================================================================
// NOVA FUNÇÃO "ROBÔ" PARA RECEBER E PROCESSAR PEDIDOS DE VIBRAÇÃO
// ===================================================================
exports.enviarPedidoVibracao = functions.region(REGIAO).https.onCall(async (data, context) => {
    const { nome, endereco, tipo } = data;
    if (!nome || !tipo || (tipo === 'encarnado' && !endereco)) {
        throw new functions.https.HttpsError('invalid-argument', 'Dados do pedido incompletos.');
    }

    const agoraSP = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
    const diaDaSemana = agoraSP.getDay(); // Domingo 0, Quinta 4
    const horas = agoraSP.getHours();
    const minutos = agoraSP.getMinutes();
    
    let statusFinal = 'ativo'; // Por padrão, o pedido entra como ativo

    // Condição para entrar na "sala de espera": apenas na quinta-feira, entre 19:21 e 22:30
    if (diaDaSemana === 4 && 
        ((horas === 19 && minutos >= 21) || (horas > 19 && horas < 22) || (horas === 22 && minutos <= 30))) {
        statusFinal = 'pendente';
    }
    
    const { dataArquivamento } = calcularCicloVibracoes(agoraSP);
    
    const colecaoAlvo = tipo === 'encarnado' ? 'encarnados' : 'desencarnados';
    
    const dadosParaSalvar = {
        nome: nome.trim(),
        dataCriacao: admin.firestore.FieldValue.serverTimestamp(),
        status: statusFinal,
        dataArquivamento: dataArquivamento
    };

    if (tipo === 'encarnado') {
        dadosParaSalvar.endereco = endereco.trim();
    }
    
    try {
        await db.collection(colecaoAlvo).add(dadosParaSalvar);
        return { success: true, message: 'Pedido enviado com sucesso!' };
    } catch (error) {
        console.error("Erro ao salvar pedido de vibração:", error);
        throw new functions.https.HttpsError('internal', 'Ocorreu um erro ao salvar o pedido.');
    }
});

exports.uploadAtaParaStorage = functions.region(REGIAO).https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'A função deve ser chamada por um usuário autenticado.');
    }
    
    const permissoes = ['super-admin', 'diretor', 'tesoureiro']; 
    if (!permissoes.includes(context.auth.token.role)) {
        throw new functions.https.HttpsError('permission-denied', 'Permissão negada.');
    }

    const { fileName, fileType, fileData, tituloAta, dataReuniao } = data;
    if (!fileName || !fileType || !fileData || !tituloAta || !dataReuniao) {
        throw new functions.https.HttpsError('invalid-argument', 'Dados incompletos para o upload.');
    }

    try {
        const bucket = storage.bucket();
        const filePath = `atas/${Date.now()}-${fileName}`;
        const file = bucket.file(filePath);

        const buffer = Buffer.from(fileData.split(',')[1], 'base64');

        await file.save(buffer, {
            metadata: { contentType: fileType },
            public: true
        });

        const publicUrl = file.publicUrl();

        await db.collection('atas').add({
            titulo: tituloAta,
            dataReuniao: new Date(dataReuniao),
            storagePath: filePath,
            fileUrl: publicUrl,
            enviadoPor: {
                uid: context.auth.uid,
                nome: context.auth.token.name || context.auth.token.email
            },
            criadoEm: admin.firestore.FieldValue.serverTimestamp()
        });
        
        return { success: true, message: 'Ata arquivada com sucesso!' };

    } catch (error) {
        console.error("Erro ao fazer upload para o Firebase Storage:", error);
        throw new functions.https.HttpsError('internal', 'Não foi possível enviar o arquivo.');
    }
});