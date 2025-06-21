import 'dotenv/config';
import admin from 'firebase-admin';
import webpush from 'web-push';

// Configura as chaves VAPID (assinatura da Casa Espírita)
webpush.setVapidDetails(
  'mailto:cepaulodetarso.sbo@gmail.com', // IMPORTANTE: Coloque um e-mail seu aqui
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

export default async function handler(request, response) {
    if (request.method !== 'POST') {
        return response.status(405).json({ message: 'Método não permitido.' });
    }
    try {
        const { title, body } = request.body;
        if (!title || !body) {
            return response.status(400).json({ message: 'Título e corpo da mensagem são obrigatórios.' });
        }
        console.log(`Iniciando envio da notificação: Título - ${title}`);
        const inscricoesSnapshot = await db.collection('inscricoes').get();
        if (inscricoesSnapshot.empty) {
            return response.status(200).json({ message: 'Nenhum voluntário inscrito para receber notificações.', successCount: 0, totalCount: 0 });
        }
        const inscricoes = [];
        inscricoesSnapshot.forEach(doc => {
            inscricoes.push(doc.data());
        });
        console.log(`Encontradas ${inscricoes.length} inscrições para notificar.`);
        const payload = JSON.stringify({ title, body });
        let successCount = 0;
        let failureCount = 0;
        const sendPromises = inscricoes.map(inscricao => 
            webpush.sendNotification(inscricao, payload)
                .then(() => successCount++)
                .catch(error => {
                    failureCount++;
                    console.error(`Erro ao enviar para endpoint. Status: ${error.statusCode}.`);
                })
        );
        await Promise.all(sendPromises);
        console.log(`Envio concluído. Sucessos: ${successCount}, Falhas: ${failureCount}`);
        response.status(200).json({ 
            message: 'Processo de envio concluído.', 
            successCount, 
            failureCount,
            totalCount: inscricoes.length
        });
    } catch (error) {
        console.error("Erro geral na função de envio:", error);
        response.status(500).json({ message: 'Erro interno no servidor.' });
    }
}