import { initializeApp } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-auth.js";
import { getFirestore, collection, query, where, getDocs, doc, getDoc, addDoc, onSnapshot, orderBy, limit, serverTimestamp, Timestamp, updateDoc, deleteDoc, writeBatch } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js";
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-functions.js";

// --- CONFIGURAÇÕE ---
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
const functions = getFunctions(app, 'southamerica-east1');

// --- ELEMENTOS DA PÁGINA ---
// (Todos os seus 'getElementById' aqui, sem alterações)
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
const btnGerarCertificados = document.getElementById('btn-gerar-certificados');
const certAlunoNome = document.getElementById('cert-aluno-nome');
const certCursoNome = document.getElementById('cert-curso-nome');
const certPeriodo = document.getElementById('cert-periodo');
const certDataEmissao = document.getElementById('cert-data-emissao');
const certAssinaturaDirigenteImg = document.getElementById('cert-assinatura-dirigente');
const certNomeDirigente = document.getElementById('cert-nome-dirigente');
const certAssinaturaPresidenteImg = document.getElementById('cert-assinatura-presidente');
const certNomePresidente = document.getElementById('cert-nome-presidente');

let turmaId = null;
let turmaData = null; // Guarda os dados da turma carregada
let currentAulaIdParaFrequencia = null;
let currentUser = null; // Guarda o objeto 'user' do Auth
let currentUserProfile = null; // Guarda os dados do Firestore ('voluntarios')
let currentUserClaims = null; // Guarda os claims (cargos)
let userIsAdminGlobal = false; // Flag para admin global
let userIsAdminEducacional = false; // Flag para dirigente/secretário
let userIsFacilitatorDaTurma = false; // Flag para facilitador desta turma

// ### AJUSTE: Refatoração da verificação de permissão ###
onAuthStateChanged(auth, async (user) => {
    if (user) {
        currentUser = user; // Guarda o usuário autenticado
        try {
            // 1. Pega o perfil do voluntário no Firestore
            const voluntariosRef = collection(db, "voluntarios");
            const q = query(voluntariosRef, where("authUid", "==", user.uid), limit(1));
            const querySnapshot = await getDocs(q);

            if (querySnapshot.empty) {
                console.warn("Usuário autenticado não encontrado na coleção 'voluntarios'.");
                throw new Error("Perfil de voluntário não encontrado.");
            }
            currentUserProfile = { id: querySnapshot.docs[0].id, ...querySnapshot.docs[0].data() }; // Guarda ID e dados

            // 2. Pega os claims (cargos)
            const idTokenResult = await user.getIdTokenResult(true);
            currentUserClaims = idTokenResult.claims || {};

            // 3. Define as flags de permissão globais
            userIsAdminGlobal = ['super-admin', 'diretor', 'tesoureiro'].some(role => currentUserClaims[role] === true || currentUserClaims.role === role);
            userIsAdminEducacional = currentUserClaims['dirigente-escola'] === true || currentUserClaims['secretario-escola'] === true;

            // 4. Pega o ID da turma da URL
            const params = new URLSearchParams(window.location.search);
            turmaId = params.get('turmaId');
            if (!turmaId) {
                throw new Error("ID da turma não encontrado na URL.");
            }

            // 5. Carrega os dados da turma E verifica a permissão específica para esta turma
            await carregarDadosDaTurmaEVerificarPermissao();

        } catch (error) {
            console.error("Erro na verificação de acesso:", error);
            document.body.innerHTML = `<h1>Erro</h1><p>${error.message}</p>`;
        }

    } else {
        window.location.href = '/index.html';
    }
});

// ### AJUSTE: Nova função para carregar turma e checar permissão ###
async function carregarDadosDaTurmaEVerificarPermissao() {
    const turmaRef = doc(db, "turmas", turmaId);
    const docSnap = await getDoc(turmaRef); // Usa getDoc para carregar uma vez antes de decidir

    if (!docSnap.exists()) {
        throw new Error("Turma não encontrada.");
    }

    turmaData = docSnap.data(); // Guarda os dados da turma

    // Verifica se o usuário é facilitador DESTA turma
    userIsFacilitatorDaTurma = (turmaData.facilitadoresIds || []).includes(currentUserProfile.id);

    // Verifica a permissão de ACESSO à página
    const podeAcessarPagina = userIsAdminGlobal || // Admins globais podem ver tudo
                             (userIsFacilitatorDaTurma && (userIsAdminEducacional || currentUserProfile.role === 'facilitador')); // Ou: É facilitador E tem cargo educacional

    if (!podeAcessarPagina) {
        throw new Error("Você não tem permissão para gerenciar esta turma específica.");
    }

    // Se passou, configura a página e habilita os botões corretos
    turmaTituloHeader.innerHTML = `<small>Gerenciando a Turma:</small>${turmaData.nomeDaTurma} (${turmaData.anoAtual || 1}º Ano)`;
    if(turmaData.isEAE) { btnAvancarAno.classList.remove('hidden'); }

    configurarTabelaParticipantes();
    escutarParticipantes(); // Mantém onSnapshot para atualizações em tempo real
    escutarCronograma();   // Mantém onSnapshot para atualizações em tempo real

    // Habilita/Desabilita botões de admin com base nos cargos E se é facilitador da turma
    habilitarOuDesabilitarBotoesAdmin();
}

// ### AJUSTE: Nova função para controlar visibilidade dos botões ###
function habilitarOuDesabilitarBotoesAdmin() {
    // Quem pode gerenciar (adicionar aluno, aula extra, recesso, notas, promover grau)?
    const podeGerenciar = userIsAdminGlobal || (userIsFacilitatorDaTurma && userIsAdminEducacional);

    // Botões principais de adição
    btnInscreverParticipante.style.display = podeGerenciar ? 'inline-block' : 'none';
    btnCadastrarAluno.style.display = podeGerenciar ? 'inline-block' : 'none';
    btnAddAulaExtra.style.display = podeGerenciar ? 'inline-block' : 'none';
    btnGerenciarRecessos.style.display = podeGerenciar ? 'inline-block' : 'none';
    btnAvancarAno.style.display = (podeGerenciar && turmaData.isEAE) ? 'inline-block' : 'none'; // Avançar ano só EAE e se puder gerenciar

    // A visibilidade dos botões DENTRO das tabelas será controlada na renderização (escutarParticipantes/escutarCronograma)
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
        const podeGerenciar = userIsAdminGlobal || (userIsFacilitatorDaTurma && userIsAdminEducacional); // Re-verifica aqui

        if (snapshot.empty) {
            const colspan = turmaData.isEAE ? 8 : 5;
            rowsHTML.push(`<tr><td colspan="${colspan}" style="text-align: center;">Nenhum participante inscrito.</td></tr>`);
        } else {
            snapshot.forEach(doc => {
                const participante = doc.data();
                const origem = participante.origem === 'aluno' ? 'Aluno' : 'Voluntário';
                const anoAtual = turmaData.anoAtual || 1;
                const avaliacaoDoAno = participante.avaliacoes ? participante.avaliacoes[anoAtual] : null;
                const freq = (avaliacaoDoAno ? avaliacaoDoAno.notaFrequencia : 0) || 0;

                let row = `<td>${participante.nome}</td>`;
                let actionsHTML = ''; // Inicia vazio

                // Monta os botões de ação apenas se o usuário puder gerenciar
                if (podeGerenciar) {
                     if (participante.origem === 'aluno') {
                         actionsHTML += `<button class="icon-btn" style="color: #27ae60;" title="Promover para Voluntário" data-action="promote-to-volunteer" data-participante-doc-id="${doc.id}"><i class="fas fa-user-plus"></i></button>`;
                     }
                     if (turmaData.isEAE) {
                         actionsHTML += `<button class="icon-btn notes" title="Lançar Notas" data-action="notas" data-id="${doc.id}"><i class="fas fa-edit"></i></button>`;
                         actionsHTML += `<button class="icon-btn promote" title="Promover Grau" data-action="promover" data-id="${doc.id}"><i class="fas fa-user-graduate"></i></button>`;
                     }
                     actionsHTML += `<button class="icon-btn delete" title="Remover da Turma" data-action="remover" data-id="${doc.id}"><i class="fas fa-user-minus"></i></button>`;
                } else {
                    actionsHTML = '---'; // Ou pode deixar vazio, ou colocar um ícone de "ver detalhes" se aplicável
                }


                if (turmaData.isEAE) {
                    row += `
                        <td>${participante.grau || 'Aluno'}</td>
                        <td>${origem}</td>
                        <td>${freq}%</td>
                        <td>${((avaliacaoDoAno ? avaliacaoDoAno.mediaRI : 0) || 0).toFixed(1)}</td>
                        <td>${((avaliacaoDoAno ? avaliacaoDoAno.mediaFinal : 0) || 0).toFixed(1)}</td>
                        <td>${(avaliacaoDoAno ? avaliacaoDoAno.statusAprovacao : 'Em Andamento')}</td>
                        <td class="actions">${actionsHTML}</td>
                    `;
                } else {
                    const status = freq >= 75 ? 'Aprovado' : 'Cursando';
                    row += `
                        <td>${origem}</td>
                        <td>${freq}%</td>
                        <td>${status}</td>
                        <td class="actions">${actionsHTML}</td>
                    `;
                }
                rowsHTML.push(`<tr>${row}</tr>`);
            });
        }
        participantesTableBody.innerHTML = rowsHTML.join('');
    });
}

async function removerParticipante(participanteDocId) {
    // ### AJUSTE: Verifica permissão antes de executar ###
    const podeGerenciar = userIsAdminGlobal || (userIsFacilitatorDaTurma && userIsAdminEducacional);
    if (!podeGerenciar) {
        return alert("Você não tem permissão para remover participantes.");
    }
    // --- Fim do Ajuste ---

    if (!confirm("Tem certeza que deseja remover este participante da turma? Esta ação não pode ser desfeita.")) {
        return;
    }
    try {
        const participanteRef = doc(db, "turmas", turmaId, "participantes", participanteDocId);
        await deleteDoc(participanteRef);
        alert("Participante removido com sucesso.");
    } catch (error) {
        console.error("Erro ao remover participante:", error);
        alert("Ocorreu um erro ao remover o participante.");
    }
}


function escutarCronograma() {
    const cronogramaRef = collection(db, "turmas", turmaId, "cronograma");
    const q = query(cronogramaRef, orderBy("dataAgendada", "asc"));

    onSnapshot(q, (snapshot) => {
        let rowsHTML = [];
        let todasAulasRealizadas = true;
        const podeGerenciar = userIsAdminGlobal || (userIsFacilitatorDaTurma && userIsAdminEducacional); // Re-verifica aqui

        if (snapshot.empty) {
            todasAulasRealizadas = false;
            rowsHTML.push(`<tr><td colspan="5" style="text-align: center;">Nenhuma aula no cronograma.</td></tr>`);
        } else {
            snapshot.forEach(doc => {
                const aula = doc.data();
                if (aula.status !== 'realizada' && !aula.isExtra) {
                    todasAulasRealizadas = false;
                }

                const dataFormatada = aula.dataAgendada.toDate().toLocaleDateString('pt-BR', { timeZone: 'UTC' });
                const numeroAulaDisplay = aula.isExtra ? '<strong>Extra</strong>' : aula.numeroDaAula;
                let actionsHTML = ''; // Inicia vazio

                // Monta botões de ação se puder gerenciar
                if (podeGerenciar) {
                    actionsHTML += `<button class="icon-btn attendance" title="Lançar Frequência" data-action="frequencia" data-id="${doc.id}" data-titulo="${aula.titulo}"><i class="fas fa-clipboard-list"></i></button>`;
                    actionsHTML += ` <button class="icon-btn edit" title="Editar Aula" data-action="edit" data-id="${doc.id}"><i class="fas fa-pencil-alt"></i></button>`;
                    if (aula.isExtra) {
                        actionsHTML += ` <button class="icon-btn delete" title="Excluir Aula Extra" data-action="delete" data-id="${doc.id}"><i class="fas fa-trash-alt"></i></button>`;
                    } else {
                        actionsHTML += ` <button class="icon-btn recess" title="Marcar como Recesso" data-action="recess" data-id="${doc.id}" data-date="${aula.dataAgendada.toDate().toISOString()}" data-titulo="${aula.titulo}"><i class="fas fa-coffee"></i></button>`;
                    }
                } else {
                    // Se não pode gerenciar, talvez mostrar só o de frequência (se for facilitador?)
                    // Ou deixar vazio/mostrar "---"
                    actionsHTML = '---';
                }

                rowsHTML.push(`<tr><td>${numeroAulaDisplay}</td><td>${dataFormatada}</td><td>${aula.titulo}</td><td>${aula.status}</td><td class="actions">${actionsHTML}</td></tr>`);
            });
        }
        cronogramaTableBody.innerHTML = rowsHTML.join('');

        // Habilita botão de gerar certificado (a lógica de quem pode clicar está no listener)
        if (todasAulasRealizadas && !snapshot.empty) {
            btnGerarCertificados.classList.remove('disabled');
            btnGerarCertificados.title = "Gerar certificados em PDF para alunos aprovados.";
        } else {
            btnGerarCertificados.classList.add('disabled');
            btnGerarCertificados.title = "Disponível após a conclusão de todas as aulas.";
        }
    }, (error) => {
        console.error("Erro ao buscar cronograma:", error);
        cronogramaTableBody.innerHTML = `<tr><td colspan="5" style="color: red; text-align: center;">Erro ao carregar o cronograma. Verifique o console (F12) para um link de criação de índice.</td></tr>`;
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
    } catch (error) {
        console.error("Erro ao promover aluno para voluntário:", error);
        alert(`Erro: ${error.message}`);
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

async function salvarNotas(event) {
    event.preventDefault();
    const participanteId = inputNotasParticipanteId.value;
    if (!participanteId) return;
    btnSalvarNotas.disabled = true;
    try {
        const participanteRef = doc(db, "turmas", turmaId, "participantes", participanteId);
        const participanteSnap = await getDoc(participanteRef);
        if (!participanteSnap.exists()) { throw new Error("Participante não encontrado."); }
        const participanteData = participanteSnap.data();
        const anoAtual = turmaData.anoAtual || 1;
        const avaliacoesAtuais = participanteData.avaliacoes || {};
        const avaliacaoDoAnoAtual = avaliacoesAtuais[anoAtual] || {};
        const notaFrequencia = avaliacaoDoAnoAtual.notaFrequencia || 0;
        const notaCadernoTemas = parseFloat(inputNotaCadernoTemas.value) || 0;
        const notaCadernetaPessoal = parseFloat(inputNotaCadernetaPessoal.value) || 0;
        const notaTrabalhos = parseFloat(inputNotaTrabalhos.value) || 0;
        const notaExameEspiritual = parseFloat(inputNotaExameEspiritual.value) || 0;
        const notaFreqConvertida = notaFrequencia >= 80 ? 10 : (notaFrequencia >= 60 ? 5 : 1);
        const mediaAT = (notaFreqConvertida + notaCadernoTemas) / 2;
        const mediaRI = (notaCadernetaPessoal + notaTrabalhos + notaExameEspiritual) / 3;
        const mediaFinal = (mediaAT + mediaRI) / 2;
        const statusAprovacao = (mediaFinal >= 5 && mediaRI >= 6) ? "Aprovado" : "Reprovado";
        const dadosAtualizados = { ...avaliacaoDoAnoAtual, notaCadernoTemas, notaCadernetaPessoal, notaTrabalhos, notaExameEspiritual, notaFrequencia, mediaAT, mediaRI, mediaFinal, statusAprovacao };
        await updateDoc(participanteRef, { [`avaliacoes.${anoAtual}`]: dadosAtualizados });
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
        
        const frequenciasSalvas = new Map();
        frequenciaSnapshot.forEach(doc => {
            frequenciasSalvas.set(doc.data().participanteId, doc.data().status); // Usa ID original como chave
        });

        let listHTML = '';
        participantesSnapshot.forEach(doc => {
            const participanteDocId = doc.id; 
            const participante = doc.data();
            const participanteIdOriginal = participante.participanteId; // Pega o ID original (de 'voluntarios' ou 'alunos')
            
            const statusAtual = frequenciasSalvas.get(participanteIdOriginal) || null; // Busca frequência pelo ID original
            
            listHTML += `
                <li class="attendance-item" data-participante-id="${participanteIdOriginal}" data-participante-doc-id="${participanteDocId}" data-status="${statusAtual || ''}">
                    <span>${participante.nome}</span>
                    <div class="attendance-controls">
                        <button class="btn-status presente ${statusAtual === 'presente' ? 'active' : ''}" data-status="presente">P</button>
                        <button class="btn-status ausente ${statusAtual === 'ausente' ? 'active' : ''}" data-status="ausente">F</button>
                        <button class="btn-status justificado ${statusAtual === 'justificado' ? 'active' : ''}" data-status="justificado">J</button>
                    </div>
                </li>`;
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
        const participanteIdOriginal = item.dataset.participanteId; // ID de 'voluntarios' ou 'alunos'
        const participanteDocId = item.dataset.participanteDocId; // ID do doc em 'participantes'
        
        const status = item.dataset.status || 'ausente'; 
        
        // Usa o ID original para criar o ID único da frequência
        const frequenciaDocId = `${currentAulaIdParaFrequencia}_${participanteIdOriginal}`; 
        const frequenciaRef = doc(db, "turmas", turmaId, "frequencias", frequenciaDocId);
        
        batch.set(frequenciaRef, {
            aulaId: currentAulaIdParaFrequencia,
            participanteId: participanteIdOriginal, // Salva o ID original
            participanteDocId: participanteDocId, // Salva o ID do doc em participantes (referência)
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
        const key = `${data.aulaId}_${data.participanteId}`; // Usa ID original na chave
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
                const key = `${aula.id}_${p.participanteId}`; // Usa ID original para buscar
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
    areaRelatorioGerado.innerHTML = `<h2>Diário de Classe - ${turmaData.nomeDaTurma}</h2>` + tableHTML;
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
        selectHTML += `<option value="${p.id}">${p.nome}</option>`; // Usa o ID do doc em 'participantes'
    });
    selectHTML += '</select></div><div id="boletim-content"></div>';
    areaRelatorioGerado.innerHTML = `<h2>Boletim Individual - ${turmaData.nomeDaTurma}</h2>` + selectHTML;

    document.getElementById('select-boletim-participante').addEventListener('change', (e) => {
        const participanteDocId = e.target.value; // ID do doc em 'participantes'
        const boletimContent = document.getElementById('boletim-content');
        if (!participanteDocId) {
            boletimContent.innerHTML = '';
            btnImprimirRelatorio.classList.add('hidden');
            return;
        }

        const participante = participantes.find(p => p.id === participanteDocId);
        const anoAtual = turmaData.anoAtual || 1;
        const avaliacao = participante.avaliacoes ? participante.avaliacoes[anoAtual] : null;

        let boletimHTML = `<div class="boletim-card" style="border: 1px solid #ccc; padding: 15px; border-radius: 8px; margin-top: 10px;"><h4>Boletim de ${participante.nome}</h4>`;
        if (turmaData.isEAE && avaliacao) {
            boletimHTML += `
                <p><strong>Frequência:</strong> ${avaliacao.notaFrequencia || 0}%</p>
                <p><strong>Média Reforma Íntima (RI):</strong> ${(avaliacao.mediaRI || 0).toFixed(1)}</p>
                <p><strong>Média Final:</strong> ${(avaliacao.mediaFinal || 0).toFixed(1)}</p>
                <p><strong>Status:</strong> ${avaliacao.statusAprovacao || 'Em Andamento'}</p>
                <hr>
                <h5>Notas Detalhadas (${anoAtual}º Ano):</h5>
                <ul>
                    <li>Caderno de Temas: ${avaliacao.notaCadernoTemas ?? '-'}</li>
                    <li>Caderneta Pessoal: ${avaliacao.notaCadernetaPessoal ?? '-'}</li>
                    <li>Trabalhos Prestados: ${avaliacao.notaTrabalhos ?? '-'}</li>
                    <li>Exame Espiritual: ${avaliacao.notaExameEspiritual ?? '-'}</li>
                </ul>
            `;
        } else if (avaliacao) {
             boletimHTML += `<p><strong>Frequência:</strong> ${avaliacao.notaFrequencia || 0}%</p><p>Não há notas para este curso.</p>`;
        } else {
             boletimHTML += `<p><strong>Frequência:</strong> 0%</p><p>Não há notas para este curso.</p>`;
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
        const avaliacao = p.avaliacoes ? p.avaliacoes[anoAtual] : null;

        if (turmaData.isEAE) {
            statusFinal = avaliacao ? avaliacao.statusAprovacao : 'Pendente';
        } else {
            const freq = avaliacao ? avaliacao.notaFrequencia : 0;
            statusFinal = freq >= 75 ? 'Aprovado' : 'Reprovado por Frequência';
        }
        tableHTML += `<tr><td>${p.nome}</td><td>${statusFinal}</td></tr>`;
    });

    tableHTML += '</tbody></table></div>';
    areaRelatorioGerado.innerHTML = `<h2>Relatório Final para Certificado - ${turmaData.nomeDaTurma}</h2>` + tableHTML;
    btnImprimirRelatorio.classList.remove('hidden');
}


// ===================================================================
// ## FUNÇÃO DE GERAR CERTIFICADOS E PRÉ-CARREGAMENTO (VERSÃO FINAL COM BUSCA DE DIRIGENTE) ##
// ===================================================================

function precarregarImagem(url) {
    return new Promise((resolve) => {
        if (!url) {
            console.warn("URL da imagem não fornecida para pré-carregamento.");
            return resolve(null);
        }
        const img = new Image();
        img.crossOrigin = "Anonymous";
        img.onload = () => resolve(img);
        img.onerror = (err) => {
            console.error(`Falha ao carregar imagem: ${url}`, err);
            resolve(null); // Retorna null se falhar
        };
        img.src = url + '?t=' + new Date().getTime(); // Cache buster
    });
}

async function gerarCertificados() {
    alert("Iniciando a geração dos certificados. Isso pode levar um momento...");
    const { jsPDF } = window.jspdf;

    try {
        const presidenteRef = doc(db, "configuracoes", "gestaoAtual");
        const [participantesSnap, presidenteSnap] = await Promise.all([
            getDocs(query(collection(db, "turmas", turmaId, "participantes"), orderBy("nome"))),
            getDoc(presidenteRef)
        ]);
        const presidenteData = presidenteSnap.exists() ? presidenteSnap.data() : { presidenteNome: "Presidente Não Definido", presidenteAssinaturaUrl: null };

        const alunosAprovados = [];
        participantesSnap.forEach(doc => {
            const participante = doc.data();
            const anoAtual = turmaData.anoAtual || 1;
            const avaliacao = participante.avaliacoes ? participante.avaliacoes[anoAtual] : null;
            let aprovado = false;
            if (turmaData.isEAE) {
                if (avaliacao && avaliacao.statusAprovacao === 'Aprovado') aprovado = true;
            } else {
                const freq = avaliacao ? avaliacao.notaFrequencia : 0;
                if (freq >= 75) aprovado = true;
            }
            if(aprovado) alunosAprovados.push(participante);
        });

        if (alunosAprovados.length === 0) {
            return alert("Nenhum aluno aprovado encontrado para gerar certificados.");
        }

        // ### AJUSTE: Lógica para encontrar o Dirigente de Escola ###
        let dirigenteEncontrado = null;
        // Usa 'facilitadoresIds' que contém os IDs da coleção 'voluntarios'
        const facilitadoresIds = turmaData.facilitadoresIds || [];

        for (const facilitadorId of facilitadoresIds) {
            const voluntarioRef = doc(db, "voluntarios", facilitadorId); // Busca na coleção 'voluntarios'
            const voluntarioDoc = await voluntarioRef.get();

            if (voluntarioDoc.exists()) {
                const voluntarioData = voluntarioDoc.data();
                // Verifica se o campo 'role' existe e é o correto
                if (voluntarioData.role === 'dirigente-escola') {
                    // Verifica se a assinaturaUrl existe ANTES de atribuir
                    if (voluntarioData.assinaturaUrl) {
                        dirigenteEncontrado = voluntarioData; // Guarda os dados do dirigente
                        console.log(`Dirigente encontrado: ${voluntarioData.nome}, Assinatura: ${voluntarioData.assinaturaUrl}`);
                        break; // Encontrou um com assinatura, pode parar de procurar
                    } else {
                        console.warn(`Voluntário ${voluntarioData.nome} (ID: ${facilitadorId}) é Dirigente, mas não tem assinaturaUrl cadastrada.`);
                        // Guarda o primeiro dirigente encontrado, mesmo sem assinatura, como fallback
                        if (!dirigenteEncontrado) {
                           dirigenteEncontrado = voluntarioData;
                        }
                    }
                }
            } else {
                console.warn("Documento do voluntário (facilitador) não encontrado para o ID:", facilitadorId);
            }
        }

        if (!dirigenteEncontrado) {
            console.warn(`Nenhum 'dirigente-escola' encontrado entre os facilitadores da turma ${turmaId}. Verifique os cargos.`);
            // Define um fallback se nenhum dirigente for encontrado
            dirigenteEncontrado = { nome: "Dirigente Não Definido", assinaturaUrl: null };
        } else if (!dirigenteEncontrado.assinaturaUrl) {
            // Se encontrou um dirigente mas ele não tem assinatura
             console.warn(`O dirigente ${dirigenteEncontrado.nome} não possui URL de assinatura. A assinatura ficará em branco.`);
        }
        // ### FIM DO AJUSTE ###

        // Pré-carrega as assinaturas (agora usando o dirigente encontrado) e o logo
        const [dirigenteImg, presidenteImg, logoImg] = await Promise.all([
            precarregarImagem(dirigenteEncontrado.assinaturaUrl), // Pode ser null se não tiver URL
            precarregarImagem(presidenteData.presidenteAssinaturaUrl),
            precarregarImagem('/logo-cepat.png') // Pré-carrega o logo também
        ]);

        // Define as URLs no HTML *antes* do loop (importante para html2canvas)
        certAssinaturaDirigenteImg.src = dirigenteImg ? dirigenteImg.src : ""; // Usa src vazia se não houver imagem
        certAssinaturaPresidenteImg.src = presidenteImg ? presidenteImg.src : "";
        document.getElementById('logo-cepat-cert').src = logoImg ? logoImg.src : ""; // Garante que o logo esteja carregado

        for (const aluno of alunosAprovados) {
            // Preenche os dados variáveis do certificado no HTML
            certAlunoNome.textContent = aluno.nome.toUpperCase();
            certCursoNome.textContent = turmaData.isEAE ? `${turmaData.nomeDaTurma} da ${turmaData.cursoNome}` : turmaData.cursoNome;
            const dataInicio = turmaData.dataInicio.toDate();
            const dataFim = new Date(); // Usa a data atual como data de fim/emissão
            certPeriodo.textContent = `realizado no período de ${dataInicio.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })} a ${dataFim.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}`;
            certDataEmissao.textContent = `Santa Bárbara d'Oeste, ${new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })}`;
            certNomeDirigente.textContent = dirigenteEncontrado.nome; // Usa o nome do dirigente encontrado
            certNomePresidente.textContent = presidenteData.presidenteNome;

            // Pequeno delay para garantir que o DOM atualizou antes do html2canvas
            await new Promise(resolve => setTimeout(resolve, 100));

            // Gera o canvas a partir do HTML
            const canvas = await html2canvas(document.getElementById('certificate-wrapper'), {
                useCORS: true,
                allowTaint: true,
                scale: 2 // Aumenta a resolução para melhor qualidade de impressão
            });
            
            // Cria o PDF e adiciona a imagem do canvas
            const imgData = canvas.toDataURL('image/png');
            const pdf = new jsPDF({ orientation: 'landscape', unit: 'px', format: [1024, 728] });
            pdf.addImage(imgData, 'PNG', 0, 0, 1024, 728);
            
            // Salva o PDF
            pdf.save(`Certificado - ${aluno.nome}.pdf`);
        }

        alert(`${alunosAprovados.length} certificados gerados com sucesso!`);

    } catch (error) {
        console.error("Erro ao gerar certificados:", error);
        alert("Ocorreu um erro ao gerar os certificados. Verifique o console.");
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
    const id = target.dataset.id; // ID do documento na subcoleção 'participantes'
    
    if (action === 'notas') {
        abrirModalNotas(id);
    } else if (action === 'promover') {
        promoverGrau(id);
    } else if (action === 'promote-to-volunteer') {
        const participanteDocId = target.dataset.participanteDocId; // Pega o ID correto
        promoverParaVoluntario(participanteDocId);
    } else if (action === 'remover') {
        removerParticipante(id); // Chama a nova função de remover
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
    if (target.classList.contains('disabled')) return;
    const reportType = target.dataset.report;
    areaRelatorioGerado.innerHTML = ''; // Limpa área antes de gerar novo relatório
    btnImprimirRelatorio.classList.add('hidden'); // Esconde botão de imprimir
    if (reportType === 'diario-classe') {
        gerarDiarioDeClasse();
    } else if (reportType === 'boletim-individual') {
        gerarBoletimIndividual();
    } else if (reportType === 'aptos-certificado') {
        gerarRelatorioAptosCertificado();
    } else if (reportType === 'gerar-certificados') {
        gerarCertificados();
    }
});
if(btnImprimirRelatorio) btnImprimirRelatorio.addEventListener('click', () => {
    window.print();
});