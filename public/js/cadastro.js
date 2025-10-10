// VERSÃO COM LÓGICA DE VINCULAÇÃO DE CONTAS

import { initializeApp } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, updateProfile } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-auth.js";
import { getFirestore, doc, setDoc, collection, query, where, getDocs, writeBatch } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js";

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
    const email = inputEmail.value.trim().toLowerCase(); // Normalizar email para minúsculas
    const senha = inputSenha.value;
    const confirmaSenha = inputConfirmaSenha.value;

    if (!nome || !email || !senha || senha !== confirmaSenha || senha.length < 6) {
        alert("Por favor, verifique os dados preenchidos (senha deve ter 6+ caracteres e coincidir).");
        return;
    }

    btnCadastrar.disabled = true;
    btnCadastrar.textContent = 'Aguarde...';

    try {
        // 1. Criar o usuário no Firebase Authentication
        console.log("Tentando criar usuário no Firebase Auth...");
        const userCredential = await createUserWithEmailAndPassword(auth, email, senha);
        const user = userCredential.user;
        console.log("SUCESSO: Usuário criado no Auth:", user.uid);

        // 2. Atualizar o perfil do usuário no Auth com o nome
        await updateProfile(user, { displayName: nome });
        console.log("SUCESSO: Perfil do Auth atualizado com o nome.");

        // 3. LÓGICA DE VINCULAÇÃO: Procurar por um voluntário existente com este email
        console.log(`Procurando por voluntário existente com o email: ${email}`);
        const voluntariosRef = collection(db, "voluntarios");
        const q = query(voluntariosRef, where("email", "==", email));
        const querySnapshot = await getDocs(q);

        if (!querySnapshot.empty) {
            // ENCONTROU UM VOLUNTÁRIO ANTIGO! VAMOS VINCULAR.
            console.log("Voluntário existente encontrado! Vinculando conta...");
            const batch = writeBatch(db);
            querySnapshot.forEach(doc => {
                // Atualiza o documento existente com a nova ID do Auth e garante que o nome esteja correto.
                batch.update(doc.ref, { 
                    authUid: user.uid,
                    nome: nome // Atualiza o nome caso o usuário tenha digitado diferente
                });
            });
            await batch.commit();
            console.log("SUCESSO: Conta antiga vinculada ao novo login.");

        } else {
            // NÃO ENCONTROU. É UM VOLUNTÁRIO 100% NOVO.
            console.log("Nenhum voluntário encontrado com este email. Criando novo registro...");
            const userDocRef = doc(db, "voluntarios", user.uid);
            await setDoc(userDocRef, {
                authUid: user.uid,
                nome: nome,
                email: email,
                statusVoluntario: 'ativo'
                // Adicione aqui outros campos padrão para um novo voluntário, se houver
            });
            console.log("SUCESSO: Novo documento de voluntário criado no Firestore.");
        }

        alert(`Bem-vindo, ${nome}! Conta criada/vinculada com sucesso.`);
        window.location.href = '/painel.html';

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
    }
});