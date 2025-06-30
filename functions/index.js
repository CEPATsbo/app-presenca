const functions = require("firebase-functions");
const admin = require("firebase-admin");
const webpush = require("web-push");

admin.initializeApp();
const db = admin.firestore();

const REGIAO = 'southamerica-east1';

// Função para configurar o web-push SÓ QUANDO NECESSÁRIO
function configurarWebPush() {
    try {
        const vapidConfig = functions.config().vapid;
        if (vapidConfig && vapidConfig.public_key && vapidConfig.private_key) {
            webpush.setVapidDetails(
              "mailto:cepaulodetarso.sbo@gmail.com", // Coloque seu e-mail aqui
              vapidConfig.public_key,
              vapidConfig.private_key
            );
            return true; // Sucesso na configuração
        } else {
            console.error("ERRO CRÍTICO: Chaves VAPID não estão configuradas no ambiente. Execute 'firebase functions:config:set ...'");
            return false; // Falha
        }
    } catch (error) {
        console.error("ERRO ao ler a configuração VAPID:", error);
        return false; // Falha
    }
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
    let failureCount = 0;
    const sendPromises = inscricoesSnapshot.docs.map(doc => {
        return webpush.sendNotification(doc.data(), payload)
            .then(() => successCount++)
            .catch(error => {
                failureCount++;
                if (error.statusCode === 410) {
                    console.log("[ENVIO FALHA 410] Inscrição expirada, apagando:", doc.id);
                    return doc.ref.delete();
                } else {
                    console.error(`[ENVIO FALHA GERAL] Não foi possível enviar para ${doc.id}. Status: ${error.statusCode}`);
                }
            });
    });
    await Promise.all(sendPromises);
    console.log(`[ENVIO] Notificação "${titulo}" enviada. Sucessos: ${successCount}, Falhas: ${failureCount}`);
    return { successCount, totalCount: inscricoesSnapshot.size };
}


// --- ROBÔ 1: Envio Imediato ---
exports.enviarNotificacaoImediata = functions.region(REGIAO).https.onRequest(async (req, res) => {
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.set('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(204).send('');
    }
    
    if (!configurarWebPush()) {
        return res.status(500).json({ error: 'Falha na configuração do servidor de notificações.' });
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


// --- ROBÔ 2: Verificador de Agendamentos ---
exports.verificarAgendamentosAgendados = functions.region(REGIAO).pubsub.schedule('every 10 minutes').timeZone('America/Sao_Paulo').onRun(async (context) => {
    if (!configurarWebPush()) {
        console.error("ROBÔ DE AGENDAMENTOS PARADO: Falha na configuração VAPID.");
        return null;
    }
    
    console.log(`[CRON-GOOGLE] Verificação de agendamentos iniciada.`);
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
    
    // Processa envios recorrentes
    const diaDaSemana = agora.getDay();
    const horaAtual = agora.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });
    const hojeFormatado = agora.toISOString().split('T')[0];
    const recorrentesSnap = await agendamentosRef.where('tipo', '==', 'recorrente').where('diaDaSemana', '==', diaDaSemana).get();
    for (const doc of recorrentesSnap.docs) {
        const agendamento = doc.data();
        if (horaAtual >= agendamento.hora && agendamento.ultimoEnvio !== hojeFormatado) {
            await enviarNotificacoesParaTodos(agendamento.titulo, agendamento.corpo);
            await doc.ref.update({ ultimoEnvio: hojeFormatado });
        }
    }
    return null;
});


// --- ROBÔ 3: Verificador de Inatividade ---
exports.verificarInatividadeVoluntarios = functions.region(REGIAO).pubsub.schedule('5 4 * * *').timeZone('America/Sao_Paulo').onRun(async (context) => {
    console.log('[CRON-GOOGLE] Verificação de inatividade iniciada.');
    const dataLimite = new Date();
    dataLimite.setDate(dataLimite.getDate() - 45);
    const dataLimiteFormatada = dataLimite.toISOString().split('T')[0];
    
    const voluntariosRef = db.collection('voluntarios');
    const q = voluntariosRef.where('statusVoluntario', '==', 'ativo').where('ultimaPresenca', '<', dataLimiteFormatada);
    const snapshot = await q.get();

    if (snapshot.empty) {
        return null;
    }
    const batch = db.batch();
    snapshot.forEach(doc => {
        batch.update(doc.ref, { statusVoluntario: 'inativo' });
    });
    await batch.commit();
    return null;
});


// --- ROBÔ 4: Reset Anual do TASV ---
exports.resetarTasvAnual = functions.region(REGIAO).pubsub.schedule('0 4 1 1 *').timeZone('America/Sao_Paulo').onRun(async (context) => {
    console.log("[CRON-ANO NOVO] Iniciando processo de reset anual do TASV.");
    const voluntariosRef = db.collection('voluntarios');
    const snapshot = await voluntariosRef.get();
    if (snapshot.empty) { return null; }
    const batch = db.batch();
    snapshot.forEach(doc => {
        batch.update(doc.ref, { tasvAssinadoAno: null });
    });
    await batch.commit();
    return null;
});