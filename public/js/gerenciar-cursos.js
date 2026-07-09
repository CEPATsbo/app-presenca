import { initializeApp } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-auth.js";
import { getFirestore, collection, query, where, getDocs, doc, getDoc, addDoc, updateDoc, onSnapshot, limit } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js";

// --- CONFIGURAÇÕES ---
const firebaseConfig = {
    apiKey: "AIzaSyBV7RPjk3cFTqL-aIpflJcUojKg1ZXMLuU",
    authDomain: "voluntarios-ativos---cepat.firebaseapp.com",
    projectId: "voluntarios-ativos---cepat",
    storageBucket: "voluntarios-ativos---cepat.appspot.com",
    messagingSenderId: "66122858261",
    appId: "1:66122858261:web:7fa21f1805463b5c08331c"
};
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// ELEMENTOS DA TELA
const mainContainer = document.getElementById('main-container');
const acessoNegadoContainer = document.getElementById('acesso-negado-container');
const cardGerenciarCursos = document.getElementById('card-gerenciar-cursos');
const cardGerenciarTurmas = document.getElementById('card-gerenciar-turmas');

onAuthStateChanged(auth, async (user) => {
    if (user) {
        try {
            const idTokenResult = await user.getIdTokenResult(true);
            const claims = idTokenResult.claims || {};
            
            // CONVERSÃO UNIFICADA PARA SUPORTE A MÚLTIPLOS CARGOS
            const userRoles = claims.roles || (claims.role ? [claims.role] : ['voluntario']);

            const rolesPermitidasPagina = [ // Quem pode VER esta página
                'super-admin', 'diretor', 
                'dirigente-escola', 'secretario-escola'
            ];
            const rolesAdminGlobal = [ // Quem pode gerenciar CURSOS
                'super-admin', 'diretor'
            ];

            // Varre o array e os formatos alternativos booleanos da escola
            const temPermissaoPagina = userRoles.includes('super-admin') || rolesPermitidasPagina.some(role => 
                userRoles.includes(role) || 
                claims[role] === true || 
                claims[role.replace('-', '_')] === true
            );

            const isAdminGlobal = userRoles.includes('super-admin') || rolesAdminGlobal.some(role => 
                userRoles.includes(role) || 
                claims[role] === true || 
                claims[role.replace('-', '_')] === true
            );

            if (temPermissaoPagina) {
                if (mainContainer) mainContainer.style.display = 'block';
                if (acessoNegadoContainer) acessoNegadoContainer.style.display = 'none';
                console.log("Acesso permitido para Gerenciamento de Cursos:", user.displayName);

                // Controla a exibição do card de gabaritos
                if (cardGerenciarCursos) {
                    if (isAdminGlobal) {
                        cardGerenciarCursos.style.display = 'block';
                    } else {
                        cardGerenciarCursos.style.display = 'none';
                    }
                }
                
                carregarCursos();
            } else {
                if (mainContainer) mainContainer.style.display = 'none';
                if (acessoNegadoContainer) {
                    acessoNegadoContainer.style.display = 'block';
                } else {
                    document.body.innerHTML = '<h1>Acesso Negado</h1><p>Você não tem permissão para acessar esta página.</p>';
                }
                console.warn("Acesso negado para Gerenciamento de Cursos:", user.displayName);
            }
        } catch (error) {
            console.error("Erro ao verificar permissões:", error);
            if (mainContainer) mainContainer.style.display = 'none';
            if (acessoNegadoContainer) {
                acessoNegadoContainer.style.display = 'block';
            } else {
                document.body.innerHTML = '<h1>Erro do Sistema</h1><p>Houve uma falha ao processar suas credenciais.</p>';
            }
        }
    } else {
        window.location.href = '/index.html';
    }
});

// --- FUNÇÕES ---
function carregarCursos() {
    const coursesGridContainer = document.getElementById('courses-grid-container');
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
    const formCurso = document.getElementById('form-curso');
    const inputCursoId = document.getElementById('curso-id');
    const modalCursoTitulo = document.getElementById('modal-curso-titulo');
    const inputCursoNome = document.getElementById('curso-nome');
    const inputCursoDescricao = document.getElementById('curso-descricao');
    const inputCursoIsEAE = document.getElementById('curso-is-eae');
    const modalCurso = document.getElementById('modal-curso');

    if (formCurso) formCurso.reset();
    if (inputCursoId) inputCursoId.value = '';

    if (cursoId) {
        if (modalCursoTitulo) modalCursoTitulo.textContent = 'Editar Gabarito';
        const cursoRef = doc(db, "cursos", cursoId);
        getDoc(cursoRef).then(docSnap => {
            if (docSnap.exists()) {
                const data = docSnap.data();
                if (inputCursoId) inputCursoId.value = docSnap.id;
                if (inputCursoNome) inputCursoNome.value = data.nome;
                if (inputCursoDescricao) inputCursoDescricao.value = data.descricao || '';
                if (inputCursoIsEAE) inputCursoIsEAE.checked = data.isEAE || false;
            }
        });
    } else {
        if (modalCursoTitulo) modalCursoTitulo.textContent = 'Criar Novo Gabarito';
    }
    if (modalCurso) modalCurso.classList.add('visible');
}

async function salvarCurso(event) {
    event.preventDefault();
    const inputCursoId = document.getElementById('curso-id');
    const inputCursoNome = document.getElementById('curso-nome');
    const inputCursoDescricao = document.getElementById('curso-descricao');
    const inputCursoIsEAE = document.getElementById('curso-is-eae');
    const btnSalvarCurso = document.getElementById('btn-salvar-curso');
    const modalCurso = document.getElementById('modal-curso');

    const id = inputCursoId ? inputCursoId.value : '';
    const dadosCurso = {
        nome: inputCursoNome ? inputCursoNome.value.trim() : '',
        descricao: inputCursoDescricao ? inputCursoDescricao.value.trim() : '',
        isEAE: inputCursoIsEAE ? inputCursoIsEAE.checked : false
    };

    if (btnSalvarCurso) {
        btnSalvarCurso.disabled = true;
        btnSalvarCurso.textContent = 'Salvando...';
    }

    try {
        if (id) {
            const cursoRef = doc(db, "cursos", id);
            await updateDoc(cursoRef, dadosCurso);
        } else {
            await addDoc(collection(db, "cursos"), dadosCurso);
        }
        if (modalCurso) modalCurso.classList.remove('visible');
    } catch (error) {
        console.error("Erro ao salvar curso:", error);
        alert("Ocorreu um erro ao salvar. Tente novamente.");
    } finally {
        if (btnSalvarCurso) {
            btnSalvarCurso.disabled = false;
            btnSalvarCurso.textContent = 'Salvar Gabarito';
        }
    }
}

// --- EVENTOS ---
const btnCriarCurso = document.getElementById('btn-criar-curso');
const closeModalCursoBtn = document.getElementById('close-modal-curso');
const modalCurso = document.getElementById('modal-curso');
const formCurso = document.getElementById('form-curso');
const coursesGridContainer = document.getElementById('courses-grid-container');

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