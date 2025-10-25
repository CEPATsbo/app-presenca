import { initializeApp } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-auth.js";
import { getFirestore, collection, query, where, getDocs, doc, addDoc, onSnapshot, orderBy, limit, serverTimestamp, Timestamp } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js"; // Adicionado Timestamp

// --- CONFIGURAÇÕES ---
const firebaseConfig = {
    apiKey: "AIzaSyBV7RPjk3cFTqL-aIpflJcUojKg1ZXMLuU",
    authDomain: "voluntarios-ativos---cepat.firebaseapp.com",
    projectId: "voluntarios-ativos---cepat",
    storageBucket: "voluntarios-ativos---cepat.firebasestorage.app", // Corrigido
    messagingSenderId: "66122858261",
    appId: "1:66122858261:web:7fa21f1805463b5c08331c"
};

// --- INICIALIZAÇÃO ---
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// --- ELEMENTOS DA PÁGINA ---
const turmasGridContainer = document.getElementById('turmas-grid-container');
const btnIniciarTurma = document.getElementById('btn-iniciar-turma');
const modalTurma = document.getElementById('modal-turma');
const closeModalTurmaBtn = document.getElementById('close-modal-turma');
const formTurma = document.getElementById('form-turma');
const inputTurmaNome = document.getElementById('turma-nome');
const selectCursoGabarito = document.getElementById('turma-curso-gabarito');
const selectFacilitadores = document.getElementById('turma-facilitadores');
const inputDataInicio = document.getElementById('turma-data-inicio');
const selectDiaSemana = document.getElementById('turma-dia-semana');
const btnSalvarTurma = document.getElementById('btn-salvar-turma');
// Adiciona referência ao container principal e à mensagem de acesso negado
const mainContent = document.getElementById('main-content');
const acessoNegadoContainer = document.getElementById('acesso-negado');


// --- VERIFICAÇÃO DE PERMISSÃO ---
onAuthStateChanged(auth, async (user) => {
    if (user) {
        try {
            // ### AJUSTE: Pega claims e verifica permissão de forma mais completa ###
            const idTokenResult = await user.getIdTokenResult(true);
            const claims = idTokenResult.claims || {};

            const rolesPermitidasPagina = [ // Quem pode VER esta página
                'super-admin', 'diretor', 'tesoureiro',
                'dirigente-escola', 'secretario-escola'
            ];
            const rolesAdminGlobal = [ // Quem pode CRIAR turmas
                'super-admin', 'diretor', 'tesoureiro'
            ];

            let temPermissaoPagina = false;
            let isAdminGlobal = false;

            // Verifica acesso à página
            if (rolesPermitidasPagina.includes(claims.role)) {
                temPermissaoPagina = true;
            } else {
                for (const role of rolesPermitidasPagina) {
                    if (claims[role] === true) {
                        temPermissaoPagina = true;
                        break;
                    }
                }
            }

            // Verifica se é admin global (para mostrar botão "Iniciar Nova Turma")
             if (rolesAdminGlobal.includes(claims.role)) {
                isAdminGlobal = true;
            } else {
                 for (const role of rolesAdminGlobal) {
                    if (claims[role] === true) {
                        isAdminGlobal = true;
                        break;
                    }
                }
            }
            // ### FIM DO AJUSTE ###

            if (temPermissaoPagina) {
                 mainContent.style.display = 'block'; // Mostra conteúdo principal
                 acessoNegadoContainer.style.display = 'none'; // Esconde msg de erro

                // ### AJUSTE: Mostra/Esconde botão "Iniciar Nova Turma" ###
                if (isAdminGlobal) {
                    btnIniciarTurma.style.display = 'block'; // Só admins globais podem iniciar
                } else {
                    btnIniciarTurma.style.display = 'none';
                }
                // ### FIM DO AJUSTE ###

                carregarTurmas(); // Carrega a lista de turmas
            } else {
                mainContent.style.display = 'none'; // Esconde conteúdo principal
                acessoNegadoContainer.style.display = 'block'; // Mostra msg de erro
            }
        } catch (error) {
             console.error("Erro ao verificar permissões em gerenciar-turmas:", error);
             mainContent.style.display = 'none';
             acessoNegadoContainer.style.display = 'block';
        }
    } else {
        window.location.href = '/login.html'; // Redireciona se não logado
    }
});

// --- FUNÇÕES ---
function carregarTurmas() {
    const turmasRef = collection(db, "turmas");
    // Ordena por nome da turma para melhor visualização
    const q = query(turmasRef, orderBy("nomeDaTurma"));

    onSnapshot(q, (snapshot) => { // Usa a query ordenada
        turmasGridContainer.innerHTML = '';
        if (snapshot.empty) {
            turmasGridContainer.innerHTML = '<p>Nenhuma turma cadastrada. Clique em "Iniciar Nova Turma" para começar (se tiver permissão).</p>';
            return;
        }
        snapshot.forEach(doc => {
            const turma = doc.data();
            const turmaId = doc.id;
            const card = document.createElement('div');
            card.className = 'turma-card';
            // Formata a data de início para exibição
            const dataInicioFormatada = turma.dataInicio ? turma.dataInicio.toDate().toLocaleDateString('pt-BR') : 'N/A';
            card.innerHTML = `
                <h3>${turma.nomeDaTurma}</h3>
                <p><strong>Curso Base:</strong> ${turma.cursoNome || 'N/D'}</p>
                ${turma.isEAE ? `<p><strong>Ano Atual:</strong> ${turma.anoAtual || 1}</p>` : ''}
                <p><strong>Início:</strong> ${dataInicioFormatada}</p>
                <p><strong>Status:</strong> ${turma.status || 'Ativa'}</p>
                <div class="actions">
                    <a href="/detalhes-turma.html?turmaId=${turmaId}" class="btn btn-primary">Gerenciar Turma</a>
                </div>
            `;
            turmasGridContainer.appendChild(card);
        });
    });
}


async function carregarDadosParaModal() {
    // Limpa seletores
    selectCursoGabarito.innerHTML = '<option value="">Carregando cursos...</option>';
    selectFacilitadores.innerHTML = ''; // Limpa completamente

    try {
        // Carrega Cursos
        const cursosSnapshot = await getDocs(query(collection(db, "cursos"), orderBy("nome")));
        selectCursoGabarito.innerHTML = '<option value="">Selecione um gabarito</option>'; // Restaura opção padrão
        cursosSnapshot.forEach(doc => {
            const option = document.createElement('option');
            option.value = doc.id;
            option.textContent = doc.data().nome;
            option.dataset.isEae = doc.data().isEAE || false;
            selectCursoGabarito.appendChild(option);
        });

        // Carrega Voluntários (Facilitadores)
        const voluntariosSnapshot = await getDocs(query(collection(db, "voluntarios"), where("statusVoluntario", "==", "ativo"), orderBy("nome")));
        voluntariosSnapshot.forEach(doc => {
            const option = document.createElement('option');
            option.value = doc.id; // ID do documento do voluntário
            option.textContent = doc.data().nome;
            selectFacilitadores.appendChild(option);
        });
    } catch (error) {
        console.error("Erro ao carregar dados para o modal:", error);
        alert("Erro ao carregar opções. Tente recarregar a página.");
        // Pode desabilitar o botão de salvar ou fechar o modal se preferir
    }
}


function abrirModalTurma() {
    formTurma.reset();
    carregarDadosParaModal(); // Carrega as opções atualizadas
    modalTurma.classList.add('visible');
}

async function salvarTurma(event) {
    event.preventDefault();
    const nomeDaTurma = inputTurmaNome.value.trim();
    const cursoGabaritoId = selectCursoGabarito.value;
    const facilitadoresSelecionados = Array.from(selectFacilitadores.selectedOptions);
    const dataInicioValue = inputDataInicio.value; // ex: "2025-09-24"
    const diaSemanaValue = selectDiaSemana.value;

    if (!nomeDaTurma || !cursoGabaritoId || facilitadoresSelecionados.length === 0 || !dataInicioValue || diaSemanaValue === "") {
        return alert("Por favor, preencha todos os campos obrigatórios.");
    }

    btnSalvarTurma.disabled = true;
    btnSalvarTurma.textContent = 'Criando...';

    const selectedOption = selectCursoGabarito.options[selectCursoGabarito.selectedIndex];
    const cursoNome = selectedOption.textContent;
    const isEAE = selectedOption.dataset.isEae === 'true';

    // Cria os dois arrays de facilitadores (ID e Nome / Apenas ID)
    const facilitadores = facilitadoresSelecionados.map(option => ({ id: option.value, nome: option.textContent }));
    const facilitadoresIds = facilitadoresSelecionados.map(option => option.value);

    // Converte a data string para Timestamp do Firebase (interpretando como UTC 00:00)
    const dataInicioTimestamp = Timestamp.fromDate(new Date(dataInicioValue + 'T00:00:00Z'));

    try {
        await addDoc(collection(db, "turmas"), {
            nomeDaTurma: nomeDaTurma,
            cursoId: cursoGabaritoId,
            cursoNome: cursoNome,
            isEAE: isEAE,
            facilitadores: facilitadores, // Array de {id, nome}
            facilitadoresIds: facilitadoresIds, // Array de IDs (para queries)
            dataInicio: dataInicioTimestamp,
            diaDaSemana: parseInt(diaSemanaValue, 10),
            status: "Ativa",
            anoAtual: isEAE ? 1 : null, // Só define anoAtual se for EAE
            criadaEm: serverTimestamp()
        });

        modalTurma.classList.remove('visible');
        alert("Turma iniciada com sucesso! O cronograma será gerado em segundo plano.");

    } catch (error) {
        console.error("Erro ao iniciar turma:", error);
        alert("Ocorreu um erro ao iniciar a turma. Tente novamente.");
    } finally {
        btnSalvarTurma.disabled = false;
        btnSalvarTurma.textContent = 'Criar Turma e Gerar Cronograma';
    }
}


// --- EVENTOS ---
if(btnIniciarTurma) btnIniciarTurma.addEventListener('click', abrirModalTurma);
if(closeModalTurmaBtn) closeModalTurmaBtn.addEventListener('click', () => modalTurma.classList.remove('visible'));
if(modalTurma) modalTurma.addEventListener('click', (event) => {
    if (event.target === modalTurma) {
        modalTurma.classList.remove('visible');
    }
});
if(formTurma) formTurma.addEventListener('submit', salvarTurma);

// Adiciona a div de acesso negado ao HTML se não existir
if (!document.getElementById('acesso-negado')) {
    const divAcessoNegado = document.createElement('div');
    divAcessoNegado.id = 'acesso-negado';
    divAcessoNegado.style.display = 'none'; // Começa escondida
    divAcessoNegado.innerHTML = '<h1>Acesso Negado</h1><p>Você não tem permissão para acessar esta página.</p>';
    document.body.appendChild(divAcessoNegado);
}