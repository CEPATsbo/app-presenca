import { initializeApp } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-auth.js";
import { getFirestore, collection, collectionGroup, query, where, getDocs, doc, getDoc, limit } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js";

// --- CONFIGURAÇÕES E INICIALIZAÇÃO ---
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

// --- ELEMENTOS DA PÁGINA ---
const mainContainer = document.getElementById('main-container');
const greetingName = document.getElementById('greeting-name');
const loadingMessage = document.getElementById('loading-message');
const moduleDia = document.getElementById('module-dia');
const modulePessoal = document.getElementById('module-pessoal');
const moduleAluno = document.getElementById('module-aluno');
const moduleFacilitador = document.getElementById('module-facilitador');
const moduleGestao = document.getElementById('module-gestao');
const moduleServicos = document.getElementById('module-servicos');
const btnLogout = document.getElementById('btn-logout');

// --- LÓGICA PRINCIPAL (VERSÃO DE TESTE SIMPLIFICADA) ---
onAuthStateChanged(auth, async (user) => {
    console.log("DEBUG: onAuthStateChanged acionado.");
    if (user) {
        console.log("DEBUG: Usuário detectado. Tentando mostrar o container.");
        try {
            // Apenas torna o container visível e exibe uma mensagem simples
            mainContainer.style.display = 'block';
            loadingMessage.textContent = 'Usuário logado! Container visível.';
            console.log("DEBUG: Container principal deve estar visível agora.");

            // Temporariamente DESATIVAMOS a busca de dados para isolar o problema
            // await carregarDadosDoUsuarioCompleto(user); // <--- COMENTADO

        } catch (error) {
            console.error("ERRO ao tentar mostrar container:", error);
            loadingMessage.textContent = 'Erro ao exibir a página.';
        }

    } else {
        console.log("DEBUG: Usuário NÃO detectado. Redirecionando...");
        window.location.href = 'login.html';
    }
});

// As funções verificarPapelAluno, verificarPapelFacilitador, verificarPapelAdmin
// e o evento btnLogout continuam aqui, mas não serão chamadas neste teste.
// ... (resto do seu código)

// --- FUNÇÕES DE VERIFICAÇÃO DE PAPÉIS ---
async function verificarPapelAluno(userId) {
    const q = query(collectionGroup(db, 'participantes'), where('participanteId', '==', userId), limit(1));
    const snapshot = await getDocs(q);
    return !snapshot.empty;
}

async function verificarPapelFacilitador(authUid) {
    // A query para facilitadores precisa buscar pelo ID do documento do voluntário, não authUid.
    // Primeiro, encontramos o ID do voluntário.
    const userQuery = await getDocs(query(collection(db, 'voluntarios'), where('authUid', '==', authUid), limit(1)));
    if (userQuery.empty) return false;
    const userId = userQuery.docs[0].id;

    // Agora, buscamos nas turmas.
    const q = query(collection(db, 'turmas'), where('facilitadoresIds', 'array-contains', userId), limit(1));
    const snapshot = await getDocs(q);
    return !snapshot.empty;
}

async function verificarPapelAdmin(user) {
    const idTokenResult = await user.getIdTokenResult();
    const userRole = idTokenResult.claims.role;
    const adminRoles = ['super-admin', 'diretor', 'tesoureiro'];
    return adminRoles.includes(userRole);
}

// --- EVENTOS ---
btnLogout.addEventListener('click', async (e) => {
    e.preventDefault();
    await signOut(auth);
    window.location.href = 'login.html';
});