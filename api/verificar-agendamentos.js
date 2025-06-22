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
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
  } catch (error) { console.error("ERRO FATAL:", error); }
}
const db = admin.firestore();

module.exports = async (request, response) => {
  console.log('[CRON] Verificador de agendamentos iniciado.');
  try {
    const agora = admin.firestore.Timestamp.now();
    const agendamentosSnapshot = await db.collection('notificacoes_agendadas')
        .where('status', '==', 'pendente')
        .where('enviarEm', '<=', agora).get();
    if (agendamentosSnapshot.empty) {
        return response.status(200).send('Nenhum agendamento para enviar.');
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
      const sendPromises = inscricoes.map(inscricaoDoc => {
        return webpush.sendNotification(inscricaoDoc.data(), payload)
          .catch(err => {
            if (err.statusCode === 410) return inscricaoDoc.ref.delete();
          });
      });
      await Promise.all(sendPromises);
      await agendamentoDoc.ref.update({ status: 'enviada' });
    }
    response.status(200).send(`Processo concluído. ${agendamentosSnapshot.size} agendamentos processados.`);
  } catch (error) {
    console.error('[CRON] Erro geral:', error);
    response.status(500).send('Erro interno ao verificar agendamentos.');
  }
};