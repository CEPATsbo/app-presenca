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
const alunoContent = document.getElementById('aluno-content');
const facilitadorContent = document.getElementById('facilitador-content');
const btnLogout = document.getElementById('btn-logout');

// --- LÓGICA PRINCIPAL ---
onAuthStateChanged(auth, async (user) => {
    console.log("DEBUG: onAuthStateChanged acionado.");
    if (user) {
        console.log("DEBUG: Usuário detectado. UID:", user.uid);
        mainContainer.style.display = 'block'; // Garante visibilidade inicial

        try {
            console.log("DEBUG: Buscando perfil do voluntário...");
            const qUser = query(collection(db, "voluntarios"), where("authUid", "==", user.uid), limit(1));
            const userSnapshot = await getDocs(qUser);
            if (userSnapshot.empty) {
                throw new Error("Perfil de voluntário não encontrado. Contate a secretaria.");
            }
            const userData = userSnapshot.docs[0].data();
            const userId = userSnapshot.docs[0].id;
            greetingName.textContent = `Olá, ${userData.nome}!`;
            console.log("DEBUG: Perfil encontrado:", userData.nome);

            console.log("DEBUG: Iniciando verificações de papéis em paralelo...");
            const [isAluno, isFacilitador, isAdmin] = await Promise.all([
                verificarPapelAluno(userId),
                verificarPapelFacilitador(userId), // Corrigido para buscar por userId
                verificarPapelAdmin(user)
            ]);
            console.log("DEBUG: Verificações de papéis concluídas.");
            console.log(`DEBUG: Resultados - Aluno: ${isAluno}, Facilitador: ${isFacilitador}, Admin: ${isAdmin}`);

            loadingMessage.classList.add('hidden');
            
            moduleDia.classList.remove('hidden');
            modulePessoal.classList.remove('hidden');
            moduleServicos.classList.remove('hidden');
            document.getElementById('dia-content').innerHTML = "<p>Carregando status de presença...</p>";
            document.getElementById('pessoal-content').innerHTML = "<p>Carregando seu perfil...</p>";

            if (isAluno) {
                console.log("DEBUG: Exibindo módulo Aluno.");
                moduleAluno.classList.remove('hidden');
                alunoContent.innerHTML = "<p>Carregando seu progresso...</p>";
            }
            if (isFacilitador) {
                console.log("DEBUG: Exibindo módulo Facilitador.");
                moduleFacilitador.classList.remove('hidden');
                facilitadorContent.innerHTML = "<p>Carregando suas turmas...</p>";
            }
            if (isAdmin) {
                console.log("DEBUG: Exibindo módulo Gestão.");
                moduleGestao.classList.remove('hidden');
            }
            console.log("DEBUG: Renderização inicial concluída.");

        } catch (error) {
            console.error("ERRO CRÍTICO ao carregar dados do usuário:", error);
            loadingMessage.classList.remove('hidden'); // Garante que a mensagem de erro seja visível
            loadingMessage.innerHTML = `<p style="color: red;">${error.message || 'Ocorreu um erro inesperado.'}</p>`;
        }
    } else {
        console.log("DEBUG: Usuário NÃO detectado. Redirecionando para login...");
        window.location.href = 'login.html';
    }
});

// --- FUNÇÕES DE VERIFICAÇÃO DE PAPÉIS ---
async function verificarPapelAluno(userId) {
    console.log("[DEBUG] ALUNO: Iniciando busca...");
    try {
        const q = query(collectionGroup(db, 'participantes'), where('participanteId', '==', userId), limit(1));
        const snapshot = await getDocs(q);
        console.log(`[DEBUG] ALUNO: Busca concluída. Encontrados ${snapshot.size} registros.`);
        return !snapshot.empty;
    } catch (error) {
        console.error("[DEBUG] ALUNO: Erro na busca:", error);
        throw new Error("Falha ao verificar se você é aluno."); // Repassa o erro
    }
}

async function verificarPapelFacilitador(userId) {
    console.log("[DEBUG] FACILITADOR: Iniciando busca...");
    try {
        // A busca usa o campo 'facilitadoresIds' que criamos
        const q = query(collection(db, 'turmas'), where('facilitadoresIds', 'array-contains', userId), limit(1));
        const snapshot = await getDocs(q);
        console.log(`[DEBUG] FACILITADOR: Busca concluída. Encontradas ${snapshot.size} turmas.`);
        return !snapshot.empty;
    } catch (error) {
        console.error("[DEBUG] FACILITADOR: Erro na busca:", error);
        // ## POSSÍVEL CAUSA DE ERRO: Índice Faltando ##
        if (error.code === 'failed-precondition') {
             console.error("[DEBUG] FACILITADOR: O erro indica que um índice do Firestore pode ser necessário. Verifique o console de erro do Firebase Functions ou tente criar um índice manualmente para 'turmas' com 'facilitadoresIds' (array-contains).");
             throw new Error("Falha ao verificar se você é facilitador (possível índice faltando).");
        }
        throw new Error("Falha ao verificar se você é facilitador.");
    }
}

async function verificarPapelAdmin(user) {
    console.log("[DEBUG] ADMIN: Verificando token...");
    try {
        const idTokenResult = await user.getIdTokenResult(true); // Força a atualização do token
        const userRole = idTokenResult.claims.role;
        console.log("[DEBUG] ADMIN: Papel encontrado no token:", userRole);
        const adminRoles = ['super-admin', 'diretor', 'tesoureiro'];
        const isAdmin = adminRoles.includes(userRole);
        console.log(`[DEBUG] ADMIN: É admin? ${isAdmin}`);
        return isAdmin;
    } catch (error) {
        console.error("[DEBUG] ADMIN: Erro ao verificar token:", error);
        throw new Error("Falha ao verificar suas permissões de administrador.");
    }
}

// --- EVENTOS ---
btnLogout.addEventListener('click', async (e) => {
    e.preventDefault();
    try {
        await signOut(auth);
        window.location.href = 'login.html';
    } catch (error) {
        console.error("Erro ao fazer logout:", error);
    }
});

console.log("DEBUG: Script meu-cepat.js carregado e eventos adicionados.");