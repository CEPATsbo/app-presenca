// VERSÃO RECONSTRUÍDA E SIMPLIFICADA - 12/06/2025

// Carrega as variáveis de ambiente do arquivo .env ou da Vercel
require('dotenv').config();

// Importa as bibliotecas necessárias com 'require'
const admin = require('firebase-admin');
const cron = require('node-cron');
const sgMail = require('@sendgrid/mail');

// Configura o SendGrid com a chave da variável de ambiente
sgMail.setApiKey(process.env.SENDGRID_API_KEY);

// Configura o Firebase Admin (apenas se ainda não foi inicializado)
if (!admin.apps.length) {
  try {
    console.log('[LOG] Inicializando Firebase Admin...');
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });
    console.log('[LOG] Firebase Admin inicializado com sucesso.');
  } catch (error) {
    console.error('[ERRO FATAL] Falha ao inicializar o Firebase Admin. Verifique a variável de ambiente FIREBASE_SERVICE_ACCOUNT_JSON:', error);
  }
}
const db = admin.firestore();

// Função principal que envia o relatório diário
async function enviarRelatorioDiario() {
    const hoje = new Date().toISOString().split('T')[0];
    console.log([CRON LOG] Iniciando tarefa. Buscando registros para a data: ${hoje});

    try {
        const snapshot = await db.collection('presencas').where('data', '==', hoje).get();

        if (snapshot.empty) {
            console.log('[CRON LOG] Nenhum registro de presença encontrado para hoje. Tarefa concluída.');
            return;
        }

        const presentes = [];
        snapshot.forEach(doc => {
            presentes.push(doc.data());
        });
        console.log([CRON LOG] Encontrados ${presentes.length} registros. Preparando e-mail.);

        presentes.sort((a, b) => a.nome.localeCompare(b.nome));

        let htmlBody = <h1>Relatório de Presença - ${new Date().toLocaleDateString('pt-BR')}</h1>;
        htmlBody += <h2>Total de ${presentes.length} voluntários presentes.</h2><ul>;
        presentes.forEach(p => {
            htmlBody += <li><strong>${p.nome}</strong> - ${p.atividade}</li>;
        });
        htmlBody += '</ul>';

        const msg = {
            to: process.env.EMAIL_TO,
            from: process.env.EMAIL_FROM,
            subject: Relatório de Presença Voluntária - ${new Date().toLocaleDateString('pt-BR')},
            html: htmlBody,
        };
        
        console.log([CRON LOG] Enviando e-mail para ${process.env.EMAIL_TO}...);
        await sgMail.send(msg);
        console.log('[CRON LOG] E-mail enviado com sucesso! Tarefa concluída.');

    } catch (error) {
        console.error('[CRON ERRO] Falha crítica durante a execução da tarefa:', error);
        if (error.response) {
            console.error('[CRON ERRO SendGrid]:', error.response.body);
        }
    }
}

// Agenda a tarefa para rodar às 02:59 UTC (23:59 BRT do dia anterior)
cron.schedule('59 2 * * *', () => {
    console.log('[CRON LOG] Agendamento disparado (02:59 UTC).');
    enviarRelatorioDiario();
}, {
    timezone: "UTC"
});

// Exportação padrão necessária para a Vercel reconhecer o arquivo
module.exports = (req, res) => {
    res.status(200).send('Serviço de Cron do e-mail está ativo. A tarefa é executada no horário agendado.');
};