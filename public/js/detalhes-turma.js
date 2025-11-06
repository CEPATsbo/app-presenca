import { initializeApp } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-auth.js";
import { getFirestore, collection, query, where, getDocs, doc, getDoc, addDoc, onSnapshot, orderBy, limit, serverTimestamp, Timestamp, updateDoc, deleteDoc, writeBatch } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js";
import { runTransaction } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js";
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
const functions = getFunctions(app, 'southamerica-east1');

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

// --- Elementos do Certificado (para preenchimento) ---
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
let currentUserProfile = null; // Guarda os dados do Firestore ('voluntarios') ID e Data
let currentUserClaims = null; // Guarda os claims (cargos)
let userIsAdminGlobal = false; // Flag para admin global
let userIsAdminEducacional = false; // Flag para dirigente/secretário
let userIsFacilitatorDaTurma = false; // Flag para facilitador DESTA turma

onAuthStateChanged(auth, async (user) => {
    console.log("AUTH STATE CHANGED:", user ? user.uid : 'No user'); // Log inicial
    if (user) {
        currentUser = user;
        try {
            // 1. Pega o perfil do voluntário no Firestore
            const voluntariosRef = collection(db, "voluntarios");
            const q = query(voluntariosRef, where("authUid", "==", user.uid), limit(1));
            const querySnapshot = await getDocs(q);

            if (querySnapshot.empty) {
                console.error("PERFIL NÃO ENCONTRADO para authUid:", user.uid);
                throw new Error("Perfil de voluntário não encontrado.");
            }
            currentUserProfile = { id: querySnapshot.docs[0].id, ...querySnapshot.docs[0].data() };
            console.log("Perfil do Usuário Carregado:", currentUserProfile); // Log Perfil

            // 2. Pega os claims (cargos)
            const idTokenResult = await user.getIdTokenResult(true); // Força refresh
            currentUserClaims = idTokenResult.claims || {};
            console.log("Claims do Usuário Carregados:", currentUserClaims); // Log Claims

            // 3. Define as flags de permissão globais
            userIsAdminGlobal = ['super-admin', 'diretor', 'tesoureiro'].some(role => currentUserClaims[role] === true || currentUserClaims.role === role);
            userIsAdminEducacional = currentUserClaims['dirigente-escola'] === true || currentUserClaims['secretario-escola'] === true || currentUserClaims.role === 'dirigente-escola' || currentUserClaims.role === 'secretario-escola';
            console.log(`Flags Globais: isAdminGlobal=${userIsAdminGlobal}, isAdminEducacional=${userIsAdminEducacional}`); // Log Flags

            // 4. Pega o ID da turma da URL
            const params = new URLSearchParams(window.location.search);
            turmaId = params.get('turmaId');
            if (!turmaId) {
                throw new Error("ID da turma não encontrado na URL.");
            }
            console.log("ID da Turma:", turmaId); // Log Turma ID

            // 5. Carrega os dados da turma E verifica a permissão específica para esta turma
            await carregarDadosDaTurmaEVerificarPermissao();

        } catch (error) {
            console.error("Erro na verificação de acesso inicial:", error); // Log Erro Inicial
            document.body.innerHTML = `<div style="text-align: center; margin-top: 50px;"><h1>Erro</h1><p>${error.message}</p><a href="/dashboard.html">Voltar</a></div>`;
        }

    } else {
        window.location.href = '/login.html';
    }
});


async function carregarDadosDaTurmaEVerificarPermissao() {
    console.log("Iniciando carregamento da turma e verificação de permissão...");
    const turmaRef = doc(db, "turmas", turmaId);
    const docSnap = await getDoc(turmaRef);

    if (!docSnap.exists()) {
        console.error("TURMA NÃO ENCONTRADA no Firestore:", turmaId);
        throw new Error("Turma não encontrada.");
    }

    turmaData = docSnap.data();
    console.log("Dados da Turma Carregados:", turmaData); // Log Dados Turma
    console.log("Facilitadores IDs da Turma:", turmaData.facilitadoresIds); // Log Facilitadores IDs

    // Verifica se o usuário é facilitador DESTA turma
    userIsFacilitatorDaTurma = (turmaData.facilitadoresIds || []).includes(currentUserProfile.id);
    console.log(`Usuário (ID: ${currentUserProfile.id}) é facilitador desta turma? ${userIsFacilitatorDaTurma}`); // Log Verificação Facilitador

    // Verifica a permissão de ACESSO à página
    const podeAcessarPagina = userIsAdminGlobal || // Admins globais podem ver tudo
        (userIsFacilitatorDaTurma && (userIsAdminEducacional || currentUserProfile.role === 'facilitador' || currentUserClaims.facilitador === true));
    console.log(`Pode acessar a página? ${podeAcessarPagina} (isAdminGlobal=${userIsAdminGlobal}, isFacilitator=${userIsFacilitatorDaTurma}, isAdminEdu=${userIsAdminEducacional}, profileRole=${currentUserProfile.role}, claimFacilitador=${currentUserClaims.facilitador})`); // Log Decisão Final

    if (!podeAcessarPagina) {
        throw new Error("Você não tem permissão para gerenciar esta turma específica.");
    }

    // Se passou, configura a página e habilita os botões corretos
    turmaTituloHeader.innerHTML = `<small>Gerenciando a Turma:</small>${turmaData.nomeDaTurma} (${turmaData.anoAtual || 1}º Ano)`;
    if (turmaData.isEAE && btnAvancarAno) { // Verifica se botão existe
        btnAvancarAno.classList.remove('hidden');
    }

    configurarTabelaParticipantes();
    escutarParticipantes(); // Mantém onSnapshot para atualizações em tempo real
    escutarCronograma(); // Mantém onSnapshot para atualizações em tempo real

    habilitarOuDesabilitarBotoesAdmin();
    console.log("Página configurada e listeners iniciados."); // Log Sucesso
}


function habilitarOuDesabilitarBotoesAdmin() {
    console.log("Verificando quais botões habilitar..."); // Log Botões
    // Quem pode gerenciar (adicionar aluno, aula extra, recesso, notas, promover grau)?
    const podeGerenciar = userIsAdminGlobal || (userIsFacilitatorDaTurma && userIsAdminEducacional);
    console.log(`Pode gerenciar (geral)? ${podeGerenciar}`); // Log Pode Gerenciar

    // Funcao auxiliar para mostrar/esconder
    const setDisplay = (element, condition) => {
        if (element) { // Verifica se o elemento existe antes de tentar mudar o estilo
            element.style.display = condition ? 'inline-block' : 'none';
        } else {
            // console.warn(`Elemento não encontrado no DOM ao tentar setar display.`);
        }
    };

    // Botões principais de adição
    setDisplay(btnInscreverParticipante, podeGerenciar);
    setDisplay(btnCadastrarAluno, podeGerenciar);
    setDisplay(btnAddAulaExtra, podeGerenciar);
    setDisplay(btnGerenciarRecessos, podeGerenciar);
    setDisplay(btnAvancarAno, podeGerenciar && turmaData.isEAE);

    // A visibilidade dos botões DENTRO das tabelas será controlada na renderização
    console.log("Visibilidade dos botões principais definida.");
}

function configurarTabelaParticipantes() {
    let tableHeaderHTML = '<tr><th>Nome</th>';
    if (turmaData.isEAE) {
        tableHeaderHTML += '<th>Grau</th><th>Origem</th><th>Freq.</th><th>Média RI</th><th>Média Final</th><th>Status</th><th>Ações</th>';
    } else {
        tableHeaderHTML += '<th>Origem</th><th>Freq.</th><th>Status</th><th>Ações</th>';
    }
    tableHeaderHTML += '</tr>';
    if (participantesTable) participantesTable.querySelector('thead').innerHTML = tableHeaderHTML;
}

// ==========================================================
// ## FUNÇÃO 'escutarParticipantes' COM A LÓGICA 'statusGeral' ##
// ==========================================================
function escutarParticipantes() {
    if (!participantesTableBody) return; // Sai se a tabela não existe
    const participantesRef = collection(db, "turmas", turmaId, "participantes");

    // ### MUDANÇA AQUI: Adiciona o 'where' para filtrar por statusGeral ###
    const q = query(participantesRef, where("statusGeral", "==", "ativo"), orderBy("nome"));

    onSnapshot(q, (snapshot) => {
        let rowsHTML = [];
        const podeGerenciar = userIsAdminGlobal || (userIsFacilitatorDaTurma && userIsAdminEducacional);

        if (snapshot.empty) {
            const colspan = turmaData.isEAE ? 8 : 5;
            rowsHTML.push(`<tr><td colspan="${colspan}" style="text-align: center;">Nenhum participante ativo inscrito.</td></tr>`);
        } else {
            snapshot.forEach(doc => {
                const participante = doc.data();
                // Fallback de segurança, mas a query deve tratar isso
                if (participante.statusGeral && participante.statusGeral !== 'ativo') {
                    return; // Pula este participante
                }

                const origem = participante.origem === 'aluno' ? 'Aluno' : 'Voluntário';
                const anoAtual = turmaData.anoAtual || 1;
                const avaliacaoDoAno = participante.avaliacoes ? participante.avaliacoes[anoAtual] : null;
                const freq = (avaliacaoDoAno ? avaliacaoDoAno.notaFrequencia : 0) || 0;

                let row = `<td>${participante.nome}</td>`;
                let actionsHTML = '';

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
                    actionsHTML = '---';
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
    }, (error) => {
        // ### IMPORTANTE: O erro do link do índice vai aparecer aqui! ###
        console.error("Erro ao escutar participantes (verifique o link para criar o índice):", error);
        participantesTableBody.innerHTML = `<tr><td colspan="8" style="color: red; text-align: center;">Erro ao carregar participantes. Verifique o console (F12) e clique no link para criar o índice do Firestore.</td></tr>`;
    });
}

async function removerParticipante(participanteDocId) {
    const podeGerenciar = userIsAdminGlobal || (userIsFacilitatorDaTurma && userIsAdminEducacional);
    if (!podeGerenciar) {
        return alert("Você não tem permissão para remover participantes.");
    }

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
    if (!cronogramaTableBody) return; // Sai se a tabela não existe
    const cronogramaRef = collection(db, "turmas", turmaId, "cronograma");
    const q = query(cronogramaRef, orderBy("dataAgendada", "asc"));

    onSnapshot(q, (snapshot) => {
        let rowsHTML = [];
        let todasAulasRealizadas = true;
        const podeGerenciar = userIsAdminGlobal || (userIsFacilitatorDaTurma && userIsAdminEducacional);

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
                let actionsHTML = '';

                // Facilitador comum TAMBÉM pode lançar frequência
                const podeLancarFrequencia = podeGerenciar || userIsFacilitatorDaTurma;

                if (podeLancarFrequencia) {
                    actionsHTML += `<button class="icon-btn attendance" title="Lançar Frequência" data-action="frequencia" data-id="${doc.id}" data-titulo="${aula.titulo}"><i class="fas fa-clipboard-list"></i></button>`;
                }

                if (podeGerenciar) {
                    actionsHTML += ` <button class="icon-btn edit" title="Editar Aula" data-action="edit" data-id="${doc.id}"><i class="fas fa-pencil-alt"></i></button>`;
                    if (aula.isExtra) {
                        actionsHTML += ` <button class="icon-btn delete" title="Excluir Aula Extra" data-action="delete" data-id="${doc.id}"><i class="fas fa-trash-alt"></i></button>`;
                    } else {
                        actionsHTML += ` <button class="icon-btn recess" title="Marcar como Recesso" data-action="recess" data-id="${doc.id}" data-date="${aula.dataAgendada.toDate().toISOString()}" data-titulo="${aula.titulo}"><i class="fas fa-coffee"></i></button>`;
                    }
                } else if (!podeLancarFrequencia) {
                    // Se não pode gerenciar nem lançar frequência
                    actionsHTML = '---';
                }

                rowsHTML.push(`<tr><td>${numeroAulaDisplay}</td><td>${dataFormatada}</td><td>${aula.titulo}</td><td>${aula.status}</td><td class="actions">${actionsHTML}</td></tr>`);
            });
        }
        cronogramaTableBody.innerHTML = rowsHTML.join('');

        if (btnGerarCertificados) { // Verifica se o botão existe
            if (todasAulasRealizadas && !snapshot.empty) {
                btnGerarCertificados.classList.remove('disabled');
                btnGerarCertificados.title = "Gerar certificados em PDF para alunos aprovados.";
            } else {
                btnGerarCertificados.classList.add('disabled');
                btnGerarCertificados.title = "Disponível após a conclusão de todas as aulas.";
            }
        }
    }, (error) => {
        console.error("Erro ao buscar cronograma:", error);
        cronogramaTableBody.innerHTML = `<tr><td colspan="5" style="color: red; text-align: center;">Erro ao carregar o cronograma. Verifique o console (F12) para um link de criação de índice.</td></tr>`;
    });
}

async function carregarVoluntariosParaInscricao() {
    if (!participanteSelect) return;
    participanteSelect.innerHTML = '<option value="">Carregando...</option>'; // Feedback visual
    try {
        const voluntariosRef = collection(db, "voluntarios");
        const q = query(voluntariosRef, where("statusVoluntario", "==", "ativo"), orderBy("nome")); // Filtra apenas ativos
        const snapshot = await getDocs(q);
        participanteSelect.innerHTML = '<option value="">Selecione...</option>'; // Limpa e adiciona padrão
        snapshot.forEach(doc => {
            const option = document.createElement('option');
            option.value = doc.id;
            option.textContent = doc.data().nome;
            participanteSelect.appendChild(option);
        });
    } catch (error) {
        console.error("Erro ao carregar voluntários:", error);
        participanteSelect.innerHTML = '<option value="">Erro ao carregar</option>';
    }
}


function abrirModalInscricao() {
    if (!modalInscricao) return;
    formInscricao.reset();
    carregarVoluntariosParaInscricao();
    if (turmaData.isEAE && formGroupGrau) { formGroupGrau.classList.remove('hidden'); }
    else if (formGroupGrau) { formGroupGrau.classList.add('hidden'); }
    modalInscricao.classList.add('visible');
}

// ==========================================================
// ## FUNÇÃO 'inscreverParticipante' COM A LÓGICA 'statusGeral' ##
// ==========================================================
async function inscreverParticipante(event) {
    event.preventDefault();
    if (!participanteSelect) return;
    const participanteId = participanteSelect.value;
    const participanteNome = participanteSelect.options[participanteSelect.selectedIndex].text;
    if (!participanteId) { return alert("Por favor, selecione um participante."); }
    if (btnSalvarInscricao) btnSalvarInscricao.disabled = true;
    try {
        // Verifica se já está inscrito para evitar duplicatas
        const participantesRef = collection(db, "turmas", turmaId, "participantes");
        const q = query(participantesRef, where("participanteId", "==", participanteId));
        const existingSnap = await getDocs(q);
        if (!existingSnap.empty) {
            throw new Error(`${participanteNome} já está inscrito nesta turma.`);
        }

        const novoParticipante = {
            participanteId,
            nome: participanteNome,
            inscritoEm: serverTimestamp(),
            origem: 'voluntario',
            statusGeral: 'ativo', // <-- MUDANÇA AQUI
            avaliacoes: {} // Inicializa avaliações
        };
        if (turmaData.isEAE && participanteGrauSelect) {
            novoParticipante.grau = participanteGrauSelect.value;
            const anoAtual = turmaData.anoAtual || 1;
            novoParticipante.avaliacoes[anoAtual] = {
                notaFrequencia: 0, mediaRI: 0, mediaFinal: 0, statusAprovacao: 'Em Andamento'
            };
        }

        await addDoc(participantesRef, novoParticipante);
        if (modalInscricao) modalInscricao.classList.remove('visible');
        alert(`${participanteNome} inscrito com sucesso!`);
    } catch (error) {
        console.error("Erro ao inscrever participante:", error);
        alert(`Erro ao inscrever: ${error.message}`); // Mostra erro específico
    } finally {
        if (btnSalvarInscricao) btnSalvarInscricao.disabled = false;
    }
}


function abrirModalNovoAluno() {
    if (!modalNovoAluno) return;
    formNovoAluno.reset();
    modalNovoAluno.classList.add('visible');
}

async function salvarNovoAluno(event) {
    event.preventDefault();
    if (!formNovoAluno || !btnSalvarNovoAluno) return;
    const nomeInput = formNovoAluno.querySelector('#novo-aluno-nome');
    const enderecoInput = formNovoAluno.querySelector('#novo-aluno-endereco');
    const telefoneInput = formNovoAluno.querySelector('#novo-aluno-telefone');
    const nascimentoInput = formNovoAluno.querySelector('#novo-aluno-nascimento');

    const nome = nomeInput ? nomeInput.value.trim() : '';
    const endereco = enderecoInput ? enderecoInput.value.trim() : '';
    const telefone = telefoneInput ? telefoneInput.value.trim() : '';
    const nascimento = nascimentoInput ? nascimentoInput.value.trim() : '';


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
        if (modalNovoAluno) modalNovoAluno.classList.remove('visible');

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
    if (!modalNotas || !formNotas || !inputNotasParticipanteId || !modalNotasTitulo || !inputNotaCadernoTemas || !inputNotaCadernetaPessoal || !inputNotaTrabalhos || !inputNotaExameEspiritual) return;
    formNotas.reset();
    inputNotasParticipanteId.value = participanteId;
    try {
        const participanteRef = doc(db, "turmas", turmaId, "participantes", participanteId);
        const docSnap = await getDoc(participanteRef);
        if (docSnap.exists()) {
            const data = docSnap.data();
            const anoAtual = turmaData.anoAtual || 1;
            modalNotasTitulo.textContent = `Lançar Notas do ${anoAtual}º Ano para ${data.nome}`;
            const avaliacaoDoAno = data.avaliacoes ? data.avaliacoes[anoAtual] : null;
            if (avaliacaoDoAno) {
                inputNotaCadernoTemas.value = avaliacaoDoAno.notaCadernoTemas ?? '';
                inputNotaCadernetaPessoal.value = avaliacaoDoAno.notaCadernetaPessoal ?? '';
                inputNotaTrabalhos.value = avaliacaoDoAno.notaTrabalhos ?? '';
                inputNotaExameEspiritual.value = avaliacaoDoAno.notaExameEspiritual ?? '';
            }
            modalNotas.classList.add('visible');
        } else {
            alert("Erro: Participante não encontrado para lançar notas.");
        }
    } catch (error) {
        console.error("Erro ao buscar dados do participante para notas:", error);
        alert("Erro ao carregar dados do participante.");
    }
}


async function salvarNotas(event) {
    event.preventDefault();
    if (!inputNotasParticipanteId || !btnSalvarNotas) return;
    const participanteId = inputNotasParticipanteId.value;
    if (!participanteId) return;
    btnSalvarNotas.disabled = true;
    try {
        const participanteRef = doc(db, "turmas", turmaId, "participantes", participanteId);
        await runTransaction(db, async (transaction) => {
            const participanteSnap = await transaction.get(participanteRef);
            if (!participanteSnap.exists()) { throw new Error("Participante não encontrado."); }

            const participanteData = participanteSnap.data();
            const anoAtual = turmaData.anoAtual || 1;
            const avaliacoesAtuais = participanteData.avaliacoes || {};
            const avaliacaoDoAnoAtual = avaliacoesAtuais[anoAtual] || {};
            const notaFrequencia = avaliacaoDoAnoAtual.notaFrequencia || 0;

            const notaCadernoTemas = Number(inputNotaCadernoTemas.value) || 0;
            const notaCadernetaPessoal = Number(inputNotaCadernetaPessoal.value) || 0;
            const notaTrabalhos = Number(inputNotaTrabalhos.value) || 0;
            const notaExameEspiritual = Number(inputNotaExameEspiritual.value) || 0;

            if ([notaCadernoTemas, notaCadernetaPessoal, notaTrabalhos, notaExameEspiritual].some(n => n < 0 || n > 10)) {
                throw new Error("As notas devem estar entre 0 e 10.");
            }

            const notaFreqConvertida = notaFrequencia >= 80 ? 10 : (notaFrequencia >= 60 ? 5 : 1);
            const mediaAT = (notaFreqConvertida + notaCadernoTemas) / 2;
            const mediaRI = (notaCadernetaPessoal + notaTrabalhos + notaExameEspiritual) / 3;
            const mediaFinal = (mediaAT + mediaRI) / 2;
            const statusAprovacao = (mediaFinal >= 5 && mediaRI >= 6) ? "Aprovado" : "Reprovado";

            const dadosAtualizados = {
                ...avaliacaoDoAnoAtual,
                notaCadernoTemas, notaCadernetaPessoal, notaTrabalhos, notaExameEspiritual,
                notaFrequencia,
                mediaAT: parseFloat(mediaAT.toFixed(1)),
                mediaRI: parseFloat(mediaRI.toFixed(1)),
                mediaFinal: parseFloat(mediaFinal.toFixed(1)),
                statusAprovacao
            };

            transaction.update(participanteRef, { [`avaliacoes.${anoAtual}`]: dadosAtualizados });
        });

        if (modalNotas) modalNotas.classList.remove('visible');
        alert("Notas salvas e médias recalculadas!");

    } catch (error) {
        console.error("Erro ao salvar notas:", error);
        alert(`Ocorreu um erro ao salvar as notas: ${error.message}`);
    } finally {
        if (btnSalvarNotas) btnSalvarNotas.disabled = false;
    }
}


async function promoverGrau(participanteId) {
    if (!participanteId) return;
    try {
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
                await updateDoc(participanteRef, { grau: proximoGrau });
                alert("Participante promovido com sucesso!");
            }
        } else {
            alert("Erro: Participante não encontrado para promover grau.");
        }
    } catch (error) {
        console.error("Erro ao promover grau:", error);
        alert("Ocorreu um erro ao tentar promover o participante.");
    }
}

// ==========================================================
// ## FUNÇÃO 'avancarAnoDaTurma' ATUALIZADA ##
// ==========================================================
async function avancarAnoDaTurma() {
    const anoAtual = turmaData.anoAtual || 1;
    if (anoAtual >= 3) { return alert("Esta turma já concluiu o 3º ano."); }
    if (!confirm(`Tem certeza que deseja avançar esta turma para o ${anoAtual + 1}º ano?\n\nATENÇÃO: Apenas alunos com status 'Aprovado' no ${anoAtual}º ano serão movidos. Esta ação não pode ser desfeita.`)) return;

    if (btnAvancarAno) {
        btnAvancarAno.disabled = true;
        btnAvancarAno.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processando...';
    }

    try {
        // CHAMA A NOVA CLOUD FUNCTION
        const avancarAno = httpsCallable(functions, 'avancarAnoComVerificacao');
        const result = await avancarAno({ turmaId: turmaId });

        // Mostra a mensagem de sucesso do back-end
        alert(result.data.message);
        location.reload(); // Recarrega a página para ver a mudança

    } catch (error) {
        console.error("Erro ao avançar o ano da turma:", error);
        alert(`Ocorreu um erro: ${error.message}`);
    } finally {
        if (btnAvancarAno) {
            btnAvancarAno.disabled = false;
            btnAvancarAno.innerHTML = '<i class="fas fa-arrow-right"></i> Avançar para o Próximo Ano';
        }
    }
}


function abrirModalAula(aulaId = null, isExtra = false) {
    if (!modalAula || !formAula || !inputAulaId || !inputAulaIsExtra || !modalAulaTitulo || !inputAulaTitulo || !inputAulaData || !formGroupNumeroAula || !inputAulaNumero) return;
    formAula.reset();
    inputAulaId.value = '';
    inputAulaIsExtra.value = String(isExtra);
    formGroupNumeroAula.classList.add('hidden');
    inputAulaNumero.readOnly = false;

    if (aulaId) {
        modalAulaTitulo.textContent = 'Editar Aula';
        const aulaRef = doc(db, "turmas", turmaId, "cronograma", aulaId);
        getDoc(aulaRef).then(docSnap => {
            if (docSnap.exists()) {
                const data = docSnap.data();
                inputAulaId.value = docSnap.id;
                inputAulaTitulo.value = data.titulo;
                inputAulaData.value = data.dataAgendada.toDate().toISOString().split('T')[0];
                inputAulaIsExtra.value = String(data.isExtra || false);

                if (!data.isExtra) {
                    formGroupNumeroAula.classList.remove('hidden');
                    inputAulaNumero.value = data.numeroDaAula;
                    inputAulaNumero.readOnly = true;
                }
            } else {
                alert("Erro: Aula não encontrada para edição.");
                modalAula.classList.remove('visible');
            }
        }).catch(error => {
            console.error("Erro ao buscar aula para editar:", error);
            alert("Erro ao carregar dados da aula.");
            modalAula.classList.remove('visible');
        });
    } else {
        modalAulaTitulo.textContent = 'Adicionar Aula Extra';
        inputAulaIsExtra.value = 'true';
    }
    modalAula.classList.add('visible');
}

async function salvarAula(event) {
    event.preventDefault();
    if (!inputAulaId || !inputAulaIsExtra || !inputAulaTitulo || !inputAulaData || !inputAulaNumero || !btnSalvarAula) return;
    const id = inputAulaId.value;
    const isExtra = inputAulaIsExtra.value === 'true';
    const dadosAula = {
        titulo: inputAulaTitulo.value.trim(),
        dataAgendada: Timestamp.fromDate(new Date(inputAulaData.value + 'T00:00:00')),
        isExtra: isExtra
    };

    if (!dadosAula.titulo || !inputAulaData.value) {
        return alert("Título e Data são obrigatórios.");
    }

    if (!isExtra) {
        if (!id) { return alert("Não é possível adicionar aulas regulares manualmente."); }
        delete dadosAula.isExtra;
        const aulaRef = doc(db, "turmas", turmaId, "cronograma", id);
        const docSnap = await getDoc(aulaRef);
        if (docSnap.exists()) dadosAula.numeroDaAula = docSnap.data().numeroDaAula;

    } else {
        dadosAula.numeroDaAula = 999;
        dadosAula.status = 'agendada';
    }

    btnSalvarAula.disabled = true;
    try {
        const cronogramaRef = collection(db, "turmas", turmaId, "cronograma");
        if (id) {
            const aulaRef = doc(cronogramaRef, id);
            await updateDoc(aulaRef, dadosAula);
            alert("Aula atualizada. O cronograma pode ser reajustado.");
        } else if (isExtra) {
            await addDoc(cronogramaRef, dadosAula);
            alert("Aula extra adicionada. O cronograma pode ser reajustado.");
        }
        if (modalAula) modalAula.classList.remove('visible');
    } catch (error) {
        console.error("Erro ao salvar aula:", error);
        alert("Erro ao salvar aula. Verifique os dados e tente novamente.");
    } finally {
        btnSalvarAula.disabled = false;
    }
}


async function deletarAula(aulaId) {
    if (!aulaId) return;
    const aulaRef = doc(db, "turmas", turmaId, "cronograma", aulaId);
    try {
        const aulaSnap = await getDoc(aulaRef);
        if (aulaSnap.exists() && aulaSnap.data().isExtra === true) {
            if (!confirm("Tem certeza que deseja excluir esta aula extra? O cronograma será recalculado.")) return;
            await deleteDoc(aulaRef);
            alert("Aula extra excluída com sucesso. O cronograma será reajustado.");
        } else {
            alert("Apenas aulas extras podem ser excluídas.");
        }
    } catch (error) {
        console.error("Erro ao deletar aula:", error);
        alert("Ocorreu um erro ao tentar excluir a aula.");
    }
}


function abrirModalRecessos() {
    if (!modalRecessos || !formRecesso || !recessoListContainer) return;
    formRecesso.reset();
    escutarRecessos(); // Atualiza a lista ao abrir
    modalRecessos.classList.add('visible');
}


function escutarRecessos() {
    if (!recessoListContainer) return;
    const recessosRef = collection(db, "turmas", turmaId, "recessos");
    const q = query(recessosRef, orderBy("dataInicio")); // Ordena por data de início
    onSnapshot(q, (snapshot) => {
        let listItems = [];
        if (snapshot.empty) {
            listItems.push('<li>Nenhum recesso cadastrado.</li>');
        } else {
            snapshot.forEach(doc => {
                const recesso = doc.data();
                const inicio = recesso.dataInicio.toDate().toLocaleDateString('pt-BR', { timeZone: 'UTC' });
                const fim = recesso.dataFim.toDate().toLocaleDateString('pt-BR', { timeZone: 'UTC' });
                listItems.push(`<li><span>De ${inicio} até ${fim}</span><button class="icon-btn delete" data-id="${doc.id}" title="Excluir Recesso"><i class="fas fa-trash-alt"></i></button></li>`);
            });
        }
        recessoListContainer.innerHTML = listItems.join('');
    });
}


async function salvarRecesso(event) {
    event.preventDefault();
    if (!inputRecessoInicio || !inputRecessoFim || !formRecesso) return;
    const dataInicio = inputRecessoInicio.value;
    const dataFim = inputRecessoFim.value;
    if (!dataInicio || !dataFim || new Date(dataFim) < new Date(dataInicio)) {
        return alert("Por favor, selecione uma data de início e fim válidas (a data fim não pode ser anterior à data início).");
    }
    const btnSubmit = formRecesso.querySelector('button[type="submit"]');
    if (btnSubmit) btnSubmit.disabled = true; // Desabilita o botão ao enviar

    try {
        const recessosRef = collection(db, "turmas", turmaId, "recessos");
        await addDoc(recessosRef, {
            dataInicio: Timestamp.fromDate(new Date(dataInicio + 'T00:00:00')),
            dataFim: Timestamp.fromDate(new Date(dataFim + 'T00:00:00'))
        });
        formRecesso.reset();
        alert("Recesso adicionado. O cronograma será reajustado.");
    } catch (error) {
        console.error("Erro ao salvar recesso:", error);
        alert("Erro ao adicionar recesso.");
    } finally {
        if (btnSubmit) btnSubmit.disabled = false; // Reabilita o botão
    }
}


async function deletarRecesso(recessoId) {
    if (!recessoId) return;
    if (!confirm("Tem certeza que deseja remover este período de recesso? O cronograma será recalculado.")) return;
    try {
        const recessoRef = doc(db, "turmas", turmaId, "recessos", recessoId);
        await deleteDoc(recessoRef);
        alert("Recesso removido. O cronograma será reajustado.");
    } catch (error) {
        console.error("Erro ao deletar recesso:", error);
        alert("Erro ao remover recesso.");
    }
}


async function marcarRecessoDeAulaUnica(aulaDataISO, aulaTitulo) {
    const dataObj = new Date(aulaDataISO);
    const dataUTC = new Date(Date.UTC(dataObj.getUTCFullYear(), dataObj.getUTCMonth(), dataObj.getUTCDate()));
    const dataFormatada = dataUTC.toLocaleDateString('pt-BR', { timeZone: 'UTC' });
    const confirmacao = confirm(`Tem certeza que deseja marcar o dia ${dataFormatada} como um recesso?\n\nA aula "${aulaTitulo}" e todas as aulas seguintes serão reagendadas automaticamente.`);
    if (confirmacao) {
        try {
            const recessosRef = collection(db, "turmas", turmaId, "recessos");
            await addDoc(recessosRef, {
                dataInicio: Timestamp.fromDate(dataUTC),
                dataFim: Timestamp.fromDate(dataUTC)
            });
            alert("Recesso de um dia adicionado com sucesso! O cronograma será reajustado.");
        } catch (error) {
            console.error("Erro ao marcar recesso de aula única:", error);
            alert("Ocorreu um erro ao tentar marcar o recesso.");
        }
    }
}


async function abrirModalFrequencia(aulaId, aulaTitulo) {
    if (!modalFrequencia || !modalFrequenciaTitulo || !frequenciaListContainer) return;
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
            frequenciasSalvas.set(doc.data().participanteId, doc.data().status);
        });

        let listHTML = '';
        if (participantesSnapshot.empty) {
            listHTML = '<li>Nenhum participante inscrito nesta turma.</li>';
        } else {
            participantesSnapshot.forEach(doc => {
                const participanteDocId = doc.id;
                const participante = doc.data();
                const participanteIdOriginal = participante.participanteId;

                const statusAtual = frequenciasSalvas.get(participanteIdOriginal) || null;

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
        }
        frequenciaListContainer.innerHTML = listHTML;
    } catch (error) {
        console.error("Erro ao carregar lista de chamada:", error);
        frequenciaListContainer.innerHTML = '<li>Erro ao carregar participantes.</li>';
    }
}


async function salvarFrequencia() {
    if (!currentAulaIdParaFrequencia || !btnSalvarFrequencia || !frequenciaListContainer) return;
    btnSalvarFrequencia.disabled = true;

    const batch = writeBatch(db);
    const items = frequenciaListContainer.querySelectorAll('.attendance-item');

    let algumaFrequenciaAlterada = false;

    items.forEach(item => {
        const participanteIdOriginal = item.dataset.participanteId;
        const participanteDocId = item.dataset.participanteDocId;

        if (!participanteIdOriginal || !participanteDocId) {
            console.error("Item da lista de frequência com IDs faltando:", item);
            return;
        }

        const status = item.dataset.status || 'ausente';

        const frequenciaDocId = `${currentAulaIdParaFrequencia}_${participanteIdOriginal}`;
        const frequenciaRef = doc(db, "turmas", turmaId, "frequencias", frequenciaDocId);

        batch.set(frequenciaRef, {
            aulaId: currentAulaIdParaFrequencia,
            participanteId: participanteIdOriginal,
            participanteDocId: participanteDocId,
            status: status,
            turmaId: turmaId,
            registradoEm: serverTimestamp()
        });
        algumaFrequenciaAlterada = true;
    });

    if (algumaFrequenciaAlterada || items.length === 0) {
        const aulaRef = doc(db, "turmas", turmaId, "cronograma", currentAulaIdParaFrequencia);
        batch.update(aulaRef, { status: 'realizada' });
    } else {
        console.log("Nenhuma frequência alterada, aula não marcada como realizada.");
    }


    try {
        await batch.commit();
        alert("Frequência salva com sucesso!");
        if (modalFrequencia) modalFrequencia.classList.remove('visible');
    } catch (error) {
        console.error("Erro ao salvar frequência:", error);
        alert("Ocorreu um erro ao salvar a frequência. Verifique o console.");
    } finally {
        btnSalvarFrequencia.disabled = false;
    }
}


// --- NOVAS FUNÇÕES DE RELATÓRIO ---
async function getDadosCompletosParaRelatorio() {
    const participantesRef = collection(db, "turmas", turmaId, "participantes");
    const cronogramaRef = collection(db, "turmas", turmaId, "cronograma");
    const frequenciasRef = collection(db, "turmas", turmaId, "frequencias");

    try {
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
    } catch (error) {
        console.error("Erro ao buscar dados completos para relatório:", error);
        return { participantes: [], cronograma: [], frequenciasMap: new Map() };
    }
}
// ==========================================================
// ## FUNÇÃO AUXILIAR PARA CARREGAR IMAGENS DO CERTIFICADO ##
// ==========================================================
function precarregarImagem(url) {
    return new Promise((resolve) => {
        if (!url) {
            // Se a URL for nula (ex: sem assinatura), resolve com null
            resolve(null);
            return;
        }
        const img = new Image();
        // Essencial para o html2canvas ler imagens de outro domínio (Firebase Storage)
        img.crossOrigin = "Anonymous"; 
        img.onload = () => resolve(img);
        img.onerror = () => {
            console.warn(`Falha ao precarregar imagem: ${url}`);
            resolve(null); // Resolve com null para não quebrar o Promise.all
        };
        img.src = url;
    });
}
// ==========================================================

async function gerarDiarioDeClasse() {
    if (!areaRelatorioGerado) return;
    areaRelatorioGerado.innerHTML = '<p>Gerando diário de classe...</p>';
    if (btnImprimirRelatorio) btnImprimirRelatorio.classList.add('hidden');

    const { participantes, cronograma, frequenciasMap } = await getDadosCompletosParaRelatorio();

    if (participantes.length === 0 || cronograma.length === 0) {
        areaRelatorioGerado.innerHTML = '<p>Não há participantes ou aulas suficientes para gerar o diário.</p>';
        return;
    }

    let tableHTML = `<div class="table-container"><table id="report-table"><thead><tr><th>Aluno (${participantes.length})</th>`;
    cronograma.forEach(aula => {
        const dataFormatada = aula.dataAgendada.toDate().toLocaleDateString('pt-BR', { month: '2-digit', day: '2-digit' });
        tableHTML += `<th title="${aula.titulo}">${dataFormatada}</th>`;
    });
    tableHTML += '<th>Freq.%</th></tr></thead><tbody>';

    participantes.forEach(p => {
        tableHTML += `<tr><td>${p.nome}</td>`;
        let presencas = 0;
        let aulasContabilizadas = 0;
        cronograma.forEach(aula => {
            if (aula.status === 'realizada' && !aula.isExtra) {
                aulasContabilizadas++;
                const key = `${aula.id}_${p.participanteId}`;
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
            } else if (!aula.isExtra) {
                tableHTML += `<td>-</td>`;
            } else {
                tableHTML += `<td style="color: #999;" title="Aula Extra">E</td>`;
            }
        });
        const freqPercent = aulasContabilizadas > 0 ? Math.round((presencas / aulasContabilizadas) * 100) : 0;
        tableHTML += `<td>${freqPercent}%</td></tr>`;
    });

    tableHTML += '</tbody></table></div>';
    areaRelatorioGerado.innerHTML = `<h2>Diário de Classe - ${turmaData.nomeDaTurma}</h2>` + tableHTML;
    if (btnImprimirRelatorio) btnImprimirRelatorio.classList.remove('hidden');
}


async function gerarBoletimIndividual() {
    if (!areaRelatorioGerado) return;
    areaRelatorioGerado.innerHTML = '<p>Carregando lista de participantes...</p>';
    if (btnImprimirRelatorio) btnImprimirRelatorio.classList.add('hidden');
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
    areaRelatorioGerado.innerHTML = `<h2>Boletim Individual - ${turmaData.nomeDaTurma}</h2>` + selectHTML;

    const selectElement = document.getElementById('select-boletim-participante');
    if (selectElement) {
        selectElement.addEventListener('change', (e) => {
            const participanteDocId = e.target.value;
            const boletimContent = document.getElementById('boletim-content');
            if (!boletimContent) return;

            if (!participanteDocId) {
                boletimContent.innerHTML = '';
                if (btnImprimirRelatorio) btnImprimirRelatorio.classList.add('hidden');
                return;
            }

            const participante = participantes.find(p => p.id === participanteDocId);
            if (!participante) {
                boletimContent.innerHTML = '<p style="color:red;">Erro: Participante não encontrado na lista.</p>';
                if (btnImprimirRelatorio) btnImprimirRelatorio.classList.add('hidden');
                return;
            }

            const anoAtual = turmaData.anoAtual || 1;
            const avaliacao = participante.avaliacoes ? participante.avaliacoes[anoAtual] : null;

            let boletimHTML = `<div class="boletim-card" style="border: 1px solid #ccc; padding: 15px; border-radius: 8px; margin-top: 10px;"><h4>Boletim de ${participante.nome}</h4>`;
            if (turmaData.isEAE && avaliacao) {
                boletimHTML += `
                    <p><strong>Frequência:</strong> ${avaliacao.notaFrequencia ?? 0}%</p>
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
                boletimHTML += `<p><strong>Frequência:</strong> ${avaliacao.notaFrequencia || 0}%</p><p>Não há outras notas para este curso.</p>`;
            } else {
                boletimHTML += `<p><strong>Frequência:</strong> 0%</p><p>Não há notas lançadas para este curso.</p>`;
            }
            boletimHTML += '</div>';
            boletimContent.innerHTML = boletimHTML;
            if (btnImprimirRelatorio) btnImprimirRelatorio.classList.remove('hidden');
        });
    }
}


async function gerarRelatorioAptosCertificado() {
    if (!areaRelatorioGerado) return;
    areaRelatorioGerado.innerHTML = '<p>Gerando relatório final...</p>';
    if (btnImprimirRelatorio) btnImprimirRelatorio.classList.add('hidden');
    const { participantes } = await getDadosCompletosParaRelatorio();

    if (participantes.length === 0) {
        areaRelatorioGerado.innerHTML = '<p>Nenhum participante na turma.</p>';
        return;
    }

    let tableHTML = '<div class="table-container"><table id="report-table"><thead><tr><th>Aluno</th><th>Status Final</th></tr></thead><tbody>';
    const anoAtual = turmaData.anoAtual || 1;
    let aptosCount = 0;

    participantes.forEach(p => {
        let statusFinal = 'Em Andamento';
        let isApto = false;
        const avaliacao = p.avaliacoes ? p.avaliacoes[anoAtual] : null;

        if (turmaData.isEAE) {
            statusFinal = avaliacao ? avaliacao.statusAprovacao : 'Pendente';
            if (statusFinal === 'Aprovado') isApto = true;
        } else {
            const freq = avaliacao ? avaliacao.notaFrequencia : 0;
            if (freq >= 75) {
                statusFinal = 'Aprovado';
                isApto = true;
            } else {
                statusFinal = 'Reprovado por Frequência';
            }
        }
        if (isApto) aptosCount++;
        tableHTML += `<tr><td>${p.nome}</td><td>${statusFinal}</td></tr>`;
    });

    tableHTML += '</tbody></table></div>';
    areaRelatorioGerado.innerHTML = `<h2>Relatório Final para Certificado - ${turmaData.nomeDaTurma} (${aptosCount} aptos)</h2>` + tableHTML;
    if (btnImprimirRelatorio) btnImprimirRelatorio.classList.remove('hidden');
}


async function gerarCertificados() {
    const podeGerenciar = userIsAdminGlobal || (userIsFacilitatorDaTurma && userIsAdminEducacional);
    if (!podeGerenciar) {
        return alert("Você não tem permissão para gerar certificados para esta turma.");
    }

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
            if (aprovado) alunosAprovados.push(participante);
        });

        if (alunosAprovados.length === 0) {
            return alert("Nenhum aluno aprovado encontrado para gerar certificados.");
        }

        let dirigenteEncontrado = null;
        const facilitadoresIds = turmaData.facilitadoresIds || [];

        for (const facilitadorId of facilitadoresIds) {
            const voluntarioRef = doc(db, "voluntarios", facilitadorId);
            const voluntarioDoc = await getDoc(voluntarioRef);

            if (voluntarioDoc.exists()) {
                const voluntarioData = voluntarioDoc.data();
                if (voluntarioData.role === 'dirigente-escola') {
                    if (voluntarioData.assinaturaUrl) {
                        dirigenteEncontrado = voluntarioData;
                        console.log(`Dirigente encontrado: ${voluntarioData.nome}, Assinatura: ${voluntarioData.assinaturaUrl}`);
                        break;
                    } else {
                        console.warn(`Voluntário ${voluntarioData.nome} (ID: ${facilitadorId}) é Dirigente, mas não tem assinaturaUrl cadastrada.`);
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
            console.warn(`Nenhum 'dirigente-escola' encontrado entre os facilitadores da turma ${turmaId}.`);
            dirigenteEncontrado = { nome: "Dirigente Não Definido", assinaturaUrl: null };
        } else if (!dirigenteEncontrado.assinaturaUrl) {
            console.warn(`O dirigente ${dirigenteEncontrado.nome} não possui URL de assinatura.`);
        }

        const [dirigenteImg, presidenteImg, logoImg] = await Promise.all([
            precarregarImagem(dirigenteEncontrado.assinaturaUrl),
            precarregarImagem(presidenteData.presidenteAssinaturaUrl),
            precarregarImagem('/logo-cepat.png')
        ]);

        if (certAssinaturaDirigenteImg) certAssinaturaDirigenteImg.src = dirigenteImg ? dirigenteImg.src : "";
        if (certAssinaturaPresidenteImg) certAssinaturaPresidenteImg.src = presidenteImg ? presidenteImg.src : "";
        const logoElement = document.getElementById('logo-cepat-cert');
        if (logoElement) logoElement.src = logoImg ? logoImg.src : "";

        const certificateWrapper = document.getElementById('certificate-wrapper');
        if (!certificateWrapper) throw new Error("Elemento do certificado não encontrado no DOM.");


        for (const aluno of alunosAprovados) {
            if (certAlunoNome) certAlunoNome.textContent = aluno.nome.toUpperCase();
            if (certCursoNome) certCursoNome.textContent = turmaData.isEAE ? `${turmaData.nomeDaTurma} da ${turmaData.cursoNome}` : turmaData.cursoNome;
            const dataInicio = turmaData.dataInicio.toDate();
            const dataFim = new Date();
            if (certPeriodo) certPeriodo.textContent = `realizado no período de ${dataInicio.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })} a ${dataFim.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}`;
            if (certDataEmissao) certDataEmissao.textContent = `Santa Bárbara d'Oeste, ${new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })}`;
            if (certNomeDirigente) certNomeDirigente.textContent = dirigenteEncontrado.nome;
            if (certNomePresidente) certNomePresidente.textContent = presidenteData.presidenteNome;

            await new Promise(resolve => setTimeout(resolve, 100));

            const canvas = await html2canvas(certificateWrapper, {
                useCORS: true,
                allowTaint: true,
                scale: 2
            });

            const imgData = canvas.toDataURL('image/png');
            const pdf = new jsPDF({ orientation: 'landscape', unit: 'px', format: [1024, 728] });
            pdf.addImage(imgData, 'PNG', 0, 0, 1024, 728);

            pdf.save(`Certificado - ${aluno.nome}.pdf`);
        }

        alert(`${alunosAprovados.length} certificados gerados com sucesso!`);

    } catch (error) {
        console.error("Erro ao gerar certificados:", error);
        alert(`Ocorreu um erro ao gerar os certificados: ${error.message}. Verifique o console.`);
    }
}


// --- EVENTOS ---
tabs.forEach(tab => {
    tab.addEventListener('click', () => {
        tabs.forEach(item => item.classList.remove('active'));
        tab.classList.add('active');
        const targetTab = document.getElementById(tab.dataset.tab);
        tabContents.forEach(content => content.classList.remove('active'));
        if (targetTab) targetTab.classList.add('active'); // Verifica se targetTab existe
        if (areaRelatorioGerado) areaRelatorioGerado.innerHTML = '';
        if (btnImprimirRelatorio) btnImprimirRelatorio.classList.add('hidden');
    });
});
if (btnInscreverParticipante) btnInscreverParticipante.addEventListener('click', abrirModalInscricao);
if (closeModalInscricaoBtn) closeModalInscricaoBtn.addEventListener('click', () => modalInscricao?.classList.remove('visible')); // Optional chaining
if (modalInscricao) modalInscricao.addEventListener('click', (event) => { if (event.target === modalInscricao) modalInscricao.classList.remove('visible'); });
if (formInscricao) formInscricao.addEventListener('submit', inscreverParticipante);
if (btnCadastrarAluno) btnCadastrarAluno.addEventListener('click', abrirModalNovoAluno);
if (closeModalNovoAlunoBtn) closeModalNovoAlunoBtn.addEventListener('click', () => modalNovoAluno?.classList.remove('visible'));
if (modalNovoAluno) modalNovoAluno.addEventListener('click', (event) => { if (event.target === modalNovoAluno) modalNovoAluno.classList.remove('visible'); });
if (formNovoAluno) formNovoAluno.addEventListener('submit', salvarNovoAluno);
if (btnAddAulaExtra) btnAddAulaExtra.addEventListener('click', () => abrirModalAula(null, true));
if (closeModalAulaBtn) closeModalAulaBtn.addEventListener('click', () => modalAula?.classList.remove('visible'));
if (modalAula) modalAula.addEventListener('click', (event) => { if (event.target === modalAula) modalAula.classList.remove('visible'); });
if (formAula) formAula.addEventListener('submit', salvarAula);
if (cronogramaTableBody) cronogramaTableBody.addEventListener('click', (event) => {
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
if (btnGerenciarRecessos) btnGerenciarRecessos.addEventListener('click', abrirModalRecessos);
if (closeModalRecessosBtn) closeModalRecessosBtn.addEventListener('click', () => modalRecessos?.classList.remove('visible'));
if (modalRecessos) modalRecessos.addEventListener('click', (event) => { if (event.target === modalRecessos) modalRecessos.classList.remove('visible'); });
if (formRecesso) formRecesso.addEventListener('submit', salvarRecesso);
if (recessoListContainer) recessoListContainer.addEventListener('click', (event) => {
    const target = event.target.closest('button.delete');
    if (target && target.dataset.id) {
        deletarRecesso(target.dataset.id);
    }
});
if (participantesTableBody) participantesTableBody.addEventListener('click', (event) => {
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
if (formNotas) formNotas.addEventListener('submit', salvarNotas);
if (closeModalNotasBtn) closeModalNotasBtn.addEventListener('click', () => modalNotas?.classList.remove('visible'));
if (modalNotas) modalNotas.addEventListener('click', (event) => { if (event.target === modalNotas) modalNotas.classList.remove('visible'); });
if (btnAvancarAno) btnAvancarAno.addEventListener('click', avancarAnoDaTurma);
if (frequenciaListContainer) frequenciaListContainer.addEventListener('click', (event) => {
    if (event.target.classList.contains('btn-status')) {
        const targetBtn = event.target;
        const parentItem = targetBtn.closest('.attendance-item');
        if (!parentItem) return; // Adiciona verificação
        const status = targetBtn.dataset.status;
        parentItem.dataset.status = status;
        parentItem.querySelectorAll('.btn-status').forEach(btn => btn.classList.remove('active'));
        targetBtn.classList.add('active');
    }
});
if (btnSalvarFrequencia) btnSalvarFrequencia.addEventListener('click', salvarFrequencia);
if (closeModalFrequenciaBtn) closeModalFrequenciaBtn.addEventListener('click', () => modalFrequencia?.classList.remove('visible'));
if (modalFrequencia) modalFrequencia.addEventListener('click', (event) => { if (event.target === modalFrequencia) modalFrequencia.classList.remove('visible'); });
if (reportMenuContainer) reportMenuContainer.addEventListener('click', (event) => {
    event.preventDefault();
    const target = event.target.closest('a');
    if (!target || !target.dataset.report) return;
    if (target.classList.contains('disabled')) return;
    const reportType = target.dataset.report;
    if (areaRelatorioGerado) areaRelatorioGerado.innerHTML = ''; // Limpa área antes de gerar novo relatório
    if (btnImprimirRelatorio) btnImprimirRelatorio.classList.add('hidden'); // Esconde botão de imprimir
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
if (btnImprimirRelatorio) btnImprimirRelatorio.addEventListener('click', () => {
    window.print();
});