import { initializeApp } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-auth.js";
import { getFirestore, collection, collectionGroup, query, where, getDocs, doc, getDoc, orderBy } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js";

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
onAuthStateChanged(auth, async (user) => {
    if (user) {
        mainContainer.style.display = 'block';
        await carregarDadosDoAluno(user);
    } else {
        window.location.href = 'login.html';
    }
});

// --- FUNÇÕES PRINCIPAIS ---
async function carregarDadosDoAluno(user) {
    const voluntariosRef = collection(db, "voluntarios");
    const qUser = query(voluntariosRef, where("authUid", "==", user.uid));
    const userSnapshot = await getDocs(qUser);

    if (userSnapshot.empty) {
        cursosContainer.innerHTML = '<p>Erro: Perfil de voluntário não encontrado.</p>';
        return;
    }
    const userData = userSnapshot.docs[0].data();
    const userId = userSnapshot.docs[0].id;
    greetingName.textContent = `Olá, ${userData.nome}!`;

    const participantesQuery = query(collectionGroup(db, 'participantes'), where('participanteId', '==', userId));
    const participantesSnapshot = await getDocs(participantesQuery);

    if (participantesSnapshot.empty) {
        cursosContainer.innerHTML = '<p>Você não está inscrito em nenhum curso no momento.</p>';
        return;
    }

    cursosContainer.innerHTML = '';

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

// ===================================================================
// ## NOVA FUNÇÃO PARA CARREGAR E RENDERIZAR OS DETALHES ##
// ===================================================================
async function carregarErenderizarDetalhes(turmaId, participanteId, detailsContainer) {
    try {
        // Buscar o cronograma e as frequências ao mesmo tempo
        const cronogramaRef = collection(db, "turmas", turmaId, "cronograma");
        const frequenciasRef = collection(db, "turmas", turmaId, "frequencias");

        const [cronogramaSnap, frequenciasSnap] = await Promise.all([
            getDocs(query(cronogramaRef, orderBy("dataAgendada", "asc"))),
            getDocs(query(frequenciasRef, where("participanteId", "==", participanteId)))
        ]);

        // Mapear as frequências para busca rápida
        const frequenciasMap = new Map();
        frequenciasSnap.forEach(doc => {
            const freqData = doc.data();
            frequenciasMap.set(freqData.aulaId, freqData.status);
        });

        const hoje = new Date();
        hoje.setHours(0, 0, 0, 0); // Zera a hora para comparar apenas a data

        let proximasAulasHTML = '';
        let historicoHTML = '';

        cronogramaSnap.docs.forEach(doc => {
            const aula = { id: doc.id, ...doc.data() };
            const dataAula = aula.dataAgendada.toDate();
            const dataFormatada = dataAula.toLocaleDateString('pt-BR', { timeZone: 'UTC' });
            
            if (dataAula >= hoje && aula.status !== 'realizada') {
                proximasAulasHTML += `
                    <tr>
                        <td>${dataFormatada}</td>
                        <td>${aula.isExtra ? 'Extra' : aula.numeroDaAula}</td>
                        <td>${aula.titulo}</td>
                    </tr>
                `;
            }

            if (aula.status === 'realizada') {
                const statusPresenca = frequenciasMap.get(aula.id);
                let statusDisplay = '';
                switch (statusPresenca) {
                    case 'presente': statusDisplay = '<span class="status-presente">Presente ✅</span>'; break;
                    case 'ausente': statusDisplay = '<span class="status-ausente">Falta ❌</span>'; break;
                    case 'justificado': statusDisplay = '<span class="status-justificado">Justificado  excused</span>'; break;
                    default: statusDisplay = '<span>Não lançado</span>';
                }

                historicoHTML = `
                    <tr>
                        <td>${dataFormatada}</td>
                        <td>${aula.titulo}</td>
                        <td>${statusDisplay}</td>
                    </tr>
                ` + historicoHTML; // Adiciona no início para ordem decrescente
            }
        });
        
        detailsContainer.innerHTML = `
            <h4>Próximas Aulas:</h4>
            <div class="table-container">
                <table>
                    <thead><tr><th>Data</th><th>Nº</th><th>Tema da Aula</th></tr></thead>
                    <tbody>${proximasAulasHTML || '<tr><td colspan="3">Nenhuma aula futura agendada.</td></tr>'}</tbody>
                </table>
            </div>
            <h4 style="margin-top: 20px;">Histórico de Frequência:</h4>
            <div class="table-container">
                <table>
                    <thead><tr><th>Data</th><th>Tema da Aula</th><th>Sua Presença</th></tr></thead>
                    <tbody>${historicoHTML || '<tr><td colspan="3">Nenhum histórico de frequência registrado.</td></tr>'}</tbody>
                </table>
            </div>
        `;

    } catch (error) {
        console.error("Erro ao carregar detalhes do curso:", error);
        detailsContainer.innerHTML = '<p style="color: red;">Não foi possível carregar os detalhes. Tente novamente.</p>';
    }
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

// ===================================================================
// ## NOVO EVENTO PARA O BOTÃO "VER DETALHES" ##
// ===================================================================
cursosContainer.addEventListener('click', async (e) => {
    const target = e.target.closest('.btn-details');
    if (!target) return; // Se o clique não foi no botão ou em algo dentro dele, ignora.

    const card = target.closest('.curso-card');
    const detailsContent = card.querySelector('.curso-details-content');
    const turmaId = target.dataset.turmaId;
    const participanteId = target.dataset.participanteId;

    // Lógica para abrir e fechar (toggle)
    const isHidden = detailsContent.style.display !== 'block';

    if (isHidden) {
        detailsContent.style.display = 'block';
        target.innerHTML = `<i class="fas fa-chevron-up"></i> Ocultar Detalhes`;
        detailsContent.innerHTML = '<p>Carregando detalhes...</p>';
        await carregarErenderizarDetalhes(turmaId, participanteId, detailsContent);
    } else {
        detailsContent.style.display = 'none';
        target.innerHTML = `<i class="fas fa-chevron-down"></i> Ver Detalhes e Cronograma`;
        detailsContent.innerHTML = ''; // Limpa para recarregar da próxima vez
    }
});