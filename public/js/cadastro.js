// /js/cadastro.js
// VERSÃO CORRIGIDA (Lógica de filtro local)

import { initializeApp } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, updateProfile } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-auth.js";
import { getFirestore, doc, setDoc, updateDoc, collection, query, where, getDocs, limit } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js";

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

// --- DOM ---
const formCadastro = document.getElementById('form-cadastro');
const inputNome = document.getElementById('nome');
const inputEmail = document.getElementById('email');
const inputSenha = document.getElementById('senha');
const inputConfirmaSenha = document.getElementById('confirma-senha');
const btnCadastrar = document.getElementById('btn-cadastrar');

// --- DOM DO MODAL ---
const modal = document.getElementById('modal-vinculacao');
const listaSugestoes = document.getElementById('lista-sugestoes');
const btnNovoUsuario = document.getElementById('btn-novo-usuario');
const msgVinculado = document.getElementById('msg-vinculado');

// --- Variáveis de Estado ---
let debounceTimer; 
let voluntarioSelecionadoId = null; 

// ===================================================================
// FUNÇÃO DE BUSCA (Buscar-enquanto-digita)
// ===================================================================
inputNome.addEventListener('input', () => {
    if (voluntarioSelecionadoId) return;

    clearTimeout(debounceTimer);
    const nomeDigitado = inputNome.value.trim();

    if (nomeDigitado.length < 4) {
        modal.classList.remove('modal-visible');
        return; 
    }
    
    const nomeCapitalizado = nomeDigitado.charAt(0).toUpperCase() + nomeDigitado.slice(1);

    debounceTimer = setTimeout(async () => {
        console.log(`Buscando por nomes começando com: ${nomeCapitalizado}`); 
        
        const voluntariosRef = collection(db, "voluntarios");

        // --- MUDANÇA DE LÓGICA AQUI ---
        // 1. Buscamos APENAS pelo nome.
        const q = query(voluntariosRef, 
            where("nome", ">=", nomeCapitalizado), 
            where("nome", "<=", nomeCapitalizado + '\uf8ff'),
            limit(10) // Pegamos 10 para poder filtrar
        );

        const querySnapshot = await getDocs(q);

        // 2. Filtramos a lista AQUI no JavaScript
        //    Buscamos por voluntários que não tenham o 'authUid' (seja nulo ou indefinido)
        const orfaos = querySnapshot.docs.filter(doc => !doc.data().authUid);
        // --- FIM DA MUDANÇA ---


        listaSugestoes.innerHTML = ''; 

        if (orfaos.length === 0) {
            console.log("Nenhum voluntário 'órfão' encontrado.");
            modal.classList.remove('modal-visible');
            return;
        }

        // Se encontrou, preenche o pop-up
        console.log("Voluntários 'órfãos' encontrados!"); 
        orfaos.forEach(doc => {
            const voluntario = doc.data();
            const li = document.createElement('li');
            li.textContent = voluntario.nome;
            
            const btnSouEu = document.createElement('button');
            btnSouEu.textContent = 'Sou eu';
            btnSouEu.className = 'btn-sou-eu';
            btnSouEu.type = 'button'; 
            btnSouEu.dataset.id = doc.id; 
            btnSouEu.dataset.nome = voluntario.nome; 
            
            li.appendChild(btnSouEu);
            listaSugestoes.appendChild(li);
        });

        modal.classList.add('modal-visible'); 

    }, 500);
});

// ===================================================================
// AÇÕES DO MODAL (Pop-up)
// ===================================================================

// Ação: Usuário clica em "Sou eu"
listaSugestoes.addEventListener('click', (e) => {
    if (e.target.classList.contains('btn-sou-eu')) {
        const docId = e.target.dataset.id;
        const nomeCompleto = e.target.dataset.nome;
        
        console.log(`Voluntário selecionado! ID: ${docId}`);
        
        voluntarioSelecionadoId = docId;
        inputNome.value = nomeCompleto; 
        inputNome.disabled = true; 
        msgVinculado.textContent = `Ótimo! Vamos vincular sua conta, ${nomeCompleto.split(' ')[0]}.`;
        msgVinculado.style.display = 'block';
        modal.classList.remove('modal-visible');
    }
});

// Ação: Usuário clica em "Não sou nenhum desses"
btnNovoUsuario.addEventListener('click', () => {
    console.log("Usuário selecionou 'Novo Cadastro'.");
    voluntarioSelecionadoId = null; 
    modal.classList.remove('modal-visible');
    inputNome.disabled = true; 
    msgVinculado.textContent = `Ok! Prosseguindo com um novo cadastro para ${inputNome.value}.`;
    msgVinculado.style.display = 'block';
});

// ===================================================================
// SUBMISSÃO DO FORMULÁRIO (A LÓGICA FINAL)
// ===================================================================
formCadastro.addEventListener('submit', async (event) => {
    event.preventDefault();
    console.log("--- INICIANDO PROCESSO DE CADASTRO ---");

    inputNome.disabled = false; 
    const nome = inputNome.value.trim();
    inputNome.disabled = (voluntarioSelecionadoId != null || (modal.classList.contains('modal-visible') && !voluntarioSelecionadoId) ); 
    
    if (modal.classList.contains('modal-visible') && !voluntarioSelecionadoId) {
        alert("Por favor, selecione se você é um dos voluntários da lista ou clique em 'Não sou nenhum desses'.");
        return;
    }

    const email = inputEmail.value.trim().toLowerCase();
    const senha = inputSenha.value;
    const confirmaSenha = inputConfirmaSenha.value;

    if (!nome) {
        alert("O campo nome está vazio.");
        return;
    }
    if (senha !== confirmaSenha) {
        alert("As senhas não coincidem.");
        return;
    }
    if (senha.length < 6) {
        alert("Sua senha deve ter no mínimo 6 caracteres.");
        return;
    }

    btnCadastrar.disabled = true;
    btnCadastrar.textContent = 'Aguarde...';

    try {
        console.log("Tentando criar usuário no Firebase Auth...");
        const userCredential = await createUserWithEmailAndPassword(auth, email, senha);
        const user = userCredential.user;
        console.log("SUCESSO: Usuário criado no Auth:", user.uid);

        await updateProfile(user, { displayName: nome });

        if (voluntarioSelecionadoId) {
            // CASO A: VINCULAR CONTA (UPDATE)
            console.log(`Vinculando Auth UID ${user.uid} ao documento ${voluntarioSelecionadoId}`);
            const userDocRef = doc(db, "voluntarios", voluntarioSelecionadoId);
            await updateDoc(userDocRef, {
                authUid: user.uid,
                email: email, 
                nome: nome    
            });
            console.log("SUCESSO: Conta antiga vinculada ao novo login.");

        } else {
            // CASO B: CRIAR NOVO REGISTRO (SET)
            console.log("Nenhum voluntário selecionado. Criando novo registro...");
            const userDocRef = doc(db, "voluntarios", user.uid);
            await setDoc(userDocRef, {
                authUid: user.uid,
                nome: nome,
                email: email,
                statusVoluntario: 'ativo',
                cargos: { 
                    voluntario: true 
                }
            });
            console.log("SUCESSO: Novo documento de voluntário criado no Firestore.");
        }

        alert(`Bem-vindo, ${nome}! Conta criada/vinculada com sucesso.`);
        window.location.href = '/meu-cepat.html'; 

    } catch (error) {
        console.error("ERRO DETALHADO NO CADASTRO:", error);
        let friendlyMessage = "Ocorreu uma falha no cadastro. Tente novamente.";
        if (error.code === 'auth/email-already-in-use') {
            friendlyMessage = "Este email já foi usado para criar uma conta no portal. Tente fazer o login ou use 'Esqueci minha senha'.";
        }
        alert(friendlyMessage);

    } finally {
        btnCadastrar.disabled = false;
        btnCadastrar.textContent = 'FINALIZAR CADASTRO';
        inputNome.disabled = false; 
    }
});