// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyBV7RPjk3cFTqL-aIpflJcUojKg1ZXMLuU",
  authDomain: "voluntarios-ativos---cepat.firebaseapp.com",
  projectId: "voluntarios-ativos---cepat",
  storageBucket: "voluntarios-ativos---cepat.firebasestorage.app",
  messagingSenderId: "66122858261",
  appId: "1:66122858261:web:7fa21f1805463b5c08331c"
};

// Initialize Firebase
const firebaseConfig = {
  apiKey: "AIzaSyBV7RPjk3cFTqL-aIpflJcUojKg1ZXMLuU",
  authDomain: "voluntarios-ativos---cepat.firebaseapp.com",
  projectId: "voluntarios-ativos---cepat",
  storageBucket: "voluntarios-ativos---cepat.firebasestorage.app",
  messagingSenderId: "66122858261",
  appId: "1:66122858261:web:7fa21f1805463b5c08331c"
};
// -------------------------------------------------------------

// Inicializa o Firebase
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

const listaPresencaDiv = document.getElementById('lista-presenca');

// Função para renderizar a lista de presentes na tela
function renderizarLista(presentes) {
    // Agrupa os presentes por atividade
    const porAtividade = presentes.reduce((acc, pessoa) => {
        const atividade = pessoa.atividade;
        if (!acc[atividade]) {
            acc[atividade] = [];
        }
        acc[atividade].push(pessoa.nome);
        return acc;
    }, {});

    listaPresencaDiv.innerHTML = ''; // Limpa a lista antes de redesenhar

    // Cria o HTML para cada grupo de atividade
    for (const atividade in porAtividade) {
        const grupoDiv = document.createElement('div');
        grupoDiv.className = 'atividade-grupo';
        
        const titulo = document.createElement('h2');
        titulo.className = 'atividade-titulo';
        titulo.textContent = atividade;
        grupoDiv.appendChild(titulo);

        const listaUl = document.createElement('ul');
        porAtividade[atividade].sort().forEach(nome => { // Ordena os nomes em ordem alfabética
            const itemLi = document.createElement('li');
            itemLi.textContent = nome;
            listaUl.appendChild(itemLi);
        });
        grupoDiv.appendChild(listaUl);

        listaPresencaDiv.appendChild(grupoDiv);
    }
}


// Ouve as mudanças na coleção de presenças em TEMPO REAL
function carregarPresencas() {
    const hoje = new Date().toISOString().split('T')[0];

    db.collection("presencas").where("data", "==", hoje)
      .onSnapshot((querySnapshot) => {
          const presentes = [];
          querySnapshot.forEach((doc) => {
              presentes.push(doc.data());
          });
          renderizarLista(presentes);
      }, (error) => {
          console.error("Erro ao buscar presenças: ", error);
          listaPresencaDiv.innerHTML = <p style="color:red;">Erro ao carregar dados.</p>;
      });
}

// Inicia o carregamento quando a página abre
window.onload = carregarPresencas;