const functions = require("firebase-functions");
const admin = require("firebase-admin");
const webpush = require("web-push");
const cors = require("cors")({ origin: true });
const Fuse = require("fuse.js");
const axios = require("axios"); // NOVO: Módulo para buscar dados na internet
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

// ===================================================================
// NOVA FUNÇÃO "ROBÔ" PARA PROMOVER A IRRADIADOR
// ===================================================================
exports.promoverParaIrradiador = functions.region(REGIAO).https.onCall(async (data, context) => {
    if (context.auth.token.role !== 'super-admin') { 
        throw new functions.https.HttpsError('permission-denied', 'Apenas o Super Admin pode promover usuários.'); 
    }
    const uidParaPromover = data.uid;
    if (!uidParaPromover) { 
        throw new functions.https.HttpsError('invalid-argument', 'O UID do usuário é necessário.'); 
    }
    try {
        await admin.auth().setCustomUserClaims(uidParaPromover, { role: 'irradiador' });
        const userQuery = await db.collection('voluntarios').where('authUid', '==', uidParaPromover).limit(1).get();
        if (!userQuery.empty) { 
            await userQuery.docs[0].ref.update({ role: 'irradiador' }); 
        }
        return { success: true, message: 'Usuário promovido a Irradiador com sucesso.' };
    } catch (error) { 
        console.error("Erro ao promover para Irradiador:", error); 
        throw new functions.https.HttpsError('internal', 'Erro interno ao tentar promover o usuário.'); 
    }
});

// ===================================================================
// NOVA FUNÇÃO "ROBÔ" PARA PROMOVER A BIBLIOTECÁRIO
// ===================================================================
exports.promoverParaBibliotecario = functions.region(REGIAO).https.onCall(async (data, context) => {
    if (context.auth.token.role !== 'super-admin') { 
        throw new functions.https.HttpsError('permission-denied', 'Apenas o Super Admin pode promover usuários.'); 
    }
    const uidParaPromover = data.uid;
    if (!uidParaPromover) { 
        throw new functions.https.HttpsError('invalid-argument', 'O UID do usuário é necessário.'); 
    }
    try {
        await admin.auth().setCustomUserClaims(uidParaPromover, { role: 'bibliotecario' });
        const userQuery = await db.collection('voluntarios').where('authUid', '==', uidParaPromover).limit(1).get();
        if (!userQuery.empty) { 
            await userQuery.docs[0].ref.update({ role: 'bibliotecario' }); 
        }
        return { success: true, message: 'Usuário promovido a Bibliotecário(a) com sucesso.' };
    } catch (error) { 
        console.error("Erro ao promover para Bibliotecário:", error); 
        throw new functions.https.HttpsError('internal', 'Erro interno ao tentar promover o usuário.'); 
    }
});

// ===================================================================
// NOVAS FUNÇÕES PARA ATENDIMENTO ESPIRITUAL (AE)
// ===================================================================
exports.promoverParaRecepcionista = functions.region(REGIAO).https.onCall(async (data, context) => {
    if (context.auth.token.role !== 'super-admin') {
        throw new functions.https.HttpsError('permission-denied', 'Apenas o Super Admin pode promover usuários.');
    }
    const uidParaPromover = data.uid;
    if (!uidParaPromover) {
        throw new functions.https.HttpsError('invalid-argument', 'O UID do usuário é necessário.');
    }
    try {
        await admin.auth().setCustomUserClaims(uidParaPromover, { role: 'recepcionista' });
        const userQuery = await db.collection('voluntarios').where('authUid', '==', uidParaPromover).limit(1).get();
        if (!userQuery.empty) {
            await userQuery.docs[0].ref.update({ role: 'recepcionista' });
        }
        return { success: true, message: 'Usuário promovido a Recepcionista com sucesso.' };
    } catch (error) {
        console.error("Erro ao promover para Recepcionista:", error);
        throw new functions.https.HttpsError('internal', 'Erro interno ao tentar promover o usuário.');
    }
});

exports.promoverParaEntrevistador = functions.region(REGIAO).https.onCall(async (data, context) => {
    if (context.auth.token.role !== 'super-admin') {
        throw new functions.https.HttpsError('permission-denied', 'Apenas o Super Admin pode promover usuários.');
    }
    const uidParaPromover = data.uid;
    if (!uidParaPromover) {
        throw new functions.https.HttpsError('invalid-argument', 'O UID do usuário é necessário.');
    }
    try {
        await admin.auth().setCustomUserClaims(uidParaPromover, { role: 'entrevistador' });
        const userQuery = await db.collection('voluntarios').where('authUid', '==', uidParaPromover).limit(1).get();
        if (!userQuery.empty) {
            await userQuery.docs[0].ref.update({ role: 'entrevistador' });
        }
        return { success: true, message: 'Usuário promovido a Entrevistador(a) com sucesso.' };
    } catch (error) {
        console.error("Erro ao promover para Entrevistador:", error);
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

exports.revogarAcessoProdutorEvento = functions.region(REGIAO).https.onCall(async (data, context) => {
    if (context.auth.token.role !== 'super-admin') {
        throw new functions.https.HttpsError('permission-denied', 'Apenas o Super Admin pode revogar acesso.');
    }
    const uidParaRevogar = data.uid;
    if (!uidParaRevogar) {
        throw new functions.https.HttpsError('invalid-argument', 'O UID do usuário é necessário.');
    }
    try {
        await admin.auth().setCustomUserClaims(uidParaRevogar, { role: 'voluntario' });
        const userQuery = await db.collection('voluntarios').where('authUid', '==', uidParaRevogar).limit(1).get();
        if (!userQuery.empty) {
            await userQuery.docs[0].ref.update({ role: 'voluntario' });
        }
        return { success: true, message: 'Acesso de Produtor de Evento revogado com sucesso.' };
    } catch (error) {
        console.error("Erro ao revogar acesso de Produtor de Evento:", error);
        throw new functions.https.HttpsError('internal', 'Erro interno ao tentar revogar o acesso.');
    }
});

exports.revogarAcessoIrradiador = functions.region(REGIAO).https.onCall(async (data, context) => {
    if (context.auth.token.role !== 'super-admin') {
        throw new functions.https.HttpsError('permission-denied', 'Apenas o Super Admin pode revogar acesso.');
    }
    const uidParaRevogar = data.uid;
    if (!uidParaRevogar) {
        throw new functions.https.HttpsError('invalid-argument', 'O UID do usuário é necessário.');
    }
    try {
        await admin.auth().setCustomUserClaims(uidParaRevogar, { role: 'voluntario' });
        const userQuery = await db.collection('voluntarios').where('authUid', '==', uidParaRevogar).limit(1).get();
        if (!userQuery.empty) {
            await userQuery.docs[0].ref.update({ role: 'voluntario' });
        }
        return { success: true, message: 'Acesso de Irradiador revogado com sucesso.' };
    } catch (error) {
        console.error("Erro ao revogar acesso de Irradiador:", error);
        throw new functions.https.HttpsError('internal', 'Erro interno ao tentar revogar o acesso.');
    }
});

exports.revogarAcessoBibliotecario = functions.region(REGIAO).https.onCall(async (data, context) => {
    if (context.auth.token.role !== 'super-admin') {
        throw new functions.https.HttpsError('permission-denied', 'Apenas o Super Admin pode revogar acesso.');
    }
    const uidParaRevogar = data.uid;
    if (!uidParaRevogar) {
        throw new functions.https.HttpsError('invalid-argument', 'O UID do usuário é necessário.');
    }
    try {
        await admin.auth().setCustomUserClaims(uidParaRevogar, { role: 'voluntario' });
        const userQuery = await db.collection('voluntarios').where('authUid', '==', uidParaRevogar).limit(1).get();
        if (!userQuery.empty) {
            await userQuery.docs[0].ref.update({ role: 'voluntario' });
        }
        return { success: true, message: 'Acesso de Bibliotecário(a) revogado com sucesso.' };
    } catch (error) {
        console.error("Erro ao revogar acesso de Bibliotecário:", error);
        throw new functions.https.HttpsError('internal', 'Erro interno ao tentar revogar o acesso.');
    }
});

// ===================================================================
// NOVAS FUNÇÕES PARA REVOGAR ACESSO (AE)
// ===================================================================
exports.revogarAcessoRecepcionista = functions.region(REGIAO).https.onCall(async (data, context) => {
    if (context.auth.token.role !== 'super-admin') {
        throw new functions.https.HttpsError('permission-denied', 'Apenas o Super Admin pode revogar acesso.');
    }
    const uidParaRevogar = data.uid;
    if (!uidParaRevogar) {
        throw new functions.https.HttpsError('invalid-argument', 'O UID do usuário é necessário.');
    }
    try {
        await admin.auth().setCustomUserClaims(uidParaRevogar, { role: 'voluntario' });
        const userQuery = await db.collection('voluntarios').where('authUid', '==', uidParaRevogar).limit(1).get();
        if (!userQuery.empty) {
            await userQuery.docs[0].ref.update({ role: 'voluntario' });
        }
        return { success: true, message: 'Acesso de Recepcionista revogado com sucesso.' };
    } catch (error) {
        console.error("Erro ao revogar acesso de Recepcionista:", error);
        throw new functions.https.HttpsError('internal', 'Erro interno ao tentar revogar o acesso.');
    }
});

exports.revogarAcessoEntrevistador = functions.region(REGIAO).https.onCall(async (data, context) => {
    if (context.auth.token.role !== 'super-admin') {
        throw new functions.https.HttpsError('permission-denied', 'Apenas o Super Admin pode revogar acesso.');
    }
    const uidParaRevogar = data.uid;
    if (!uidParaRevogar) {
        throw new functions.https.HttpsError('invalid-argument', 'O UID do usuário é necessário.');
    }
    try {
        await admin.auth().setCustomUserClaims(uidParaRevogar, { role: 'voluntario' });
        const userQuery = await db.collection('voluntarios').where('authUid', '==', uidParaRevogar).limit(1).get();
        if (!userQuery.empty) {
            await userQuery.docs[0].ref.update({ role: 'voluntario' });
        }
        return { success: true, message: 'Acesso de Entrevistador(a) revogado com sucesso.' };
    } catch (error) {
        console.error("Erro ao revogar acesso de Entrevistador:", error);
        throw new functions.https.HttpsError('internal', 'Erro interno ao tentar revogar o acesso.');
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

exports.enviarPedidoVibracao = functions.region(REGIAO).https.onCall(async (data, context) => {
    const { nome, endereco, tipo } = data;
    if (!nome || !tipo || (tipo === 'encarnado' && !endereco)) {
        throw new functions.https.HttpsError('invalid-argument', 'Dados do pedido incompletos.');
    }
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

// ===================================================================
// NOVA FUNÇÃO "ROBÔ" PARA REGISTRAR LOGS DE ACESSO
// ===================================================================
exports.registrarLogDeAcesso = functions.region(REGIAO).https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'A função deve ser chamada por um usuário autenticado.');
    }

    const { acao, detalhes } = data;
    if (!acao) {
        throw new functions.https.HttpsError('invalid-argument', 'A ação é obrigatória para o log.');
    }

    const autor = {
        uid: context.auth.uid,
        nome: context.auth.token.name || context.auth.token.email
    };

    try {
        await db.collection('log_auditoria').add({
            acao,
            autor,
            detalhes: detalhes || {},
            timestamp: admin.firestore.FieldValue.serverTimestamp()
        });
        return { success: true };
    } catch (error) {
        console.error("Erro ao registrar log de acesso:", error);
        throw new functions.https.HttpsError('internal', 'Não foi possível registrar o log.');
    }
});

// ===================================================================
// FUNÇÃO "ROBÔ" PARA REGISTRAR VENDAS DA CANTINA (PDV) ATUALIZADA
// ===================================================================
exports.registrarVendaCantina = functions.region(REGIAO).https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'A função deve ser chamada por um usuário autenticado.');
    }
    const permissoes = ['super-admin', 'diretor', 'tesoureiro', 'conselheiro', 'produtor-evento'];
    if (!permissoes.includes(context.auth.token.role)) {
        throw new functions.https.HttpsError('permission-denied', 'Permissão negada.');
    }

    const { eventoId, eventoTitulo, total, itens, tipoVenda, comprador } = data;

    if (!eventoId || !eventoTitulo || total === undefined || !itens || !tipoVenda) {
        throw new functions.https.HttpsError('invalid-argument', 'Dados da venda incompletos.');
    }
    if (tipoVenda === 'prazo' && !comprador) {
        throw new functions.https.HttpsError('invalid-argument', 'Dados do comprador são obrigatórios para registrar pendência.');
    }

    const vendaData = {
        eventoId,
        eventoTitulo,
        total,
        itens,
        registradoPor: {
            uid: context.auth.uid,
            nome: context.auth.token.name || context.auth.token.email
        },
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
        throw new functions.https.HttpsError('internal', 'Ocorreu um erro ao salvar a venda.');
    }
});

// ===================================================================
// NOVA FUNÇÃO "ROBÔ" PARA BUSCAR DADOS DO LIVRO PELO ISBN
// ===================================================================
exports.buscarDadosLivroPorISBN = functions.region(REGIAO).https.onCall(async (data, context) => {
    // Verificando permissão do usuário
    const permissoes = ['super-admin', 'tesoureiro' , 'diretor', 'bibliotecario'];
    if (!context.auth || !permissoes.includes(context.auth.token.role)) {
        throw new functions.https.HttpsError('permission-denied', 'Você não tem permissão para executar esta ação.');
    }

    const isbn = data.isbn;
    if (!isbn) {
        throw new functions.https.HttpsError('invalid-argument', 'O código ISBN é obrigatório.');
    }

    try {
        const url = `https://www.googleapis.com/books/v1/volumes?q=isbn:${isbn}`;
        const response = await axios.get(url);

        if (response.data.totalItems > 0) {
            const book = response.data.items[0].volumeInfo;
            // Retorna os dados formatados para o formulário
            return {
                titulo: book.title || '',
                autor: book.authors ? book.authors.join(', ') : '',
                editora: book.publisher || '',
                anoPublicacao: book.publishedDate ? book.publishedDate.substring(0, 4) : ''
            };
        } else {
            throw new functions.https.HttpsError('not-found', 'Nenhum livro encontrado com este ISBN.');
        }
    } catch (error) {
        console.error("Erro ao buscar dados do livro na API do Google:", error);
        throw new functions.https.HttpsError('internal', 'Não foi possível buscar os dados do livro.');
    }
});


// ===================================================================
// FUNÇÃO "ROBÔ" PARA REGISTRAR VENDAS DA BIBLIOTECA (COM CONTROLE DE ESTOQUE)
// ===================================================================
exports.registrarVendaBiblioteca = functions.region(REGIAO).https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'A função deve ser chamada por um usuário autenticado.');
    }
    const permissoes = ['super-admin', 'tesoureiro', 'diretor', 'bibliotecario'];
    if (!permissoes.includes(context.auth.token.role)) {
        throw new functions.https.HttpsError('permission-denied', 'Permissão negada.');
    }

    const { total, itens, tipoVenda, comprador } = data;

    if (total === undefined || !itens || itens.length === 0 || !tipoVenda) {
        throw new functions.https.HttpsError('invalid-argument', 'Dados da venda incompletos.');
    }
    if (tipoVenda === 'prazo' && !comprador) {
        throw new functions.https.HttpsError('invalid-argument', 'Dados do comprador são obrigatórios para registrar pendência.');
    }

    try {
        await db.runTransaction(async (transaction) => {
            const promisesEstoque = itens.map(item => {
                const livroRef = db.collection('biblioteca_livros').doc(item.id);
                return transaction.get(livroRef);
            });

            const docsLivros = await Promise.all(promisesEstoque);

            for (let i = 0; i < docsLivros.length; i++) {
                const docLivro = docsLivros[i];
                const itemVenda = itens[i];

                if (!docLivro.exists) {
                    throw new functions.https.HttpsError('not-found', `O livro "${itemVenda.titulo}" não foi encontrado no acervo.`);
                }

                const estoqueAtual = docLivro.data().quantidade;
                if (estoqueAtual < itemVenda.qtd) {
                    throw new functions.https.HttpsError('failed-precondition', `Estoque insuficiente para "${itemVenda.titulo}". Disponível: ${estoqueAtual}, Pedido: ${itemVenda.qtd}.`);
                }
            }

            // Se chegou até aqui, todos os livros têm estoque. Agora vamos dar baixa.
            docsLivros.forEach((docLivro, i) => {
                const itemVenda = itens[i];
                const livroRef = docLivro.ref;
                transaction.update(livroRef, {
                    quantidade: admin.firestore.FieldValue.increment(-itemVenda.qtd)
                });
            });

            // Agora, registrar a venda
            const vendaData = {
                total,
                itens,
                tipoVenda,
                registradoPor: {
                    uid: context.auth.uid,
                    nome: context.auth.token.name || context.auth.token.email
                },
                registradoEm: admin.firestore.FieldValue.serverTimestamp()
            };

            if (tipoVenda === 'vista') {
                const novaVendaRef = db.collection('biblioteca_vendas_avista').doc();
                transaction.set(novaVendaRef, vendaData);
            } else if (tipoVenda === 'prazo') {
                vendaData.compradorId = comprador.id;
                vendaData.compradorNome = comprador.nome;
                vendaData.compradorTipo = comprador.tipo;
                vendaData.status = 'pendente';
                const novaVendaRef = db.collection('biblioteca_contas_a_receber').doc();
                transaction.set(novaVendaRef, vendaData);
            }
        });

        return { success: true, message: 'Venda da biblioteca registrada com sucesso!' };

    } catch (error) {
        console.error("Erro ao registrar venda da biblioteca:", error);
        if (error instanceof functions.https.HttpsError) {
             throw error; // Repassa o erro já formatado
        }
        throw new functions.https.HttpsError('internal', 'Ocorreu um erro ao salvar a venda. A operação foi cancelada.');
    }
});


// ===================================================================
// FUNÇÃO "ROBÔ" PARA GERENCIAR EMPRÉSTIMOS (COM CONTROLE DE ESTOQUE)
// ===================================================================
exports.gerenciarEmprestimoBiblioteca = functions.region(REGIAO).https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'A função deve ser chamada por um usuário autenticado.');
    }
    const permissoes = ['super-admin', 'diretor', 'bibliotecario'];
    if (!permissoes.includes(context.auth.token.role)) {
        throw new functions.https.HttpsError('permission-denied', 'Permissão negada.');
    }

    const { acao, livroId, leitor, emprestimoId } = data;
    
    try {
        if (acao === 'emprestar') {
            if (!livroId || !leitor) throw new functions.https.HttpsError('invalid-argument', 'Dados do empréstimo incompletos.');
            
            const livroRef = db.collection('biblioteca_livros').doc(livroId);

            return db.runTransaction(async (transaction) => {
                const livroDoc = await transaction.get(livroRef);

                if (!livroDoc.exists || livroDoc.data().finalidade !== 'Empréstimo') {
                     throw new functions.https.HttpsError('failed-precondition', 'Este livro não é para empréstimo.');
                }

                if (livroDoc.data().quantidade < 1) {
                    throw new functions.https.HttpsError('failed-precondition', 'Não há cópias disponíveis deste livro para empréstimo.');
                }

                const novoEmprestimoRef = db.collection('biblioteca_emprestimos').doc();
                transaction.set(novoEmprestimoRef, {
                    livroId,
                    livroTitulo: livroDoc.data().titulo,
                    leitor: {
                        id: leitor.id || null,
                        nome: leitor.nome,
                        tipo: leitor.tipo
                    },
                    dataEmprestimo: admin.firestore.FieldValue.serverTimestamp(),
                    status: 'emprestado'
                });
                
                transaction.update(livroRef, {
                    quantidade: admin.firestore.FieldValue.increment(-1)
                });

                return { success: true, message: 'Empréstimo registrado com sucesso!' };
            });

        } else if (acao === 'devolver') {
            if (!emprestimoId || !livroId) throw new functions.https.HttpsError('invalid-argument', 'Dados da devolução incompletos.');
            
            const emprestimoRef = db.collection('biblioteca_emprestimos').doc(emprestimoId);
            const livroRef = db.collection('biblioteca_livros').doc(livroId);

            return db.runTransaction(async (transaction) => {
                const emprestimoDoc = await transaction.get(emprestimoRef);
                if (!emprestimoDoc.exists || emprestimoDoc.data().status !== 'emprestado') {
                    throw new functions.https.HttpsError('failed-precondition', 'Este empréstimo não está ativo ou não foi encontrado.');
                }
                
                transaction.update(emprestimoRef, {
                    status: 'devolvido',
                    dataDevolucao: admin.firestore.FieldValue.serverTimestamp()
                });

                transaction.update(livroRef, {
                    quantidade: admin.firestore.FieldValue.increment(1)
                });

                return { success: true, message: 'Devolução registrada com sucesso!' };
            });
        }
        throw new functions.https.HttpsError('invalid-argument', 'Ação desconhecida.');
    } catch (error) {
        console.error("Erro ao gerenciar empréstimo:", error);
         if (error instanceof functions.https.HttpsError) {
             throw error;
        }
        throw new functions.https.HttpsError('internal', 'Ocorreu um erro na operação de empréstimo/devolução.');
    }
});

// ===================================================================
// NOVA FUNÇÃO "ROBÔ" PARA GERAR RELATÓRIOS DA BIBLIOTECA
// ===================================================================
exports.gerarRelatorioBiblioteca = functions.region(REGIAO).https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'A função deve ser chamada por um usuário autenticado.');
    }
    const permissoes = ['super-admin', 'diretor', 'bibliotecario'];
    if (!permissoes.includes(context.auth.token.role)) {
        throw new functions.https.HttpsError('permission-denied', 'Permissão negada.');
    }

    const { ano, mes } = data;
    if (!ano || !mes) {
        throw new functions.https.HttpsError('invalid-argument', 'Mês e ano são obrigatórios.');
    }

    const inicioDoMes = new Date(ano, mes - 1, 1);
    const fimDoMes = new Date(ano, mes, 0, 23, 59, 59);

    try {
        const qVista = db.collection('biblioteca_vendas_avista')
            .where('registradoEm', '>=', inicioDoMes)
            .where('registradoEm', '<=', fimDoMes);
        const snapshotVista = await qVista.get();
        const vendasVista = snapshotVista.docs.map(doc => {
            const data = doc.data();
            return { ...data, registradoEm: data.registradoEm.toDate().toISOString() };
        });

        const qPrazo = db.collection('biblioteca_contas_a_receber')
            .where('registradoEm', '>=', inicioDoMes)
            .where('registradoEm', '<=', fimDoMes);
        const snapshotPrazo = await qPrazo.get();
        const vendasPrazo = snapshotPrazo.docs.map(doc => {
            const data = doc.data();
            return { ...data, registradoEm: data.registradoEm.toDate().toISOString() };
        });

        const qEmprestimos = db.collection('biblioteca_emprestimos')
            .where('dataEmprestimo', '>=', inicioDoMes)
            .where('dataEmprestimo', '<=', fimDoMes);
        const snapshotEmprestimos = await qEmprestimos.get();
        const emprestimos = snapshotEmprestimos.docs.map(doc => {
            const data = doc.data();
            return { 
                ...data, 
                dataEmprestimo: data.dataEmprestimo.toDate().toISOString(),
                dataDevolucao: data.dataDevolucao ? data.dataDevolucao.toDate().toISOString() : null
            };
        });

        return {
            vendas: [...vendasVista, ...vendasPrazo],
            emprestimos: emprestimos
        };

    } catch (error) {
        console.error("Erro ao gerar relatório da biblioteca:", error);
        throw new functions.https.HttpsError('internal', 'Ocorreu um erro ao buscar os dados do relatório.');
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