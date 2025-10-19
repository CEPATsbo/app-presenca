import { initializeApp } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-auth.js";
import { getFirestore, collection, query, where, getDocs, doc, getDoc, addDoc, onSnapshot, orderBy, limit, serverTimestamp, Timestamp, updateDoc, deleteDoc, writeBatch } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js";
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-functions.js";

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
// ## MUDANÇA 2: Inicializando o serviço de Functions para a região correta ##
const functions = getFunctions(app, 'southamerica-east1');

// --- ELEMENTOS DA PÁGINA ---
// (Todo o seu código de elementos permanece o mesmo)
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
const reportMenuContainer = document.getElementById('report-menu-container');
const areaRelatorioGerado = document.getElementById('area-relatorio-gerado');
const btnImprimirRelatorio = document.getElementById('btn-imprimir-relatorio');
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
const modalFrequencia = document.getElementById('modal-frequencia');
const closeModalFrequenciaBtn = document.getElementById('close-modal-frequencia');
const modalFrequenciaTitulo = document.getElementById('modal-frequencia-titulo');
const frequenciaListContainer = document.getElementById('frequencia-list-container');
const btnSalvarFrequencia = document.getElementById('btn-salvar-frequencia');
const btnCadastrarAluno = document.getElementById('btn-cadastrar-aluno');
const modalNovoAluno = document.getElementById('modal-novo-aluno');
const closeModalNovoAlunoBtn = document.getElementById('close-modal-novo-aluno');
const formNovoAluno = document.getElementById('form-novo-aluno');
const btnSalvarNovoAluno = document.getElementById('btn-salvar-novo-aluno');

let turmaId = null;
let turmaData = null;
let currentAulaIdParaFrequencia = null;

// --- O RESTO DO SEU CÓDIGO PERMANECE IGUAL ---
onAuthStateChanged(auth, async (user) => {
    if (user) {
        const voluntariosRef = collection(db, "voluntarios");
        const q = query(voluntariosRef, where("authUid", "==", user.uid), limit(1));
        const querySnapshot = await getDocs(q);
        if (!querySnapshot.empty) {
            const userProfile = querySnapshot.docs[0].data();
            const userRole = userProfile.role;
            if (userRole === 'super-admin' || userRole === 'diretor' || userRole === 'facilitador') { // Adicionado facilitador para teste
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
        tableHeaderHTML += '<th>Grau</th><th>Origem</th><th>Freq.</th><th>Média RI</th><th>Média Final</th><th>Status</th><th>Ações</th>';
    } else {
        tableHeaderHTML += '<th>Origem</th><th>Freq.</th><th>Status</th><th>Ações</th>';
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
            const colspan = turmaData.isEAE ? 8 : 5;
            rowsHTML.push(`<tr><td colspan="${colspan}" style="text-align: center;">Nenhum participante inscrito.</td></tr>`);
        } else {
            snapshot.forEach(doc => {
                const participante = doc.data();
                const origem = participante.origem === 'aluno' ? 'Aluno' : 'Voluntário';
                let row = `<td>${participante.nome}</td>`;
                if (turmaData.isEAE) {
                    const anoAtual = turmaData.anoAtual || 1;
                    const avaliacaoDoAno = participante.avaliacoes ? participante.avaliacoes[anoAtual] : null;

                    // ## MUDANÇA 1: Adicionando o novo botão de promoção ##
                    let acoesExtras = '';
                    if (participante.origem === 'aluno') {
                        acoesExtras += `<button class="icon-btn" style="color: #27ae60;" title="Promover para Voluntário" data-action="promote-to-volunteer" data-participante-doc-id="${doc.id}"><i class="fas fa-user-plus"></i></button>`;
                    }

                    row += `
                        <td>${participante.grau || 'Aluno'}</td>
                        <td>${origem}</td>
                        <td>${(avaliacaoDoAno ? avaliacaoDoAno.notaFrequencia : 0) || 0}%</td>
                        <td>${(avaliacaoDoAno ? avaliacaoDoAno.mediaRI : 0).toFixed(1)}</td>
                        <td>${(avaliacaoDoAno ? avaliacaoDoAno.mediaFinal : 0).toFixed(1)}</td>
                        <td>${(avaliacaoDoAno ? avaliacaoDoAno.statusAprovacao : 'Em Andamento')}</td>
                        <td class="actions">
                            ${acoesExtras}
                            <button class="icon-btn notes" title="Lançar Notas" data-action="notas" data-id="${doc.id}"><i class="fas fa-edit"></i></button>
                            <button class="icon-btn promote" title="Promover Grau" data-action="promover" data-id="${doc.id}"><i class="fas fa-user-graduate"></i></button>
                        </td>
                    `;
                } else {
                    row += `<td>${origem}</td><td>--%</td><td>Ativo</td><td class="actions">...</td>`;
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
                let actionsHTML = `<button class="icon-btn attendance" title="Lançar Frequência" data-action="frequencia" data-id="${doc.id}" data-titulo="${aula.titulo}"><i class="fas fa-clipboard-list"></i></button> <button class="icon-btn edit" title="Editar Aula" data-action="edit" data-id="${doc.id}"><i class="fas fa-pencil-alt"></i></button>`;
                if (aula.isExtra) {
                    actionsHTML += `<button class="icon-btn delete" title="Excluir Aula Extra" data-action="delete" data-id="${doc.id}"><i class="fas fa-trash-alt"></i></button>`;
                } else {
                    actionsHTML += `<button class="icon-btn recess" title="Marcar como Recesso" data-action="recess" data-id="${doc.id}" data-date="${aula.dataAgendada.toDate().toISOString()}" data-titulo="${aula.titulo}"><i class="fas fa-coffee"></i></button>`;
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
        const novoParticipante = { 
            participanteId, 
            nome: participanteNome, 
            inscritoEm: serverTimestamp(),
            origem: 'voluntario' 
        };
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

function abrirModalNovoAluno() {
    formNovoAluno.reset();
    modalNovoAluno.classList.add('visible');
}

// ## MUDANÇA 3: A função 'salvarNovoAluno' continua a mesma, mas agora as ferramentas (functions) existem ##
async function salvarNovoAluno(event) {
    event.preventDefault();
    const nome = document.getElementById('novo-aluno-nome').value.trim();
    const endereco = document.getElementById('novo-aluno-endereco').value.trim();
    const telefone = document.getElementById('novo-aluno-telefone').value.trim();
    const nascimento = document.getElementById('novo-aluno-nascimento').value.trim();

    if (!nome) {
        return alert("O nome completo do aluno é obrigatório.");
    }
    
    btnSalvarNovoAluno.disabled = true;
    btnSalvarNovoAluno.textContent = 'Salvando...';

    try {
        const matricularNovoAluno = httpsCallable(functions, 'matricularNovoAluno');
        const result = await matricularNovoAluno({
            turmaId: turmaId,
            nome: nome,
            endereco: endereco,
            telefone: telefone,
            nascimento: nascimento
        });

        alert(result.data.message);
        modalNovoAluno.classList.remove('visible');

    } catch (error) {
        console.error("Erro ao chamar a função de cadastrar novo aluno:", error);
        alert(`Erro: ${error.message}`);
    } finally {
        btnSalvarNovoAluno.disabled = false;
        btnSalvarNovoAluno.textContent = 'Salvar e Inscrever na Turma';
    }
}

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
        if (avaliacaoDoAno) {
            inputNotaCadernoTemas.value = avaliacaoDoAno.notaCadernoTemas || '';
            inputNotaCadernetaPessoal.value = avaliacaoDoAno.notaCadernetaPessoal || '';
            inputNotaTrabalhos.value = avaliacaoDoAno.notaTrabalhos || '';
            inputNotaExameEspiritual.value = avaliacaoDoAno.notaExameEspiritual || '';
        }
        modalNotas.classList.add('visible');
    }
}

// ===================================================================
// ## CORREÇÃO CRÍTICA AQUI ##
// A função 'salvarNotas' foi reescrita para ler a frequência correta
// antes de recalcular e salvar, evitando o bug do "100%".
// ===================================================================
async function salvarNotas(event) {
    event.preventDefault();
    const participanteId = inputNotasParticipanteId.value;
    if (!participanteId) return;

    btnSalvarNotas.disabled = true;

    try {
        const participanteRef = doc(db, "turmas", turmaId, "participantes", participanteId);
        const participanteSnap = await getDoc(participanteRef);

        if (!participanteSnap.exists()) {
            throw new Error("Participante não encontrado.");
        }

        const participanteData = participanteSnap.data();
        const anoAtual = turmaData.anoAtual || 1;
        
        // 1. Pega a frequência REAL que já está salva no banco de dados
        const avaliacoesAtuais = participanteData.avaliacoes || {};
        const avaliacaoDoAnoAtual = avaliacoesAtuais[anoAtual] || {};
        const notaFrequencia = avaliacaoDoAnoAtual.notaFrequencia || 0; // Usa a frequência real, ou 0 se não existir

        // 2. Pega as notas digitadas no formulário
        const notaCadernoTemas = parseFloat(inputNotaCadernoTemas.value) || 0;
        const notaCadernetaPessoal = parseFloat(inputNotaCadernetaPessoal.value) || 0;
        const notaTrabalhos = parseFloat(inputNotaTrabalhos.value) || 0;
        const notaExameEspiritual = parseFloat(inputNotaExameEspiritual.value) || 0;

        // 3. Recalcula as médias usando a frequência REAL
        const notaFreqConvertida = notaFrequencia >= 80 ? 10 : (notaFrequencia >= 60 ? 5 : 1);
        const mediaAT = (notaFreqConvertida + notaCadernoTemas) / 2;
        const mediaRI = (notaCadernetaPessoal + notaTrabalhos + notaExameEspiritual) / 3;
        const mediaFinal = (mediaAT + mediaRI) / 2;
        const statusAprovacao = (mediaFinal >= 5 && mediaRI >= 6) ? "Aprovado" : "Reprovado";
        
        // 4. Prepara os dados para salvar, mantendo a frequência real
        const dadosAtualizados = {
            ...avaliacaoDoAnoAtual, // Mantém outros dados que possam existir (como as notas dos outros anos)
            notaCadernoTemas,
            notaCadernetaPessoal,
            notaTrabalhos,
            notaExameEspiritual,
            notaFrequencia, // A frequência real lida no passo 1
            mediaAT,
            mediaRI,
            mediaFinal,
            statusAprovacao
        };

        await updateDoc(participanteRef, {
            [`avaliacoes.${anoAtual}`]: dadosAtualizados
        });
        
        modalNotas.classList.remove('visible');
    } catch (error) {
        console.error("Erro ao salvar notas:", error);
        alert("Ocorreu um erro ao salvar as notas.");
    } finally {
        btnSalvarNotas.disabled = false;
    }
}

async function promoverGrau(participanteId) {
    const participanteRef = doc(db, "turmas", turmaId, "participantes", participanteId);
    const docSnap = await getDoc(participanteRef);
    if (docSnap.exists()) {
        const participante = docSnap.data();
        const grauAtual = participante.grau || "Aluno";
        let proximoGrau = "";
        if (grauAtual === "Aluno") { proximoGrau = "Aprendiz"; } 
        else if (grauAtual === "Aprendiz") { proximoGrau = "Servidor"; } 
        else { alert(`${participante.nome} já está no grau máximo (Servidor).`); return; }
        if (confirm(`Tem certeza que deseja promover ${participante.nome} para o grau de ${proximoGrau}?`)) {
            try {
                await updateDoc(participanteRef, { grau: proximoGrau });
                alert("Participante promovido com sucesso!");
            } catch (error) {
                console.error("Erro ao promover grau:", error);
                alert("Ocorreu um erro ao tentar promover o participante.");
            }
        }
    }
}

async function avancarAnoDaTurma() {
    const anoAtual = turmaData.anoAtual || 1;
    if (anoAtual >= 3) { return alert("Esta turma já concluiu o 3º ano."); }
    if (!confirm(`Tem certeza que deseja avançar esta turma para o ${anoAtual + 1}º ano?`)) return;
    try {
        const turmaRef = doc(db, "turmas", turmaId);
        await updateDoc(turmaRef, { anoAtual: anoAtual + 1 });
        alert(`Turma avançou para o ${anoAtual + 1}º ano com sucesso!`);
    } catch (error) {
        console.error("Erro ao avançar o ano da turma:", error);
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

async function marcarRecessoDeAulaUnica(aulaDataISO, aulaTitulo) {
    const dataObj = new Date(aulaDataISO);
    const dataFormatada = dataObj.toLocaleDateString('pt-BR', { timeZone: 'UTC' });
    const confirmacao = confirm(`Tem certeza que deseja marcar o dia ${dataFormatada} como um recesso?\n\nA aula "${aulaTitulo}" e todas as aulas seguintes serão reagendadas automaticamente.`);
    if (confirmacao) {
        try {
            const recessosRef = collection(db, "turmas", turmaId, "recessos");
            await addDoc(recessosRef, {
                dataInicio: Timestamp.fromDate(dataObj),
                dataFim: Timestamp.fromDate(dataObj)
            });
            alert("Recesso de um dia adicionado com sucesso! O cronograma será reajustado.");
        } catch (error) {
            console.error("Erro ao marcar recesso de aula única:", error);
            alert("Ocorreu um erro ao tentar marcar o recesso.");
        }
    }
}

// --- FUNÇÕES DE FREQUÊNCIA (COM CORREÇÃO) ---
async function abrirModalFrequencia(aulaId, aulaTitulo) {
    currentAulaIdParaFrequencia = aulaId;
    modalFrequenciaTitulo.textContent = `Frequência da Aula: ${aulaTitulo}`;
    frequenciaListContainer.innerHTML = '<li>Carregando lista de chamada...</li>';
    modalFrequencia.classList.add('visible');

    try {
        const participantesRef = collection(db, "turmas", turmaId, "participantes");
        const qParticipantes = query(participantesRef, orderBy("nome"));
        const participantesSnapshot = await getDocs(qParticipantes);

        const frequenciaRef = collection(db, "turmas", turmaId, "frequencias");
        const qFrequencia = query(frequenciaRef, where("aulaId", "==", aulaId));
        const frequenciaSnapshot = await getDocs(qFrequencia);
        
        const frequenciasSalvas = {};
        frequenciaSnapshot.forEach(doc => {
            frequenciasSalvas[doc.data().participanteId] = doc.data().status;
        });

        let listHTML = '';
        participantesSnapshot.forEach(doc => {
            const participante = doc.data();
            const participanteId = doc.id;
            const statusAtual = frequenciasSalvas[participanteId] || 'presente';
            listHTML += `
                <li class="attendance-item" data-participante-id="${participanteId}" data-status="${statusAtual}">
                    <span>${participante.nome}</span>
                    <div class="attendance-controls">
                        <button class="btn-status presente ${statusAtual === 'presente' ? 'active' : ''}" data-status="presente">P</button>
                        <button class="btn-status ausente ${statusAtual === 'ausente' ? 'active' : ''}" data-status="ausente">F</button>
                        <button class="btn-status justificado ${statusAtual === 'justificado' ? 'active' : ''}" data-status="justificado">J</button>
                    </div>
                </li>
            `;
        });
        frequenciaListContainer.innerHTML = listHTML || '<li>Nenhum participante inscrito nesta turma.</li>';

    } catch(error) {
        console.error("Erro ao carregar lista de chamada:", error);
    }
}

async function salvarFrequencia() {
    if (!currentAulaIdParaFrequencia) return;
    btnSalvarFrequencia.disabled = true;
    
    const batch = writeBatch(db);
    const items = frequenciaListContainer.querySelectorAll('.attendance-item');

    items.forEach(item => {
        const participanteId = item.dataset.participanteId;
        const status = item.dataset.status;
        const frequenciaDocId = `${currentAulaIdParaFrequencia}_${participanteId}`;
        const frequenciaRef = doc(db, "turmas", turmaId, "frequencias", frequenciaDocId);
        batch.set(frequenciaRef, {
            aulaId: currentAulaIdParaFrequencia,
            participanteId: participanteId,
            status: status,
            turmaId: turmaId
        });
    });
    
    const aulaRef = doc(db, "turmas", turmaId, "cronograma", currentAulaIdParaFrequencia);
    batch.update(aulaRef, { status: 'realizada' });

    try {
        await batch.commit();
        alert("Frequência salva com sucesso!");
        modalFrequencia.classList.remove('visible');
    } catch (error) {
        console.error("Erro ao salvar frequência:", error);
    } finally {
        btnSalvarFrequencia.disabled = false;
    }
}

// --- NOVAS FUNÇÕES DE RELATÓRIO ---
async function getDadosCompletosParaRelatorio() {
    const participantesRef = collection(db, "turmas", turmaId, "participantes");
    const cronogramaRef = collection(db, "turmas", turmaId, "cronograma");
    const frequenciasRef = collection(db, "turmas", turmaId, "frequencias");

    const [participantesSnap, cronogramaSnap, frequenciasSnap] = await Promise.all([
        getDocs(query(participantesRef, orderBy("nome"))),
        getDocs(query(cronogramaRef, orderBy("dataAgendada"))),
        getDocs(frequenciasRef)
    ]);

    const participantes = participantesSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    const cronograma = cronogramaSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    const frequenciasMap = new Map();
    frequenciasSnap.forEach(doc => {
        const data = doc.data();
        const key = `${data.aulaId}_${data.participanteId}`;
        frequenciasMap.set(key, data.status);
    });

    return { participantes, cronograma, frequenciasMap };
}

async function gerarDiarioDeClasse() {
    areaRelatorioGerado.innerHTML = '<p>Gerando diário de classe...</p>';
    btnImprimirRelatorio.classList.add('hidden');

    const { participantes, cronograma, frequenciasMap } = await getDadosCompletosParaRelatorio();

    if (participantes.length === 0 || cronograma.length === 0) {
        areaRelatorioGerado.innerHTML = '<p>Não há participantes ou aulas suficientes para gerar o diário.</p>';
        return;
    }

    let tableHTML = '<div class="table-container"><table id="report-table"><thead><tr><th>Aluno</th>';
    cronograma.forEach(aula => {
        const dataFormatada = aula.dataAgendada.toDate().toLocaleDateString('pt-BR', { month: '2-digit', day: '2-digit' });
        tableHTML += `<th>${dataFormatada}</th>`;
    });
    tableHTML += '<th>Freq.%</th></tr></thead><tbody>';

    participantes.forEach(p => {
        tableHTML += `<tr><td>${p.nome}</td>`;
        let presencas = 0;
        let aulasContabilizadas = 0;
        cronograma.forEach(aula => {
            if (aula.status === 'realizada') {
                aulasContabilizadas++;
                const key = `${aula.id}_${p.id}`;
                const status = frequenciasMap.get(key);
                let statusChar = '-';
                if (status === 'presente') {
                    statusChar = 'P';
                    presencas++;
                } else if (status === 'ausente') {
                    statusChar = 'F';
                } else if (status === 'justificado') {
                    statusChar = 'J';
                }
                tableHTML += `<td>${statusChar}</td>`;
            } else {
                tableHTML += `<td>-</td>`;
            }
        });
        const freqPercent = aulasContabilizadas > 0 ? ((presencas / aulasContabilizadas) * 100).toFixed(0) : 0;
        tableHTML += `<td>${freqPercent}%</td></tr>`;
    });

    tableHTML += '</tbody></table></div>';
    areaRelatorioGerado.innerHTML = tableHTML;
    btnImprimirRelatorio.classList.remove('hidden');
}

async function gerarBoletimIndividual() {
    areaRelatorioGerado.innerHTML = '<p>Carregando lista de participantes...</p>';
    btnImprimirRelatorio.classList.add('hidden');
    const { participantes } = await getDadosCompletosParaRelatorio();

    if (participantes.length === 0) {
        areaRelatorioGerado.innerHTML = '<p>Nenhum participante inscrito para gerar boletim.</p>';
        return;
    }

    let selectHTML = '<div class="form-group"><label>Selecione um participante para ver o boletim:</label><select id="select-boletim-participante"><option value="">Selecione...</option>';
    participantes.forEach(p => {
        selectHTML += `<option value="${p.id}">${p.nome}</option>`;
    });
    selectHTML += '</select></div><div id="boletim-content"></div>';
    areaRelatorioGerado.innerHTML = selectHTML;

    document.getElementById('select-boletim-participante').addEventListener('change', (e) => {
        const participanteId = e.target.value;
        const boletimContent = document.getElementById('boletim-content');
        if (!participanteId) {
            boletimContent.innerHTML = '';
            btnImprimirRelatorio.classList.add('hidden');
            return;
        }

        const participante = participantes.find(p => p.id === participanteId);
        const anoAtual = turmaData.anoAtual || 1;
        const avaliacao = participante.avaliacoes ? participante.avaliacoes[anoAtual] : null;

        let boletimHTML = `<div class="boletim-card"><h4>Boletim de ${participante.nome}</h4>`;
        if (turmaData.isEAE && avaliacao) {
            boletimHTML += `
                <p><strong>Frequência:</strong> ${avaliacao.notaFrequencia || 0}%</p>
                <p><strong>Média Reforma Íntima (RI):</strong> ${avaliacao.mediaRI.toFixed(1)}</p>
                <p><strong>Média Final:</strong> ${avaliacao.mediaFinal.toFixed(1)}</p>
                <p><strong>Status:</strong> ${avaliacao.statusAprovacao}</p>
                <hr>
                <h5>Notas Detalhadas (${anoAtual}º Ano):</h5>
                <ul>
                    <li>Caderno de Temas: ${avaliacao.notaCadernoTemas || '-'}</li>
                    <li>Caderneta Pessoal: ${avaliacao.notaCadernetaPessoal || '-'}</li>
                    <li>Trabalhos Prestados: ${avaliacao.notaTrabalhos || '-'}</li>
                    <li>Exame Espiritual: ${avaliacao.notaExameEspiritual || '-'}</li>
                </ul>
            `;
        } else {
             boletimHTML += `<p><strong>Frequência:</strong> ${participante.frequenciaPercentual || 'N/D'}%</p><p>Não há notas para este curso.</p>`;
        }
        boletimHTML += '</div>';
        boletimContent.innerHTML = boletimHTML;
        btnImprimirRelatorio.classList.remove('hidden');
    });
}

async function gerarRelatorioAptosCertificado() {
    areaRelatorioGerado.innerHTML = '<p>Gerando relatório final...</p>';
    btnImprimirRelatorio.classList.add('hidden');
    const { participantes } = await getDadosCompletosParaRelatorio();

    if (participantes.length === 0) {
        areaRelatorioGerado.innerHTML = '<p>Nenhum participante na turma.</p>';
        return;
    }

    let tableHTML = '<div class="table-container"><table id="report-table"><thead><tr><th>Aluno</th><th>Status Final</th></tr></thead><tbody>';
    const anoAtual = turmaData.anoAtual || 1;

    participantes.forEach(p => {
        let statusFinal = 'Em Andamento';
        if (turmaData.isEAE) {
            const avaliacao = p.avaliacoes ? p.avaliacoes[anoAtual] : null;
            statusFinal = avaliacao ? avaliacao.statusAprovacao : 'Pendente';
        } else {
            const freq = p.frequenciaPercentual || 0;
            statusFinal = freq >= 75 ? 'Aprovado' : 'Reprovado por Frequência';
        }
        tableHTML += `<tr><td>${p.nome}</td><td>${statusFinal}</td></tr>`;
    });

    tableHTML += '</tbody></table></div>';
    areaRelatorioGerado.innerHTML = tableHTML;
    btnImprimirRelatorio.classList.remove('hidden');
}

// ## MUDANÇA 2: Nova função para chamar o Robô de Promoção ##
async function promoverParaVoluntario(participanteDocId) {
    if (!confirm("Tem certeza que deseja promover este aluno para a lista de voluntários? Esta ação criará um novo registro de voluntário com os dados do aluno.")) {
        return;
    }

    try {
        const promoverAluno = httpsCallable(functions, 'promoverAlunoParaVoluntario');
        const result = await promoverAluno({
            turmaId: turmaId,
            participanteDocId: participanteDocId
        });
        alert(result.data.message);
        // A tabela irá se atualizar automaticamente graças ao onSnapshot.
    } catch (error) {
        console.error("Erro ao promover aluno para voluntário:", error);
        alert(`Erro: ${error.message}`);
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
        areaRelatorioGerado.innerHTML = '';
        btnImprimirRelatorio.classList.add('hidden');
    });
});
if(btnInscreverParticipante) btnInscreverParticipante.addEventListener('click', abrirModalInscricao);
if(closeModalInscricaoBtn) closeModalInscricaoBtn.addEventListener('click', () => modalInscricao.classList.remove('visible'));
if(modalInscricao) modalInscricao.addEventListener('click', (event) => { if (event.target === modalInscricao) modalInscricao.classList.remove('visible'); });
if(formInscricao) formInscricao.addEventListener('submit', inscreverParticipante);

if(btnCadastrarAluno) btnCadastrarAluno.addEventListener('click', abrirModalNovoAluno);
if(closeModalNovoAlunoBtn) closeModalNovoAlunoBtn.addEventListener('click', () => modalNovoAluno.classList.remove('visible'));
if(modalNovoAluno) modalNovoAluno.addEventListener('click', (event) => { if (event.target === modalNovoAluno) modalNovoAluno.classList.remove('visible'); });
if(formNovoAluno) formNovoAluno.addEventListener('submit', salvarNovoAluno);

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
    else if (action === 'frequencia') {
        const titulo = target.dataset.titulo;
        abrirModalFrequencia(id, titulo);
    }
    else if (action === 'recess') {
        const date = target.dataset.date;
        const titulo = target.dataset.titulo;
        marcarRecessoDeAulaUnica(date, titulo);
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

participantesTableBody.addEventListener('click', (event) => {
    const target = event.target.closest('button');
    if (!target || !target.dataset.action) return;
    const action = target.dataset.action;
    const id = target.dataset.id;
    
    if (action === 'notas') {
        abrirModalNotas(id);
    } else if (action === 'promover') {
        promoverGrau(id);
    } 
    // ## MUDANÇA 3: Adicionando o gatilho para o novo botão ##
    else if (action === 'promote-to-volunteer') {
        const participanteDocId = target.dataset.participanteDocId;
        promoverParaVoluntario(participanteDocId);
    }
});

if(formNotas) formNotas.addEventListener('submit', salvarNotas);
if(closeModalNotasBtn) closeModalNotasBtn.addEventListener('click', () => modalNotas.classList.remove('visible'));
if(modalNotas) modalNotas.addEventListener('click', (event) => { if (event.target === modalNotas) modalNotas.classList.remove('visible'); });

if(btnAvancarAno) btnAvancarAno.addEventListener('click', avancarAnoDaTurma);

frequenciaListContainer.addEventListener('click', (event) => {
    if (event.target.classList.contains('btn-status')) {
        const targetBtn = event.target;
        const parentItem = targetBtn.closest('.attendance-item');
        const status = targetBtn.dataset.status;
        parentItem.dataset.status = status;
        parentItem.querySelectorAll('.btn-status').forEach(btn => btn.classList.remove('active'));
        targetBtn.classList.add('active');
    }
});
if(btnSalvarFrequencia) btnSalvarFrequencia.addEventListener('click', salvarFrequencia);
if(closeModalFrequenciaBtn) closeModalFrequenciaBtn.addEventListener('click', () => modalFrequencia.classList.remove('visible'));
if(modalFrequencia) modalFrequencia.addEventListener('click', (event) => { if(event.target === modalFrequencia) modalFrequencia.classList.remove('visible'); });

if(reportMenuContainer) reportMenuContainer.addEventListener('click', (event) => {
    event.preventDefault();
    const target = event.target.closest('a');
    if (!target || !target.dataset.report) return;

    const reportType = target.dataset.report;
    if (reportType === 'diario-classe') {
        gerarDiarioDeClasse();
    } else if (reportType === 'boletim-individual') {
        gerarBoletimIndividual();
    } else if (reportType === 'aptos-certificado') {
        gerarRelatorioAptosCertificado();
    }
});

if(btnImprimirRelatorio) btnImprimirRelatorio.addEventListener('click', () => {
    window.print();
});