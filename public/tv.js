// VERSÃO 2.2 - CORREÇÃO DE FUSO HORÁRIO

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
    
    let dataAtualParaConsulta = ''; 
    let unsubscribe; 

    // --- NOVA FUNÇÃO DE DATA COM FUSO HORÁRIO CORRETO ---
    function getDataDeHojeSP() {
        const formatador = new Intl.DateTimeFormat('en-CA', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            timeZone: 'America/Sao_Paulo'
        });
        return formatador.format(new Date());
    }

    // Função para atualizar a data visível no título (dd/mm/aaaa)
    function atualizarDataVisivel(dataString) {
        if (dataHojeSpan) {
            // A dataString já vem como AAAA-MM-DD
            const [ano, mes, dia] = dataString.split('-');
            dataHojeSpan.textContent = `(${dia}/${mes}/${ano})`;
        }
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

        if (Object.keys(porAtividade).length === 0) {
            listaPresencaDiv.innerHTML = '<p style="font-size: 3vh; text-align: center;">Aguardando os primeiros registros do dia...</p>';
            return;
        }

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
        // Desliga o listener antigo para evitar múltiplas execuções
        if (unsubscribe) {
            unsubscribe();
            console.log("Listener antigo do Firebase desligado.");
        }

        // Usa a nova função para pegar a data correta de São Paulo
        dataAtualParaConsulta = getDataDeHojeSP();
        atualizarDataVisivel(dataAtualParaConsulta); // Atualiza o título
        
        console.log(`Iniciando busca de presenças para a data: ${dataAtualParaConsulta}`);
        const q = query(collection(db, "presencas"), where("data", "==", dataAtualParaConsulta));

        // Cria o novo listener para a data correta
        unsubscribe = onSnapshot(q, (querySnapshot) => {
            console.log(`Dados recebidos para a data ${dataAtualParaConsulta}. Documentos: ${querySnapshot.size}`);
            const presentes = [];
            querySnapshot.forEach((doc) => {
                presentes.push(doc.data());
            });
            renderizarLista(presentes);
        }, (error) => {
            console.error("Erro ao buscar presenças: ", error);
            if(listaPresencaDiv){
                listaPresencaDiv.innerHTML = `<p style="color:red; text-align:center;">Não foi possível carregar os dados.</p>`;
            }
        });
        console.log(`Novo listener do Firebase iniciado para a data ${dataAtualParaConsulta}.`);
    }

    // --- LÓGICA PRINCIPAL DE EXECUÇÃO ---
    
    // 1. Carrega as presenças do dia atual assim que a página abre
    carregarPresencas();

    // 2. A cada 1 minuto, verifica se o dia mudou (usando a data de São Paulo)
    setInterval(() => {
        const novaDataSP = getDataDeHojeSP();
        if (novaDataSP !== dataAtualParaConsulta) {
            console.log(`Virada de dia detectada! (de ${dataAtualParaConsulta} para ${novaDataSP}). Reiniciando o painel...`);
            // Limpa a tela imediatamente antes de carregar novos dados
            if(listaPresencaDiv) listaPresencaDiv.innerHTML = '';
            // Carrega os dados para o novo dia
            carregarPresencas();
        }
    }, 60000); // Verifica a cada 60 segundos
});