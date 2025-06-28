require('dotenv').config();
const admin = require('firebase-admin');
const webpush = require('web-push');

webpush.setVapidDetails(
  'mailto:cepaulodetarso.sbo@gmail.com',
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);

if (!admin.apps.length) {
  try {
    const serviceAccountString = Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_JSON, 'base64').toString('utf-8');
    const serviceAccount = JSON.parse(serviceAccountString);
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
  } catch (error) { console.error("ERRO FATAL:", error); }
}
const db = admin.firestore();

module.exports = async (request, response) => {
    console.log('[CRON] Verificador de agendamentos iniciado.');
    try {
        const agora = admin.firestore.Timestamp.now();
        const agendamentosRef = db.collection('notificacoes_agendadas');
        const q = agendamentosRef.where('status', '==', 'pendente').where('enviarEm', '<=', agora);
        const agendamentosSnapshot = await q.get();

        if (agendamentosSnapshot.empty) {
            console.log('[CRON] Nenhuma notificação agendada para enviar agora.');
            return response.status(200).send('Nenhum agendamento encontrado.');
        }
        
        const inscricoesSnapshot = await db.collection('inscricoes').get();
        if (inscricoesSnapshot.empty) {
            agendamentosSnapshot.docs.forEach(doc => doc.ref.update({ status: 'falhou', motivo: 'Nenhum inscrito' }));
            return response.status(200).send('Nenhum voluntário inscrito.');
        }
        const inscricoes = inscricoesSnapshot.docs;
        
        for (const agendamentoDoc of agendamentosSnapshot.docs) {
            const agendamento = agendamentoDoc.data();
            const payload = JSON.stringify({ title: agendamento.titulo, body: agendamento.corpo });
            console.log(`[CRON] Enviando notificação agendada: "${agendamento.titulo}"`);
            
            const sendPromises = inscricoes.map(inscricaoDoc => {
                return webpush.sendNotification(inscricaoDoc.data(), payload)
                    .catch(err => {
                        if (err.statusCode === 410) {
                            console.log("Inscrição expirada. Apagando...");
                            return inscricaoDoc.ref.delete();
                        }
                    });
            });
            await Promise.all(sendPromises);
            
            await agendamentoDoc.ref.update({ status: 'enviada' });
            console.log(`[CRON] Notificação "${agendamento.titulo}" marcada como enviada.`);
        }
        response.status(200).send(`Processo de cron concluído. ${agendamentosSnapshot.size} agendamentos processados.`);
    } catch (error) {
        console.error('[CRON] Erro geral:', error);
        response.status(500).send('Erro interno ao verificar agendamentos.');
    }
};