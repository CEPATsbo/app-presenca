// /js/cadastro.js
// VERSÃO COM LÓGICA DE VINCULAÇÃO POR NOME (SUGESTÃO)

import { initializeApp } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, updateProfile } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-auth.js";
import { getFirestore, doc, setDoc, updateDoc, collection, query, where, getDocs, limit } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyBV7RPjk3cFTqL-aIpflJcUojKg1ZXMLuU",
    authDomain: "voluntarios-ativos---cepat.firebaseapp.com",
    projectId: "voluntarios-ativos---cepat",
    storageBucket: "voluntarios-ativos---cepat.firebasestorage.app", // Corrigido
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
let debounceTimer; // Para o "buscar enquanto digita"
let voluntarioSelecionadoId = null; // Chave-mestra: decide se vamos ATUALIZAR ou CRIAR

// ===================================================================
// FUNÇÃO DEBUSCA (Buscar-enquanto-digita)
// ===================================================================
inputNome.addEventListener('input', () => {
    // Se o usuário já selecionou um nome, não faz mais buscas
    if (voluntarioSelecionadoId) return;

    clearTimeout(debounceTimer);
    const nomeDigitado = inputNome.value.trim();

    if (nomeDigitado.length < 4) {
        modal.classList.remove('modal-visible');
        return; // Só busca com 4+ caracteres
    }

    // Espera 500ms após a última tecla antes de consultar o banco
    debounceTimer = setTimeout(async () => {
        console.log(`Buscando por nomes começando com: ${nomeDigitado}`);
        
        const voluntariosRef = collection(db, "voluntarios");
        // Consulta:
        // 1. Nome começa com o digitado (case-sensitive, infelizmente é uma limitação)
        // 2. E que AINDA NÃO TEM login (authUid == null)
        const q = query(voluntariosRef, 
            where("nome", ">=", nomeDigitado), 
            where("nome", "<=", nomeDigitado + '\uf8ff'),
            where("authUid", "==", null), // A MÁGICA: SÓ PEGA ÓRFÃOS
            limit(5)
        );

        const querySnapshot = await getDocs(q);

        listaSugestoes.innerHTML = ''; // Limpa sugestões antigas

        if (querySnapshot.empty) {
            console.log("Nenhum voluntário 'órfão' encontrado.");
            modal.classList.remove('modal-visible');
            return;
        }

        // Se encontrou, preenche o pop-up
        querySnapshot.forEach(doc => {
            const voluntario = doc.data();
            const li = document.createElement('li');
            li.textContent = voluntario.nome;
            
            const btnSouEu = document.createElement('button');
            btnSouEu.textContent = 'Sou eu';
            btnSouEu.className = 'btn-sou-eu';
            btnSouEu.type = 'button'; // Previne submit do formulário
            btnSouEu.dataset.id = doc.id; // Guarda o ID do documento
            btnSouEu.dataset.nome = voluntario.nome; // Guarda o nome completo
            
            li.appendChild(btnSouEu);
            listaSugestoes.appendChild(li);
        });

        modal.classList.add('modal-visible'); // Mostra o pop-up

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
        
        // 1. Guarda o ID para o submit
        voluntarioSelecionadoId = docId;
        
        // 2. Atualiza o formulário
        inputNome.value = nomeCompleto; // Preenche o nome correto
        inputNome.disabled = true; // Trava o campo nome
        msgVinculado.textContent = `Ótimo! Vamos vincular sua conta, ${nomeCompleto.split(' ')[0]}.`;
        msgVinculado.style.display = 'block';

        // 3. Fecha o modal
        modal.classList.remove('modal-visible');
    }
});

// Ação: Usuário clica em "Não sou nenhum desses"
btnNovoUsuario.addEventListener('click', () => {
    console.log("Usuário selecionou 'Novo Cadastro'.");
    voluntarioSelecionadoId = null; // Garante que vamos criar um novo
    modal.classList.remove('modal-visible');
    // Opcional: Travar o inputNome para ele não mudar e reabrir o modal
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

    // Re-habilita o nome só para pegar o valor, caso esteja travado
    inputNome.disabled = false; 
    const nome = inputNome.value.trim();
    inputNome.disabled = (voluntarioSelecionadoId != null); // Trava de novo se for o caso

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
        // 1. Criar o usuário no Firebase Authentication (isso sempre acontece)
        console.log("Tentando criar usuário no Firebase Auth...");
        const userCredential = await createUserWithEmailAndPassword(auth, email, senha);
        const user = userCredential.user;
        console.log("SUCESSO: Usuário criado no Auth:", user.uid);

        // 2. Atualizar o perfil do usuário no Auth com o nome
        await updateProfile(user, { displayName: nome });

        // 3. DECISÃO: Vincular (Update) ou Criar Novo (Set)?
        if (voluntarioSelecionadoId) {
            // ========================================
            // CASO A: VINCULAR CONTA (UPDATE)
            // ========================================
            console.log(`Vinculando Auth UID ${user.uid} ao documento ${voluntarioSelecionadoId}`);
            const userDocRef = doc(db, "voluntarios", voluntarioSelecionadoId);
            await updateDoc(userDocRef, {
                authUid: user.uid,
                email: email, // Atualiza o email no registro antigo
                nome: nome    // Atualiza o nome, caso ele tenha corrigido
            });
            console.log("SUCESSO: Conta antiga vinculada ao novo login.");

        } else {
            // ========================================
            // CASO B: CRIAR NOVO REGISTRO (SET)
            // ========================================
            console.log("Nenhum voluntário selecionado. Criando novo registro...");
            // Usamos o Auth UID como ID do documento no Firestore (excelente prática!)
            const userDocRef = doc(db, "voluntarios", user.uid);
            await setDoc(userDocRef, {
                authUid: user.uid,
                nome: nome,
                email: email,
                statusVoluntario: 'ativo',
                cargos: { // Define cargos padrão
                    voluntario: true 
                }
            });
            console.log("SUCESSO: Novo documento de voluntário criado no Firestore.");
        }

        alert(`Bem-vindo, ${nome}! Conta criada/vinculada com sucesso.`);
        window.location.href = '/meu-cepat.html'; // Redireciona para o portal do voluntário

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
        inputNome.disabled = false; // Libera o campo nome em caso de erro
    }
});