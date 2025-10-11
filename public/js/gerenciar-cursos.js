import { initializeApp } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-auth.js";
import { getFirestore, collection, query, where, getDocs, doc, getDoc, addDoc, updateDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js";

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
const coursesGridContainer = document.getElementById('courses-grid-container');
const btnCriarCurso = document.getElementById('btn-criar-curso');
const modalCurso = document.getElementById('modal-curso');
const closeModalCursoBtn = document.getElementById('close-modal-curso');
const modalCursoTitulo = document.getElementById('modal-curso-titulo');
const formCurso = document.getElementById('form-curso');
const inputCursoId = document.getElementById('curso-id');
const inputCursoNome = document.getElementById('curso-nome');
const inputCursoDescricao = document.getElementById('curso-descricao');
const inputCursoIsEAE = document.getElementById('curso-is-eae');
const btnSalvarCurso = document.getElementById('btn-salvar-curso');

// --- VERIFICAÇÃO DE PERMISSÃO ---
onAuthStateChanged(auth, async (user) => {
    if (user) {
        // CORREÇÃO APLICADA AQUI:
        // Buscamos o perfil do voluntário pelo 'authUid' que é a forma correta e mais segura.
        const voluntariosRef = collection(db, "voluntarios");
        const q = query(voluntariosRef, where("authUid", "==", user.uid), limit(1));
        const querySnapshot = await getDocs(q);

        if (!querySnapshot.empty) {
            const userProfile = querySnapshot.docs[0].data();
            const userCargos = userProfile.cargos; // O campo correto é 'cargos', que é um array

            // Verificamos se 'cargos' é um array e se ele inclui as permissões necessárias.
            if (Array.isArray(userCargos) && (userCargos.includes('super-admin') || userCargos.includes('diretor'))) {
                // Permissão concedida
                carregarCursos();
            } else {
                // Permissão negada
                document.body.innerHTML = '<h1>Acesso Negado</h1><p>Você não tem permissão para acessar esta página.</p>';
            }
        } else {
            document.body.innerHTML = '<h1>Acesso Negado</h1><p>Seu perfil de voluntário não foi encontrado.</p>';
        }
    } else {
        window.location.href = '/index.html'; // Redireciona para login se não estiver autenticado
    }
});

// --- FUNÇÕES ---
function carregarCursos() {
    const cursosRef = collection(db, "cursos");
    onSnapshot(cursosRef, (snapshot) => {
        if (!coursesGridContainer) return;
        coursesGridContainer.innerHTML = '';
        if (snapshot.empty) {
            coursesGridContainer.innerHTML = '<p>Nenhum gabarito de curso cadastrado. Clique em "Criar Novo Gabarito" para começar.</p>';
            return;
        }
        snapshot.forEach(doc => {
            const curso = doc.data();
            const cursoId = doc.id;
            const card = document.createElement('div');
            card.className = 'course-card';
            card.innerHTML = `
                <h3>${curso.nome}</h3>
                ${curso.isEAE ? '<span class="eae-badge">⭐ Curso EAE</span>' : ''}
                <div class="actions">
                    <button class="btn btn-secondary btn-action" data-action="edit" data-id="${cursoId}">Ver Detalhes</button>
                    <button class="btn btn-primary btn-action" data-action="curriculo" data-id="${cursoId}">Editar Currículo</button>
                </div>
            `;
            coursesGridContainer.appendChild(card);
        });
    });
}

function abrirModal(cursoId = null) {
    formCurso.reset();
    inputCursoId.value = '';

    if (cursoId) {
        modalCursoTitulo.textContent = 'Editar Gabarito';
        const cursoRef = doc(db, "cursos", cursoId);
        getDoc(cursoRef).then(docSnap => {
            if (docSnap.exists()) {
                const data = docSnap.data();
                inputCursoId.value = docSnap.id;
                inputCursoNome.value = data.nome;
                inputCursoDescricao.value = data.descricao || '';
                inputCursoIsEAE.checked = data.isEAE || false;
            }
        });
    } else {
        modalCursoTitulo.textContent = 'Criar Novo Gabarito';
    }
    modalCurso.classList.add('visible');
}

async function salvarCurso(event) {
    event.preventDefault();
    const id = inputCursoId.value;
    const dadosCurso = {
        nome: inputCursoNome.value.trim(),
        descricao: inputCursoDescricao.value.trim(),
        isEAE: inputCursoIsEAE.checked
    };

    btnSalvarCurso.disabled = true;
    btnSalvarCurso.textContent = 'Salvando...';

    try {
        if (id) {
            const cursoRef = doc(db, "cursos", id);
            await updateDoc(cursoRef, dadosCurso);
        } else {
            await addDoc(collection(db, "cursos"), dadosCurso);
        }
        modalCurso.classList.remove('visible');
    } catch (error) {
        console.error("Erro ao salvar curso:", error);
        alert("Ocorreu um erro ao salvar. Tente novamente.");
    } finally {
        btnSalvarCurso.disabled = false;
        btnSalvarCurso.textContent = 'Salvar Gabarito';
    }
}

// --- EVENTOS ---
if(btnCriarCurso) btnCriarCurso.addEventListener('click', () => abrirModal());
if(closeModalCursoBtn) closeModalCursoBtn.addEventListener('click', () => modalCurso.classList.remove('visible'));
if(modalCurso) modalCurso.addEventListener('click', (event) => {
    if (event.target === modalCurso) {
        modalCurso.classList.remove('visible');
    }
});
if(formCurso) formCurso.addEventListener('submit', salvarCurso);

if(coursesGridContainer) coursesGridContainer.addEventListener('click', (event) => {
    const target = event.target;
    if (target.tagName === 'BUTTON' && target.dataset.action) {
        const action = target.dataset.action;
        const id = target.dataset.id;
        if (action === 'edit') {
            abrirModal(id);
        } else if (action === 'curriculo') {
            window.location.href = `/editar-curriculo.html?cursoId=${id}`;
        }
    }
});