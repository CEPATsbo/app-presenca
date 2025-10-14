import { initializeApp } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-auth.js";
import { getFirestore, collection, query, where, getDocs, doc, addDoc, onSnapshot, orderBy, limit, serverTimestamp } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js";

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

// --- VERIFICAÇÃO DE PERMISSÃO ---
onAuthStateChanged(auth, async (user) => {
    if (user) {
        const voluntariosRef = collection(db, "voluntarios");
        const q = query(voluntariosRef, where("authUid", "==", user.uid), limit(1));
        const querySnapshot = await getDocs(q);
        if (!querySnapshot.empty) {
            const userProfile = querySnapshot.docs[0].data();
            const userRole = userProfile.role;
            if (userRole === 'super-admin' || userRole === 'diretor') {
                carregarTurmas();
            } else {
                document.body.innerHTML = '<h1>Acesso Negado</h1><p>Você não tem permissão para acessar esta página.</p>';
            }
        } else {
            document.body.innerHTML = '<h1>Acesso Negado</h1><p>Seu perfil de voluntário não foi encontrado.</p>';
        }
    } else {
        window.location.href = '/index.html';
    }
});

// --- FUNÇÕES ---
function carregarTurmas() {
    const turmasRef = collection(db, "turmas");
    onSnapshot(turmasRef, (snapshot) => {
        turmasGridContainer.innerHTML = '';
        if (snapshot.empty) {
            turmasGridContainer.innerHTML = '<p>Nenhuma turma cadastrada. Clique em "Iniciar Nova Turma" para começar.</p>';
            return;
        }
        snapshot.forEach(doc => {
            const turma = doc.data();
            const turmaId = doc.id;
            const card = document.createElement('div');
            card.className = 'turma-card';
            card.innerHTML = `
                <h3>${turma.nomeDaTurma}</h3>
                <p><strong>Curso Base:</strong> ${turma.cursoNome}</p>
                ${turma.isEAE ? `<p><strong>Ano Atual:</strong> ${turma.anoAtual || 1}</p>` : ''}
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
    // Carregar Gabaritos de Cursos
    selectCursoGabarito.innerHTML = '<option value="">Selecione um gabarito</option>';
    const cursosSnapshot = await getDocs(collection(db, "cursos"));
    cursosSnapshot.forEach(doc => {
        const option = document.createElement('option');
        option.value = doc.id;
        option.textContent = doc.data().nome;
        option.dataset.isEae = doc.data().isEAE || false;
        selectCursoGabarito.appendChild(option);
    });

    // Carregar Voluntários
    selectFacilitadores.innerHTML = '';
    const voluntariosSnapshot = await getDocs(collection(db, "voluntarios"));
    
    const voluntariosOrdenados = voluntariosSnapshot.docs.sort((a, b) => {
        return a.data().nome.localeCompare(b.data().nome);
    });

    voluntariosOrdenados.forEach(doc => {
        const option = document.createElement('option');
        option.value = doc.id;
        option.textContent = doc.data().nome;
        selectFacilitadores.appendChild(option);
    });
}

function abrirModalTurma() {
    formTurma.reset();
    carregarDadosParaModal();
    modalTurma.classList.add('visible');
}

async function salvarTurma(event) {
    event.preventDefault();
    const nomeDaTurma = inputTurmaNome.value.trim();
    const cursoGabaritoId = selectCursoGabarito.value;
    const selectedOptionsFacilitadores = Array.from(selectFacilitadores.selectedOptions);
    
    if (!nomeDaTurma || !cursoGabaritoId || selectedOptionsFacilitadores.length === 0) {
        return alert("Por favor, preencha todos os campos.");
    }

    btnSalvarTurma.disabled = true;
    btnSalvarTurma.textContent = 'Criando...';

    const selectedOptionCurso = selectCursoGabarito.options[selectCursoGabarito.selectedIndex];
    const cursoNome = selectedOptionCurso.textContent;
    const isEAE = selectedOptionCurso.dataset.isEae === 'true';

    // ===================================================================
    // ## CORREÇÃO APLICADA AQUI ##
    // Criamos as duas listas de facilitadores: uma com objetos e uma só com os IDs
    // ===================================================================
    const facilitadores = selectedOptionsFacilitadores.map(option => ({ id: option.value, nome: option.textContent }));
    const facilitadoresIds = selectedOptionsFacilitadores.map(option => option.value);

    try {
        await addDoc(collection(db, "turmas"), {
            nomeDaTurma: nomeDaTurma,
            cursoId: cursoGabaritoId,
            cursoNome: cursoNome,
            isEAE: isEAE,
            facilitadores: facilitadores,         // Salva o array de objetos {id, nome}
            facilitadoresIds: facilitadoresIds,   // SALVA O NOVO ARRAY apenas com os IDs
            dataInicio: new Date(inputDataInicio.value + "T12:00:00Z"), // Salva como Data para o robô
            diaDaSemana: parseInt(selectDiaSemana.value, 10),
            status: "Ativa",
            anoAtual: 1,
            criadaEm: serverTimestamp()
        });
        
        modalTurma.classList.remove('visible');
        alert("Turma iniciada com sucesso!");

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