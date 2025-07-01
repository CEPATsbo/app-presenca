const functions = require("firebase-functions");
const admin = require("firebase-admin");
const webpush = require("web-push");

admin.initializeApp();
const db = admin.firestore();

const REGIAO = 'southamerica-east1';

try {
    const vapidConfig = functions.config().vapid;
    if (vapidConfig && vapidConfig.public_key && vapidConfig.private_key) {
        webpush.setVapidDetails(
          "mailto:cepaulodetarso.sbo@gmail.com", // Seu e-mail
          vapidConfig.public_key,
          vapidConfig.private_key
        );
    } else {
        console.error("ERRO CRÍTICO: As chaves VAPID não estão configuradas no ambiente.");
    }
} catch (error) {
    console.error("ERRO ao ler a configuração VAPID:", error);
}

// =====================================================================
//  NOVO ROBÔ PARA GERENCIAR A DIRETORIA
// =====================================================================
exports.convidarDiretor = functions.region(REGIAO).https.onCall(async (data, context) => {
    // Passo 1: Verifica se quem está chamando é o Super Admin
    if (context.auth.token.role !== 'super-admin') {
        throw new functions.https.HttpsError('permission-denied', 'Apenas o super-admin pode executar esta ação.');
    }

    const { email, nome } = data;
    if (!email || !nome) {
        throw new functions.https.HttpsError('invalid-argument', 'O email e o nome do novo diretor são obrigatórios.');
    }

    try {
        // Passo 2: Cria o usuário no sistema de Autenticação
        console.log(`Criando usuário de autenticação para: ${email}`);
        const userRecord = await admin.auth().createUser({
            email: email,
            emailVerified: false, // Opcional: pode forçar verificação de email
            displayName: nome
        });
        
        // Passo 3: Envia email para o usuário definir a própria senha
        const linkDeReset = await admin.auth().generatePasswordResetLink(email);
        // Aqui você integraria com um serviço de e-mail (como SendGrid) para enviar o link
        // Por enquanto, o link será logado no console para você enviar manualmente
        console.log(`LINK PARA DEFINIR SENHA (enviar para ${nome}): ${linkDeReset}`);

        // Passo 4: Adiciona a "etiqueta" de 'diretor' ao crachá do novo usuário
        await admin.auth().setCustomUserClaims(userRecord.uid, { role: 'diretor' });

        // Passo 5: Cria ou atualiza a "ficha" dele no banco de dados de voluntários
        const voluntariosRef = db.collection('voluntarios');
        const q = voluntariosRef.where("nome", "==", nome).limit(1);
        const snapshot = await q.get();

        if (snapshot.empty) {
            await voluntariosRef.doc(userRecord.uid).set({
                nome: nome, email: email, authUid: userRecord.uid, role: 'diretor',
                statusVoluntario: 'ativo', criadoEm: admin.firestore.FieldValue.serverTimestamp()
            });
        } else {
            const voluntarioDoc = snapshot.docs[0];
            await voluntarioDoc.ref.update({ email: email, authUid: userRecord.uid, role: 'diretor' });
        }
        
        return { success: true, message: `Diretor ${nome} convidado com sucesso!` };

    } catch (error) {
        console.error("Erro ao criar novo diretor:", error);
        if (error.code === 'auth/email-already-exists') {
            throw new functions.https.HttpsError('already-exists', 'Este email já está em uso.');
        }
        throw new functions.https.HttpsError('internal', 'Ocorreu um erro ao criar o novo diretor.');
    }
});


// --- ROBÔS EXISTENTES ---

// Função auxiliar para enviar as notificações
async function enviarNotificacoesParaTodos(titulo, corpo) {
    const inscricoesSnapshot = await db.collection('inscricoes').get();
    if (inscricoesSnapshot.empty) {
        return { successCount: 0, totalCount: 0 };
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

exports.enviarNotificacaoImediata = functions.region(REGIAO).https.onRequest(async (req, res) => {
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.set('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') { return res.status(204).send(''); }
    
    if (!configurarWebPush()) { return res.status(500).json({ error: 'Falha na configuração do servidor.' }); }
    
    try {
        const { titulo, corpo } = req.body;
        if (!titulo || !corpo) { return res.status(400).json({ error: 'Título e corpo são obrigatórios.' }); }
        const resultado = await enviarNotificacoesParaTodos(titulo, corpo);
        return res.status(200).json(resultado);
    } catch (error) { return res.status(500).json({ error: 'Erro interno no servidor.' }); }
});

exports.verificarAgendamentosAgendados = functions.region(REGIAO).pubsub.schedule('every 10 minutes').timeZone('America/Sao_Paulo').onRun(async (context) => {
    if (!configurarWebPush()) { return null; }
    const agora = new Date();
    const agoraTimestamp = admin.firestore.Timestamp.fromDate(agora);
    const agendamentosRef = db.collection('notificacoes_agendadas');
    const unicosSnap = await agendamentosRef.where('tipo', '==', 'unico').where('status', '==', 'pendente').where('enviarEm', '<=', agoraTimestamp).get();
    for (const doc of unicosSnap.docs) {
        await enviarNotificacoesParaTodos(doc.data().titulo, doc.data().corpo);
        await doc.ref.update({ status: 'enviada' });
    }
    const diaDaSemana = agora.getDay();
    const horaAtual = agora.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });
    const hojeFormatado = agora.toISOString().split('T')[0];
    const recorrentesSnap = await agendamentosRef.where('tipo', '==', 'recorrente').where('diaDaSemana', '==', diaDaSemana).get();
    for (const doc of recorrentesSnap.docs) {
        const agendamento = doc.data();
        if (horaAtual >= agendamento.hora && agendamento.ultimoEnvio !== hojeFormatado) {
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
    const voluntariosRef = db.collection('voluntarios');
    const q = voluntariosRef.where('statusVoluntario', '==', 'ativo').where('ultimaPresenca', '<', dataLimiteFormatada);
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