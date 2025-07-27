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

    const TEMPO_CARROSSEL_MS = 20000; // 20 segundos
    const MAX_LINHAS_POR_COLUNA = 10; // Altura máxima de uma coluna em "unidades" (título + nomes)

    const listaPresencaDiv = document.getElementById('lista-presenca');
    const dataHojeSpan = document.getElementById('data-hoje');
    
    let dataAtualParaConsulta = '';
    let unsubscribe; 
    let carrosselInterval;

    function getDataDeHojeSP() {
        const agora = new Date();
        const formatadorQuery = new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'America/Sao_Paulo' });
        return formatadorQuery.format(agora);
    }

    function atualizarDataVisivel(dataString) {
        if (dataHojeSpan) {
            const [ano, mes, dia] = dataString.split('-');
            dataHojeSpan.textContent = `(${dia}/${mes}/${ano})`;
        }
    }
    
    function renderizarLista(presentes) {
        if(!listaPresencaDiv) return;

        const porAtividade = presentes.reduce((acc, pessoa) => {
            let atividadesIndividuais = [];
            if (Array.isArray(pessoa.atividade)) {
                atividadesIndividuais = pessoa.atividade;
            } else if (typeof pessoa.atividade === 'string') {
                atividadesIndividuais = pessoa.atividade.split(',').map(a => a.trim());
            }
            
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

        const todosOsBlocos = Object.keys(porAtividade).sort().map(atividade => {
            const voluntarios = porAtividade[atividade].sort();
            return {
                titulo: atividade,
                nomes: voluntarios,
                // Altura em "unidades": 2 para o título, 1 por nome
                altura: 2 + voluntarios.length 
            };
        });

        // Lógica de distribuição em colunas (Masonry Layout)
        const colunas = [[]];
        const alturasColunas = [0];

        todosOsBlocos.forEach(bloco => {
            let colunaComMenorAltura = 0;
            // Encontra a coluna mais "vazia" para adicionar o próximo bloco
            for (let i = 1; i < alturasColunas.length; i++) {
                if (alturasColunas[i] < alturasColunas[colunaComMenorAltura]) {
                    colunaComMenorAltura = i;
                }
            }

            if (alturasColunas[colunaComMenorAltura] + bloco.altura > MAX_LINHAS_POR_COLUNA && colunas.length < 4) {
                 // Se o bloco não cabe e ainda temos espaço, cria uma nova coluna
                colunas.push([bloco]);
                alturasColunas.push(bloco.altura);
            } else {
                // Adiciona o bloco na coluna com menor altura
                colunas[colunaComMenorAltura].push(bloco);
                alturasColunas[colunaComMenorAltura] += bloco.altura;
            }
        });

        // Renderiza as colunas e os blocos
        colunas.forEach(colunaData => {
            const colunaDiv = document.createElement('div');
            colunaData.forEach(bloco => {
                const grupoDiv = document.createElement('div');
                grupoDiv.className = 'atividade-grupo';
                grupoDiv.style.gridRow = `span ${bloco.altura}`; // Define a altura no grid
                grupoDiv.innerHTML = `<h2 class="atividade-titulo">${bloco.titulo}</h2><ul>${bloco.nomes.map(n => `<li>${n}</li>`).join('')}</ul>`;
                colunaDiv.appendChild(grupoDiv);
            });
            listaPresencaDiv.appendChild(colunaDiv);
        });
        
        // Revela os blocos com uma pequena animação
        setTimeout(() => {
            document.querySelectorAll('.atividade-grupo').forEach(el => el.classList.add('visivel'));
        }, 100);
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