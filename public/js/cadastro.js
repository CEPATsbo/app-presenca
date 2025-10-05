// VERSÃO "MODO DETETIVE" - COLE ISTO EM public/js/cadastro.js

import { initializeApp } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, updateProfile } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-auth.js";
import { getFirestore, doc, setDoc } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js";

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

const formCadastro = document.getElementById('form-cadastro');
const inputNome = document.getElementById('nome');
const inputEmail = document.getElementById('email');
const inputSenha = document.getElementById('senha');
const inputConfirmaSenha = document.getElementById('confirma-senha');
const btnCadastrar = document.getElementById('btn-cadastrar');

formCadastro.addEventListener('submit', async (event) => {
    event.preventDefault();
    console.log("--- INICIANDO PROCESSO DE CADASTRO ---");

    const nome = inputNome.value.trim();
    const email = inputEmail.value.trim();
    const senha = inputSenha.value;
    const confirmaSenha = inputConfirmaSenha.value;

    if (!nome || !email || !senha || senha !== confirmaSenha || senha.length < 6) {
        alert("Por favor, verifique os dados preenchidos (senha deve ter 6+ caracteres e coincidir).");
        console.log("Falha na validação local. Processo interrompido.");
        return;
    }
    console.log("Validações locais passaram. Dados:", { nome, email });

    btnCadastrar.disabled = true;
    btnCadastrar.textContent = 'Aguarde...';

    try {
        console.log("Tentando criar usuário no Firebase Auth...");
        const userCredential = await createUserWithEmailAndPassword(auth, email, senha);
        const user = userCredential.user;
        console.log("SUCESSO: Usuário criado no Auth:", user.uid);

        console.log("Tentando atualizar o perfil do usuário...");
        await updateProfile(user, { displayName: nome });
        console.log("SUCESSO: Perfil atualizado com o nome.");

        console.log("Tentando criar documento no Firestore...");
        const userDocRef = doc(db, "voluntarios", user.uid);
        await setDoc(userDocRef, {
            authUid: user.uid,
            nome: nome,
            email: email,
            statusVoluntario: 'ativo'
        });
        console.log("SUCESSO: Documento criado no Firestore.");

        alert(`Bem-vindo, ${nome}! Cadastro realizado com sucesso.`);
        window.location.href = '/painel.html';

    } catch (error) {
        console.error("ERRO DETALHADO NO CADASTRO:", error);
        alert(
`FALHA NO CADASTRO!

Código do Erro: ${error.code}

Mensagem: ${error.message}

Por favor, envie um print do console para o assistente.`
        );

    } finally {
        btnCadastrar.disabled = false;
        btnCadastrar.textContent = 'FINALIZAR CADASTRO';
    }
});