import { initializeApp } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-auth.js";
import { getFirestore, collection, collectionGroup, query, where, getDocs, doc, getDoc } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js";

console.log("DEBUG: Arquivo meu-progresso.js foi carregado e está sendo executado.");

// --- CONFIGURAÇÕES ---
const firebaseConfig = {
    apiKey: "AIzaSyBV7RPjk3cFTqL-aIpflJcUojKg1ZXMLuU",
    authDomain: "voluntarios-ativos---cepat.firebaseapp.com",
    projectId: "voluntarios-ativos---cepat",
    storageBucket: "voluntarios-ativos---cepat.appspot.com",
    messagingSenderId: "66122858261",
    appId: "1:66122858261:web:7fa21f1805463b5c08331c"
};

// --- INICIALIZAÇÃO ---
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// --- ELEMENTOS DA PÁGINA ---
const mainContainer = document.getElementById('main-container');
const greetingName = document.getElementById('greeting-name');
const cursosContainer = document.getElementById('cursos-container');
const btnLogout = document.getElementById('btn-logout');

// --- VERIFICAÇÃO DE AUTENTICAÇÃO ---
console.log("DEBUG: Adicionando o listener onAuthStateChanged...");

onAuthStateChanged(auth, async (user) => {
    console.log("DEBUG: onAuthStateChanged foi acionado.");

    if (user) {
        console.log("DEBUG: Usuário ENCONTRADO. UID:", user.uid);
        try {
            console.log("DEBUG: Tornando o container principal visível.");
            mainContainer.style.display = 'block';
            console.log("DEBUG: Tentando carregar dados do aluno...");
            await carregarDadosDoAluno(user);
            console.log("DEBUG: Função carregarDadosDoAluno concluída.");
        } catch (error) {
            console.error("ERRO CRÍTICO AO CARREGAR DADOS:", error);
            mainContainer.style.display = 'block'; // Garante que a mensagem de erro seja visível
            cursosContainer.innerHTML = `<p style="color: red; font-weight: bold;">Ocorreu um erro grave ao carregar seus dados. Verifique o console (F12) para mais detalhes.</p>`;
        }
    } else {
        console.log("DEBUG: Usuário NÃO encontrado. Redirecionando para a página de login...");
        // Usando caminho relativo para garantir compatibilidade
        window.location.href = 'login.html'; 
    }
});

// --- FUNÇÕES PRINCIPAIS ---

async function carregarDadosDoAluno(user) {
    // 1. Buscar o perfil do voluntário para pegar o nome
    const voluntariosRef = collection(db, "voluntarios");
    const qUser = query(voluntariosRef, where("authUid", "==", user.uid));
    const userSnapshot = await getDocs(qUser);

    if (userSnapshot.empty) {
        cursosContainer.innerHTML = '<p>Erro: Perfil de voluntário não encontrado.</p>';
        console.warn("DEBUG: Perfil não encontrado no Firestore para o UID:", user.uid);
        return;
    }
    const userData = userSnapshot.docs[0].data();
    const userId = userSnapshot.docs[0].id;
    greetingName.textContent = `Olá, ${userData.nome}!`;
    console.log(`DEBUG: Olá, ${userData.nome}!`);

    // 2. Buscar em quais turmas este aluno está inscrito
    const participantesQuery = query(collectionGroup(db, 'participantes'), where('participanteId', '==', userId));
    const participantesSnapshot = await getDocs(participantesQuery);

    if (participantesSnapshot.empty) {
        cursosContainer.innerHTML = '<p>Você não está inscrito em nenhum curso no momento.</p>';
        console.log("DEBUG: Nenhuma inscrição encontrada para o participante ID:", userId);
        return;
    }
    console.log(`DEBUG: Encontradas ${participantesSnapshot.size} inscrições.`);

    cursosContainer.innerHTML = ''; // Limpa a mensagem de "carregando"

    // 3. Para cada inscrição, buscar os detalhes da turma e do progresso do aluno
    for (const participanteDoc of participantesSnapshot.docs) {
        const participanteData = participanteDoc.data();
        const turmaRef = participanteDoc.ref.parent.parent; 
        const turmaDoc = await getDoc(turmaRef);

        if (turmaDoc.exists()) {
            const turmaData = { id: turmaDoc.id, ...turmaDoc.data() };
            const participanteComId = { id: participanteDoc.id, ...participanteData };
            renderizarCardDoCurso(turmaData, participanteComId);
        }
    }
}

function renderizarCardDoCurso(turmaData, participanteData) {
    console.log(`DEBUG: Renderizando card para a turma ${turmaData.nomeDaTurma}`);
    const cursoCard = document.createElement('div');
    cursoCard.className = 'curso-card';

    const anoAtual = turmaData.anoAtual || 1;
    const avaliacaoDoAno = participanteData.avaliacoes ? participanteData.avaliacoes[anoAtual] : null;

    let frequencia = '--';
    let status = 'Cursando';
    let mediaFinal = null;

    if (avaliacaoDoAno) {
        frequencia = `${avaliacaoDoAno.notaFrequencia || 0}%`;
        status = avaliacaoDoAno.statusAprovacao || 'Em Andamento';
        if (turmaData.isEAE) {
            mediaFinal = avaliacaoDoAno.mediaFinal.toFixed(1);
        }
    }

    let metricsHTML = `<div class="metric-item"><strong>${frequencia}</strong><span>Frequência</span></div>`;
    metricsHTML += `<div class="metric-item"><strong>${status}</strong><span>Status</span></div>`;
    if (mediaFinal !== null) {
        metricsHTML += `<div class="metric-item"><strong>${mediaFinal}</strong><span>Média Final (${anoAtual}º Ano)</span></div>`;
    }

    cursoCard.innerHTML = `
        <div class="curso-card-header">
            <h3>${turmaData.nomeDaTurma}</h3>
            <div class="curso-metrics">
                ${metricsHTML}
            </div>
        </div>
        <div class="curso-card-footer">
            <button class="btn-details" data-turma-id="${turmaData.id}" data-participante-id="${participanteData.id}">
                <i class="fas fa-chevron-down"></i> Ver Detalhes e Cronograma
            </button>
        </div>
        <div class="curso-details-content">
            </div>
    `;

    cursosContainer.appendChild(cursoCard);
}


// --- EVENTOS ---
btnLogout.addEventListener('click', async (e) => {
    e.preventDefault();
    try {
        await signOut(auth);
        window.location.href = 'login.html'; 
    } catch (error) {
        console.error('Erro ao fazer logout:', error);
    }
});