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
const btnAvancarAno = document.getElementById('btn-avancar-ano');

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
    onSnapshot(turmaRef, (docSnap) => {
        if (docSnap.exists()) {
            turmaData = docSnap.data();
            turmaTituloHeader.innerHTML = `<small>Gerenciando a Turma:</small>${turmaData.nomeDaTurma} (${turmaData.anoAtual || 1}º Ano)`;
            if(turmaData.isEAE) { btnAvancarAno.classList.remove('hidden'); }
            configurarTabelaParticipantes();
            escutarParticipantes();
            escutarCronograma();
        } else {
            document.body.innerHTML = '<h1>Erro: Turma não encontrada.</h1>';
        }
    });
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

// ***** FUNÇÃO CORRIGIDA PARA LER A ESTRUTURA DE AVALIAÇÕES ANUAIS *****
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
                    const anoAtual = turmaData.anoAtual || 1;
                    const avaliacaoDoAno = participante.avaliacoes ? participante.avaliacoes[anoAtual] : null;

                    row += `
                        <td>${participante.grau || 'Aluno'}</td>
                        <td>${(avaliacaoDoAno ? avaliacaoDoAno.notaFrequencia : 0) || 0}%</td>
                        <td>${(avaliacaoDoAno ? avaliacaoDoAno.mediaRI : 0).toFixed(1)}</td>
                        <td>${(avaliacaoDoAno ? avaliacaoDoAno.mediaFinal : 0).toFixed(1)}</td>
                        <td>${(avaliacaoDoAno ? avaliacaoDoAno.statusAprovacao : 'Em Andamento')}</td>
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

// ***** FUNÇÃO CORRIGIDA PARA LER A ESTRUTURA DE AVALIAÇÕES ANUAIS *****
async function abrirModalNotas(participanteId) {
    formNotas.reset();
    inputNotasParticipanteId.value = participanteId;
    const participanteRef = doc(db, "turmas", turmaId, "participantes", participanteId);
    const docSnap = await getDoc(participanteRef);
    if (docSnap.exists()) {
        const data = docSnap.data();
        const anoAtual = turmaData.anoAtual || 1;
        modalNotasTitulo.textContent = `Lançar Notas do ${anoAtual}º Ano para ${data.nome}`;

        const avaliacaoDoAno = data.avaliacoes ? data.avaliacoes[anoAtual] : null;
        if(avaliacaoDoAno) {
            inputNotaCadernoTemas.value = avaliacaoDoAno.notaCadernoTemas || '';
            inputNotaCadernetaPessoal.value = avaliacaoDoAno.notaCadernetaPessoal || '';
            inputNotaTrabalhos.value = avaliacaoDoAno.notaTrabalhos || '';
            inputNotaExameEspiritual.value = avaliacaoDoAno.notaExameEspiritual || '';
        }
        modalNotas.classList.add('visible');
    }
}

async function salvarNotas(event) {
    event.preventDefault();
    const participanteId = inputNotasParticipanteId.value;
    if (!participanteId) return;

    const anoAtual = turmaData.anoAtual || 1;
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
        [`avaliacoes.${anoAtual}`]: {
            notaCadernoTemas, notaCadernetaPessoal, notaTrabalhos, notaExameEspiritual,
            notaFrequencia, mediaAT, mediaRI, mediaFinal, statusAprovacao
        }
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

async function avancarAnoDaTurma() {
    const anoAtual = turmaData.anoAtual || 1;
    if (anoAtual >= 3) {
        return alert("Esta turma já concluiu o 3º ano e não pode mais avançar.");
    }
    if (!confirm(`Tem certeza que deseja avançar esta turma para o ${anoAtual + 1}º ano? Esta ação não pode ser desfeita.`)) return;

    try {
        const turmaRef = doc(db, "turmas", turmaId);
        await updateDoc(turmaRef, { anoAtual: anoAtual + 1 });
        alert(`Turma avançou para o ${anoAtual + 1}º ano com sucesso! A página será recarregada para refletir as notas do novo ano.`);
    } catch (error) {
        console.error("Erro ao avançar o ano da turma:", error);
        alert("Ocorreu um erro ao tentar avançar o ano.");
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
    if (!isExtra) { dadosAula.numeroDaAula = Number(inputAulaNumero.value); } 
    else { dadosAula.isExtra = true; dadosAula.numeroDaAula = 999; dadosAula.status = 'agendada'; }
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
        let listItems = [];
        if (snapshot.empty) {
            listItems.push('<li>Nenhum recesso cadastrado.</li>');
        } else {
            snapshot.forEach(doc => {
                const recesso = doc.data();
                const inicio = recesso.dataInicio.toDate().toLocaleDateString('pt-BR', { timeZone: 'UTC' });
                const fim = recesso.dataFim.toDate().toLocaleDateString('pt-BR', { timeZone: 'UTC' });
                listItems.push(`<li><span>De ${inicio} até ${fim}</span><button class="icon-btn delete" data-id="${doc.id}"><i class="fas fa-trash-alt"></i></button></li>`);
            });
        }
        recessoListContainer.innerHTML = listItems.join('');
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
    }
}

async function deletarRecesso(recessoId) {
    if (!confirm("Tem certeza que deseja remover este período de recesso? O cronograma será recalculado.")) return;
    try {
        const recessoRef = doc(db, "turmas", turmaId, "recessos", recessoId);
        await deleteDoc(recessoRef);
    } catch (error) {
        console.error("Erro ao deletar recesso:", error);
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

if(btnAddAulaExtra) btnAddAulaExtra.addEventListener('click', () => abrirModalAula(null, true));
if(closeModalAulaBtn) closeModalAulaBtn.addEventListener('click', () => modalAula.classList.remove('visible'));
if(modalAula) modalAula.addEventListener('click', (event) => { if (event.target === modalAula) modalAula.classList.remove('visible'); });
if(formAula) formAula.addEventListener('submit', salvarAula);

if(cronogramaTableBody) cronogramaTableBody.addEventListener('click', (event) => {
    const target = event.target.closest('button');
    if (!target || !target.dataset.action) return;
    const action = target.dataset.action;
    const id = target.dataset.id;
    if (action === 'edit') { abrirModalAula(id); } 
    else if (action === 'delete') { deletarAula(id); }
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

if(btnAvancarAno) btnAvancarAno.addEventListener('click', avancarAnoDaTurma);