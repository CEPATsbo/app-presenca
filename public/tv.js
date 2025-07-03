// VERSÃO FINAL CORRIGIDA - COM BALANCEAMENTO E TODAS AS FUNÇÕES

import { initializeApp } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-app.js";
import { getFirestore, collection, query, where, onSnapshot } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js";

document.addEventListener('DOMContentLoaded', () => {

    const firebaseConfig = {
  apiKey: "AIzaSyBV7RPjk3cFTqL-aIpflJcUojKg1ZXMLuU",
  authDomain: "voluntarios-ativos---cepat.firebaseapp.com",
  projectId: "voluntarios-ativos---cepat",
  storageBucket: "voluntarios-ativos---cepat.firebasestorage.app",
  messagingSenderId: "66122858261",
  appId: "1:66122858261:web:7fa21f1805463b5c08331c"
};
    const app = initializeApp(firebaseConfig);
    const db = getFirestore(app);

    const TEMPO_CARROSSEL_MS = 15000;
    const MAX_VOLUNTARIOS_POR_BLOCO = 5;
    const MAX_VOLUNTARIOS_POR_COLUNA = 7;

    const listaPresencaDiv = document.getElementById('lista-presenca');
    const dataHojeSpan = document.getElementById('data-hoje');
    
    let dataAtualParaConsulta = '';
    let unsubscribe; 
    let carrosselInterval;

    function getDataDeHojeSP() {
        const agora = new Date();
        // Formata a data para a consulta no Firestore (AAAA-MM-DD)
        const formatadorQuery = new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'America/Sao_Paulo' });
        return formatadorQuery.format(agora);
    }

    // --- FUNÇÃO RESTAURADA ---
    function atualizarDataVisivel(dataString) {
        if (dataHojeSpan) {
            const [ano, mes, dia] = dataString.split('-');
            dataHojeSpan.textContent = `(${dia}/${mes}/${ano})`;
        }
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
            listaPresencaDiv.innerHTML = '<p style="font-size: 3vh; text-align: center; width: 100%;">Aguardando voluntários presentes...</p>';
            if (carrosselInterval) clearInterval(carrosselInterval);
            return;
        }

        const todosOsBlocos = [];
        Object.keys(porAtividade).sort().forEach(atividade => {
            const voluntarios = porAtividade[atividade].sort();
            const totalPaginas = Math.ceil(voluntarios.length / MAX_VOLUNTARIOS_POR_BLOCO);
            for (let i = 0; i < totalPaginas; i++) {
                const inicio = i * MAX_VOLUNTARIOS_POR_BLOCO;
                const fim = inicio + MAX_VOLUNTARIOS_POR_BLOCO;
                const nomesDoBloco = voluntarios.slice(inicio, fim);
                todosOsBlocos.push({
                    atividade: atividade,
                    titulo: totalPaginas > 1 ? `${atividade} (pág ${i + 1}/${totalPaginas})` : atividade,
                    nomes: nomesDoBloco,
                    contagem: nomesDoBloco.length
                });
            }
        });

        const colunasPorPagina = Math.max(1, Math.floor(window.innerWidth / 420));
        const paginasDoCarrossel = [];
        let paginaAtual = [];
        let colunaAtual = [];
        let contagemNaColuna = 0;
        
        todosOsBlocos.forEach(bloco => {
            if (colunaAtual.length === 0) {
                colunaAtual.push(bloco);
                contagemNaColuna = bloco.contagem;
            } else if (colunaAtual.length === 1 && (contagemNaColuna + bloco.contagem) <= MAX_VOLUNTARIOS_POR_COLUNA) {
                colunaAtual.push(bloco);
                contagemNaColuna += bloco.contagem;
            } else {
                paginaAtual.push(colunaAtual);
                if (paginaAtual.length >= colunasPorPagina) {
                    paginasDoCarrossel.push(paginaAtual);
                    paginaAtual = [];
                }
                colunaAtual = [bloco];
                contagemNaColuna = bloco.contagem;
            }
        });
        if (colunaAtual.length > 0) paginaAtual.push(colunaAtual);
        if (paginaAtual.length > 0) paginasDoCarrossel.push(paginaAtual);

        paginasDoCarrossel.forEach((pagina, index) => {
            const paginaDiv = document.createElement('div');
            paginaDiv.className = 'pagina-carrossel';
            if (index > 0) paginaDiv.style.display = 'none';
            pagina.forEach(coluna => {
                const colunaDiv = document.createElement('div');
                colunaDiv.className = 'coluna';
                coluna.forEach(bloco => {
                    const grupoDiv = document.createElement('div');
                    grupoDiv.className = 'atividade-grupo visivel';
                    grupoDiv.innerHTML = `<h2 class="atividade-titulo">${bloco.titulo}</h2><ul>${bloco.nomes.map(n => `<li>${n}</li>`).join('')}</ul>`;
                    colunaDiv.appendChild(grupoDiv);
                });
                paginaDiv.appendChild(colunaDiv);
            });
            listaPresencaDiv.appendChild(paginaDiv);
        });

        iniciarCarrossel(paginasDoCarrossel);
    }
    
    function iniciarCarrossel(paginas) {
        if (carrosselInterval) clearInterval(carrosselInterval);
        if (paginas.length <= 1) {
             if (paginas.length === 1) paginas[0].style.display = 'flex';
             return;
        }
        
        let paginaAtualIndex = 0;
        paginas.forEach((p, i) => p.style.display = i === 0 ? 'flex' : 'none');

        carrosselInterval = setInterval(() => {
            paginas[paginaAtualIndex].style.display = 'none';
            paginaAtualIndex = (paginaAtualIndex + 1) % paginas.length;
            paginas[paginaAtualIndex].style.display = 'flex';
        }, TEMPO_CARROSSEL_MS);
    }
    
    const style = document.createElement('style');
    style.innerHTML = `
        .pagina-carrossel { display: flex; width: 100%; height: 100%; gap: 20px; justify-content: center; align-items: flex-start; }
        .coluna { display: flex; flex-direction: column; gap: 20px; flex-basis: 350px; flex-grow: 1; max-width: 400px; }
    `;
    document.head.appendChild(style);

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
            if(listaPresencaDiv) listaPresencaDiv.innerHTML = `<p style="color:red;">Não foi possível carregar dados.</p>`;
        });
    }

    carregarPresencas();

    setInterval(() => {
        const novaDataSP = getDataDeHojeSP();
        if (novaDataSP !== dataAtualParaConsulta) {
            console.log("Virada de dia detectada! Recarregando a página...");
            window.location.reload();
        }
    }, 60000);
});