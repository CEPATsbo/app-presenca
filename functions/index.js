// Teste final de deploy
// // ===================================================================
// IMPORTAÇÕES (Atualizadas para a nova sintaxe v2)
// ===================================================================
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { onDocumentCreated, onDocumentWritten } = require("firebase-functions/v2/firestore");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { onRequest } = require("firebase-functions/v2/https");
const functions = require("firebase-functions"); // Necessário para functions.config()

// Pacotes que não mudam
const admin = require("firebase-admin");
const webpush = require("web-push");
const cors = require("cors")({ origin: true });
const Fuse = require("fuse.js");
const axios = require("axios");
const stream = require('stream');

admin.initializeApp();
const db = admin.firestore();
const storage = admin.storage();

// Constantes e Opções Globais para as Funções
const REGIAO = 'southamerica-east1';
const OPCOES_FUNCAO = { region: REGIAO };
const OPCOES_FUNCAO_SAOPAULO = { region: REGIAO, timeZone: 'America/Sao_Paulo' };


// ===================================================================
// Funções Auxiliares (Não mudam)
// ===================================================================
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

const promoverUsuario = async (uid, novoPapel) => {
    if (!uid) return;
    await admin.auth().setCustomUserClaims(uid, { role: novoPapel });
    const userQuery = await db.collection('voluntarios').where('authUid', '==', uid).limit(1).get();
    if (!userQuery.empty) await userQuery.docs[0].ref.update({ role: novoPapel });
};


// ===================================================================
// Funções Principais (Convertidas e Corrigidas para a Nova Sintaxe v2)
// ===================================================================

exports.sincronizarStatusVoluntario = onDocumentWritten({ ...OPCOES_FUNCAO, document: 'presencas/{presencaId}' }, async (event) => {
    const dadosPresenca = event.data.after.exists ? event.data.after.data() : null;
    const dadosAntigos = event.data.before.exists ? event.data.before.data() : null;
    if (!dadosPresenca || dadosPresenca.status !== 'presente') { return null; }
    if (dadosAntigos && dadosAntigos.status === 'presente') { return null; }
    const nomeVoluntario = dadosPresenca.nome;
    const voluntariosRef = db.collection('voluntarios');
    const q = voluntariosRef.where('nome', '==', nomeVoluntario).limit(1);
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
    const logAuditoriaCollection = db.collection('log_auditoria');
    const autor = { uid: request.auth.uid, nome: request.auth.token.name || request.auth.token.email };
    try {
        const balanceteDoc = await balanceteRef.get();
        if (!balanceteDoc.exists) { throw new HttpsError('not-found', 'Balancete não encontrado.'); }
        const balanceteData = balanceteDoc.data();
        if (balanceteData.status !== 'em revisão') { throw new HttpsError('failed-precondition', 'Este balancete não está mais aberto para revisão.'); }
        if (balanceteData.aprovacoes && balanceteData.aprovacoes[autor.uid]) { throw new HttpsError('already-exists', 'Você já votou neste balancete.'); }
        let updateData = {};
        let logDetalhes = {};
        if (voto === 'aprovado') {
            const campoAprovacao = `aprovacoes.${autor.uid}`;
            updateData[campoAprovacao] = { nome: autor.nome, data: admin.firestore.FieldValue.serverTimestamp() };
            logDetalhes = { balanceteId, voto: 'APROVADO' };
        } else if (voto === 'reprovado') {
            if (!mensagem) { throw new HttpsError('invalid-argument', 'Uma mensagem com a ressalva é obrigatória para reprovar.'); }
            updateData.status = 'com_ressalva';
            updateData.mensagens = admin.firestore.FieldValue.arrayUnion({ autor, texto: mensagem, data: new Date(), isResposta: false });
            logDetalhes = { balanceteId, voto: 'REPROVADO', ressalva: mensagem };
        }
        await balanceteRef.update(updateData);
        await logAuditoriaCollection.add({ acao: "VOTOU_BALANCETE", autor, timestamp: admin.firestore.FieldValue.serverTimestamp(), detalhes: logDetalhes });
        return { success: true, message: 'Ação registrada com sucesso!' };
    } catch (error) {
        console.error("Erro interno ao registrar voto do conselho:", error);
        throw new HttpsError('internal', 'Ocorreu um erro interno ao processar seu voto.');
    }
});

exports.verificarAprovacaoFinal = onDocumentWritten({ ...OPCOES_FUNCAO, document: 'balancetes/{balanceteId}' }, async (event) => {
    if (!event.data.after.exists) return null;
    const balanceteNovo = event.data.after.data();
    if (balanceteNovo.status !== 'em revisão') { return null; }
    const totalAprovacoes = Object.keys(balanceteNovo.aprovacoes || {}).length;
    if (totalAprovacoes >= 3) {
        await event.data.after.ref.update({ status: 'aprovado' });
        await db.collection('log_auditoria').add({ acao: "BALANCETE_APROVADO_AUTO", autor: { nome: 'SISTEMA' }, timestamp: admin.firestore.FieldValue.serverTimestamp(), detalhes: { balanceteId: event.params.balanceteId, totalVotos: totalAprovacoes } });
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