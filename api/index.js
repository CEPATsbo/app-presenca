// VERSÃO 2.0 - GERADOR DE RELATÓRIO DE TEXTO

// Carrega as variáveis de ambiente
require('dotenv').config();
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
  }
}
const db = admin.firestore();

// Esta é a função que a Vercel vai executar quando o link /api for acessado
module.exports = async (request, response) => {
  try {
    const hoje = new Date().toISOString().split('T')[0];
    console.log(`Buscando registros para o relatório de ${hoje}`);

    const snapshot = await db.collection('presencas').where('data', '==', hoje).get();

    // Define o cabeçalho da resposta como texto puro
    response.setHeader('Content-Type', 'text/plain; charset=utf-8');

    if (snapshot.empty) {
      console.log('Nenhum registro encontrado para hoje.');
      const relatorioVazio = `Relatório de Presença - ${new Date().toLocaleDateString('pt-BR')}\n\nNenhum voluntário presente registrado hoje.`;
      return response.status(200).send(relatorioVazio);
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

    // Envia o relatório como resposta
    response.status(200).send(relatorioTexto);

  } catch (error) {
    console.error("Erro ao gerar o relatório:", error);
    response.status(500).send("Ocorreu um erro interno ao gerar o relatório. Verifique os logs da função na Vercel.");
  }
};