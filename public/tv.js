import { initializeApp } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-app.js";
import { getFirestore, collection, query, where, onSnapshot } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js";

document.addEventListener('DOMContentLoaded', () => {

    // =================================================================
    //  COLE AQUI O MESMO OBJETO 'firebaseConfig'
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

    const app = initializeApp(firebaseConfig);
    const db = getFirestore(app);

    const listaPresencaDiv = document.getElementById('lista-presenca');

    function renderizarLista(presentes) {
        const porAtividade = presentes.reduce((acc, pessoa) => {
            const atividades = pessoa.atividade.split(', ');
            atividades.forEach(atividade => {
                if (!acc[atividade]) {
                    acc[atividade] = [];
                }
                // Evita adicionar nomes duplicados na mesma atividade
                if (!acc[atividade].includes(pessoa.nome)) {
                    acc[atividade].push(pessoa.nome);
                }
            });
            return acc;
        }, {});

        listaPresencaDiv.innerHTML = '';

        for (const atividade of Object.keys(porAtividade).sort()) {
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

            listaPresencaDiv.appendChild(listaUl);
        }
    }

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
            listaPresencaDiv.innerHTML = `<p style="color:red;">Erro ao carregar dados.</p>`;
        });
    }

    carregarPresencas();
});