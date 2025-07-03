const functions = require("firebase-functions");
const admin = require("firebase-admin");
const webpush = require("web-push");
const cors = require("cors")({ origin: true });
const Fuse = require("fuse.js");

admin.initializeApp();
const db = admin.firestore();

const REGIAO = 'southamerica-east1';

function configurarWebPush() {
    try {
        const vapidConfig = functions.config().vapid;
        if (vapidConfig && vapidConfig.public_key && vapidConfig.private_key) {
            webpush.setVapidDetails(
              "mailto:cepaulodetarso.sbo@gmail.com",
              vapidConfig.public_key,
              vapidConfig.private_key
            );
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
    if (!configurarWebPush()) {
        return { successCount: 0, failureCount: 0, totalCount: 0 };
    }
    const inscricoesSnapshot = await db.collection('inscricoes').get();
    if (inscricoesSnapshot.empty) {
        return { successCount: 0, totalCount: inscricoesSnapshot.size };
    }
    const payload = JSON.stringify({ title: titulo, body: corpo });
    let successCount = 0;
    let failureCount = 0;
    const sendPromises = inscricoesSnapshot.docs.map(doc => {
        return webpush.sendNotification(doc.data(), payload)
            .then(() => successCount++)
            .catch(error => {
                failureCount++;
                if (error.statusCode === 410) { return doc.ref.delete(); }
            });
    });
    await Promise.all(sendPromises);
    return { successCount, failureCount, totalCount: inscricoesSnapshot.size };
}

// --- ROBÔS DE GESTÃO DA DIRETORIA ---

exports.definirSuperAdmin = functions.region(REGIAO).https.onRequest(async (req, res) => {
    if (req.query.senha !== "amorcaridade") {
        return res.status(401).send('Acesso não autorizado.');
    }
    const email = req.query.email;
    if (!email) {
        return res.status(400).send('Forneça um parâmetro de email.');
    }
    try {
        const user = await admin.auth().getUserByEmail(email);
        await admin.auth().setCustomUserClaims(user.uid, { role: 'super-admin' });
        const q = db.collection('voluntarios').where('authUid', '==', user.uid);
        const snapshot = await q.get();
        if (!snapshot.empty) {
            await snapshot.docs[0].ref.update({ role: 'super-admin' });
        }
        return res.status(200).send(`Sucesso! O usuário ${email} agora é Super Admin.`);
    } catch (error) {
        return res.status(500).send(`Erro: ${error.message}`);
    }
});

exports.convidarDiretor = functions.region(REGIAO).https.onCall(async (data, context) => {
    if (context.auth.token.role !== 'super-admin') {
        throw new functions.https.HttpsError('permission-denied', 'Apenas o super-admin pode executar esta ação.');
    }
    const { email, nome } = data;
    if (!email || !nome) {
        throw new functions.https.HttpsError('invalid-argument', 'Email e nome são obrigatórios.');
    }
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
            await voluntariosRef.doc(userRecord.uid).set({
                nome, email, authUid: userRecord.uid, role: 'diretor',
                statusVoluntario: 'ativo', criadoEm: admin.firestore.FieldValue.serverTimestamp()
            });
        }
        return { success: true, message: `Diretor ${nome} convidado com sucesso!` };
    } catch (error) {
        if (error.code === 'auth/email-already-exists') throw new functions.https.HttpsError('already-exists', 'Este email já está em uso.');
        throw new functions.https.HttpsError('internal', 'Ocorreu um erro ao criar o novo diretor.');
    }
});

exports.revogarAcessoDiretor = functions.region(REGIAO).https.onCall(async (data, context) => {
    if (context.auth.token.role !== 'super-admin') {
        throw new functions.https.HttpsError('permission-denied', 'Apenas o Super Admin pode revogar acesso.');
    }
    const uidParaRevogar = data.uid;
    if (!uidParaRevogar) {
        throw new functions.https.HttpsError('invalid-argument', 'O UID do diretor é necessário.');
    }
    try {
        await admin.auth().setCustomUserClaims(uidParaRevogar, { role: 'voluntario' });
        const userQuery = await db.collection('voluntarios').where('authUid', '==', uidParaRevogar).limit(1).get();
        if (!userQuery.empty) {
            await userQuery.docs[0].ref.update({ role: 'voluntario' });
        }
        return { success: true, message: 'Acesso de diretor revogado com sucesso.' };
    } catch (error) {
        console.error("Erro ao revogar acesso de diretor:", error);
        throw new functions.https.HttpsError('internal', 'Erro interno ao tentar revogar o acesso.');
    }
});


// --- ROBÔS DE NOTIFICAÇÃO ---
exports.enviarNotificacaoImediata = functions.region(REGIAO).https.onRequest((req, res) => {
    cors(req, res, async () => {
        if (req.method !== 'POST') { return res.status(405).send({ error: 'Método não permitido!' });}
        try {
            const { titulo, corpo } = req.body;
            if (!titulo || !corpo) { return res.status(400).json({ error: 'Título e corpo são obrigatórios.' }); }
            const resultado = await enviarNotificacoesParaTodos(titulo, corpo);
            return res.status(200).json(resultado);
        } catch (error) { return res.status(500).json({ error: 'Erro interno no servidor.' }); }
    });
});

exports.verificarAgendamentosAgendados = functions.region(REGIAO).pubsub.schedule('every 10 minutes').timeZone('America/Sao_Paulo').onRun(async (context) => {
    console.log('[CRON-GOOGLE] Verificação de agendamentos iniciada.');
    
    // --- LÓGICA DE DATA/HORA CORRIGIDA ---
    const agora = new Date();
    const agoraSP = new Date(agora.toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
    
    const diaDaSemanaSP = agoraSP.getDay(); // Domingo = 0, Segunda = 1, etc.
    const horaAtualSP = agora.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo', hour12: false });
    const hojeFormatadoSP = new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'America/Sao_Paulo' }).format(agora);
    
    const agendamentosRef = db.collection('notificacoes_agendadas');

    // Lógica para envios únicos (não precisa de alteração, pois já usa timestamp)
    const agoraTimestamp = admin.firestore.Timestamp.fromDate(agora);
    const unicosSnap = await agendamentosRef.where('tipo', '==', 'unico').where('status', '==', 'pendente').where('enviarEm', '<=', agoraTimestamp).get();
    for (const doc of unicosSnap.docs) {
        await enviarNotificacoesParaTodos(doc.data().titulo, doc.data().corpo);
        await doc.ref.update({ status: 'enviada' });
    }
    
    // Lógica para envios recorrentes (agora usando os valores de São Paulo)
    const recorrentesSnap = await agendamentosRef.where('tipo', '==', 'recorrente').where('diaDaSemana', '==', diaDaSemanaSP).get();
    for (const doc of recorrentesSnap.docs) {
        const agendamento = doc.data();
        if (horaAtualSP >= agendamento.hora && agendamento.ultimoEnvio !== hojeFormatadoSP) {
            await enviarNotificacoesParaTodos(agendamento.titulo, agendamento.corpo);
            await doc.ref.update({ ultimoEnvio: hojeFormatadoSP });
        }
    }
    return null;
});

// --- ROBÔS DE MANUTENÇÃO ---
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