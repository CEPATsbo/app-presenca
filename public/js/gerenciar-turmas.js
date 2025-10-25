import { initializeApp } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-auth.js";
import { getFirestore, collection, query, where, getDocs, doc, addDoc, onSnapshot, orderBy, limit, serverTimestamp, Timestamp } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js";

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
const mainContent = document.getElementById('main-content');
const acessoNegadoContainer = document.getElementById('acesso-negado');

// ### AJUSTE: Guarda o ID do perfil do usuário logado ###
let currentUserProfileId = null;

// --- VERIFICAÇÃO DE PERMISSÃO ---
onAuthStateChanged(auth, async (user) => {
    if (user) {
        try {
            // Pega perfil e claims
            const voluntariosRef = collection(db, "voluntarios");
            const userQuery = query(voluntariosRef, where("authUid", "==", user.uid), limit(1));
            const userSnapshot = await getDocs(userQuery);

            if (userSnapshot.empty) {
                throw new Error("Perfil de voluntário não encontrado.");
            }
            const userProfile = { id: userSnapshot.docs[0].id, ...userSnapshot.docs[0].data() };
            currentUserProfileId = userProfile.id; // <-- Guarda o ID do Firestore

            const idTokenResult = await user.getIdTokenResult(true);
            const claims = idTokenResult.claims || {};

            const rolesPermitidasPagina = [
                'super-admin', 'diretor', 'tesoureiro',
                'dirigente-escola', 'secretario-escola'
                // Facilitador comum NÃO entra aqui, pois ele acessa via Meu CEPAT
            ];
            const rolesAdminGlobal = [
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

            // Verifica se é admin global
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

            if (temPermissaoPagina) {
                 mainContent.style.display = 'block';
                 acessoNegadoContainer.style.display = 'none';

                if (isAdminGlobal) {
                    btnIniciarTurma.style.display = 'inline-flex'; // Usa inline-flex por causa do ícone
                } else {
                    btnIniciarTurma.style.display = 'none';
                }

                // ### AJUSTE: Passa isAdminGlobal e ID do usuário para carregarTurmas ###
                carregarTurmas(isAdminGlobal, currentUserProfileId);
            } else {
                mainContent.style.display = 'none';
                acessoNegadoContainer.style.display = 'block';
            }
        } catch (error) {
             console.error("Erro ao verificar permissões em gerenciar-turmas:", error);
             mainContent.style.display = 'none';
             acessoNegadoContainer.style.display = 'block';
             // Mostra o erro no container de acesso negado para depuração
             acessoNegadoContainer.innerHTML = `<h1>Erro</h1><p>${error.message}</p><a href="/dashboard.html">Voltar</a>`;
        }
    } else {
        window.location.href = '/login.html';
    }
});

// --- FUNÇÕES ---

// ### AJUSTE: Função agora recebe parâmetros para a query condicional ###
function carregarTurmas(isUserAdminGlobal, userFirestoreId) {
    const turmasRef = collection(db, "turmas");
    let q; // Declara a query

    if (isUserAdminGlobal) {
        // Admins globais veem todas as turmas
        console.log("Carregando TODAS as turmas (Admin Global)");
        q = query(turmasRef, orderBy("nomeDaTurma"));
    } else {
        // Dirigentes/Secretários veem apenas as turmas onde são facilitadores
        console.log(`Carregando turmas onde o usuário ${userFirestoreId} é facilitador.`);
        q = query(turmasRef,
                  where("facilitadoresIds", "array-contains", userFirestoreId),
                  orderBy("nomeDaTurma"));
    }
    // ### FIM DO AJUSTE ###

    onSnapshot(q, (snapshot) => {
        turmasGridContainer.innerHTML = '';
        if (snapshot.empty) {
            if (isUserAdminGlobal) {
                turmasGridContainer.innerHTML = '<p>Nenhuma turma cadastrada. Clique em "Iniciar Nova Turma" para começar.</p>';
            } else {
                 turmasGridContainer.innerHTML = '<p>Você não está listado como facilitador em nenhuma turma ativa.</p>';
            }
            return;
        }
        snapshot.forEach(doc => {
            const turma = doc.data();
            const turmaId = doc.id;
            const card = document.createElement('div');
            card.className = 'turma-card';
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
    }, (error) => { // Adiciona tratamento de erro para o onSnapshot
        console.error("Erro ao carregar turmas:", error);
        turmasGridContainer.innerHTML = '<p style="color: red;">Erro ao carregar a lista de turmas. Verifique o console.</p>';
        // Se o erro for de índice, pode adicionar a mensagem específica
        if (error.code === 'failed-precondition') {
             turmasGridContainer.innerHTML += '<p style="color: orange;">Pode ser necessário criar um índice no Firestore. Verifique o link no console de erro.</p>';
        }
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
            facilitadores: facilitadores,
            facilitadoresIds: facilitadoresIds,
            dataInicio: dataInicioTimestamp,
            diaDaSemana: parseInt(diaSemanaValue, 10),
            status: "Ativa",
            anoAtual: isEAE ? 1 : null,
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

// Adiciona a div de acesso negado ao HTML se não existir (Mantido como segurança)
if (!document.getElementById('acesso-negado')) {
    const divAcessoNegado = document.createElement('div');
    divAcessoNegado.id = 'acesso-negado';
    divAcessoNegado.style.display = 'none'; // Começa escondida
    divAcessoNegado.innerHTML = '<h1>Acesso Negado</h1><p>Você não tem permissão para acessar esta página.</p>';
    document.body.appendChild(divAcessoNegado);
}