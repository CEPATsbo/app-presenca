// VERSÃO FINAL - Relatório em Tabela com Horários de Check-in/out

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

function getDataDeHojeSP() {
    const formatador = new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'America/Sao_Paulo' });
    return formatador.format(new Date());
}

// Esta é a função que a Vercel vai executar quando o link /api for acessado
module.exports = async (request, response) => {
  try {
    let dataParaConsulta = request.query.data || getDataDeHojeSP();
    
    // Validação simples do formato de data
    const formatoValido = /^\d{4}-\d{2}-\d{2}$/.test(dataParaConsulta);
    if (!formatoValido) {
      return response.status(400).send("Formato de data inválido. Use AAAA-MM-DD.");
    }

    const dataParaExibicao = new Date(dataParaConsulta + 'T12:00:00Z').toLocaleDateString('pt-BR', {timeZone: 'UTC'});

    const snapshot = await db.collection('presencas').where('data', '==', dataParaConsulta).get();
    
    // Define o cabeçalho da resposta como HTML
    response.setHeader('Content-Type', 'text/html; charset=utf-8');

    let corpoHtml;

    if (snapshot.empty) {
        corpoHtml = `<h1>Relatório de Presença - ${dataParaExibicao}</h1><p>Nenhum voluntário presente registrado neste dia.</p>`;
    } else {
        const presentes = snapshot.docs.map(doc => doc.data());
        presentes.sort((a, b) => a.nome.localeCompare(b.nome));

        let corpoTabela = '';
        presentes.forEach(p => {
            const options = { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' };
            
            // Formata o horário de check-in a partir do campo 'primeiroCheckin'
            const horarioCheckin = p.primeiroCheckin 
                ? p.primeiroCheckin.toDate().toLocaleTimeString('pt-BR', options) 
                : 'N/A';
            
            // O check-out só é válido se o último status for 'ausente'
            const horarioCheckout = (p.status === 'ausente' && p.ultimaAtualizacao) 
                ? p.ultimaAtualizacao.toDate().toLocaleTimeString('pt-BR', options) 
                : '---';

            corpoTabela += `
                <tr>
                    <td>${p.nome}</td>
                    <td>${p.atividade}</td>
                    <td>${horarioCheckin}</td>
                    <td>${horarioCheckout}</td>
                </tr>
            `;
        });
        
        corpoHtml = `
          <h1>Relatório de Presença - ${dataParaExibicao}</h1>
          <h2>Total de ${presentes.length} voluntários únicos.</h2>
          <table>
              <thead>
                  <tr>
                      <th>Voluntário</th>
                      <th>Atividade(s)</th>
                      <th>Check-in</th>
                      <th>Check-out</th>
                  </tr>
              </thead>
              <tbody>
                  ${corpoTabela}
              </tbody>
          </table>
        `;
    }

    // Monta a página HTML final com estilos
    const htmlRelatorio = `
      <!DOCTYPE html>
      <html lang="pt-br"><head><title>Relatório de Presença - ${dataParaExibicao}</title>
        <style>
          body { font-family: sans-serif; margin: 2em; color: #333; }
          table { width: 100%; border-collapse: collapse; margin-top: 20px;}
          th, td { border: 1px solid #ddd; padding: 12px; text-align: left; }
          thead th { background-color: #2e7d32; color: white; font-size: 1.1em; }
          h1, h2 { font-weight: 300; text-align: center; }
          h2 { font-size: 1.2em; color: #555; }
          @media print { button { display: none; } }
          button { display: block; margin: 0 auto 20px auto; padding: 10px 20px; cursor: pointer; font-size: 1em; }
        </style>
      </head><body>
        <button onclick="window.print()">Imprimir / Salvar como PDF</button>
        ${corpoHtml}
      </body></html>
    `;
    
    response.status(200).send(htmlRelatorio);

  } catch (error) {
    console.error("Erro ao gerar o relatório:", error);
    response.status(500).send("Ocorreu um erro interno ao gerar o relatório.");
  }
};