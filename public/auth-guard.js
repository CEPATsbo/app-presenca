import { initializeApp } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-auth.js";

const firebaseConfig = {
    apiKey: "AIzaSyBV7RPjk3cFTqL-aIpflJcUojKg1ZXMLuU",
    authDomain: "voluntarios-ativos---cepat.firebaseapp.com",
    projectId: "voluntarios-ativos---cepat",
    storageBucket: "voluntarios-ativos---cepat.firebasestorage.app",
    messagingSenderId: "66122858261",
    appId: "1:66122858261:web:7fa21f1805463b5c08331c"
};

const app = initializeApp(firebaseConfig, "authGuardApp");
const auth = getAuth(app);

onAuthStateChanged(auth, (user) => {
    // A lógica agora é simples:
    // Se NÃO houver um usuário logado...
    if (!user) {
        // ...então redirecione para a página de login.
        console.log("Auth Guard: Usuário não logado. Redirecionando para /login.html");
        window.location.href = '/login.html';
    }
    // Se houver um usuário logado, o script não faz NADA,
    // permitindo que o usuário permaneça na página que ele tentou acessar (ex: painel-vibracoes.html).
});