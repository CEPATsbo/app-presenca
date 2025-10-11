import { initializeApp } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-auth.js";
import { getFirestore, collection, query, where, getDocs, doc, getDoc, addDoc, updateDoc, deleteDoc, onSnapshot, orderBy, limit } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js";

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
const cursoTituloHeader = document.getElementById('curso-titulo-header');
const aulasTableBody = document.getElementById('aulas-table-body');
const colunaAno = document.getElementById('coluna-ano');
const btnNovaAula = document.getElementById('btn-nova-aula');
const modalAula = document.getElementById('modal-aula');
const closeModalAulaBtn = document.getElementById('close-modal-aula');
const modalAulaTitulo = document.getElementById('modal-aula-titulo');
const formAula = document.getElementById('form-aula');
const inputAulaId = document.getElementById('aula-id');
const inputAulaNumero = document.getElementById('aula-numero');
const inputAulaTitulo = document.getElementById('aula-titulo');
const formGroupAno = document.getElementById('form-group-ano');
const selectAulaAno = document.getElementById('aula-ano');
const btnSalvarAula = document.getElementById('btn-salvar-aula');

let cursoId = null;
let cursoIsEAE = false;

// --- VERIFICAÇÃO DE PERMISSÃO E CARREGAMENTO INICIAL ---
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
                cursoId = params.get('cursoId');
                if (cursoId) {
                    carregarDetalhesDoCursoEAulas();
                } else {
                    document.body.innerHTML = '<h1>Erro</h1><p>ID do curso não encontrado na URL.</p>';
                }
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
async function carregarDetalhesDoCursoEAulas() {
    const cursoRef = doc(db, "cursos", cursoId);
    const cursoSnap = await getDoc(cursoRef);

    if (cursoSnap.exists()) {
        const cursoData = cursoSnap.data();
        cursoTituloHeader.innerHTML = `<small>Editando Currículo de:</small>${cursoData.nome}`;
        cursoIsEAE = cursoData.isEAE || false;

        if (cursoIsEAE) {
            colunaAno.classList.remove('hidden');
            formGroupAno.classList.remove('hidden');
        }
    }

    const aulasRef = collection(db, "cursos", cursoId, "curriculo");
    const q = query(aulasRef, orderBy("numeroDaAula"));
    
    onSnapshot(q, (snapshot) => {
        aulasTableBody.innerHTML = '';
        if (snapshot.empty) {
            aulasTableBody.innerHTML = '<tr><td colspan="4" style="text-align: center;">Nenhuma aula cadastrada. Clique em "Adicionar Nova Aula" para começar.</td></tr>';
            return;
        }
        snapshot.forEach(doc => {
            const aula = doc.data();
            const aulaId = doc.id;
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${aula.numeroDaAula}</td>
                <td>${aula.titulo}</td>
                ${cursoIsEAE ? `<td>${aula.anoCorrespondente || ''}</td>` : ''}
                <td class="actions">
                    <button class="icon-btn edit" data-action="edit" data-id="${aulaId}"><i class="fas fa-pencil-alt"></i></button>
                    <button class="icon-btn delete" data-action="delete" data-id="${aulaId}"><i class="fas fa-trash-alt"></i></button>
                </td>
            `;
            aulasTableBody.appendChild(tr);
        });
    }, (error) => {
        console.error("Erro no listener de aulas:", error);
        aulasTableBody.innerHTML = '<tr><td colspan="4" style="text-align: center; color: red;">Erro ao carregar aulas. Verifique o console.</td></tr>';
    });
}

function abrirModalAula(aulaId = null) {
    formAula.reset();
    inputAulaId.value = '';

    if (aulaId) {
        modalAulaTitulo.textContent = 'Editar Aula';
        const aulaRef = doc(db, "cursos", cursoId, "curriculo", aulaId);
        getDoc(aulaRef).then(docSnap => {
            if (docSnap.exists()) {
                const data = docSnap.data();
                inputAulaId.value = docSnap.id;
                inputAulaNumero.value = data.numeroDaAula;
                inputAulaTitulo.value = data.titulo;
                if (cursoIsEAE) {
                    selectAulaAno.value = data.anoCorrespondente || '1';
                }
            }
        });
    } else {
        modalAulaTitulo.textContent = 'Adicionar Nova Aula';
    }
    modalAula.classList.add('visible');
}

async function salvarAula(event) {
    event.preventDefault();
    const id = inputAulaId.value;
    const dadosAula = {
        numeroDaAula: Number(inputAulaNumero.value),
        titulo: inputAulaTitulo.value.trim()
    };
    if (cursoIsEAE) {
        dadosAula.anoCorrespondente = selectAulaAno.value;
    }

    btnSalvarAula.disabled = true;
    btnSalvarAula.textContent = 'Salvando...';

    try {
        if (id) {
            // CORREÇÃO: Usar a referência direta ao documento
            const aulaRef = doc(db, "cursos", cursoId, "curriculo", id);
            await updateDoc(aulaRef, dadosAula);
        } else {
            // A adição de um novo documento já estava correta
            const aulasRef = collection(db, "cursos", cursoId, "curriculo");
            await addDoc(aulasRef, dadosAula);
        }
        modalAula.classList.remove('visible');
    } catch (error) {
        console.error("Erro ao salvar aula:", error);
        alert("Ocorreu um erro ao salvar a aula.");
    } finally {
        btnSalvarAula.disabled = false;
        btnSalvarAula.textContent = 'Salvar Aula';
    }
}

async function deletarAula(aulaId) {
    if (!confirm("Tem certeza que deseja excluir esta aula? Esta ação não pode ser desfeita.")) {
        return;
    }
    try {
        // A lógica de exclusão já estava correta, mas a mantemos aqui para consistência.
        const aulaRef = doc(db, "cursos", cursoId, "curriculo", aulaId);
        await deleteDoc(aulaRef);
        // O onSnapshot cuidará de remover a linha da tela automaticamente.
    } catch (error) {
        console.error("Erro ao deletar aula:", error);
        alert("Ocorreu um erro ao excluir a aula.");
    }
}

// --- EVENTOS ---
if(btnNovaAula) btnNovaAula.addEventListener('click', () => abrirModalAula());
if(closeModalAulaBtn) closeModalAulaBtn.addEventListener('click', () => modalAula.classList.remove('visible'));
if(modalAula) modalAula.addEventListener('click', (event) => {
    if (event.target === modalAula) { modalAula.classList.remove('visible'); }
});
if(formAula) formAula.addEventListener('submit', salvarAula);

if(aulasTableBody) aulasTableBody.addEventListener('click', (event) => {
    const target = event.target.closest('button');
    if (target && target.dataset.action) {
        const action = target.dataset.action;
        const id = target.dataset.id;
        if (action === 'edit') {
            abrirModalAula(id);
        } else if (action === 'delete') {
            deletarAula(id);
        }
    }
});