import 'dotenv/config';
import admin from 'firebase-admin';
import webpush from 'web-push';

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
    if (request.method !== 'POST') {
        return response.status(405).json({ message: 'Método não permitido.' });
    }
    try {
        const { title, body } = request.body;
        if (!title || !body) {
            return response.status(400).json({ message: 'Título e corpo são obrigatórios.' });
        }
        const inscricoesSnapshot = await db.collection('inscricoes').get();
        if (inscricoesSnapshot.empty) {
            return response.status(200).json({ message: 'Nenhum voluntário inscrito.', successCount: 0, totalCount: 0 });
        }
        
        const payload = JSON.stringify({ title, body });
        let successCount = 0;
        let failureCount = 0;
        
        const sendPromises = inscricoesSnapshot.docs.map(doc => {
            const inscricao = doc.data();
            return webpush.sendNotification(inscricao, payload)
                .then(() => { successCount++; })
                .catch(error => {
                    failureCount++;
                    console.error(`Erro ao enviar. Status: ${error.statusCode}.`);
                    // --- LÓGICA DE LIMPEZA ---
                    // Se a inscrição expirou (410), apaga ela do banco de dados.
                    if (error.statusCode === 410) {
                        console.log("Inscrição expirada encontrada. Apagando do banco de dados...");
                        return doc.ref.delete();
                    }
                });
        });
        
        await Promise.all(sendPromises);

        response.status(200).json({ 
            message: 'Processo de envio concluído.', 
            successCount, 
            failureCount,
            totalCount: inscricoesSnapshot.size
        });
    } catch (error) {
        console.error("Erro geral na função de envio:", error);
        response.status(500).json({ message: 'Erro interno no servidor.' });
    }
}