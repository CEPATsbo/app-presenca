import 'dotenv/config';
import admin from 'firebase-admin';
import webpush from 'web-push';
import { getFirestore, collection, query, where, getDocs, updateDoc } from 'firebase-admin/firestore';

webpush.setVapidDetails(
  'mailto:cepaulodetarso.sbo@gmail.com',
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);

if (!admin.apps.length) {
  try {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
  } catch (error) { console.error("ERRO FATAL ao inicializar Firebase Admin:", error); }
}
const db = admin.firestore();

export default async function handler(request, response) {
  console.log('[CRON] Verificador de agendamentos iniciado.');
  
  try {
    const agora = admin.firestore.Timestamp.now();
    const agendamentosRef = collection(db, 'notificacoes_agendadas');
    const q = query(agendamentosRef, where('status', '==', 'pendente'), where('enviarEm', '<=', agora));
    const agendamentosSnapshot = await getDocs(q);

    if (agendamentosSnapshot.empty) {
      return response.status(200).send('Nenhum agendamento para enviar agora.');
    }
    
    const inscricoesSnapshot = await db.collection('inscricoes').get();
    if (inscricoesSnapshot.empty) {
      // Marca os agendamentos como falhos para não tentar de novo
      agendamentosSnapshot.docs.forEach(doc => updateDoc(doc.ref, { status: 'falhou', motivo: 'Nenhum inscrito' }));
      return response.status(200).send('Agendamentos encontrados, mas nenhum voluntário inscrito.');
    }
    const inscricoes = inscricoesSnapshot.docs;

    for (const agendamentoDoc of agendamentosSnapshot.docs) {
      const agendamento = agendamentoDoc.data();
      const payload = JSON.stringify({ title: agendamento.titulo, body: agendamento.corpo });
      console.log(`[CRON] Enviando notificação: "${agendamento.titulo}"`);
      
      const sendPromises = inscricoes.map(inscricaoDoc => {
        const inscricao = inscricaoDoc.data();
        return webpush.sendNotification(inscricao, payload)
          .catch(err => {
            console.error(`Erro ao enviar para um inscrito. Status: ${err.statusCode}`);
            if (err.statusCode === 410) {
                console.log("Inscrição expirada encontrada. Apagando...");
                return inscricaoDoc.ref.delete();
            }
          });
      });
      await Promise.all(sendPromises);
      
      await updateDoc(agendamentoDoc.ref, { status: 'enviada' });
      console.log(`[CRON] Notificação "${agendamento.titulo}" marcada como enviada.`);
    }
    response.status(200).send(`Processo de cron concluído. ${agendamentosSnapshot.size} agendamentos processados.`);
  } catch (error) {
    console.error('[CRON] Erro geral:', error);
    response.status(500).send('Erro interno ao verificar agendamentos.');
  }
}