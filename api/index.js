// VERSÃO 2.1 - Relatório com consulta por data

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

// Esta é a função que a Vercel vai executar
export default async function handler(request, response) {
  try {
    // --- LÓGICA ATUALIZADA PARA LER A DATA DO LINK ---
    let dataParaConsulta;
    
    // Verifica se o parâmetro ?data= foi passado no link
    if (request.query.data) {
      // Validação simples do formato YYYY-MM-DD
      const formatoValido = /^\d{4}-\d{2}-\d{2}$/.test(request.query.data);
      if (formatoValido) {
        dataParaConsulta = request.query.data;
      } else {
        // Se o formato for inválido, retorna um erro amigável
        response.setHeader('Content-Type', 'text/plain; charset=utf-8');
        return response.status(400).send("Formato de data inválido. Use AAAA-MM-DD.");
      }
    } else {
      // Se nenhum parâmetro de data for passado, usa a data de hoje
      dataParaConsulta = new Date().toISOString().split('T')[0];
    }
    // --- FIM DA LÓGICA ATUALIZADA ---

    const dataFormatadaParaExibicao = new Date(dataParaConsulta + 'T12:00:00Z').toLocaleDateString('pt-BR');
    console.log(`Buscando registros para o relatório de ${dataParaConsulta}`);

    const snapshot = await db.collection('presencas').where('data', '==', dataParaConsulta).get();

    response.setHeader('Content-Type', 'text/plain; charset=utf-8');

    if (snapshot.empty) {
      console.log(`Nenhum registro encontrado para ${dataParaConsulta}.`);
      return response.status(200).send(`Relatório de Presença - ${dataFormatadaParaExibicao}\n\nNenhum voluntário presente registrado neste dia.`);
    }

    const presentes = [];
    snapshot.forEach(doc => {
      presentes.push(doc.data());
    });
    console.log(`Encontrados ${presentes.length} registros.`);

    presentes.sort((a, b) => a.nome.localeCompare(b.nome));

    let relatorioTexto = `Relatório de Presença - ${dataFormatadaParaExibicao}\n`;
    relatorioTexto += `==================================================\n`;
    relatorioTexto += `Total de ${presentes.length} voluntários presentes.\n\n`;

    presentes.forEach(p => {
      relatorioTexto += `- Nome: ${p.nome}\n`;
      relatorioTexto += `  Atividade(s): ${p.atividade}\n\n`;
    });
    
    response.status(200).send(relatorioTexto);

  } catch (error) {
    console.error("Erro ao gerar o relatório:", error);
    response.setHeader('Content-Type', 'text/plain; charset=utf-8');
    response.status(500).send("Ocorreu um erro interno ao gerar o relatório. Verifique os logs da função na Vercel.");
  }
};