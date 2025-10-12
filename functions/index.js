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

const vapidPublicKey = defineString("VAPID_PUBLIC_KEY");
const vapidPrivateKey = defineString("VAPID_PRIVATE_KEY");

// --- FUNÇÕES AUXILIARES ---

function configurarWebPush() {
    try {
        const publicKey = vapidPublicKey.value();
        const privateKey = vapidPrivateKey.value();
        if (publicKey && privateKey) {
            webpush.setVapidDetails("mailto:cepaulodetarso.sbo@gmail.com", publicKey, privateKey);
            return true;
        }
        console.error("ERRO CRÍTICO: Chaves VAPID não encontradas nas variáveis de ambiente.");
        return false;
    } catch (error) {
        console.error("ERRO CRÍTICO ao configurar web-push:", error);
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

const promoverUsuario = async (uid, novoPapel) => {
    if (!uid) return;
    await admin.auth().setCustomUserClaims(uid, { role: novoPapel });
    const userQuery = await db.collection('voluntarios').where('authUid', '==', uid).limit(1).get();
    if (!userQuery.empty) await userQuery.docs[0].ref.update({ role: novoPapel });
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

exports.convidarDiretor = onCall(OPCOES_FUNCAO, async (request) => {
    if (request.auth.token.role !== 'super-admin') { throw new HttpsError('permission-denied', 'Apenas o super-admin pode executar esta ação.'); }
    const { email, nome } = request.data;
    if (!email || !nome) { throw new HttpsError('invalid-argument', 'Email e nome são obrigatórios.'); }
    try {
        const userRecord = await admin.auth().createUser({ email, displayName: nome });
        await promoverUsuario(userRecord.uid, 'diretor');
        const linkDeReset = await admin.auth().generatePasswordResetLink(email);
        console.log(`IMPORTANTE: Envie este link para ${nome} (${email}) para definir a senha: ${linkDeReset}`);
        return { success: true, message: `Diretor ${nome} convidado com sucesso!` };
    } catch (error) {
        if (error.code === 'auth/email-already-exists') { throw new HttpsError('already-exists', 'Este email já está em uso.'); }
        throw new HttpsError('internal', 'Ocorreu um erro ao criar o novo diretor.');
    }
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

exports.revogarAcessoDiretor = onCall(OPCOES_FUNCAO, async (request) => {
    if (request.auth.token.role !== 'super-admin') { throw new HttpsError('permission-denied', 'Apenas o Super Admin pode revogar acesso.'); }
    const uidParaRevogar = request.data.uid;
    if (!uidParaRevogar) { throw new HttpsError('invalid-argument', 'O UID do diretor é necessário.'); }
    await promoverUsuario(uidParaRevogar, 'voluntario');
    return { success: true, message: 'Acesso de diretor revogado com sucesso.' };
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
    const { eventoId, eventoTitulo, total, itens, tipoVenda, comprador } = request.data;
    if (!eventoId || !eventoTitulo || total === undefined || !itens || !tipoVenda) { throw new HttpsError('invalid-argument', 'Dados da venda incompletos.'); }
    if (tipoVenda === 'prazo' && !comprador) { throw new HttpsError('invalid-argument', 'Dados do comprador são obrigatórios para registrar pendência.'); }
    const vendaData = { eventoId, eventoTitulo, total, itens, registradoPor: { uid: request.auth.uid, nome: request.auth.token.name || request.auth.token.email }, registradoEm: admin.firestore.FieldValue.serverTimestamp() };
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

// ===================================================================
// ===== NOVO ROBÔ PARA O MÓDULO EDUCACIONAL =========================
// ===================================================================

// Lista completa das 118 aulas da EAE
const aulasEAE = [
    { numeroDaAula: 1, titulo: "Aula inaugural", anoCorrespondente: "1" },
    { numeroDaAula: 2, titulo: "A Criação", anoCorrespondente: "1" },
    { numeroDaAula: 3, titulo: "O nosso Planeta", anoCorrespondente: "1" },
    { numeroDaAula: 4, titulo: "As raças primitivas", anoCorrespondente: "1" },
    { numeroDaAula: 5, titulo: "Constituição Geográfica da Terra", anoCorrespondente: "1" },
    { numeroDaAula: 6, titulo: "Civilização da Mesopotâmia", anoCorrespondente: "1" },
    { numeroDaAula: 7, titulo: "Missão Planetária de Moisés/Preparação dos Hebreus no deserto", anoCorrespondente: "1" },
    { numeroDaAula: 8, titulo: "Introdução ao Processo de Reforma Íntima", anoCorrespondente: "1" },
    { numeroDaAula: 9, titulo: "O Decálogo/Regresso a Canaã/A morte de Moisés", anoCorrespondente: "1" },
    { numeroDaAula: 10, titulo: "O governo dos Juízes/O governo dos Reis até Salomão", anoCorrespondente: "1" },
    { numeroDaAula: 11, titulo: "Separação dos Reinos/Sua Destruição/O período do cativeiro até a rec de Jerusalém", anoCorrespondente: "1" },
    { numeroDaAula: 12, titulo: "História de Israel e dominação estrangeira", anoCorrespondente: "1" },
    { numeroDaAula: 13, titulo: "Implantação do Caderno de Temas", anoCorrespondente: "1" },
    { numeroDaAula: 14, titulo: "O nascimento e controvérsias doutrinárias", anoCorrespondente: "1" },
    { numeroDaAula: 15, titulo: "Os reis magos e o exílio no estrangeiro", anoCorrespondente: "1" },
    { numeroDaAula: 16, titulo: "Infância e juventude do Messias", anoCorrespondente: "1" },
    { numeroDaAula: 17, titulo: "Jerusalém e o grande templo/Reis e líderes", anoCorrespondente: "1" },
    { numeroDaAula: 18, titulo: "As seitas nacionais/Os costumes da época", anoCorrespondente: "1" },
    { numeroDaAula: 19, titulo: "A Fraternidade Essênia", anoCorrespondente: "1" },
    { numeroDaAula: 20, titulo: "O precursor", anoCorrespondente: "1" },
    { numeroDaAula: 21, titulo: "O início da tarefa pública/Os primeiros discípulos", anoCorrespondente: "1" },
    { numeroDaAula: 22, titulo: "A volta a Jerusalém e as escolas rabínicas", anoCorrespondente: "1" },
    { numeroDaAula: 23, titulo: "Promoção do candidato ao grau de aprendiz", anoCorrespondente: "1" },
    { numeroDaAula: 24, titulo: "Implantação da Caderneta Pessoal", anoCorrespondente: "1" },
    { numeroDaAula: 25, titulo: "Regresso à Galiléia/A morte de João Batista", anoCorrespondente: "1" },
    { numeroDaAula: 26, titulo: "Os trabalhos na Galiléia", anoCorrespondente: "1" },
    { numeroDaAula: 27, titulo: "As parábolas. Introdução. (I) Usos e costumes sociais", anoCorrespondente: "1" },
    { numeroDaAula: 28, titulo: "Pregações e curas", anoCorrespondente: "1" },
    { numeroDaAula: 29, titulo: "Hostilidades do Sinédrio", anoCorrespondente: "1" },
    { numeroDaAula: 30, titulo: "O desenvolvimento da pregação", anoCorrespondente: "1" },
    { numeroDaAula: 31, titulo: "As parábolas. (II) Domésticas e Familiares. Distribuição do 1º teste", anoCorrespondente: "1" },
    { numeroDaAula: 32, titulo: "Implantação das Caravanas de Evangelização e Auxílio", anoCorrespondente: "1" },
    { numeroDaAula: 33, titulo: "O quadro dos apóstolos e a consagração", anoCorrespondente: "1" },
    { numeroDaAula: 34, titulo: "Excursões ao estrangeiro", anoCorrespondente: "1" },
    { numeroDaAula: 35, titulo: "As parábolas. (III) Vida rural", anoCorrespondente: "1" },
    { numeroDaAula: 36, titulo: "O Sermão do Monte", anoCorrespondente: "1" },
    { numeroDaAula: 37, titulo: "A gênese da alma", anoCorrespondente: "1" },
    { numeroDaAula: 38, titulo: "Atos finais na Galiléia", anoCorrespondente: "1" },
    { numeroDaAula: 39, titulo: "Últimos dias em Jerusalém", anoCorrespondente: "1" },
    { numeroDaAula: 40, titulo: "Encerramento da Tarefa Planetária", anoCorrespondente: "1" },
    { numeroDaAula: 41, titulo: "Prisão e entrega aos romanos. Distribuição do 2º teste", anoCorrespondente: "1" },
    { numeroDaAula: 42, titulo: "O tribunal judaíco", anoCorrespondente: "1" },
    { numeroDaAula: 43, titulo: "O julgamento de Pilatos", anoCorrespondente: "1" },
    { numeroDaAula: 44, titulo: "O Calvário", anoCorrespondente: "1" },
    { numeroDaAula: 45, titulo: "Ressurreição", anoCorrespondente: "1" },
    { numeroDaAula: 46, titulo: "Exame espiritual", anoCorrespondente: "1" },
    { numeroDaAula: 47, titulo: "Exame espiritual", anoCorrespondente: "1" },
    { numeroDaAula: 48, titulo: "Passagem para o grau de servidor/Inscrição para o Curso de Médiuns", anoCorrespondente: "2" },
    { numeroDaAula: 49, titulo: "Evolução do Homem animal para o homem espiritual", anoCorrespondente: "2" },
    { numeroDaAula: 50, titulo: "Interpretação do Sermão do Monte", anoCorrespondente: "2" },
    { numeroDaAula: 51, titulo: "Interpretação do Sermão do Monte", anoCorrespondente: "2" },
    { numeroDaAula: 52, titulo: "Interpretação do Sermão do Monte", anoCorrespondente: "2" },
    { numeroDaAula: 53, titulo: "Interpretação do Sermão do Monte", anoCorrespondente: "2" },
    { numeroDaAula: 54, titulo: "Fundação da igreja cristã", anoCorrespondente: "2" },
    { numeroDaAula: 55, titulo: "Ascensão", anoCorrespondente: "2" },
    { numeroDaAula: 56, titulo: "Vida Plena – Conceito", anoCorrespondente: "2" },
    { numeroDaAula: 57, titulo: "Instituição dos diáconos. Distribuição do 3º teste", anoCorrespondente: "2" },
    { numeroDaAula: 58, titulo: "A conversão de Paulo", anoCorrespondente: "2" },
    { numeroDaAula: 59, titulo: "O apóstolo Paulo e suas pregações", anoCorrespondente: "2" },
    { numeroDaAula: 60, titulo: "Paulo defende-se em Jerusalém", anoCorrespondente: "2" },
    { numeroDaAula: 61, titulo: "Os apóstolos que mais se destacaram e seus principais atos", anoCorrespondente: "2" },
    { numeroDaAula: 62, titulo: "Preconceito – Definição", anoCorrespondente: "2" },
    { numeroDaAula: 63, titulo: "Preconceito / Vivência (Exercício de Vida Plena)", anoCorrespondente: "2" },
    { numeroDaAula: 64, titulo: "O estudo das epístolas", anoCorrespondente: "2" },
    { numeroDaAula: 65, titulo: "A predestinação segundo a doutrina de Paulo", anoCorrespondente: "2" },
    { numeroDaAula: 66, titulo: "Justificação dos pecados", anoCorrespondente: "2" },
    { numeroDaAula: 67, titulo: "Continuação das epístolas", anoCorrespondente: "2" },
    { numeroDaAula: 68, titulo: "Vícios e defeitos – Conceitos", anoCorrespondente: "2" },
    { numeroDaAula: 69, titulo: "A doutrina de Tiago sobre a salvação", anoCorrespondente: "2" },
    { numeroDaAula: 70, titulo: "A doutrina de Pedro, João e Judas", anoCorrespondente: "2" },
    { numeroDaAula: 71, titulo: "O apocalipse de João", anoCorrespondente: "2" },
    { numeroDaAula: 72, titulo: "O apocalipse de João. Distrib. do 4º teste", anoCorrespondente: "2" },
    { numeroDaAula: 73, titulo: "Vícios e defeitos / Vivência (Exercício de Vida Plena)", anoCorrespondente: "2" },
    { numeroDaAula: 74, titulo: "Ciência e Religião", anoCorrespondente: "2" },
    { numeroDaAula: 75, titulo: "Pensamento e Vontade", anoCorrespondente: "2" },
    { numeroDaAula: 76, titulo: "Lei de Ação e Reação", anoCorrespondente: "2" },
    { numeroDaAula: 77, titulo: "Amor como lei soberana, o valor científico da prece, lei da solidariedade", anoCorrespondente: "2" },
    { numeroDaAula: 78, titulo: "A Medicina Psicossomática", anoCorrespondente: "2" },
    { numeroDaAula: 79, titulo: "Exercício de Vida Plena", anoCorrespondente: "2" },
    { numeroDaAula: 80, titulo: "Curas e milagres do Evangelho", anoCorrespondente: "2" },
    { numeroDaAula: 81, titulo: "Cosmogonias e concepções do Universo", anoCorrespondente: "2" },
    { numeroDaAula: 82, titulo: "Estudos dos seres e das formas", anoCorrespondente: "2" },
    { numeroDaAula: 83, titulo: "Evolução nos diferentes reinos/Histórico da evolução dos seres vivos", anoCorrespondente: "2" },
    { numeroDaAula: 84, titulo: "Leis universais", anoCorrespondente: "2" },
    { numeroDaAula: 85, titulo: "Exercício de Vida Plena", anoCorrespondente: "2" },
    { numeroDaAula: 86, titulo: "O Plano Divino / A Lei da Evolução. Distrib. do 5º teste", anoCorrespondente: "2" },
    { numeroDaAula: 87, titulo: "A Lei do Trabalho / A Lei da Justiça", anoCorrespondente: "2" },
    { numeroDaAula: 88, titulo: "A Lei do Amor", anoCorrespondente: "2" },
    { numeroDaAula: 89, titulo: "Amor a Deus, ao próximo e aos inimigos", anoCorrespondente: "2" },
    { numeroDaAula: 90, titulo: "A filosofia da dor", anoCorrespondente: "2" },
    { numeroDaAula: 91, titulo: "Normas da vida espiritual", anoCorrespondente: "2" },
    { numeroDaAula: 92, titulo: "Exame espiritual", anoCorrespondente: "2" },
    { numeroDaAula: 93, titulo: "Exame espiritual", anoCorrespondente: "2" },
    { numeroDaAula: 94, titulo: "Estrutura da Aliança e de um Centro Espírtia. Como abrir um Centro Espírita", anoCorrespondente: "3" },
    { numeroDaAula: 95, titulo: "Nova frente de trabalho", anoCorrespondente: "3" },
    { numeroDaAula: 96, titulo: "Evolução Anímica (I)", anoCorrespondente: "3" },
    { numeroDaAula: 97, titulo: "Evolução Anímica (II)", anoCorrespondente: "3" },
    { numeroDaAula: 98, titulo: "Categoria dos mundos", anoCorrespondente: "3" },
    { numeroDaAula: 99, titulo: "Imortalidade", anoCorrespondente: "3" },
    { numeroDaAula: 100, titulo: "A Fraternidade do Trevo e FDJ", anoCorrespondente: "3" },
    { numeroDaAula: 101, titulo: "Reencarnação", anoCorrespondente: "3" },
    { numeroDaAula: 102, titulo: "Exercício de Vida Plena", anoCorrespondente: "3" },
    { numeroDaAula: 103, titulo: "Regras para a educação. Conduta e aperfeiçoamento dos seres", anoCorrespondente: "3" },
    { numeroDaAula: 104, titulo: "Regras para a educação. Conduta e aperfeiçoamento dos seres", anoCorrespondente: "3" },
    { numeroDaAula: 105, titulo: "Regras para a educação. Conduta e aperfeiçoamento dos seres", anoCorrespondente: "3" },
    { numeroDaAula: 106, titulo: "O papel do discípulo. Distrib. do 6º teste", anoCorrespondente: "3" },
    { numeroDaAula: 107, titulo: "O cristão no lar", anoCorrespondente: "3" },
    { numeroDaAula: 108, titulo: "O cristão no meio religioso e no meio profano", anoCorrespondente: "3" },
    { numeroDaAula: 109, titulo: "Os recursos do cristão", anoCorrespondente: "3" },
    { numeroDaAula: 110, titulo: "Exercício de Vida Plena", anoCorrespondente: "3" },
    { numeroDaAula: 111, titulo: "Iniciação espiritual", anoCorrespondente: "3" },
    { numeroDaAula: 112, titulo: "Estudo do perispírito / Centros de força", anoCorrespondente: "3" },
    { numeroDaAula: 113, titulo: "Regras de conduta", anoCorrespondente: "3" },
    { numeroDaAula: 114, titulo: "O espírito e o sexo", anoCorrespondente: "3" },
    { numeroDaAula: 115, titulo: "Problemas da propagação do Espiritismo", anoCorrespondente: "3" },
    { numeroDaAula: 116, titulo: "Exame espiritual", anoCorrespondente: "3" },
    { numeroDaAula: 117, titulo: "Exame espiritual", anoCorrespondente: "3" },
    { numeroDaAula: 118, titulo: "Exame espiritual. Devolução das cadernetas.Esclarecimentos sobre o período probatório de três meses após o estudo de O Livro dos Espíritos", anoCorrespondente: "3" }
];

exports.cadastrarAulasEAEAutomaticamente = onDocumentCreated({ ...OPCOES_FUNCAO, document: 'cursos/{cursoId}' }, async (event) => {
    const snap = event.data;
    if (!snap) {
        console.log("Nenhum dado no evento.");
        return null;
    }

    const dadosCurso = snap.data();

    if (dadosCurso.isEAE === true) {
        console.log(`Novo curso EAE detectado: ${dadosCurso.nome}. Iniciando cadastro automático de ${aulasEAE.length} aulas.`);
        
        const cursoId = event.params.cursoId;
        const aulasRef = db.collection('cursos').doc(cursoId).collection('curriculo');
        
        const batch = db.batch();

        aulasEAE.forEach(aula => {
            const novaAulaRef = aulasRef.doc();
            batch.set(novaAulaRef, aula);
        });

        try {
            await batch.commit();
            console.log("Sucesso! Todas as aulas da EAE foram cadastradas para o curso:", cursoId);
            return null;
        } catch (error) {
            console.error("Erro ao cadastrar aulas da EAE em batch:", error);
            return null;
        }
    } else {
        console.log(`Novo curso (${dadosCurso.nome}) não é da EAE. Nenhuma ação automática necessária.`);
        return null;
    }
});

// ===================================================================
// ===== NOVO ROBÔ PARA GERAR O CRONOGRAMA DAS TURMAS ================
// ===================================================================

/**
 * Acionado quando uma nova turma é criada.
 * Gera o cronograma de aulas completo para a turma com base no gabarito do curso.
 */
exports.gerarCronogramaAutomaticamente = onDocumentCreated({ ...OPCOES_FUNCAO, document: 'turmas/{turmaId}' }, async (event) => {
    const snap = event.data;
    if (!snap) {
        console.log("Nenhum dado no evento de criação da turma.");
        return null;
    }

    const dadosTurma = snap.data();
    const turmaId = event.params.turmaId;

    const { cursoId, dataInicio, diaDaSemana } = dadosTurma;

    if (!cursoId || !dataInicio || diaDaSemana === undefined) {
        console.log(`Dados incompletos para a turma ${turmaId}. Abortando geração de cronograma.`);
        return null;
    }

    console.log(`Iniciando geração de cronograma para a turma: ${dadosTurma.nomeDaTurma} (ID: ${turmaId})`);

    try {
        // 1. Buscar todas as aulas do currículo do curso gabarito
        const aulasRef = db.collection('cursos').doc(cursoId).collection('curriculo');
        const aulasSnapshot = await aulasRef.orderBy('numeroDaAula').get();

        if (aulasSnapshot.empty) {
            console.log(`O curso gabarito ${cursoId} não possui aulas cadastradas. Nenhum cronograma foi gerado.`);
            return null;
        }

        const aulasDoCurso = [];
        aulasSnapshot.forEach(doc => {
            aulasDoCurso.push({ id: doc.id, ...doc.data() });
        });

        // 2. Calcular as datas das aulas
        const cronograma = [];
        // Converte a data de início (string 'YYYY-MM-DD') para um objeto Date, ajustando para o fuso horário correto.
        let dataAtual = new Date(`${dataInicio}T12:00:00.000Z`);

        aulasDoCurso.forEach(aula => {
            // Encontra a próxima data que corresponde ao dia da semana da aula
            while (dataAtual.getUTCDay() !== diaDaSemana) {
                dataAtual.setUTCDate(dataAtual.getUTCDate() + 1);
            }
            
            // Cria a entrada do cronograma com a data calculada
            cronograma.push({
                ...aula, // Inclui todos os dados da aula (numero, titulo, ano, etc)
                aulaId: aula.id,
                dataAgendada: admin.firestore.Timestamp.fromDate(dataAtual),
                status: 'agendada' // Status inicial da aula
            });

            // Avança a data para a próxima semana para a próxima iteração
            dataAtual.setUTCDate(dataAtual.getUTCDate() + 7);
        });

        // 3. Salvar o cronograma gerado em uma subcoleção da turma
        const cronogramaRef = db.collection('turmas').doc(turmaId).collection('cronograma');
        const batch = db.batch();

        cronograma.forEach(aulaAgendada => {
            const novaAulaCronogramaRef = cronogramaRef.doc();
            batch.set(novaAulaCronogramaRef, aulaAgendada);
        });

        await batch.commit();
        console.log(`Sucesso! ${cronograma.length} aulas foram agendadas para a turma ${turmaId}.`);
        return null;

    } catch (error) {
        console.error(`Erro ao gerar cronograma para a turma ${turmaId}:`, error);
        return null;
    }
});


// ===================================================================
// ===== NOVO ROBÔ PARA RECALCULAR O CRONOGRAMA (RECESSOS) ===========
// ===================================================================
exports.recalcularCronogramaAposRecesso = onDocumentWritten({ ...OPCOES_FUNCAO, document: 'turmas/{turmaId}/recessos/{recessoId}' }, async (event) => {
    const turmaId = event.params.turmaId;
    console.log(`Gatilho de recesso acionado para a turma: ${turmaId}. Iniciando recálculo do cronograma.`);

    try {
        // 1. Buscar os dados base da turma (data de início, dia da semana, cursoId)
        const turmaRef = db.collection('turmas').doc(turmaId);
        const turmaSnap = await turmaRef.get();
        if (!turmaSnap.exists) {
            console.error(`Turma ${turmaId} não encontrada.`);
            return null;
        }
        const dadosTurma = turmaSnap.data();
        const { cursoId, dataInicio, diaDaSemana } = dadosTurma;

        // 2. Buscar todas as aulas do GABARITO do curso (a fonte original)
        const aulasGabaritoRef = db.collection('cursos').doc(cursoId).collection('curriculo');
        const aulasGabaritoSnapshot = await aulasGabaritoRef.orderBy('numeroDaAula').get();
        if (aulasGabaritoSnapshot.empty) {
            console.log(`Curso ${cursoId} não possui aulas no gabarito. Nada a recalcular.`);
            return null;
        }
        const aulasDoGabarito = [];
        aulasGabaritoSnapshot.forEach(doc => aulasDoGabarito.push({ id: doc.id, ...doc.data() }));

        // 3. Buscar a lista ATUALIZADA de todos os períodos de recesso
        const recessosRef = turmaRef.collection('recessos');
        const recessosSnapshot = await recessosRef.get();
        const periodosDeRecesso = [];
        recessosSnapshot.forEach(doc => {
            const data = doc.data();
            periodosDeRecesso.push({
                inicio: data.dataInicio.toDate(),
                fim: data.dataFim.toDate()
            });
        });
        console.log(`Encontrados ${periodosDeRecesso.length} períodos de recesso.`);

        // 4. Apagar o cronograma antigo para reconstruí-lo
        const cronogramaAntigoRef = turmaRef.collection('cronograma');
        const cronogramaAntigoSnapshot = await cronogramaAntigoRef.get();
        const deleteBatch = db.batch();
        cronogramaAntigoSnapshot.docs.forEach(doc => deleteBatch.delete(doc.ref));
        await deleteBatch.commit();
        console.log(`Cronograma antigo com ${cronogramaAntigoSnapshot.size} aulas foi apagado.`);

        // 5. Recalcular as datas do novo cronograma
        const novoCronograma = [];
        let dataAtual = new Date(`${dataInicio}T12:00:00.000Z`);

        aulasDoGabarito.forEach(aula => {
            let dataEncontrada = false;
            while (!dataEncontrada) {
                // Encontra o próximo dia da semana correto
                while (dataAtual.getUTCDay() !== diaDaSemana) {
                    dataAtual.setUTCDate(dataAtual.getUTCDate() + 1);
                }

                // Verifica se a data encontrada cai em algum período de recesso
                let emRecesso = false;
                for (const periodo of periodosDeRecesso) {
                    if (dataAtual >= periodo.inicio && dataAtual <= periodo.fim) {
                        emRecesso = true;
                        break;
                    }
                }

                if (emRecesso) {
                    // Se estiver em recesso, pula para a próxima semana e tenta de novo
                    dataAtual.setUTCDate(dataAtual.getUTCDate() + 7);
                } else {
                    // Se não estiver em recesso, a data é válida
                    dataEncontrada = true;
                }
            }
            
            novoCronograma.push({
                ...aula,
                aulaId: aula.id,
                dataAgendada: admin.firestore.Timestamp.fromDate(dataAtual),
                status: 'agendada'
            });

            // Avança para a próxima semana para a próxima aula
            dataAtual.setUTCDate(dataAtual.getUTCDate() + 7);
        });

        // 6. Salvar o novo cronograma recalculado
        const cronogramaNovoRef = turmaRef.collection('cronograma');
        const writeBatch = db.batch();
        novoCronograma.forEach(aulaAgendada => {
            const novaAulaCronogramaRef = cronogramaNovoRef.doc();
            writeBatch.set(novaAulaCronogramaRef, aulaAgendada);
        });
        await writeBatch.commit();

        console.log(`SUCESSO! Novo cronograma com ${novoCronograma.length} aulas foi gerado e salvo para a turma ${turmaId}.`);
        return null;

    } catch (error) {
        console.error(`Erro GERAL ao recalcular cronograma para a turma ${turmaId}:`, error);
        return null;
    }
});

// ===== NOVO ROBÔ PARA REAJUSTAR CRONOGRAMA APÓS AULA EXTRA =====
exports.reajustarCronogramaPorMudanca = onDocumentWritten({ ...OPCOES_FUNCAO, document: 'turmas/{turmaId}/cronograma/{aulaId}' }, async (event) => {
    const turmaId = event.params.turmaId;
    const change = event.data;

    // Se não há dados depois (aula foi deletada) ou antes (aula foi criada), aciona o recálculo.
    // Também aciona se a data de uma aula foi alterada.
    const aulaAntes = change.before.data();
    const aulaDepois = change.after.data();

    // Condição de disparo: aula nova, aula deletada, ou data de uma aula foi alterada.
    const precisaRecalcular = !change.before.exists || !change.after.exists || 
                              (aulaAntes.dataAgendada.toMillis() !== aulaDepois.dataAgendada.toMillis());

    if (!precisaRecalcular) {
        console.log(`Alteração na aula ${event.params.aulaId} não requer recálculo do cronograma.`);
        return null;
    }

    console.log(`Gatilho de mudança no cronograma acionado para a turma: ${turmaId}. Iniciando recálculo completo.`);

    try {
        const turmaRef = db.collection('turmas').doc(turmaId);
        const turmaSnap = await turmaRef.get();
        if (!turmaSnap.exists) { console.error(`Turma ${turmaId} não encontrada.`); return null; }
        const dadosTurma = turmaSnap.data();
        const { cursoId, dataInicio, diaDaSemana } = dadosTurma;
        
        // Busca o gabarito original do curso
        const aulasGabaritoRef = db.collection('cursos').doc(cursoId).collection('curriculo');
        const aulasGabaritoSnapshot = await aulasGabaritoRef.orderBy('numeroDaAula').get();
        if (aulasGabaritoSnapshot.empty) { return null; }
        const aulasDoGabarito = [];
        aulasGabaritoSnapshot.forEach(doc => aulasDoGabarito.push({ id: doc.id, ...doc.data() }));

        // Busca todos os recessos
        const recessosRef = turmaRef.collection('recessos');
        const recessosSnapshot = await recessosRef.get();
        const periodosDeRecesso = [];
        recessosSnapshot.forEach(doc => periodosDeRecesso.push({ inicio: doc.data().dataInicio.toDate(), fim: doc.data().dataFim.toDate() }));
        
        // Busca todas as aulas extras que já existem
        const aulasExtrasRef = turmaRef.collection('cronograma');
        const aulasExtrasSnapshot = await aulasExtrasRef.where('isExtra', '==', true).get();
        const aulasExtras = [];
        aulasExtrasSnapshot.forEach(doc => aulasExtras.push({ id: doc.id, ...doc.data() }));

        // Apaga o cronograma antigo completamente
        const cronogramaAntigoSnapshot = await turmaRef.collection('cronograma').get();
        const deleteBatch = db.batch();
        cronogramaAntigoSnapshot.docs.forEach(doc => deleteBatch.delete(doc.ref));
        await deleteBatch.commit();

        // --- LÓGICA DE RECONSTRUÇÃO ---
        const novoCronograma = [];
        let dataAtual = new Date(`${dataInicio}T12:00:00.000Z`);

        // Adiciona as aulas extras à lista de aulas a serem agendadas
        const todasAsAulas = [...aulasDoGabarito, ...aulasExtras];
        
        // Recalcula as datas das aulas REGULARES
        aulasDoGabarito.forEach(aula => {
            let dataEncontrada = false;
            while (!dataEncontrada) {
                while (dataAtual.getUTCDay() !== diaDaSemana) {
                    dataAtual.setUTCDate(dataAtual.getUTCDate() + 1);
                }
                
                let emRecesso = periodosDeRecesso.some(p => dataAtual >= p.inicio && dataAtual <= p.fim);
                let dataOcupadaPorExtra = aulasExtras.some(extra => extra.dataAgendada.toDate().getTime() === dataAtual.getTime());

                if (emRecesso || dataOcupadaPorExtra) {
                    dataAtual.setUTCDate(dataAtual.getUTCDate() + 7);
                } else {
                    dataEncontrada = true;
                }
            }
            novoCronograma.push({ ...aula, aulaId: aula.id, dataAgendada: admin.firestore.Timestamp.fromDate(dataAtual), status: 'agendada' });
            dataAtual.setUTCDate(dataAtual.getUTCDate() + 7);
        });

        // Adiciona as aulas extras (que já têm data fixa) ao cronograma final
        aulasExtras.forEach(extra => {
            novoCronograma.push(extra);
        });

        // Salva o novo cronograma completo
        const cronogramaNovoRef = turmaRef.collection('cronograma');
        const writeBatch = db.batch();
        novoCronograma.forEach(aulaAgendada => {
            // Se a aula tem um ID (veio do gabarito ou já existia), usamos ele. Se não, geramos um novo.
            const docRef = aulaAgendada.id ? cronogramaNovoRef.doc(aulaAgendada.id) : cronogramaNovoRef.doc();
            writeBatch.set(docRef, aulaAgendada);
        });
        await writeBatch.commit();

        console.log(`SUCESSO! Cronograma recalculado e salvo para a turma ${turmaId}.`);

    } catch (error) {
        console.error(`Erro GERAL ao recalcular cronograma para a turma ${turmaId}:`, error);
    }
    return null;
});