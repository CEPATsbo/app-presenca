const admin = require('firebase-admin');

// Inicialize o app do Firebase Admin (usando as credenciais da Vercel)
try {
  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON))
    });
  }
} catch (error) {
  console.error('Erro ao inicializar Firebase Admin SDK:', error);
}

const db = admin.firestore();

export default async function handler(request, response) {
  console.log("Iniciando verificação de inatividade de voluntários...");

  try {
    const hoje = new Date();
    const dataLimite = new Date();
    dataLimite.setDate(hoje.getDate() - 45); // Define o limite de 45 dias atrás

    // Formata a data limite para o formato 'YYYY-MM-DD' para comparação
    const dataLimiteFormatada = dataLimite.toISOString().split('T')[0];

    // Busca todos os voluntários que estão ATIVOS
    const voluntariosAtivosRef = db.collection('voluntarios').where('statusVoluntario', '==', 'ativo');
    const snapshot = await voluntariosAtivosRef.get();

    if (snapshot.empty) {
      console.log("Nenhum voluntário ativo encontrado para verificação.");
      return response.status(200).send("Nenhum voluntário ativo para verificar.");
    }

    const batch = db.batch(); // Usamos um "batch" para atualizar todos de uma vez
    let inativadosCount = 0;

    snapshot.forEach(doc => {
      const voluntario = doc.data();
      const ultimaPresenca = voluntario.ultimaPresenca; // Formato 'YYYY-MM-DD'

      // Se o voluntário nunca teve presença ou a última foi antes da data limite
      if (!ultimaPresenca || ultimaPresenca < dataLimiteFormatada) {
        console.log(`Marcando ${voluntario.nome} como inativo. Última presença: ${ultimaPresenca || 'Nenhuma'}`);
        const docRef = db.collection('voluntarios').doc(doc.id);
        batch.update(docRef, { statusVoluntario: 'inativo' });
        inativadosCount++;
      }
    });

    // Executa todas as atualizações de uma vez
    await batch.commit();

    const mensagem = `Verificação concluída. ${inativadosCount} voluntário(s) foram marcados como inativos.`;
    console.log(mensagem);
    return response.status(200).send(mensagem);

  } catch (error) {
    console.error('Erro na verificação de inatividade:', error);
    return response.status(500).send('Erro interno no servidor.');
  }
}