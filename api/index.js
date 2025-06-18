// VERSÃO 2.2 - CORREÇÃO DE FUSO HORÁRIO

require('dotenv').config();
const admin = require('firebase-admin');

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

// Função para obter a data atual no fuso horário de São Paulo, formato AAAA-MM-DD
function getDataDeHojeSP() {
    const hoje = new Date();
    // Opções para formatar a data no padrão de São Paulo e obter as partes
    const ano = hoje.toLocaleString('pt-BR', { year: 'numeric', timeZone: 'America/Sao_Paulo' });
    const mes = hoje.toLocaleString('pt-BR', { month: '2-digit', timeZone: 'America/Sao_Paulo' });
    const dia = hoje.toLocaleString('pt-BR', { day: '2-digit', timeZone: 'America/Sao_Paulo' });
    return `${ano}-${mes}-${dia}`;
}


export default async function handler(request, response) {
  try {
    let dataParaConsulta;
    
    if (request.query.data) {
      const formatoValido = /^\d{4}-\d{2}-\d{2}$/.test(request.query.data);
      if (formatoValido) {
        dataParaConsulta = request.query.data;
      } else {
        response.setHeader('Content-Type', 'text/plain; charset=utf-8');
        return response.status(400).send("Formato de data inválido. Use AAAA-MM-DD.");
      }
    } else {
      // --- AQUI ESTÁ A MUDANÇA ---
      // Usa a nova função para pegar a data de São Paulo
      dataParaConsulta = getDataDeHojeSP();
    }

    const dataParaExibicao = new Date(dataParaConsulta + 'T12:00:00Z').toLocaleDateString('pt-BR', {timeZone: 'UTC'});
    console.log(`Buscando registros para o relatório de ${dataParaConsulta}`);

    const snapshot = await db.collection('presencas').where('data', '==', dataParaConsulta).get();
    response.setHeader('Content-Type', 'text/plain; charset=utf-8');

    if (snapshot.empty) {
      console.log(`Nenhum registro encontrado para ${dataParaConsulta}.`);
      return response.status(200).send(`Relatório de Presença - ${dataParaExibicao}\n\nNenhum voluntário presente registrado neste dia.`);
    }

    const presentes = [];
    snapshot.forEach(doc => {
      presentes.push(doc.data());
    });
    console.log(`Encontrados ${presentes.length} registros.`);

    presentes.sort((a, b) => a.nome.localeCompare(b.nome));

    let relatorioTexto = `Relatório de Presença - ${dataParaExibicao}\n`;
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
    response.status(500).send("Ocorreu um erro interno ao gerar o relatório.");
  }
};