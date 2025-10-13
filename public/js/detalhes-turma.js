import { initializeApp } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-auth.js";
import { getFirestore, collection, query, where, getDocs, doc, getDoc, addDoc, onSnapshot, orderBy, limit, serverTimestamp, Timestamp, updateDoc, deleteDoc } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js";

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
const cronogramaTableBody = document.getElementById('cronograma-table-body');
const tabs = document.querySelectorAll('.tab-link');
const tabContents = document.querySelectorAll('.tab-content');
const btnAddAulaExtra = document.getElementById('btn-add-aula-extra');
const btnGerenciarRecessos = document.getElementById('btn-gerenciar-recessos');

// Modais e seus componentes...
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
const modalNotas = document.getElementById('modal-notas');
const closeModalNotasBtn = document.getElementById('close-modal-notas');
const formNotas = document.getElementById('form-notas');
const modalNotasTitulo = document.getElementById('modal-notas-titulo');
const inputNotasParticipanteId = document.getElementById('notas-participante-id');
const inputNotaCadernoTemas = document.getElementById('nota-caderno-temas');
const inputNotaCadernetaPessoal = document.getElementById('nota-caderneta-pessoal');
const inputNotaTrabalhos = document.getElementById('nota-trabalhos');
const inputNotaExameEspiritual = document.getElementById('nota-exame-espiritual');
const btnSalvarNotas = document.getElementById('btn-salvar-notas');

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
        escutarCronograma();
    } else {
        document.body.innerHTML = '<h1>Erro: Turma não encontrada.</h1>';
    }
}

function configurarTabelaParticipantes() {
    let tableHeaderHTML = '<tr><th>Nome</th>';
    if (turmaData.isEAE) {
        tableHeaderHTML += '<th>Grau</th><th>Freq.</th><th>Média RI</th><th>Média Final</th><th>Status</th><th>Ações</th>';
    } else {
        tableHeaderHTML += '<th>Freq.</th><th>Status</th><th>Ações</th>';
    }
    tableHeaderHTML += '</tr>';
    participantesTable.querySelector('thead').innerHTML = tableHeaderHTML;
}

function escutarParticipantes() {
    const participantesRef = collection(db, "turmas", turmaId, "participantes");
    const q = query(participantesRef, orderBy("nome"));
    onSnapshot(q, (snapshot) => {
        let rowsHTML = [];
        if (snapshot.empty) {
            const colspan = turmaData.isEAE ? 7 : 4;
            rowsHTML.push(`<tr><td colspan="${colspan}" style="text-align: center;">Nenhum participante inscrito.</td></tr>`);
        } else {
            snapshot.forEach(doc => {
                const participante = doc.data();
                let row = `<td>${participante.nome}</td>`;
                if (turmaData.isEAE) {
                    row += `
                        <td>${participante.grau || 'Aluno'}</td>
                        <td>${(participante.notaFrequencia || 0)}%</td>
                        <td>${(participante.mediaRI || 0).toFixed(1)}</td>
                        <td>${(participante.mediaFinal || 0).toFixed(1)}</td>
                        <td>${participante.statusAprovacao || 'Em Andamento'}</td>
                        <td class="actions">
                            <button class="icon-btn notes" title="Lançar Notas" data-action="notas" data-id="${doc.id}"><i class="fas fa-edit"></i></button>
                            <button class="icon-btn promote" title="Promover Grau" data-action="promover" data-id="${doc.id}"><i class="fas fa-user-graduate"></i></button>
                        </td>
                    `;
                } else {
                    row += `<td>--%</td><td>Ativo</td><td class="actions">...</td>`;
                }
                rowsHTML.push(`<tr>${row}</tr>`);
            });
        }
        participantesTableBody.innerHTML = rowsHTML.join('');
    });
}

function escutarCronograma() {
    const cronogramaRef = collection(db, "turmas", turmaId, "cronograma");
    const q = query(cronogramaRef, orderBy("dataAgendada", "asc"));
    onSnapshot(q, (snapshot) => {
        let rowsHTML = [];
        if (snapshot.empty) {
            rowsHTML.push('<tr><td colspan="5" style="text-align: center;">Cronograma ainda não gerado ou vazio.</td></tr>');
        } else {
            snapshot.forEach(doc => {
                const aula = doc.data();
                const dataFormatada = aula.dataAgendada.toDate().toLocaleDateString('pt-BR', { timeZone: 'UTC' });
                const numeroAulaDisplay = aula.isExtra ? '<strong>Extra</strong>' : aula.numeroDaAula;
                let actionsHTML = `<button class="icon-btn edit" title="Editar Aula" data-action="edit" data-id="${doc.id}"><i class="fas fa-pencil-alt"></i></button>`;
                if (aula.isExtra) {
                    actionsHTML += `<button class="icon-btn delete" title="Excluir Aula Extra" data-action="delete" data-id="${doc.id}"><i class="fas fa-trash-alt"></i></button>`;
                } else {
                    actionsHTML += `<button class="icon-btn recess" title="Marcar como Recesso" data-action="recess" data-id="${doc.id}"><i class="fas fa-coffee"></i></button>`;
                }
                rowsHTML.push(`<tr><td>${numeroAulaDisplay}</td><td>${dataFormatada}</td><td>${aula.titulo}</td><td>${aula.status}</td><td class="actions">${actionsHTML}</td></tr>`);
            });
        }
        cronogramaTableBody.innerHTML = rowsHTML.join('');
    });
}

async function carregarVoluntariosParaInscricao() {
    participanteSelect.innerHTML = '<option value="">Selecione...</option>';
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
    if (turmaData.isEAE) { formGroupGrau.classList.remove('hidden'); }
    else { formGroupGrau.classList.add('hidden'); }
    modalInscricao.classList.add('visible');
}

async function inscreverParticipante(event) {
    event.preventDefault();
    const participanteId = participanteSelect.value;
    const participanteNome = participanteSelect.options[participanteSelect.selectedIndex].text;
    if (!participanteId) { return alert("Por favor, selecione um participante."); }
    btnSalvarInscricao.disabled = true;
    try {
        const novoParticipante = { participanteId, nome: participanteNome, inscritoEm: serverTimestamp() };
        if (turmaData.isEAE) { novoParticipante.grau = participanteGrauSelect.value; }
        const participantesRef = collection(db, "turmas", turmaId, "participantes");
        await addDoc(participantesRef, novoParticipante);
        modalInscricao.classList.remove('visible');
    } catch (error) {
        console.error("Erro ao inscrever participante:", error);
    } finally {
        btnSalvarInscricao.disabled = false;
    }
}

async function abrirModalNotas(participanteId) {
    formNotas.reset();
    inputNotasParticipanteId.value = participanteId;
    const participanteRef = doc(db, "turmas", turmaId, "participantes", participanteId);
    const docSnap = await getDoc(participanteRef);
    if (docSnap.exists()) {
        const data = docSnap.data();
        modalNotasTitulo.textContent = `Lançar Notas para ${data.nome}`;
        inputNotaCadernoTemas.value = data.notaCadernoTemas || '';
        inputNotaCadernetaPessoal.value = data.notaCadernetaPessoal || '';
        inputNotaTrabalhos.value = data.notaTrabalhos || '';
        inputNotaExameEspiritual.value = data.notaExameEspiritual || '';
        modalNotas.classList.add('visible');
    }
}

async function salvarNotas(event) {
    event.preventDefault();
    const participanteId = inputNotasParticipanteId.value;
    if (!participanteId) return;

    const notaFrequencia = 100; // Placeholder
    const notaCadernoTemas = parseFloat(inputNotaCadernoTemas.value) || 0;
    const notaCadernetaPessoal = parseFloat(inputNotaCadernetaPessoal.value) || 0;
    const notaTrabalhos = parseFloat(inputNotaTrabalhos.value) || 0;
    const notaExameEspiritual = parseFloat(inputNotaExameEspiritual.value) || 0;

    const notaFreqConvertida = notaFrequencia >= 80 ? 10 : (notaFrequencia >= 60 ? 5 : 1);
    const mediaAT = (notaFreqConvertida + notaCadernoTemas) / 2;
    const mediaRI = (notaCadernetaPessoal + notaTrabalhos + notaExameEspiritual) / 3;
    const mediaFinal = (mediaAT + mediaRI) / 2;
    const statusAprovacao = (mediaFinal >= 5 && mediaRI >= 6) ? "Aprovado" : "Reprovado";

    const dadosAtualizados = {
        notaCadernoTemas, notaCadernetaPessoal, notaTrabalhos, notaExameEspiritual,
        notaFrequencia, mediaAT, mediaRI, mediaFinal, statusAprovacao
    };

    btnSalvarNotas.disabled = true;
    try {
        const participanteRef = doc(db, "turmas", turmaId, "participantes", participanteId);
        await updateDoc(participanteRef, dadosAtualizados);
        modalNotas.classList.remove('visible');
    } catch (error) {
        console.error("Erro ao salvar notas:", error);
    } finally {
        btnSalvarNotas.disabled = false;
    }
}

// --- EVENTOS ---
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

participantesTableBody.addEventListener('click', (event) => {
    const target = event.target.closest('button');
    if (!target || !target.dataset.action) return;
    const action = target.dataset.action;
    const id = target.dataset.id;
    if (action === 'notas') {
        abrirModalNotas(id);
    }
});

if(formNotas) formNotas.addEventListener('submit', salvarNotas);
if(closeModalNotasBtn) closeModalNotasBtn.addEventListener('click', () => modalNotas.classList.remove('visible'));
if(modalNotas) modalNotas.addEventListener('click', (event) => { if (event.target === modalNotas) modalNotas.classList.remove('visible'); });