// VERSÃO FINAL E INTEGRADA - TV COM CHECK-OUT E CARROSSEL

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

    // --- CONFIGURAÇÕES DO CARROSSEL ---
    const GRUPOS_POR_PAGINA = 6; // Quantos blocos de atividade cabem na sua TV? Ajuste este número.
    const TEMPO_POR_PAGINA = 12000; // 12 segundos por página (15000 milissegundos)
    // ------------------------------------

    const app = initializeApp(firebaseConfig);
    const db = getFirestore(app);

    const listaPresencaDiv = document.getElementById('lista-presenca');
    const dataHojeSpan = document.getElementById('data-hoje');
    
    let dataAtualParaConsulta = '';
    let unsubscribe; 
    let intervaloCarrossel;

    function getDataDeHojeSP() {
        const formatador = new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'America/Sao_Paulo' });
        return formatador.format(new Date());
    }

    function atualizarDataVisivel(dataString) {
        if (dataHojeSpan) {
            const [ano, mes, dia] = dataString.split('-');
            dataHojeSpan.textContent = `(${dia}/${mes}/${ano})`;
        }
    }
    
    function gerenciarCarrossel() {
        if (intervaloCarrossel) clearInterval(intervaloCarrossel);
        const todosOsGrupos = Array.from(listaPresencaDiv.children);
        if (todosOsGrupos.length === 0) return;

        todosOsGrupos.forEach(grupo => grupo.classList.remove('visivel'));

        const totalPaginas = Math.ceil(todosOsGrupos.length / GRUPOS_POR_PAGINA);
        let paginaAtual = 0;

        function mostrarPagina(pagina) {
            todosOsGrupos.forEach(grupo => grupo.classList.remove('visivel'));
            const inicio = pagina * GRUPOS_POR_PAGINA;
            const fim = inicio + GRUPOS_POR_PAGINA;
            const gruposDaPagina = todosOsGrupos.slice(inicio, fim);
            gruposDaPagina.forEach(grupo => grupo.classList.add('visivel'));
        }

        mostrarPagina(paginaAtual);
        if (totalPaginas <= 1) return;

        intervaloCarrossel = setInterval(() => {
            paginaAtual++;
            if (paginaAtual >= totalPaginas) {
                paginaAtual = 0;
            }
            mostrarPagina(paginaAtual);
        }, TEMPO_POR_PAGINA);
    }

    function renderizarLista(presentes) {
        if(!listaPresencaDiv) return;

        const porAtividade = presentes.reduce((acc, pessoa) => {
            const atividadesIndividuais = pessoa.atividade.split(', ');
            atividadesIndividuais.forEach(atividade => {
                if (!acc[atividade]) acc[atividade] = [];
                if (!acc[atividade].includes(pessoa.nome)) acc[atividade].push(pessoa.nome);
            });
            return acc;
        }, {});

        listaPresencaDiv.innerHTML = '';
        if (Object.keys(porAtividade).length === 0) {
            listaPresencaDiv.innerHTML = '<p style="font-size: 3vh; text-align: center;">Aguardando voluntários presentes...</p>';
            if (intervaloCarrossel) clearInterval(intervaloCarrossel);
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
        gerenciarCarrossel();
    }

    function carregarPresencas() {
        if (unsubscribe) unsubscribe();
        dataAtualParaConsulta = getDataDeHojeSP();
        atualizarDataVisivel(dataAtualParaConsulta);
        
        const q = query(
            collection(db, "presencas"), 
            where("data", "==", dataAtualParaConsulta),
            where("status", "==", "presente")
        );

        unsubscribe = onSnapshot(q, (querySnapshot) => {
            const presentes = [];
            querySnapshot.forEach((doc) => presentes.push(doc.data()));
            renderizarLista(presentes);
        }, (error) => {
            console.error("Erro ao buscar presenças: ", error);
            if(listaPresencaDiv) listaPresencaDiv.innerHTML = `<p style="color:red;">Não foi possível carregar dados. Pode ser necessário criar um índice no Firebase.</p>`;
        });
    }

    carregarPresencas();

    setInterval(() => {
        const novaDataSP = getDataDeHojeSP();
        if (novaDataSP !== dataAtualParaConsulta) {
            console.log("Virada de dia detectada! Reiniciando o painel...");
            carregarPresencas();
        }
    }, 60000);
});