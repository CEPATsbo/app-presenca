// CÓDIGO COMPLETO PARA functions/index.js

const functions = require("firebase-functions");
const admin = require("firebase-admin");
const webpush = require("web-push");

admin.initializeApp();
const db = admin.firestore();

try {
    const vapidConfig = functions.config().vapid;
    if (vapidConfig && vapidConfig.public_key && vapidConfig.private_key) {
        webpush.setVapidDetails(
          "mailto:cepaulodetarso.sbo@gmail.com", // Coloque seu e-mail aqui
          vapidConfig.public_key,
          vapidConfig.private_key
        );
    } else {
        console.error("ERRO CRÍTICO: As chaves VAPID não estão configuradas no ambiente.");
    }
} catch (error) {
    console.error("ERRO ao ler a configuração VAPID:", error);
}

// Função auxiliar para enviar as notificações
async function enviarNotificacoesParaTodos(titulo, corpo) {
    const inscricoesSnapshot = await db.collection('inscricoes').get();
    if (inscricoesSnapshot.empty) {
        console.log(`[ENVIO] Nenhuma inscrição encontrada para a notificação "${titulo}".`);
        return { successCount: 0, totalCount: 0 };
    }
    const payload = JSON.stringify({ title: titulo, body: corpo });
    let successCount = 0;
    const sendPromises = inscricoesSnapshot.docs.map(doc => {
        return webpush.sendNotification(doc.data(), payload)
            .then(() => successCount++)
            .catch(error => {
                if (error.statusCode === 410) {
                    console.log("[ENVIO FALHA 410] Inscrição expirada, apagando:", doc.id);
                    return doc.ref.delete();
                }
            });
    });
    await Promise.all(sendPromises);
    console.log(`[ENVIO SUCESSO] Notificação "${titulo}" enviada para ${successCount} de ${inscricoesSnapshot.size} inscritos.`);
    return { successCount, totalCount: inscricoesSnapshot.size };
}

// --- ROBÔ 1: Envio Imediato (com CORS manual) ---
exports.enviarNotificacaoImediata = functions.region('southamerica-east1').https.onRequest(async (req, res) => {
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.set('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(204).send('');
    }

    if (req.method !== 'POST') {
        return res.status(405).send({ error: 'Método não permitido!' });
    }
    
    try {
        const { titulo, corpo } = req.body;
        if (!titulo || !corpo) {
            return res.status(400).json({ error: 'Título e corpo são obrigatórios.' });
        }
        const resultado = await enviarNotificacoesParaTodos(titulo, corpo);
        return res.status(200).json(resultado);
    } catch (error) {
        console.error("Erro no envio:", error);
        return res.status(500).json({ error: 'Erro interno no servidor.' });
    }
});

// --- ROBÔ 2: Verificador de Agendamentos (com LOGS DETALHADOS) ---
exports.verificarAgendamentosAgendados = functions.region('southamerica-east1').pubsub.schedule('every 10 minutes').timeZone('America/Sao_Paulo').onRun(async (context) => {
    console.log('[CRON-GOOGLE] Verificação iniciada.');
    const agora = new Date();
    const agoraTimestamp = admin.firestore.Timestamp.fromDate(agora);
    const agendamentosRef = db.collection('notificacoes_agendadas');
    
    // Processa envios únicos
    const unicosSnap = await agendamentosRef.where('tipo', '==', 'unico').where('status', '==', 'pendente').where('enviarEm', '<=', agoraTimestamp).get();
    for (const doc of unicosSnap.docs) {
        const agendamento = doc.data();
        await enviarNotificacoesParaTodos(agendamento.titulo, agendamento.corpo);
        await doc.ref.update({ status: 'enviada' });
    }
    
    // --- LÓGICA DE RECORRENTES COM MODO DETETIVE ---
    const diaDaSemanaAtual = agora.getDay(); // 0 = Domingo
    const horaAtual = agora.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });
    const hojeFormatado = agora.toISOString().split('T')[0]; // YYYY-MM-DD
    
    console.log(`[DETETIVE] Dia da semana atual: ${diaDaSemanaAtual} | Hora atual: ${horaAtual}`);

    const recorrentesSnap = await agendamentosRef.where('tipo', '==', 'recorrente').where('diaDaSemana', '==', diaDaSemanaAtual).get();
    
    if(recorrentesSnap.empty) {
        console.log("[DETETIVE] Nenhum agendamento recorrente encontrado para hoje.");
        return null;
    }

    for (const doc of recorrentesSnap.docs) {
        const agendamento = doc.data();
        console.log(`[DETETIVE] Verificando agendamento: "${agendamento.titulo}" (ID: ${doc.id})`);
        console.log(`   |-- Hora agendada: ${agendamento.hora}`);
        console.log(`   |-- Último envio: ${agendamento.ultimoEnvio || 'Nunca'}`);
        
        const condicaoHora = horaAtual >= agendamento.hora;
        const condicaoJaEnviado = agendamento.ultimoEnvio !== hojeFormatado;

        console.log(`   |-- Condição de HORA atendida? (${horaAtual} >= ${agendamento.hora}) -> ${condicaoHora}`);
        console.log(`   |-- Condição de JÁ ENVIADO HOJE atendida? (${agendamento.ultimoEnvio} !== ${hojeFormatado}) -> ${condicaoJaEnviado}`);

        if (condicaoHora && condicaoJaEnviado) {
            console.log(`   |-- DECISÃO: ENVIAR!`);
            await enviarNotificacoesParaTodos(agendamento.titulo, agendamento.corpo);
            await doc.ref.update({ ultimoEnvio: hojeFormatado });
            console.log(`   |-- SUCESSO: 'ultimoEnvio' atualizado para ${hojeFormatado}.`);
        } else {
            console.log(`   |-- DECISÃO: NÃO ENVIAR.`);
        }
    }
    
    return null;
});