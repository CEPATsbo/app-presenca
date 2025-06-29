const functions = require("firebase-functions");
const admin = require("firebase-admin");
const webpush = require("web-push");
const cors = require("cors")({ origin: true }); // Carrega e configura o cors

admin.initializeApp();
const db = admin.firestore();

const vapidConfig = functions.config().vapid;
if (vapidConfig && vapidConfig.public_key) {
    webpush.setVapidDetails(
      "mailto:cepaulodetarso.sbo@gmail.com", // Coloque seu e-mail aqui
      vapidConfig.public_key,
      vapidConfig.private_key
    );
}

// --- ROBÔ 1: MUDADO PARA onRequest com CORS ---
exports.enviarNotificacaoImediata = functions.https.onRequest((req, res) => {
    // Usa o middleware do cors para lidar com as permissões automaticamente
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
            res.status(200).json(resultado);
        } catch (error) {
            console.error("Erro no envio:", error);
            res.status(500).json({ error: 'Erro interno no servidor.' });
        }
    });
});


// --- ROBÔ 2: Verificador de Agendamentos (sem alterações na lógica interna) ---
exports.verificarAgendamentosAgendados = functions.pubsub.schedule('every 10 minutes').timeZone('America/Sao_Paulo').onRun(async (context) => {
    // ... (toda a lógica deste robô permanece a mesma da última versão)
    console.log('[CRON-GOOGLE] Verificação iniciada.');
    const agora = admin.firestore.Timestamp.now();
    const agendamentosRef = db.collection('notificacoes_agendadas');
    
    // Unicos
    const unicosSnap = await agendamentosRef.where('tipo', '==', 'unico').where('status', '==', 'pendente').where('enviarEm', '<=', agora).get();
    for (const doc of unicosSnap.docs) {
        const agendamento = doc.data();
        await enviarNotificacoesParaTodos(agendamento.titulo, agendamento.corpo);
        await doc.ref.update({ status: 'enviada' });
    }
    
    // Recorrentes
    const diaDaSemana = new Date().getDay();
    const horaAtual = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });
    const hojeFormatado = new Date().toISOString().split('T')[0];
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