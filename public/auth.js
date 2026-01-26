import { initializeApp } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-auth.js";
import { getFirestore, collection, query, where, getDocs } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js";

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

function getHojeString() {
    const hoje = new Date();
    return `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}-${String(hoje.getDate()).padStart(2, '0')}`;
}

function atualizarTimestampAtividade() {
    try { localStorage.setItem('ultimaAtividade', getHojeString()); } catch (e) {}
}

function verificarSessaoExpirada() {
    const ultimaAtividade = localStorage.getItem('ultimaAtividade');
    if (ultimaAtividade && ultimaAtividade !== getHojeString()) {
        signOut(auth).catch((error) => console.error("Erro logout:", error));
        return true; 
    }
    return false;
}

window.addEventListener('click', atualizarTimestampAtividade);
window.addEventListener('keydown', atualizarTimestampAtividade);
window.addEventListener('mousemove', atualizarTimestampAtividade);

export function protegerPagina(rolesPermitidas = []) {
    return new Promise((resolve, reject) => {
        const unsubscribe = onAuthStateChanged(auth, async (user) => {
            if (!user) {
                const redirectUrl = window.location.pathname;
                window.location.href = `/login.html?redirectUrl=${encodeURIComponent(redirectUrl)}`;
                reject(new Error('Usuário não autenticado.'));
                return;
            }

            if (verificarSessaoExpirada()) {
                alert('Sua sessão expirou por segurança.');
                window.location.href = `/login.html?redirectUrl=${encodeURIComponent(window.location.pathname)}`;
                reject(new Error('Sessão expirada.'));
                return; 
            }
            
            atualizarTimestampAtividade();

            try {
                // Força a atualização do Token para garantir que pegamos o cargo atualizado
                const idTokenResult = await user.getIdTokenResult(true);
                const claims = idTokenResult.claims || {};
                user.claims = claims;

                // Lógica de fallback: se não houver role, é voluntário
                const userRole = claims.role || 'voluntario';

                // Super Admin sempre tem acesso total
                if (userRole === 'super-admin') {
                    resolve(user);
                    return;
                }

                const temCargoNecessario = rolesPermitidas.length === 0 || 
                    rolesPermitidas.includes(userRole) ||
                    rolesPermitidas.some(role => claims[role] === true);

                if (temCargoNecessario) {
                    resolve(user);
                } else {
                    reject(new Error('Acesso negado: cargo insuficiente.'));
                }
            } catch (error) {
                console.error("Erro na proteção de página:", error);
                reject(error);
            }
        });
    });
}