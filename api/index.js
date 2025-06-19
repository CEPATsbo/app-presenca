// VERSÃO 2.3 - Relatório em formato Tabela HTML

require('dotenv').config();
const admin = require('firebase-admin');

// Configura o Firebase Admin
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

function getDataDeHojeSP() {
    const formatador = new Intl.DateTimeFormat('en-CA', {
        year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'America/Sao_Paulo'
    });
    return formatador.format(new Date());
}

export default async function handler(request, response) {
  try {
    let dataParaConsulta;
    if (request.query.data) {
      const formatoValido = /^\d{4}-\d{2}-\d{2}$/.test(request.query.data);
      if (formatoValido) {
        dataParaConsulta = request.query.data;
      } else {
        return response.status(400).send("Formato de data inválido. Use AAAA-MM-DD.");
      }
    } else {
      dataParaConsulta = getDataDeHojeSP();
    }

    const dataParaExibicao = new Date(dataParaConsulta + 'T12:00:00Z').toLocaleDateString('pt-BR', {timeZone: 'UTC'});
    console.log(`Buscando registros para o relatório de ${dataParaConsulta}`);

    const snapshot = await db.collection('presencas').where('data', '==', dataParaConsulta).get();
    
    // --- LÓGICA ATUALIZADA PARA GERAR HTML ---

    let corpoHtml;
    if (snapshot.empty) {
      console.log(`Nenhum registro encontrado para ${dataParaConsulta}.`);
      corpoHtml = `<h1>Relatório de Presença - ${dataParaExibicao}</h1><p>Nenhum voluntário presente registrado neste dia.</p>`;
    } else {
      const presentes = [];
      snapshot.forEach(doc => {
        presentes.push(doc.data());
      });
      console.log(`Encontrados ${presentes.length} registros.`);

      // Agrupa voluntários por atividade (lógica similar à da TV)
      const porAtividade = presentes.reduce((acc, pessoa) => {
          const atividadesIndividuais = pessoa.atividade.split(', ');
          atividadesIndividuais.forEach(atividade => {
              if (!acc[atividade]) {
                  acc[atividade] = [];
              }
              if (!acc[atividade].includes(pessoa.nome)) {
                  acc[atividade].push(pessoa.nome);
              }
          });
          return acc;
      }, {});
      
      // Monta o corpo da tabela em HTML
      let corpoTabela = '';
      const atividadesOrdenadas = Object.keys(porAtividade).sort();

      for (const atividade of atividadesOrdenadas) {
        corpoTabela += `<tr><th colspan="2" class="atividade-header">${atividade}</th></tr>`;
        porAtividade[atividade].sort().forEach(nome => {
          corpoTabela += `<tr><td class="nome-voluntario">${nome}</td></tr>`;
        });
      }
      
      corpoHtml = `
        <h1>Relatório de Presença - ${dataParaExibicao}</h1>
        <h2>Total de ${presentes.length} voluntários únicos.</h2>
        <table>
            <thead>
                <tr>
                    <th>Voluntários por Atividade</th>
                </tr>
            </thead>
            <tbody>
                ${corpoTabela}
            </tbody>
        </table>
      `;
    }

    // Cria a página HTML completa com estilos
    const htmlRelatorio = `
      <!DOCTYPE html>
      <html lang="pt-br">
      <head>
        <meta charset="UTF-8">
        <title>Relatório de Presença - ${dataParaExibicao}</title>
        <style>
          body { font-family: sans-serif; margin: 2em; color: #333; }
          table { width: 100%; border-collapse: collapse; }
          th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
          thead th { background-color: #4CAF50; color: white; font-size: 1.2em; }
          th.atividade-header { background-color: #f2f2f2; font-size: 1.1em; font-weight: bold; }
          td.nome-voluntario { padding-left: 20px; }
          h1, h2 { font-weight: 300; }
          @media print {
            body { margin: 0.5em; }
            button { display: none; }
          }
          button { padding: 10px 15px; margin-bottom: 20px; cursor: pointer; }
        </style>
      </head>
      <body>
        <button onclick="window.print()">Imprimir / Salvar como PDF</button>
        ${corpoHtml}
      </body>
      </html>
    `;

    // Define o cabeçalho como HTML e envia a resposta
    response.setHeader('Content-Type', 'text/html; charset=utf-8');
    response.status(200).send(htmlRelatorio);

  } catch (error) {
    console.error("Erro ao gerar o relatório:", error);
    response.status(500).send("Ocorreu um erro interno ao gerar o relatório.");
  }
};