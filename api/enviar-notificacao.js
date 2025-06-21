// Importa as ferramentas necessárias
import 'dotenv/config';
import admin from 'firebase-admin';
import webpush from 'web-push';

// Configura as chaves VAPID a partir das Variáveis de Ambiente
webpush.setVapidDetails(
  'mailto:seu_email_de_contato@exemplo.com', // Um e-mail de contato
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

// Esta é a função que será executada
export default async function handler(request, response) {
    // Só permite o método POST
    if (request.method !== 'POST') {
        return response.status(405).json({ message: 'Método não permitido' });
    }
    
    try {
        const { title, body } = request.body;

        if (!title || !body) {
            return response.status(400).json({ message: 'Título e corpo da mensagem são obrigatórios.' });
        }

        console.log(`Iniciando envio da notificação: Título - ${title}`);

        // 1. Busca todas as inscrições no banco de dados
        const inscricoesSnapshot = await db.collection('inscricoes').get();
        if (inscricoesSnapshot.empty) {
            console.log("Nenhuma inscrição encontrada para enviar notificações.");
            return response.status(200).json({ message: 'Nenhum voluntário inscrito para receber notificações.', successCount: 0, totalCount: 0 });
        }

        const inscricoes = [];
        inscricoesSnapshot.forEach(doc => {
            inscricoes.push(doc.data());
        });
        console.log(`Encontradas ${inscricoes.length} inscrições.`);

        // 2. Prepara a notificação
        const payload = JSON.stringify({ title, body });
        let successCount = 0;
        let failureCount = 0;

        // 3. Envia a notificação para cada inscrito
        const promises = inscricoes.map(inscricao => 
            webpush.sendNotification(inscricao, payload)
                .then(() => {
                    successCount++;
                    console.log(`Notificação enviada com sucesso para: ${inscricao.endpoint.slice(0, 40)}...`);
                })
                .catch(error => {
                    failureCount++;
                    console.error(`Erro ao enviar para ${inscricao.endpoint.slice(0, 40)}...:`, error.statusCode);
                    // Se a inscrição expirou (erro 410), podemos removê-la no futuro
                })
        );
        
        await Promise.all(promises);

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