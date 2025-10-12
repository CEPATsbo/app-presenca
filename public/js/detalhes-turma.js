import { initializeApp } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-auth.js";
import { getFirestore, collection, query, where, getDocs, doc, getDoc, addDoc, onSnapshot, orderBy, limit, serverTimestamp, Timestamp, updateDoc, deleteDoc } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyBV7RPjk3cFTqL-aIpflJcUojKg1ZXMLuU",
    authDomain: "voluntarios-ativos---cepat.firebaseapp.com",
    projectId: "voluntarios-ativos---cepat",
    storageBucket: "voluntarios-ativos---cepat.appspot.com",
    messagingSenderId: "66122858261",
    appId: "1:66122858261:web:7fa21f1805463b5c08331c"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// --- ELEMENTOS DA PÁGINA (CORRIGIDO) ---
const turmaTituloHeader = document.getElementById('turma-titulo-header');
const participantesTable = document.getElementById('participantes-table');
const participantesTableBody = document.getElementById('participantes-table-body');
const btnInscreverParticipante = document.getElementById('btn-inscrever-participante');
const cronogramaTableBody = document.getElementById('cronograma-table-body');
const tabs = document.querySelectorAll('.tab-link');
const tabContents = document.querySelectorAll('.tab-content');
const btnAddAulaExtra = document.getElementById('btn-add-aula-extra');
const btnGerenciarRecessos = document.getElementById('btn-gerenciar-recessos');
const btnSair = null; // ESTA PÁGINA NÃO TEM BOTÃO DE SAIR, ENTÃO DEFINIMOS COMO NULL PARA EVITAR ERROS.

const modalInscricao = document.getElementById('modal-inscricao');
const closeModalInscricaoBtn = document.getElementById('close-modal-inscricao');
const formInscricao = document.getElementById('form-inscricao');
const participanteSelect = document.getElementById('participante-select');
const formGroupGrau = document.getElementById('form-group-grau');
const participanteGrauSelect = document.getElementById('participante-grau');
const btnSalvarInscricao = document.getElementById('btn-salvar-inscricao');

const modalAula = document.getElementById('modal-aula');
const closeModalAulaBtn = document.getElementById('close-modal-aula');
const formAula = document.getElementById('form-aula');
const modalAulaTitulo = document.getElementById('modal-aula-titulo');
const inputAulaId = document.getElementById('aula-id');
const inputAulaIsExtra = document.getElementById('aula-is-extra');
const inputAulaTitulo = document.getElementById('aula-titulo');
const inputAulaData = document.getElementById('aula-data');
const formGroupNumeroAula = document.getElementById('form-group-numero-aula');
const inputAulaNumero = document.getElementById('aula-numero');
const btnSalvarAula = document.getElementById('btn-salvar-aula');

const modalRecessos = document.getElementById('modal-recessos');
const closeModalRecessosBtn = document.getElementById('close-modal-recessos');
const formRecesso = document.getElementById('form-recesso');
const inputRecessoInicio = document.getElementById('recesso-data-inicio');
const inputRecessoFim = document.getElementById('recesso-data-fim');
const recessoListContainer = document.getElementById('recesso-list-container');

let turmaId = null;
let turmaData = null;

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

async function carregarDadosDaTurma() {
    const turmaRef = doc(db, "turmas", turmaId);
    const turmaSnap = await getDoc(turmaRef);
    if (turmaSnap.exists()) {
        turmaData = turmaSnap.data();
        turmaTituloHeader.innerHTML = `<small>Gerenciando a Turma:</small>${turmaData.nomeDaTurma}`;
        configurarTabelaParticipantes();
        escutarParticipantes();
        escutarCronograma();
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
            rowHTML += `<td>Ativo</td>`;
            rowHTML += `<td class="actions"><button class="icon-btn delete" data-id="${doc.id}"><i class="fas fa-trash-alt"></i></button></td>`;
            tr.innerHTML = rowHTML;
            participantesTableBody.appendChild(tr);
        });
    });
}

function escutarCronograma() {
    const cronogramaRef = collection(db, "turmas", turmaId, "cronograma");
    const q = query(cronogramaRef, orderBy("dataAgendada", "asc"));
    onSnapshot(q, (snapshot) => {
        cronogramaTableBody.innerHTML = '';
        if (snapshot.empty) {
            cronogramaTableBody.innerHTML = '<tr><td colspan="5" style="text-align: center;">Cronograma ainda não gerado ou vazio.</td></tr>';
            return;
        }
        snapshot.forEach(doc => {
            const aula = doc.data();
            const dataFormatada = aula.dataAgendada.toDate().toLocaleDateString('pt-BR', { timeZone: 'UTC' });
            const tr = document.createElement('tr');
            const numeroAulaDisplay = aula.isExtra ? '<strong>Extra</strong>' : aula.numeroDaAula;
            let actionsHTML = `<button class="icon-btn edit" title="Editar Aula" data-action="edit" data-id="${doc.id}"><i class="fas fa-pencil-alt"></i></button>`;
            if (aula.isExtra) {
                actionsHTML += `<button class="icon-btn delete" title="Excluir Aula Extra" data-action="delete" data-id="${doc.id}"><i class="fas fa-trash-alt"></i></button>`;
            } else {
                actionsHTML += `<button class="icon-btn recess" title="Marcar como Recesso" data-action="recess" data-id="${doc.id}"><i class="fas fa-coffee"></i></button>`;
            }
            tr.innerHTML = `<td>${numeroAulaDisplay}</td><td>${dataFormatada}</td><td>${aula.titulo}</td><td>${aula.status}</td><td class="actions">${actionsHTML}</td>`;
            cronogramaTableBody.appendChild(tr);
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
    if (!participanteId) { return alert("Por favor, selecione um participante."); }
    btnSalvarInscricao.disabled = true;
    try {
        const novoParticipante = { participanteId: participanteId, nome: participanteNome, inscritoEm: serverTimestamp() };
        if (turmaData.isEAE) { novoParticipante.grau = participanteGrauSelect.value; }
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

function abrirModalAula(aulaId = null, isExtra = false) {
    formAula.reset();
    inputAulaId.value = '';
    inputAulaIsExtra.value = isExtra;
    if (aulaId) {
        modalAulaTitulo.textContent = 'Editar Aula';
        const aulaRef = doc(db, "turmas", turmaId, "cronograma", aulaId);
        getDoc(aulaRef).then(docSnap => {
            if (docSnap.exists()) {
                const data = docSnap.data();
                inputAulaId.value = docSnap.id;
                inputAulaTitulo.value = data.titulo;
                inputAulaData.value = data.dataAgendada.toDate().toISOString().split('T')[0];
                inputAulaIsExtra.value = data.isExtra || false;
                if (!data.isExtra) {
                    formGroupNumeroAula.classList.remove('hidden');
                    inputAulaNumero.value = data.numeroDaAula;
                    inputAulaNumero.readOnly = true;
                } else {
                    formGroupNumeroAula.classList.add('hidden');
                }
            }
        });
    } else {
        modalAulaTitulo.textContent = 'Adicionar Aula Extra';
        formGroupNumeroAula.classList.add('hidden');
        inputAulaIsExtra.value = true;
    }
    modalAula.classList.add('visible');
}

async function salvarAula(event) {
    event.preventDefault();
    const id = inputAulaId.value;
    const isExtra = inputAulaIsExtra.value === 'true';
    const dadosAula = { titulo: inputAulaTitulo.value.trim(), dataAgendada: Timestamp.fromDate(new Date(`${inputAulaData.value}T12:00:00.000Z`)) };
    if (!isExtra) { dadosAula.numeroDaAula = Number(inputAulaNumero.value); } else { dadosAula.isExtra = true; dadosAula.numeroDaAula = 999; dadosAula.status = 'agendada'; }
    btnSalvarAula.disabled = true;
    try {
        const cronogramaRef = collection(db, "turmas", turmaId, "cronograma");
        if (id) {
            const aulaRef = doc(cronogramaRef, id);
            await updateDoc(aulaRef, dadosAula);
        } else {
            await addDoc(cronogramaRef, dadosAula);
        }
        modalAula.classList.remove('visible');
    } catch (error) {
        console.error("Erro ao salvar aula:", error);
    } finally {
        btnSalvarAula.disabled = false;
    }
}

async function deletarAula(aulaId) {
    if (!confirm("Tem certeza que deseja excluir esta aula extra?")) return;
    try {
        const aulaRef = doc(db, "turmas", turmaId, "cronograma", aulaId);
        await deleteDoc(aulaRef);
    } catch (error) {
        console.error("Erro ao deletar aula:", error);
        alert("Ocorreu um erro ao excluir a aula.");
    }
}

function abrirModalRecessos() {
    formRecesso.reset();
    escutarRecessos();
    modalRecessos.classList.add('visible');
}

function escutarRecessos() {
    const recessosRef = collection(db, "turmas", turmaId, "recessos");
    onSnapshot(recessosRef, (snapshot) => {
        recessoListContainer.innerHTML = '';
        if (snapshot.empty) {
            recessoListContainer.innerHTML = '<li>Nenhum recesso cadastrado.</li>';
            return;
        }
        snapshot.forEach(doc => {
            const recesso = doc.data();
            const inicio = recesso.dataInicio.toDate().toLocaleDateString('pt-BR', { timeZone: 'UTC' });
            const fim = recesso.dataFim.toDate().toLocaleDateString('pt-BR', { timeZone: 'UTC' });
            const li = document.createElement('li');
            li.innerHTML = `<span>De ${inicio} até ${fim}</span><button class="icon-btn delete" data-id="${doc.id}"><i class="fas fa-trash-alt"></i></button>`;
            recessoListContainer.appendChild(li);
        });
    });
}

async function salvarRecesso(event) {
    event.preventDefault();
    const dataInicio = inputRecessoInicio.value;
    const dataFim = inputRecessoFim.value;
    if (!dataInicio || !dataFim || dataFim < dataInicio) { return alert("Por favor, selecione uma data de início e fim válidas."); }
    try {
        const recessosRef = collection(db, "turmas", turmaId, "recessos");
        await addDoc(recessosRef, {
            dataInicio: Timestamp.fromDate(new Date(`${dataInicio}T12:00:00.000Z`)),
            dataFim: Timestamp.fromDate(new Date(`${dataFim}T12:00:00.000Z`))
        });
        formRecesso.reset();
    } catch (error) {
        console.error("Erro ao salvar recesso:", error);
        alert("Ocorreu um erro ao adicionar o período de recesso.");
    }
}

async function deletarRecesso(recessoId) {
    if (!confirm("Tem certeza que deseja remover este período de recesso? O cronograma será recalculado.")) return;
    try {
        const recessoRef = doc(db, "turmas", turmaId, "recessos", recessoId);
        await deleteDoc(recessoRef);
    } catch (error) {
        console.error("Erro ao deletar recesso:", error);
        alert("Ocorreu um erro ao remover o recesso.");
    }
}

tabs.forEach(tab => {
    tab.addEventListener('click', () => {
        tabs.forEach(item => item.classList.remove('active'));
        tab.classList.add('active');
        const targetTab = document.getElementById(tab.dataset.tab);
        tabContents.forEach(content => content.classList.remove('active'));
        targetTab.classList.add('active');
    });
});
if(btnInscreverParticipante) btnInscreverParticipante.addEventListener('click', abrirModalInscricao);
if(closeModalInscricaoBtn) closeModalInscricaoBtn.addEventListener('click', () => modalInscricao.classList.remove('visible'));
if(modalInscricao) modalInscricao.addEventListener('click', (event) => { if (event.target === modalInscricao) modalInscricao.classList.remove('visible'); });
if(formInscricao) formInscricao.addEventListener('submit', inscreverParticipante);

if(btnAddAulaExtra) btnAddAulaExtra.addEventListener('click', () => abrirModalAula(null, true));
if(closeModalAulaBtn) closeModalAulaBtn.addEventListener('click', () => modalAula.classList.remove('visible'));
if(modalAula) modalAula.addEventListener('click', (event) => { if (event.target === modalAula) modalAula.classList.remove('visible'); });
if(formAula) formAula.addEventListener('submit', salvarAula);

if(cronogramaTableBody) cronogramaTableBody.addEventListener('click', (event) => {
    const target = event.target.closest('button');
    if (!target || !target.dataset.action) return;
    const action = target.dataset.action;
    const id = target.dataset.id;
    if (action === 'edit') {
        abrirModalAula(id);
    } else if (action === 'delete') {
        deletarAula(id);
    }
});

if(btnGerenciarRecessos) btnGerenciarRecessos.addEventListener('click', abrirModalRecessos);
if(closeModalRecessosBtn) closeModalRecessosBtn.addEventListener('click', () => modalRecessos.classList.remove('visible'));
if(modalRecessos) modalRecessos.addEventListener('click', (event) => { if (event.target === modalRecessos) modalRecessos.classList.remove('visible'); });
if(formRecesso) formRecesso.addEventListener('submit', salvarRecesso);

if(recessoListContainer) recessoListContainer.addEventListener('click', (event) => {
    const target = event.target.closest('button.delete');
    if (target && target.dataset.id) {
        deletarRecesso(target.dataset.id);
    }
});