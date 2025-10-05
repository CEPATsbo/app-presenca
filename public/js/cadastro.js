// Importando as funções necessárias do Firebase SDK
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, updateProfile } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-auth.js";
import { getFirestore, doc, setDoc } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js";

// A sua configuração do Firebase que já usamos em outros scripts
const firebaseConfig = {
    apiKey: "AIzaSyBV7RPjk3cFTqL-aIpflJcUojKg1ZXMLuU",
    authDomain: "voluntarios-ativos---cepat.firebaseapp.com",
    projectId: "voluntarios-ativos---cepat",
    storageBucket: "voluntarios-ativos---cepat.appspot.com", // Corrigido para .appspot.com
    messagingSenderId: "66122858261",
    appId: "1:66122858261:web:7fa21f1805463b5c08331c"
};

// Inicializando o Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// Selecionando os elementos do formulário
const formCadastro = document.getElementById('form-cadastro');
const inputNome = document.getElementById('nome');
const inputEmail = document.getElementById('email');
const inputSenha = document.getElementById('senha');
const inputConfirmaSenha = document.getElementById('confirma-senha');
const btnCadastrar = document.getElementById('btn-cadastrar');

// Adicionando o "escutador" de eventos ao formulário
formCadastro.addEventListener('submit', async (event) => {
    event.preventDefault(); // Impede o recarregamento da página

    const nome = inputNome.value.trim();
    const email = inputEmail.value.trim();
    const senha = inputSenha.value;
    const confirmaSenha = inputConfirmaSenha.value;

    // Validações básicas
    if (!nome || !email || !senha) {
        alert("Por favor, preencha todos os campos.");
        return;
    }
    if (senha !== confirmaSenha) {
        alert("As senhas não coincidem.");
        return;
    }
    if (senha.length < 6) {
        alert("A senha deve ter no mínimo 6 caracteres.");
        return;
    }

    btnCadastrar.disabled = true;
    btnCadastrar.textContent = 'Aguarde...';

    try {
        // 1. Criar o usuário no Firebase Authentication
        const userCredential = await createUserWithEmailAndPassword(auth, email, senha);
        const user = userCredential.user;

        // 2. Atualizar o perfil do usuário com o nome
        await updateProfile(user, {
            displayName: nome
        });

        // 3. Vincular Auth com Firestore (vamos aprimorar isso depois)
        // Por enquanto, vamos criar um documento simples em 'voluntarios'
        // NOTA: A lógica de busca com Fuse.js para evitar duplicatas virá depois.
        const userDocRef = doc(db, "voluntarios", user.uid);
        await setDoc(userDocRef, {
            authUid: user.uid,
            nome: nome,
            email: email,
            statusVoluntario: 'ativo',
            // outros campos padrão que você queira adicionar
        });

        alert(`Bem-vindo, ${nome}! Cadastro realizado com sucesso.`);
        // Redireciona para a tela do painel após o sucesso
        window.location.href = '/painel.html';

    } catch (error) {
        console.error("Erro no cadastro:", error);
        if (error.code === 'auth/email-already-in-use') {
            alert("Este email já está em uso por outra conta.");
        } else {
            alert("Ocorreu um erro ao realizar o cadastro. Tente novamente.");
        }
    } finally {
        btnCadastrar.disabled = false;
        btnCadastrar.textContent = 'FINALIZAR CADASTRO';
    }
});