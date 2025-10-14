import { initializeApp } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-auth.js";
import { getFirestore, collection, query, where, getDocs, doc, getDoc, orderBy, limit, Timestamp, writeBatch, updateDoc } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js";

// --- CONFIGURAÇÕES ---
const firebaseConfig = {
    apiKey: "AIzaSyBV7RPjk3cFTqL-aIpflJcUojKg1ZXMLuU",
    authDomain: "voluntarios-ativos---cepat.firebaseapp.com",
    projectId: "voluntarios-ativos---cepat",
    storageBucket: "voluntarios-ativos---cepat.appspot.com",
    messagingSenderId: "66122858261",
    appId: "1:66122858261:web:7fa21f1f1805463b5c08331c"
};

// --- INICIALIZAÇÃO ---
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// --- ELEMENTOS DA PÁGINA ---
const mainContainer = document.getElementById('main-container');
const greetingName = document.getElementById('greeting-name');
const turmasContainer = document.getElementById('turmas-container');
const btnLogout = document.getElementById('btn-logout');

// Elementos do Modal de Frequência
const modalFrequencia = document.getElementById('modal-frequencia');
const closeModalFrequenciaBtn = document.getElementById('close-modal-frequencia');
const modalFrequenciaTitulo = document.getElementById('modal-frequencia-titulo');
const frequenciaListContainer = document.getElementById('frequencia-list-container');
const btnSalvarFrequencia = document.getElementById('btn-salvar-frequencia');

let currentTurmaId = null;
let currentAulaId = null;

// --- VERIFICAÇÃO DE AUTENTICAÇÃO ---
onAuthStateChanged(auth, async (user) => {
    if (user) {
        mainContainer.style.display = 'block';
        await carregarDadosDoFacilitador(user);
    } else {
        window.location.href = 'login.html';
    }
});

// --- FUNÇÕES PRINCIPAIS ---

async function carregarDadosDoFacilitador(user) {
    const voluntariosRef = collection(db, "voluntarios");
    const qUser = query(voluntariosRef, where("authUid", "==", user.uid));
    const userSnapshot = await getDocs(qUser);

    if (userSnapshot.empty) {
        turmasContainer.innerHTML = '<p>Erro: Perfil de facilitador não encontrado.</p>';
        return;
    }
    const userData = userSnapshot.docs[0].data();
    const facilitatorId = userSnapshot.docs[0].id;
    greetingName.textContent = `Olá, ${userData.nome}!`;

    // Busca as turmas onde o usuário é facilitador
    const turmasRef = collection(db, "turmas");
    
    // ===================================================================
    // ## CORREÇÃO FINAL APLICADA AQUI ##
    // Apontando para o novo campo 'facilitadoresIds'
    // ===================================================================
    const qTurmas = query(turmasRef, where("facilitadoresIds", "array-contains", facilitatorId));
    
    const turmasSnapshot = await getDocs(qTurmas);

    if (turmasSnapshot.empty) {
        turmasContainer.innerHTML = '<p>Você não está designado como facilitador de nenhuma turma no momento.</p>';
        return;
    }

    turmasContainer.innerHTML = '';
    for (const turmaDoc of turmasSnapshot.docs) {
        await renderizarCardDaTurma({ id: turmaDoc.id, ...turmaDoc.data() });
    }
}

// O restante do arquivo permanece exatamente o mesmo, sem nenhuma outra alteração.
async function renderizarCardDaTurma(turmaData) {
    const card = document.createElement('div');
    card.className = 'turma-card';

    const hojeInicio = new Date();
    hojeInicio.setHours(0, 0, 0, 0);
    const hojeFim = new Date();
    hojeFim.setHours(23, 59, 59, 999);

    const cronogramaRef = collection(db, "turmas", turmaData.id, "cronograma");
    const qAula = query(cronogramaRef, 
        where("dataAgendada", ">=", Timestamp.fromDate(hojeInicio)),
        where("dataAgendada", "<=", Timestamp.fromDate(hojeFim)),
        limit(1)
    );
    const aulaSnapshot = await getDocs(qAula);
    
    let aulaDeHoje = null;
    if (!aulaSnapshot.empty) {
        const aulaDoc = aulaSnapshot.docs[0];
        aulaDeHoje = { id: aulaDoc.id, ...aulaDoc.data() };
    }
    
    const dataFormatada = hojeInicio.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
    let aulaInfoHTML = '';
    let isChamadaDisabled = true;
    let buttonDataAttributes = '';

    if (aulaDeHoje) {
        aulaInfoHTML = `<strong>Aula de Hoje (${dataFormatada}):</strong><p>${aulaDeHoje.titulo}</p>`;
        isChamadaDisabled = false;
        buttonDataAttributes = `data-turma-id="${turmaData.id}" data-aula-id="${aulaDeHoje.id}" data-aula-titulo="${aulaDeHoje.titulo}"`;
    } else {
        aulaInfoHTML = `<strong>Aula de Hoje (${dataFormatada}):</strong><p>Nenhuma aula agendada para hoje.</p>`;
    }

    card.innerHTML = `
        <div class="turma-card-content">
            <h3>${turmaData.nomeDaTurma}</h3>
            <div class="aula-info">${aulaInfoHTML}</div>
        </div>
        <div class="turma-card-footer">
            <button class="btn-chamada" ${buttonDataAttributes} ${isChamadaDisabled ? 'disabled' : ''}>
                <i class="fas fa-clipboard-list"></i> Realizar Chamada
            </button>
        </div>`;
    turmasContainer.appendChild(card);
}

async function abrirModalFrequencia(turmaId, aulaId, aulaTitulo) {
    currentTurmaId = turmaId;
    currentAulaId = aulaId;
    modalFrequenciaTitulo.textContent = `Frequência: ${aulaTitulo}`;
    frequenciaListContainer.innerHTML = '<li>Carregando lista de chamada...</li>';
    modalFrequencia.classList.add('visible');

    try {
        const participantesRef = collection(db, "turmas", turmaId, "participantes");
        const qParticipantes = query(participantesRef, orderBy("nome"));
        const participantesSnapshot = await getDocs(qParticipantes);

        const frequenciaRef = collection(db, "turmas", turmaId, "frequencias");
        const qFrequencia = query(frequenciaRef, where("aulaId", "==", aulaId));
        const frequenciaSnapshot = await getDocs(qFrequencia);
        
        const frequenciasSalvas = new Map();
        frequenciaSnapshot.forEach(doc => {
            frequenciasSalvas.set(doc.data().participanteId, doc.data().status);
        });

        let listHTML = '';
        participantesSnapshot.forEach(doc => {
            const participanteId = doc.id;
            const participante = doc.data();
            const statusAtual = frequenciasSalvas.get(participanteId) || 'presente';
            listHTML += `<li class="attendance-item" data-participante-id="${participanteId}" data-status="${statusAtual}"><span>${participante.nome}</span><div class="attendance-controls"><button class="btn-status presente ${statusAtual === 'presente' ? 'active' : ''}" data-status="presente">P</button><button class="btn-status ausente ${statusAtual === 'ausente' ? 'active' : ''}" data-status="ausente">F</button><button class="btn-status justificado ${statusAtual === 'justificado' ? 'active' : ''}" data-status="justificado">J</button></div></li>`;
        });
        frequenciaListContainer.innerHTML = listHTML || '<li>Nenhum participante inscrito nesta turma.</li>';
    } catch(error) {
        console.error("Erro ao carregar lista de chamada:", error);
        frequenciaListContainer.innerHTML = '<li>Ocorreu um erro ao carregar a lista.</li>';
    }
}

async function salvarFrequencia() {
    if (!currentTurmaId || !currentAulaId) return;
    btnSalvarFrequencia.disabled = true;
    
    try {
        const batch = writeBatch(db);
        const items = frequenciaListContainer.querySelectorAll('.attendance-item');

        items.forEach(item => {
            const participanteId = item.dataset.participanteId;
            const status = item.dataset.status;
            const frequenciaDocId = `${currentAulaId}_${participanteId}`;
            const frequenciaRef = doc(db, "turmas", currentTurmaId, "frequencias", frequenciaDocId);
            batch.set(frequenciaRef, {
                aulaId: currentAulaId,
                participanteId: participanteId,
                status: status,
                turmaId: currentTurmaId
            });
        });
        
        const aulaRef = doc(db, "turmas", currentTurmaId, "cronograma", currentAulaId);
        batch.update(aulaRef, { status: 'realizada' });

        await batch.commit();
        alert("Frequência salva com sucesso!");
        modalFrequencia.classList.remove('visible');
        location.reload();
    } catch (error) {
        console.error("Erro ao salvar frequência:", error);
        alert("Ocorreu um erro ao salvar a frequência.");
    } finally {
        btnSalvarFrequencia.disabled = false;
    }
}


// --- EVENTOS ---
btnLogout.addEventListener('click', async (e) => {
    e.preventDefault();
    await signOut(auth);
    window.location.href = 'login.html';
});

turmasContainer.addEventListener('click', (e) => {
    const target = e.target.closest('.btn-chamada');
    if (target && !target.disabled) {
        const { turmaId, aulaId, aulaTitulo } = target.dataset;
        abrirModalFrequencia(turmaId, aulaId, aulaTitulo);
    }
});

closeModalFrequenciaBtn.addEventListener('click', () => modalFrequencia.classList.remove('visible'));
btnSalvarFrequencia.addEventListener('click', salvarFrequencia);
frequenciaListContainer.addEventListener('click', (event) => {
    if (event.target.classList.contains('btn-status')) {
        const targetBtn = event.target;
        const parentItem = targetBtn.closest('.attendance-item');
        parentItem.dataset.status = targetBtn.dataset.status;
        parentItem.querySelectorAll('.btn-status').forEach(btn => btn.classList.remove('active'));
        targetBtn.classList.add('active');
    }
});