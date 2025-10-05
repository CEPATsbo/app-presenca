// === ARQUIVO: public/js/index.js ===

import { initializeApp } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-app.js";
import { getAuth, signInWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-auth.js";
// Funções do Firestore que usaremos para a parte clássica
import { getFirestore, collection, query, where, getDocs, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js";
import Fuse from 'https://cdn.jsdelivr.net/npm/fuse.js@7.0.0/dist/fuse.mjs';

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

// --- LÓGICA DO PORTAL DE LOGIN ---
const formLogin = document.getElementById('form-login-portal');
const inputEmail = document.getElementById('email-login');
const inputSenha = document.getElementById('senha-login');

if (formLogin) {
    formLogin.addEventListener('submit', (event) => {
        event.preventDefault();
        const email = inputEmail.value;
        const senha = inputSenha.value;

        if (!email || !senha) {
            alert("Por favor, preencha email e senha.");
            return;
        }

        signInWithEmailAndPassword(auth, email, senha)
            .then((userCredential) => {
                // Login bem-sucedido!
                console.log("Login realizado com sucesso:", userCredential.user);
                window.location.href = '/painel.html';
            })
            .catch((error) => {
                console.error("Erro de login:", error.code);
                alert("Email ou senha incorretos. Tente novamente.");
            });
    });
}

// --- LÓGICA DO REGISTRO DE PRESENÇA RÁPIDO (CLÁSSICO) ---
// (Adaptado do seu script antigo)
const formPresencaRapida = document.getElementById('form-presenca-rapida');
const nomeInput = document.getElementById('nome-presenca');
const btnSelecionarAtividades = document.getElementById('btn-selecionar-atividades');
const atividadesWrapper = document.getElementById('atividades-wrapper');
const atividadesContainer = document.getElementById('atividades-container');

// Carregar atividades do Firestore
async function buscarAtividadesDoFirestore() {
    if (!atividadesContainer) return;
    try {
        const q = query(collection(db, "atividades"), where("ativo", "==", true));
        const snapshot = await getDocs(q);
        atividadesContainer.innerHTML = ''; // Limpa antes de adicionar
        snapshot.forEach(doc => {
            const atividade = doc.data().nome;
            const div = document.createElement('div');
            div.innerHTML = `<input type="checkbox" name="atividade" value="${atividade}" id="${atividade}"> <label for="${atividade}">${atividade}</label>`;
            atividadesContainer.appendChild(div);
        });
    } catch (e) {
        console.error("Erro ao buscar atividades:", e);
    }
}

if (btnSelecionarAtividades) {
    btnSelecionarAtividades.addEventListener('click', () => {
        atividadesWrapper.style.display = atividadesWrapper.style.display === 'block' ? 'none' : 'block';
    });
    buscarAtividadesDoFirestore(); // Carrega as atividades quando a página carrega
}

if(formPresencaRapida) {
    formPresencaRapida.addEventListener('submit', (event) => {
        event.preventDefault();
        // A LÓGICA DE SALVAR A PRESENÇA RÁPIDA (COM FUSE.JS) SERÁ ADICIONADA AQUI.
        // Por enquanto, vamos apenas confirmar que o botão funciona.
        const nome = nomeInput.value;
        const atividadesSelecionadas = document.querySelectorAll('input[name="atividade"]:checked');
        if (!nome || atividadesSelecionadas.length === 0) {
            alert("Por favor, digite seu nome e selecione ao menos uma atividade.");
            return;
        }
        alert(`Olá, ${nome}! A funcionalidade de registro rápido será conectada em breve.`);
    });
}