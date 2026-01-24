import { initializeApp } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-auth.js";
import { getFirestore, collection, query, where, getDocs } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js";

// Configuração do Firebase
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

// --- LÓGICA DE LOGOUT AUTOMÁTICO ---
function getHojeString() {
    const hoje = new Date();
    const ano = hoje.getFullYear();
    const mes = String(hoje.getMonth() + 1).padStart(2, '0');
    const dia = String(hoje.getDate()).padStart(2, '0');
    return `${ano}-${mes}-${dia}`;
}

function atualizarTimestampAtividade() {
    try {
        localStorage.setItem('ultimaAtividade', getHojeString());
    } catch (e) {
        console.warn("localStorage inacessível.");
    }
}

function verificarSessaoExpirada() {
    const ultimaAtividade = localStorage.getItem('ultimaAtividade');
    const hoje = getHojeString();

    if (ultimaAtividade && ultimaAtividade !== hoje) {
        console.log("Sessão expirada. Desconectando...");
        signOut(auth).catch((error) => console.error("Erro logout:", error));
        return true; 
    }
    return false;
}

window.addEventListener('click', atualizarTimestampAtividade);
window.addEventListener('keydown', atualizarTimestampAtividade);
window.addEventListener('mousemove', atualizarTimestampAtividade);

// --- FUNÇÃO DE PROTEÇÃO DE PÁGINA (CORRIGIDA COM FALLBACK) ---
export function protegerPagina(rolesPermitidas = []) {
    return new Promise((resolve, reject) => {
        const unsubscribe = onAuthStateChanged(auth, async (user) => {
            unsubscribe(); 

            if (user) {
                // ETAPA 1: VERIFICAÇÃO DE EXPIRAÇÃO
                if (verificarSessaoExpirada()) {
                    alert('Sua sessão expirou e foi encerrada automaticamente por segurança.');
                    const redirectUrl = window.location.pathname;
                    window.location.href = `/login.html?redirectUrl=${encodeURIComponent(redirectUrl)}`;
                    reject(new Error('Sessão expirada.'));
                    return; 
                }
                
                atualizarTimestampAtividade();

                try {
                    // ETAPA 2: BUSCA DADOS DO VOLUNTÁRIO
                    const q = query(collection(db, "voluntarios"), where("authUid", "==", user.uid));
                    const querySnapshot = await getDocs(q);

                    if (!querySnapshot.empty) {
                        const voluntarioDoc = querySnapshot.docs[0];
                        if (voluntarioDoc.data().nome) {
                            user.displayName = voluntarioDoc.data().nome;
                        }
                    }

                    // ETAPA 3: VERIFICAÇÃO DE PERMISSÃO (COM FALLBACK)
                    const idTokenResult = await user.getIdTokenResult(true);
                    user.claims = idTokenResult.claims;
                    
                    // Se o role for nulo, consideramos voluntario padrão
                    const userRole = user.claims.role || 'voluntario';

                    // Lógica robusta: aceita role, claim booleano ou super-admin
                    const temCargoNecessario = rolesPermitidas.length === 0 || 
                        rolesPermitidas.includes(userRole) ||
                        rolesPermitidas.some(role => user.claims[role] === true) ||
                        userRole === 'super-admin';

                    if (temCargoNecessario) {
                        resolve(user);
                    } else {
                        reject(new Error('Acesso negado: cargo insuficiente.'));
                    }
                } catch (error) {
                    console.error("Erro segurança:", error);
                    reject(error);
                }
            } else {
                const redirectUrl = window.location.pathname;
                window.location.href = `/login.html?redirectUrl=${encodeURIComponent(redirectUrl)}`;
                reject(new Error('Usuário não autenticado.'));
            }
        });
    });
}