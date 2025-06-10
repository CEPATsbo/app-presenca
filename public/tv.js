// Passo 1: Importa as funções do Firebase no topo do módulo.
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-app.js";
import { getFirestore, collection, query, where, onSnapshot } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js";

// Passo 2: Garante que o código que manipula a página só rode depois dela carregar.
document.addEventListener('DOMContentLoaded', () => {

    // =================================================================
    //  COLE AQUI O SEU OBJETO 'firebaseConfig' COMPLETO
    // =================================================================
    const firebaseConfig = {
  apiKey: "AIzaSyBV7RPjk3cFTqL-aIpflJcUojKg1ZXMLuU",
  authDomain: "voluntarios-ativos---cepat.firebaseapp.com",
  projectId: "voluntarios-ativos---cepat",
  storageBucket: "voluntarios-ativos---cepat.firebasestorage.app",
  messagingSenderId: "66122858261",
  appId: "1:66122858261:web:7fa21f1805463b5c08331c"
};
    // =================================================================

    // Inicializa o Firebase
    const app = initializeApp(firebaseConfig);
    const db = getFirestore(app);

    // Elementos da Página
    const listaPresencaDiv = document.getElementById('lista-presenca');

    // Função para renderizar a lista na tela
    function renderizarLista(presentes) {
        const porAtividade = presentes.reduce((acc, pessoa) => {
            const atividadesIndividuais = pessoa.atividade.split(', ');
            atividadesIndividuais.forEach(atividade => {
                if (!acc[atividade]) {
                    acc[atividade] = [];
                }
                if (!acc[atividade].includes(pessoa.nome)) {
                    acc[atividade].push(pessoa.nome);
                }
            });
            return acc;
        }, {});

        listaPresencaDiv.innerHTML = '';

        const atividadesOrdenadas = Object.keys(porAtividade).sort();

        for (const atividade of atividadesOrdenadas) {
            const grupoDiv = document.createElement('div');
            grupoDiv.className = 'atividade-grupo';
            
            const titulo = document.createElement('h2');
            titulo.className = 'atividade-titulo';
            titulo.textContent = atividade;
            grupoDiv.appendChild(titulo);

            const listaUl = document.createElement('ul');
            porAtividade[atividade].sort().forEach(nome => {
                const itemLi = document.createElement('li');
                itemLi.textContent = nome;
                listaUl.appendChild(itemLi);
            });
            grupoDiv.appendChild(listaUl);
            listaPresencaDiv.appendChild(grupoDiv);
        }
    }

    // Função para carregar os dados do Firestore em tempo real
    function carregarPresencas() {
        const hoje = new Date().toISOString().split('T')[0];
        const q = query(collection(db, "presencas"), where("data", "==", hoje));

        onSnapshot(q, (querySnapshot) => {
            const presentes = [];
            querySnapshot.forEach((doc) => {
                presentes.push(doc.data());
            });
            renderizarLista(presentes);
        }, (error) => {
            console.error("Erro ao buscar presenças: ", error);
            listaPresencaDiv.innerHTML = `<p style="color:red;">Não foi possível carregar os dados. Verifique as regras de segurança do Firestore ou o console para mais detalhes.</p>`;
        });
    }

    // Inicia o carregamento assim que a página estiver pronta
    carregarPresencas();
});