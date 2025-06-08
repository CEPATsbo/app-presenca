require('dotenv').config();
const admin = require('firebase-admin');
const cron = require('node-cron');
const sgMail = require('@sendgrid/mail');

// Configura o SendGrid
sgMail.setApiKey(process.env.SENDGRID_API_KEY);

// Configura o Firebase Admin
// Tenta carregar as credenciais da variável de ambiente (para a Vercel)
let serviceAccount;
if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
  // Se estiver na Vercel, lê o JSON da variável de ambiente
  serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
} else {
  // Se estiver no seu computador, lê o JSON do arquivo local
  serviceAccount = require('./serviceAccountKey.json');
}
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});
const db = admin.firestore();

// Função para buscar os presentes do dia e enviar o e-mail
async function enviarRelatorioDiario() {
    const hoje = new Date().toISOString().split('T')[0];
    console.log([${new Date().toLocaleString('pt-BR')}] Executando tarefa de envio de e-mail...);

    try {
        const snapshot = await db.collection('presencas').where('data', '==', hoje).get();

        if (snapshot.empty) {
            console.log('Nenhuma presença registrada hoje. E-mail não será enviado.');
            return;
        }

        const presentes = [];
        snapshot.forEach(doc => {
            presentes.push(doc.data());
        });

        // Ordena por nome em ordem alfabética
        presentes.sort((a, b) => a.nome.localeCompare(b.nome));

        // Cria o corpo do e-mail em HTML
        let htmlBody = <h1>Relatório de Presença - ${new Date().toLocaleDateString('pt-BR')}</h1>;
        htmlBody += <h2>Total de ${presentes.length} voluntários presentes.</h2>;
        htmlBody += '<ul>';
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

        await sgMail.send(msg);
        console.log('Relatório de e-mail enviado com sucesso!');

    } catch (error) {
        console.error('Erro ao gerar ou enviar o relatório:', error);
    }
}

// Agenda a tarefa para rodar todos os dias às 23:59
// Formato: 'minuto hora * * dia-da-semana'
cron.schedule('59 23 * * *', enviarRelatorioDiario, {
    scheduled: true,
    timezone: "America/Sao_Paulo"
});

console.log('Backend iniciado. Tarefa de e-mail agendada para 23:59 todos os dias.');

// Para teste imediato, você pode chamar a função aqui:
// enviarRelatorioDiario();

