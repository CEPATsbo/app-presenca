import 'dotenv/config';
import admin from 'firebase-admin';
import webpush from 'web-push';

// Configura as chaves VAPID
webpush.setVapidDetails(
  'mailto:cepaulodetarso.sbo@gmail.com',
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);

// Configura o Firebase Admin
if (!admin.apps.length) {
  try {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
  } catch (error) { console.error("ERRO FATAL:", error); }
}
const db = admin.firestore();
const { Timestamp } = admin.firestore;

// Função reutilizável para enviar notificações
async function enviarNotificacoesParaTodos(titulo, corpo) {
    const inscricoesSnapshot = await db.collection('inscricoes').get();
    if (inscricoesSnapshot.empty) {
        console.log("Nenhum voluntário inscrito para notificar.");
        return;
    }
    const inscricoes = inscricoesSnapshot.docs;
    const payload = JSON.stringify({ title: titulo, body: corpo });

    const sendPromises = inscricoes.map(inscricaoDoc => {
        return webpush.sendNotification(inscricaoDoc.data(), payload)
          .catch(err => {
            if (err.statusCode === 410) {
                console.log("Inscrição expirada encontrada. Apagando...");
                return inscricaoDoc.ref.delete();
            }
          });
    });
    await Promise.all(sendPromises);
    console.log(`Notificação "${titulo}" enviada para ${inscricoes.length} inscritos.`);
}


// Esta é a função que o despertador da Vercel vai chamar
export default async function handler(request, response) {
  console.log('[CRON] Verificador de agendamentos iniciado.');
  
  try {
    const agora = new Date();
    const agoraTimestamp = Timestamp.fromDate(agora);

    // --- TAREFA 1: Processar agendamentos de envio ÚNICO ---
    const unicosQuery = db.collection('notificacoes_agendadas')
        .where('tipo', '==', 'unico')
        .where('status', '==', 'pendente')
        .where('enviarEm', '<=', agoraTimestamp);
    
    const unicosSnapshot = await unicosQuery.get();
    if (!unicosSnapshot.empty) {
        console.log(`[CRON] Encontrados ${unicosSnapshot.size} agendamentos únicos.`);
        for (const doc of unicosSnapshot.docs) {
            const agendamento = doc.data();
            await enviarNotificacoesParaTodos(agendamento.titulo, agendamento.corpo);
            await doc.ref.update({ status: 'enviada' });
        }
    } else {
        console.log('[CRON] Nenhum agendamento único para enviar agora.');
    }

    // --- TAREFA 2: Processar agendamentos RECORRENTES ---
    const diaDaSemanaAtual = agora.toLocaleString('en-US', { weekday: 'long', timeZone: 'America/Sao_Paulo' }); // Ex: 'Saturday'
    const diasEmPortugues = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];
    const diaDaSemanaIndex = agora.getDay(); // 0 para Domingo, 1 para Segunda, etc.
    const horaAtual = agora.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' }); // Ex: "19:00"

    const recorrentesQuery = db.collection('notificacoes_agendadas')
        .where('tipo', '==', 'recorrente')
        .where('diaDaSemana', '==', diaDaSemanaIndex);

    const recorrentesSnapshot = await recorrentesQuery.get();
    if (!recorrentesSnapshot.empty) {
        console.log(`[CRON] Verificando ${recorrentesSnapshot.size} agendamentos recorrentes para hoje (${diasEmPortugues[diaDaSemanaIndex]}).`);
        for (const doc of recorrentesSnapshot.docs) {
            const agendamento = doc.data();
            const hojeFormatado = agora.toISOString().split('T')[0];

            // Verifica se a hora já passou e se já não foi enviado hoje
            if (horaAtual >= agendamento.hora && agendamento.ultimoEnvio !== hojeFormatado) {
                console.log(`[CRON] Hora de enviar agendamento recorrente: "${agendamento.titulo}"`);
                await enviarNotificacoesParaTodos(agendamento.titulo, agendamento.corpo);
                await doc.ref.update({ ultimoEnvio: hojeFormatado });
            }
        }
    } else {
        console.log(`[CRON] Nenhum agendamento recorrente para hoje.`);
    }

    response.status(200).send('Verificação de agendamentos concluída com sucesso.');

  } catch (error) {
    console.error('[CRON] Erro geral na função de verificação:', error);
    response.status(500).send('Erro interno ao verificar agendamentos.');
  }
}