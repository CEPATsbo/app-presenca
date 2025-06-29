const functions = require("firebase-functions");
const admin = require("firebase-admin");
const webpush = require("web-push");

admin.initializeApp();
const db = admin.firestore();

try {
    const vapidConfig = functions.config().vapid;
    webpush.setVapidDetails(
      "mailto:cepaulodetarso.sbo@gmail.com", // Coloque seu e-mail aqui
      vapidConfig.public_key,
      vapidConfig.private_key
    );
} catch (error) {
    console.error("ERRO CRÍTICO: Chaves VAPID não configuradas. Execute 'firebase functions:config:set ...'");
}

// --- ROBÔ 1: ATUALIZADO COM HEADERS DE CORS MANUAIS ---
exports.enviarNotificacaoImediata = functions.region('southamerica-east1').https.onRequest(async (req, res) => {
    // Estas linhas são a nossa "autorização" manual, permitindo o acesso do seu site na Vercel.
    res.set('Access-Control-Allow-Origin', '*'); // Permite qualquer origem
    res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.set('Access-Control-Allow-Headers', 'Content-Type');

    // O navegador envia uma solicitação 'OPTIONS' antes do POST para verificar as permissões.
    // Se for um OPTIONS, apenas respondemos que está tudo OK (status 204).
    if (req.method === 'OPTIONS') {
        return res.status(204).send('');
    }

    if (req.method !== 'POST') {
        return res.status(405).send({ error: 'Método não permitido!' });
    }
    
    try {
        const { titulo, corpo } = req.body;
        if (!titulo || !corpo) {
            return res.status(400).json({ error: 'Título e corpo são obrigatórios.' });
        }
        const resultado = await enviarNotificacoesParaTodos(titulo, corpo);
        return res.status(200).json(resultado);
    } catch (error) {
        console.error("Erro no envio:", error);
        return res.status(500).json({ error: 'Erro interno no servidor.' });
    }
});


// --- ROBÔ 2: Verificador de Agendamentos (com lógica completa e correta) ---
exports.verificarAgendamentosAgendados = functions.region('southamerica-east1').pubsub.schedule('every 10 minutes').timeZone('America/Sao_Paulo').onRun(async (context) => {
    console.log('[CRON-GOOGLE] Verificação iniciada.');
    const agora = new Date();
    const agoraTimestamp = admin.firestore.Timestamp.fromDate(agora);
    const agendamentosRef = db.collection('notificacoes_agendadas');
    
    // Processa envios únicos
    const unicosSnap = await agendamentosRef.where('tipo', '==', 'unico').where('status', '==', 'pendente').where('enviarEm', '<=', agoraTimestamp).get();
    for (const doc of unicosSnap.docs) {
        const agendamento = doc.data();
        await enviarNotificacoesParaTodos(agendamento.titulo, agendamento.corpo);
        await doc.ref.update({ status: 'enviada' });
    }
    
    // Processa envios recorrentes
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

// Função auxiliar para enviar as notificações
async function enviarNotificacoesParaTodos(titulo, corpo) {
    const inscricoesSnapshot = await db.collection('inscricoes').get();
    if (inscricoesSnapshot.empty) return { successCount: 0, failureCount: 0, totalCount: 0 };

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