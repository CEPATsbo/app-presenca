const functions = require("firebase-functions");
const admin = require("firebase-admin");
const webpush = require("web-push");

admin.initializeApp();
const db = admin.firestore();

// Esta função busca as configurações que salvamos com o comando `firebase functions:config:set`
const vapidConfig = functions.config().vapid;
if (vapidConfig) {
    webpush.setVapidDetails(
      "mailto:cepaulodetarso.sbo@gmail.com", // Coloque seu e-mail aqui
      vapidConfig.public_key,
      vapidConfig.private_key
    );
}

exports.enviarNotificacaoImediata = functions.https.onCall(async (data, context) => {
    // Lógica de envio imediato
    const { titulo, corpo } = data;
    if (!titulo || !corpo) { throw new functions.https.HttpsError('invalid-argument', 'Título e corpo são obrigatórios.'); }
    const inscricoes = await db.collection("inscricoes").get();
    if (inscricoes.empty) { return { successCount: 0, totalCount: 0 }; }
    const payload = JSON.stringify({ title: titulo, body: corpo });
    let successCount = 0;
    const promises = inscricoes.docs.map(doc => 
        webpush.sendNotification(doc.data(), payload).then(() => successCount++).catch(err => { if(err.statusCode === 410) doc.ref.delete() })
    );
    await Promise.all(promises);
    return { successCount: successCount, totalCount: inscricoes.size };
});

exports.verificarAgendamentosAgendados = functions.pubsub.schedule('every 10 minutes').timeZone('America/Sao_Paulo').onRun(async (context) => {
    console.log('[CRON-GOOGLE] Verificação iniciada.');
    const agora = new Date();
    const agoraTimestamp = admin.firestore.Timestamp.fromDate(agora);
    const agendamentosRef = db.collection('notificacoes_agendadas');
    
    // Processa envios únicos
    const unicosSnap = await agendamentosRef.where('tipo', '==', 'unico').where('status', '==', 'pendente').where('enviarEm', '<=', agoraTimestamp).get();
    if (!unicosSnap.empty) {
        for (const doc of unicosSnap.docs) {
            const agendamento = doc.data();
            await enviarNotificacoesParaTodos(agendamento.titulo, agendamento.corpo);
            await doc.ref.update({ status: 'enviada' });
        }
    }
    
    // Processa envios recorrentes
    const diaDaSemana = agora.getDay();
    const horaAtual = agora.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });
    const hojeFormatado = agora.toISOString().split('T')[0];
    const recorrentesSnap = await agendamentosRef.where('tipo', '==', 'recorrente').where('diaDaSemana', '==', diaDaSemana).get();
    if (!recorrentesSnap.empty) {
        for (const doc of recorrentesSnap.docs) {
            const agendamento = doc.data();
            if (horaAtual >= agendamento.hora && agendamento.ultimoEnvio !== hojeFormatado) {
                await enviarNotificacoesParaTodos(agendamento.titulo, agendamento.corpo);
                await doc.ref.update({ ultimoEnvio: hojeFormatado });
            }
        }
    }
    return null;
});

// Função auxiliar
async function enviarNotificacoesParaTodos(titulo, corpo) {
    const inscricoes = await db.collection('inscricoes').get();
    if (inscricoes.empty) return;
    const payload = JSON.stringify({ title: titulo, body: corpo });
    const promises = inscricoes.docs.map(doc => 
        webpush.sendNotification(doc.data(), payload).catch(err => { if(err.statusCode === 410) doc.ref.delete() })
    );
    await Promise.all(promises);
}