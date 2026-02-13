import { initializeApp } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, updateProfile } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-auth.js";
import { getFirestore, doc, setDoc, updateDoc, collection, query, where, getDocs, limit, serverTimestamp } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js";
import Fuse from 'https://cdn.jsdelivr.net/npm/fuse.js@7.0.0/dist/fuse.mjs';

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

// --- ELEMENTOS DO DOM ---
const formCadastro = document.getElementById('form-cadastro');
const inputNome = document.getElementById('nome');
const inputEmail = document.getElementById('email');
const inputSenha = document.getElementById('senha');
const inputConfirmaSenha = document.getElementById('confirma-senha');
const btnCadastrar = document.getElementById('btn-cadastrar');

// --- ELEMENTOS DO MODAL ---
const modal = document.getElementById('modal-vinculacao');
const listaSugestoes = document.getElementById('lista-sugestoes');
const btnNovoUsuario = document.getElementById('btn-novo-usuario');
const msgVinculado = document.getElementById('msg-vinculado');

// --- ESTADO ---
let debounceTimer; 
let voluntarioSelecionadoId = null; 

// --- AUXILIAR: NORMALIZAÇÃO ---
function normalizarString(str) {
    if (!str) return "";
    return str.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

// --- LÓGICA DE BUSCA COM FUSE.JS ---
inputNome.addEventListener('input', () => {
    if (voluntarioSelecionadoId) return;

    clearTimeout(debounceTimer);
    const nomeDigitado = inputNome.value.trim();

    if (nomeDigitado.length < 4) {
        modal.classList.remove('modal-visible');
        return; 
    }

    debounceTimer = setTimeout(async () => {
        try {
            const voluntariosRef = collection(db, "voluntarios");
            
            // Buscamos apenas quem não tem authUid (órfãos do registro rápido)
            const q = query(voluntariosRef, where("authUid", "==", null));
            const querySnapshot = await getDocs(q);
            const listaParaFuse = querySnapshot.docs.map(d => ({ id: d.id, ...d.data() }));

            // Configura o Fuse para busca aproximada
            const fuse = new Fuse(listaParaFuse, {
                keys: ['nome', 'nome_normalizado'],
                threshold: 0.4, // Sensibilidade: 0.0 (exato) a 1.0 (qualquer coisa)
                distance: 100
            });

            const resultados = fuse.search(nomeDigitado);
            listaSugestoes.innerHTML = ''; 

            if (resultados.length === 0) {
                modal.classList.remove('modal-visible');
                return;
            }

            // Renderiza sugestões
            resultados.forEach(res => {
                const voluntario = res.item;
                const li = document.createElement('li');
                li.innerHTML = `
                    <span>${voluntario.nome}</span>
                    <button type="button" class="btn-sou-eu" 
                        data-id="${voluntario.id}" 
                        data-nome="${voluntario.nome}">Sou eu</button>
                `;
                listaSugestoes.appendChild(li);
            });

            modal.classList.add('modal-visible'); 
        } catch (err) {
            console.error("Erro na busca Fuse:", err);
        }
    }, 500);
});

// --- AÇÕES DO MODAL ---
listaSugestoes.addEventListener('click', (e) => {
    if (e.target.classList.contains('btn-sou-eu')) {
        voluntarioSelecionadoId = e.target.dataset.id;
        const nomeCompleto = e.target.dataset.nome;
        
        inputNome.value = nomeCompleto; 
        inputNome.disabled = true; 
        msgVinculado.textContent = `Vínculo ativado para: ${nomeCompleto}`;
        msgVinculado.style.display = 'block';
        modal.classList.remove('modal-visible');
    }
});

btnNovoUsuario.addEventListener('click', () => {
    voluntarioSelecionadoId = null; 
    modal.classList.remove('modal-visible');
    inputNome.disabled = true; 
    msgVinculado.textContent = `Criando novo perfil para: ${inputNome.value}`;
    msgVinculado.style.display = 'block';
});

// --- SUBMISSÃO FINAL ---
formCadastro.addEventListener('submit', async (event) => {
    event.preventDefault();

    // Reabilita temporariamente para ler o valor
    inputNome.disabled = false;
    const nome = inputNome.value.trim();
    const email = inputEmail.value.trim().toLowerCase();
    const senha = inputSenha.value;
    const confirmaSenha = inputConfirmaSenha.value;

    if (senha !== confirmaSenha) return alert("As senhas não coincidem.");

    btnCadastrar.disabled = true;
    btnCadastrar.textContent = 'Processando...';

    try {
        // 1. Cria o usuário no Firebase Auth
        const userCredential = await createUserWithEmailAndPassword(auth, email, senha);
        const user = userCredential.user;

        await updateProfile(user, { displayName: nome });

        const nomeNormal = normalizarString(nome);
        const dadosBase = {
            authUid: user.uid,
            email: email,
            nome: nome,
            nome_normalizado: nomeNormal,
            ultimaAtualizacao: serverTimestamp()
        };

        if (voluntarioSelecionadoId) {
            // CASO A: Vínculo com registro existente
            const voluntarioRef = doc(db, "voluntarios", voluntarioSelecionadoId);
            await updateDoc(voluntarioRef, dadosBase);
            console.log("Vínculo realizado com sucesso.");
        } else {
            // CASO B: Novo voluntário completo
            const novoDocRef = doc(db, "voluntarios", user.uid);
            await setDoc(novoDocRef, {
                ...dadosBase,
                statusVoluntario: 'ativo',
                criadoEm: serverTimestamp(),
                cargos: { voluntario: true }
            });
            console.log("Novo registro criado.");
        }

        alert("Cadastro finalizado com sucesso!");
        window.location.href = '/meu-cepat.html';

    } catch (error) {
        console.error("Erro no cadastro:", error);
        alert("Erro: " + error.message);
        btnCadastrar.disabled = false;
        btnCadastrar.textContent = 'FINALIZAR CADASTRO';
    }
});