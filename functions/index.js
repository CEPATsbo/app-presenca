const functions = require("firebase-functions");
const admin = require("firebase-admin");
const webpush = require("web-push");
const cors = require("cors")({ origin: true });

admin.initializeApp();
const db = admin.firestore();

try {
    const vapidConfig = functions.config().vapid;
    if (vapidConfig && vapidConfig.public_key) {
        webpush.setVapidDetails(
          "mailto:cepaulodetarso.sbo@gmail.com", // IMPORTANTE: Coloque seu e-mail aqui
          vapidConfig.public_key,
          vapidConfig.private_key
        );
    } else {
        console.error("ERRO CRÍTICO: Chaves VAPID não configuradas no ambiente.");
    }
} catch (error) {
    console.error("ERRO ao ler a configuração VAPID:", error);
}

// --- ROBÔ 1: Envio Imediato - ATUALIZADO para onRequest com CORS ---
exports.enviarNotificacaoImediata = functions.https.onRequest((req, res) => {
    // Usa o 'cors' para lidar com a requisição de permissão do navegador
    cors(req, res, async () => {
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
});

// --- ROBÔ 2: Verificador de Agendamentos (com lógica completa) ---
exports.verificarAgendamentosAgendados = functions.pubsub.schedule('every 10 minutes').timeZone('America/Sao_Paulo').onRun(async (context) => {
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
        console.log(`[CRON-GOOGLE] Agendamento único '${agendamento.titulo}' processado.`);
    }
    
    // Processa envios recorrentes
    const diaDaSemana = agora.getDay(); // 0 = Domingo
    const horaAtual = agora.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });
    const hojeFormatado = agora.toISOString().split('T')[0];
    const recorrentesSnap = await agendamentosRef.where('tipo', '==', 'recorrente').where('diaDaSemana', '==', diaDaSemana).get();
    for (const doc of recorrentesSnap.docs) {
        const agendamento = doc.data();
        if (horaAtual >= agendamento.hora && agendamento.ultimoEnvio !== hojeFormatado) {
            await enviarNotificacoesParaTodos(agendamento.titulo, agendamento.corpo);
            await doc.ref.update({ ultimoEnvio: hojeFormatado });
            console.log(`[CRON-GOOGLE] Agendamento recorrente '${agendamento.titulo}' processado.`);
        }
    }
    return null;
});

// Função auxiliar para enviar as notificações
async function enviarNotificacoesParaTodos(titulo, corpo) {
    const inscricoesSnapshot = await db.collection('inscricoes').get();
    if (inscricoesSnapshot.empty) {
        return { successCount: 0, failureCount: 0, totalCount: 0 };
    }
    const payload = JSON.stringify({ title: titulo, body: corpo });
    let successCount = 0;
    let failureCount = 0;
    const sendPromises = inscricoesSnapshot.docs.map(doc => {
        return webpush.sendNotification(doc.data(), payload)
            .then(() => successCount++)
            .catch(error => {
                failureCount++;
                if (error.statusCode === 410) {
                    console.log("Inscrição expirada, apagando:", doc.id);
                    return doc.ref.delete();
                } else {
                    console.error(`Erro ao enviar notificação. Status: ${error.statusCode}`);
                }
            });
    });
    await Promise.all(sendPromises);
    return { successCount, failureCount, totalCount: inscricoesSnapshot.size };
}