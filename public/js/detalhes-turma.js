import { initializeApp } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-auth.js";
import { getFirestore, collection, query, where, getDocs, doc, getDoc, addDoc, onSnapshot, orderBy, limit, serverTimestamp } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js";

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
const turmaTituloHeader = document.getElementById('turma-titulo-header');
const participantesTable = document.getElementById('participantes-table');
const participantesTableBody = document.getElementById('participantes-table-body');
const btnInscreverParticipante = document.getElementById('btn-inscrever-participante');
// Modal de Inscrição
const modalInscricao = document.getElementById('modal-inscricao');
const closeModalInscricaoBtn = document.getElementById('close-modal-inscricao');
const formInscricao = document.getElementById('form-inscricao');
const participanteSelect = document.getElementById('participante-select');
const formGroupGrau = document.getElementById('form-group-grau');
const participanteGrauSelect = document.getElementById('participante-grau');
const btnSalvarInscricao = document.getElementById('btn-salvar-inscricao');

let turmaId = null;
let turmaData = null;

// --- VERIFICAÇÃO DE PERMISSÃO E CARREGAMENTO ---
onAuthStateChanged(auth, async (user) => {
    if (user) {
        const voluntariosRef = collection(db, "voluntarios");
        const q = query(voluntariosRef, where("authUid", "==", user.uid), limit(1));
        const querySnapshot = await getDocs(q);
        if (!querySnapshot.empty) {
            const userProfile = querySnapshot.docs[0].data();
            const userRole = userProfile.role;
            if (userRole === 'super-admin' || userRole === 'diretor') {
                const params = new URLSearchParams(window.location.search);
                turmaId = params.get('turmaId');
                if (turmaId) {
                    carregarDadosDaTurma();
                } else {
                    document.body.innerHTML = '<h1>Erro: ID da turma não encontrado.</h1>';
                }
            } else {
                document.body.innerHTML = '<h1>Acesso Negado</h1>';
            }
        } else {
            document.body.innerHTML = '<h1>Acesso Negado</h1>';
        }
    } else {
        window.location.href = '/index.html';
    }
});

// --- FUNÇÕES ---
async function carregarDadosDaTurma() {
    const turmaRef = doc(db, "turmas", turmaId);
    const turmaSnap = await getDoc(turmaRef);

    if (turmaSnap.exists()) {
        turmaData = turmaSnap.data();
        turmaTituloHeader.innerHTML = `<small>Gerenciando a Turma:</small>${turmaData.nomeDaTurma}`;
        
        configurarTabelaParticipantes();
        escutarParticipantes();
    } else {
        document.body.innerHTML = '<h1>Erro: Turma não encontrada.</h1>';
    }
}

function configurarTabelaParticipantes() {
    let tableHeaderHTML = '<tr><th>Nome do Participante</th>';
    if (turmaData.isEAE) {
        tableHeaderHTML += '<th>Grau</th><th>Status</th><th>Ações</th>';
    } else {
        tableHeaderHTML += '<th>Status</th><th>Ações</th>';
    }
    tableHeaderHTML += '</tr>';
    participantesTable.querySelector('thead').innerHTML = tableHeaderHTML;
}

function escutarParticipantes() {
    const participantesRef = collection(db, "turmas", turmaId, "participantes");
    const q = query(participantesRef, orderBy("nome"));

    onSnapshot(q, (snapshot) => {
        participantesTableBody.innerHTML = '';
        if (snapshot.empty) {
            const colspan = turmaData.isEAE ? 4 : 3;
            participantesTableBody.innerHTML = `<tr><td colspan="${colspan}" style="text-align: center;">Nenhum participante inscrito.</td></tr>`;
            return;
        }
        snapshot.forEach(doc => {
            const participante = doc.data();
            const tr = document.createElement('tr');
            let rowHTML = `<td>${participante.nome}</td>`;
            if (turmaData.isEAE) {
                rowHTML += `<td>${participante.grau || 'Aluno'}</td>`;
            }
            rowHTML += `<td>Ativo</td>`; // Placeholder para o status
            rowHTML += `<td class="actions"><button class="icon-btn delete" data-id="${doc.id}"><i class="fas fa-trash-alt"></i></button></td>`;
            tr.innerHTML = rowHTML;
            participantesTableBody.appendChild(tr);
        });
    });
}

async function carregarVoluntariosParaInscricao() {
    participanteSelect.innerHTML = '<option value="">Selecione um voluntário/assistido</option>';
    const voluntariosRef = collection(db, "voluntarios");
    const q = query(voluntariosRef, orderBy("nome"));
    const snapshot = await getDocs(q);
    snapshot.forEach(doc => {
        const option = document.createElement('option');
        option.value = doc.id;
        option.textContent = doc.data().nome;
        participanteSelect.appendChild(option);
    });
}

function abrirModalInscricao() {
    formInscricao.reset();
    carregarVoluntariosParaInscricao();
    if (turmaData.isEAE) {
        formGroupGrau.classList.remove('hidden');
    } else {
        formGroupGrau.classList.add('hidden');
    }
    modalInscricao.classList.add('visible');
}

async function inscreverParticipante(event) {
    event.preventDefault();
    const participanteId = participanteSelect.value;
    const participanteNome = participanteSelect.options[participanteSelect.selectedIndex].text;
    
    if (!participanteId) {
        return alert("Por favor, selecione um participante.");
    }

    btnSalvarInscricao.disabled = true;
    
    try {
        const novoParticipante = {
            participanteId: participanteId,
            nome: participanteNome,
            inscritoEm: serverTimestamp()
        };
        if (turmaData.isEAE) {
            novoParticipante.grau = participanteGrauSelect.value;
        }
        
        const participantesRef = collection(db, "turmas", turmaId, "participantes");
        await addDoc(participantesRef, novoParticipante);

        modalInscricao.classList.remove('visible');
    } catch (error) {
        console.error("Erro ao inscrever participante:", error);
        alert("Ocorreu um erro ao realizar a inscrição.");
    } finally {
        btnSalvarInscricao.disabled = false;
    }
}

// --- EVENTOS ---
if(btnInscreverParticipante) btnInscreverParticipante.addEventListener('click', abrirModalInscricao);
if(closeModalInscricaoBtn) closeModalInscricaoBtn.addEventListener('click', () => modalInscricao.classList.remove('visible'));
if(modalInscricao) modalInscricao.addEventListener('click', (event) => {
    if (event.target === modalInscricao) modalInscricao.classList.remove('visible');
});
if(formInscricao) formInscricao.addEventListener('submit', inscreverParticipante);