// Conteúdo FINAL e ATUALIZADO para o arquivo: public/auth.js

import { initializeApp } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-auth.js";
import { getFirestore, collection, query, where, getDocs } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js";

// Configuração do Firebase (essencial para o módulo funcionar de forma independente)
const firebaseConfig = {
    apiKey: "AIzaSyBV7RPjk3cFTqL-aIpflJcUojKg1ZXMLuU",
    authDomain: "voluntarios-ativos---cepat.firebaseapp.com",
    projectId: "voluntarios-ativos---cepat",
    storageBucket: "voluntarios-ativos---cepat.firebasestorage.app",
    messagingSenderId: "66122858261",
    appId: "1:66122858261:web:7fa21f1805463b5c08331c"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// --- INÍCIO DA NOVA LÓGICA DE LOGOUT AUTOMÁTICO NA VIRADA DO DIA ---

/**
 * Retorna a data de hoje no formato 'AAAA-MM-DD'.
 * @returns {string} A data de hoje formatada.
 */
function getHojeString() {
    const hoje = new Date();
    const ano = hoje.getFullYear();
    const mes = String(hoje.getMonth() + 1).padStart(2, '0');
    const dia = String(hoje.getDate()).padStart(2, '0');
    return `${ano}-${mes}-${dia}`;
}

/**
 * Salva a data de hoje no armazenamento local do navegador para registrar a atividade.
 */
function atualizarTimestampAtividade() {
    try {
        localStorage.setItem('ultimaAtividade', getHojeString());
    } catch (e) {
        console.warn("Não foi possível acessar o localStorage. O logout automático pode não funcionar em abas privadas.");
    }
}

/**
 * Verifica se a última atividade registrada foi em um dia anterior.
 * Se sim, inicia o processo de logout.
 * @returns {boolean} Retorna 'true' se a sessão for de um dia anterior, 'false' caso contrário.
 */
function verificarSessaoExpirada() {
    const ultimaAtividade = localStorage.getItem('ultimaAtividade');
    const hoje = getHojeString();

    if (ultimaAtividade && ultimaAtividade !== hoje) {
        console.log("Sessão de um dia anterior detectada. Desconectando usuário...");
        signOut(auth).catch((error) => console.error("Erro ao fazer logout automático:", error));
        return true; // Sessão expirou
    }
    return false; // Sessão ainda é válida para hoje
}

// Atualiza o registro de atividade sempre que o usuário interagir com a página
window.addEventListener('click', atualizarTimestampAtividade);
window.addEventListener('keydown', atualizarTimestampAtividade);
window.addEventListener('mousemove', atualizarTimestampAtividade);

// --- FIM DA NOVA LÓGICA ---


export function protegerPagina(rolesPermitidas = []) {
    return new Promise((resolve, reject) => {
        const unsubscribe = onAuthStateChanged(auth, async (user) => {
            unsubscribe(); // Evita escutas múltiplas

            if (user) {
                // ETAPA 1: VERIFICAÇÃO DE EXPIRAÇÃO DA SESSÃO
                if (verificarSessaoExpirada()) {
                    alert('Sua sessão era de um dia anterior e foi encerrada automaticamente por segurança.');
                    // Redireciona para o login, mantendo o comportamento original do seu código
                    const redirectUrl = window.location.pathname;
                    window.location.href = `/login.html?redirectUrl=${encodeURIComponent(redirectUrl)}`;
                    reject(new Error('Sessão expirada.'));
                    return; // Interrompe a execução
                }
                
                // Se a sessão é válida para hoje, atualiza o timestamp e continua
                atualizarTimestampAtividade();

                // ETAPA 2: LÓGICA ORIGINAL DE VERIFICAÇÃO DE PERMISSÃO (PRESERVADA)
                try {
                    const q = query(collection(db, "voluntarios"), where("authUid", "==", user.uid));
                    const querySnapshot = await getDocs(q);

                    if (!querySnapshot.empty) {
                        const voluntarioDoc = querySnapshot.docs[0];
                        if (voluntarioDoc.data().nome) {
                            user.displayName = voluntarioDoc.data().nome;
                        }
                    } else {
                        console.error(`[auth.js] Nenhum documento encontrado em 'voluntarios' com o authUid: ${user.uid}`);
                    }

                    const idTokenResult = await user.getIdTokenResult(true);
                    user.claims = idTokenResult.claims;
                    const userRole = user.claims.role || 'voluntario';

                    if (rolesPermitidas.length === 0 || rolesPermitidas.includes(userRole)) {
                        resolve(user);
                    } else {
                        reject(new Error('Acesso negado: cargo insuficiente.'));
                    }
                } catch (error) {
                    console.error("Erro ao verificar permissões ou buscar dados do voluntário:", error);
                    reject(error);
                }
            } else {
                // Usuário não está logado, redireciona para o login
                const redirectUrl = window.location.pathname;
                window.location.href = `/login.html?redirectUrl=${encodeURIComponent(redirectUrl)}`;
                reject(new Error('Usuário não autenticado.'));
            }
        });
    });
}