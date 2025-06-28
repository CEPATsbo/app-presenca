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
    if (request.method !== 'POST') {
        return response.status(405).json({ message: 'Método não permitido.' });
    }
    try {
        const { title, body } = request.body;
        if (!title || !body) return response.status(400).json({ message: 'Título e corpo são obrigatórios.' });
        
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
                .then(() => successCount++)
                .catch(error => {
                    failureCount++;
                    if (error.statusCode === 410) {
                        console.log("Inscrição expirada. Apagando...");
                        return doc.ref.delete();
                    }
                });
        });
        await Promise.all(sendPromises);
        response.status(200).json({ message: 'Processo concluído.', successCount, failureCount, totalCount: inscricoesSnapshot.size });
    } catch (error) {
        console.error("Erro geral no envio:", error);
        response.status(500).json({ message: 'Erro interno no servidor.' });
    }
};