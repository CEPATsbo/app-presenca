// Importa as ferramentas necessárias
import 'dotenv/config';
import admin from 'firebase-admin';
import webpush from 'web-push';

// Configura as chaves VAPID (assinatura da Casa Espírita)
webpush.setVapidDetails(
  'mailto:seu_email_de_contato@exemplo.com', // Coloque seu e-mail aqui
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);

// Configura o Firebase Admin
if (!admin.apps.length) {
  try {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });
  } catch (error) {
    console.error("ERRO FATAL ao inicializar Firebase Admin:", error);
  }
}
const db = admin.firestore();

// Esta é a função que o despertador da Vercel vai chamar
export default async function handler(request, response) {
  console.log('[CRON] Verificador de agendamentos iniciado.');
  
  try {
    const agora = admin.firestore.Timestamp.now();
    const agendamentosRef = db.collection('notificacoes_agendadas');

    // 1. Busca por agendamentos pendentes cuja hora de envio já passou
    const q = query(agendamentosRef, where('status', '==', 'pendente'), where('enviarEm', '<=', agora));
    const snapshot = await getDocs(q);

    if (snapshot.empty) {
      console.log('[CRON] Nenhuma notificação agendada para enviar agora.');
      return response.status(200).send('Nenhum agendamento encontrado.');
    }

    console.log(`[CRON] Encontradas ${snapshot.size} notificações para enviar.`);

    // 2. Busca todos os voluntários inscritos para receber notificações
    const inscricoesSnapshot = await db.collection('inscricoes').get();
    if (inscricoesSnapshot.empty) {
      return response.status(200).send('Nenhum voluntário inscrito para notificar.');
    }
    const inscricoes = inscricoesSnapshot.docs.map(doc => doc.data());

    // 3. Para cada notificação agendada, envia para todos os inscritos
    for (const doc of snapshot.docs) {
      const agendamento = doc.data();
      const payload = JSON.stringify({ title: agendamento.titulo, body: agendamento.corpo });

      console.log(`[CRON] Enviando notificação: "${agendamento.titulo}"`);
      
      const sendPromises = inscricoes.map(inscricao => 
        webpush.sendNotification(inscricao, payload)
          .catch(err => console.error(`Erro ao enviar para um inscrito: ${err.statusCode}`))
      );
      
      await Promise.all(sendPromises);

      // 4. Marca a notificação como 'enviada' para não ser enviada novamente
      await updateDoc(doc.ref, { status: 'enviada' });
      console.log(`[CRON] Notificação "${agendamento.titulo}" marcada como enviada.`);
    }

    response.status(200).send(`Processo de cron concluído. ${snapshot.size} agendamentos processados.`);

  } catch (error) {
    console.error('[CRON] Erro geral na função de verificação:', error);
    response.status(500).send('Erro interno no servidor ao verificar agendamentos.');
  }
}