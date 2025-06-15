// VERSÃO 2.0 - GERADOR DE RELATÓRIO DE TEXTO

require('dotenv').config();

// Importa as bibliotecas necessárias com 'require'
const admin = require('firebase-admin');

// Configura o Firebase Admin (apenas se ainda não foi inicializado)
if (!admin.apps.length) {
  try {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });
  } catch (error) {
    console.error("ERRO FATAL ao inicializar Firebase Admin:", error);
    // Em caso de erro na inicialização, a função não funcionará.
    // Isso geralmente aponta para um problema na variável de ambiente.
  }
}
const db = admin.firestore();

// Esta é a função que a Vercel vai executar quando o link for acessado
export default async function handler(request, response) {
  try {
    const hoje = new Date().toISOString().split('T')[0];
    console.log(`Buscando registros para o relatório de ${hoje}`);

    const snapshot = await db.collection('presencas').where('data', '==', hoje).get();

    if (snapshot.empty) {
      console.log('Nenhum registro encontrado para hoje.');
      // Define o cabeçalho como texto puro e envia a resposta
      response.setHeader('Content-Type', 'text/plain; charset=utf-8');
      return response.status(200).send(`Relatório de Presença - ${new Date().toLocaleDateString('pt-BR')}\n\nNenhum voluntário presente registrado hoje.`);
    }

    const presentes = [];
    snapshot.forEach(doc => {
      presentes.push(doc.data());
    });
    console.log(`Encontrados ${presentes.length} registros.`);

    // Ordena por nome
    presentes.sort((a, b) => a.nome.localeCompare(b.nome));

    // Monta o relatório em formato de texto
    let relatorioTexto = `Relatório de Presença - ${new Date().toLocaleDateString('pt-BR')}\n`;
    relatorioTexto += `==================================================\n`;
    relatorioTexto += `Total de ${presentes.length} voluntários presentes.\n\n`;

    presentes.forEach(p => {
      relatorioTexto += `- Nome: ${p.nome}\n`;
      relatorioTexto += `  Atividade(s): ${p.atividade}\n\n`;
    });

    // Define o cabeçalho como texto puro e envia a resposta
    response.setHeader('Content-Type', 'text/plain; charset=utf-8');
    response.status(200).send(relatorioTexto);

  } catch (error) {
    console.error("Erro ao gerar o relatório:", error);
    response.setHeader('Content-Type', 'text/plain; charset=utf-8');
    response.status(500).send("Ocorreu um erro interno ao gerar o relatório. Verifique os logs da função na Vercel.");
  }
}
