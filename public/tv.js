// Importa as funções do Firebase no topo do módulo.
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-app.js";
import { getFirestore, collection, query, where, onSnapshot } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js";

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

    const app = initializeApp(firebaseConfig);
    const db = getFirestore(app);

    const listaPresencaDiv = document.getElementById('lista-presenca');
    const dataHojeSpan = document.getElementById('data-hoje');
    
    let dataAtualFormatada = ''; 
    let unsubscribe; 

    function getEAtualizarDataFormatada() {
        const hoje = new Date();
        const dia = String(hoje.getDate()).padStart(2, '0');
        const mes = String(hoje.getMonth() + 1).padStart(2, '0');
        const ano = hoje.getFullYear();
        
        if(dataHojeSpan) {
            dataHojeSpan.textContent = `(${dia}/${mes}/${ano})`;
        }
        
        return hoje.toISOString().split('T')[0];
    }

    function renderizarLista(presentes) {
        if(!listaPresencaDiv) return;

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

    function carregarPresencas() {
        if (unsubscribe) {
            unsubscribe();
            console.log("Listener antigo do Firebase desligado.");
        }

        dataAtualFormatada = getEAtualizarDataFormatada();
        
        const q = query(collection(db, "presencas"), where("data", "==", dataAtualFormatada));

        unsubscribe = onSnapshot(q, (querySnapshot) => {
            console.log(`Dados recebidos para a data ${dataAtualFormatada}. Documentos: ${querySnapshot.size}`);
            const presentes = [];
            querySnapshot.forEach((doc) => {
                presentes.push(doc.data());
            });
            renderizarLista(presentes);
        }, (error) => {
            console.error("Erro ao buscar presenças: ", error);
            if(listaPresencaDiv){
                listaPresencaDiv.innerHTML = `<p style="color:red;">Não foi possível carregar os dados.</p>`;
            }
        });
        console.log(`Novo listener do Firebase iniciado para a data ${dataAtualFormatada}.`);
    }

    // --- LÓGICA PRINCIPAL DE EXECUÇÃO ---
    
    // 1. Carrega as presenças do dia atual assim que a página abre
    carregarPresencas();

    // 2. A cada 1 minuto, verifica se o dia mudou
    setInterval(() => {
        const novaDataParaConsulta = new Date().toISOString().split('T')[0];
        if (novaDataParaConsulta !== dataAtualFormatada) {
            console.log("Virada de dia detectada! Reiniciando o painel...");
            carregarPresencas();
        }
    }, 60000); // Verifica a cada 60 segundos
});