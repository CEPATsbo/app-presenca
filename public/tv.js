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

    const TEMPO_CARROSSEL_MS = 20000;
    const LARGURA_BLOCO = 370; // Largura do bloco (350px) + gap (20px)

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
                // Altura estimada do bloco em "unidades" para cálculo
                altura: 85 + (voluntarios.length * 48) 
            };
        });
        
        const alturaDisponivel = listaPresencaDiv.clientHeight;
        const colunasPorPagina = Math.floor(listaPresencaDiv.clientWidth / LARGURA_BLOCO);
        
        const paginas = [];
        let paginaAtual = [];
        let alturaColunasPagina = new Array(colunasPorPagina).fill(0);
        
        todosOsBlocos.forEach(bloco => {
            let colunaComMenorAltura = alturaColunasPagina.indexOf(Math.min(...alturaColunasPagina));

            if (alturaColunasPagina[colunaComMenorAltura] + bloco.altura > alturaDisponivel) {
                paginas.push(paginaAtual);
                paginaAtual = [];
                alturaColunasPagina = new Array(colunasPorPagina).fill(0);
                colunaComMenorAltura = 0;
            }

            if (!paginaAtual[colunaComMenorAltura]) {
                paginaAtual[colunaComMenorAltura] = [];
            }
            paginaAtual[colunaComMenorAltura].push(bloco);
            alturaColunasPagina[colunaComMenorAltura] += bloco.altura;
        });

        if (paginaAtual.length > 0) {
            paginas.push(paginaAtual);
        }

        paginas.forEach((pagina) => {
            const paginaDiv = document.createElement('div');
            paginaDiv.className = 'pagina-carrossel';
            
            pagina.forEach(coluna => {
                const colunaDiv = document.createElement('div'); // Cria a div da coluna
                coluna.forEach(bloco => {
                    const grupoDiv = document.createElement('div');
                    grupoDiv.className = 'atividade-grupo';
                    grupoDiv.innerHTML = `<h2 class="atividade-titulo">${bloco.titulo}</h2><ul>${bloco.nomes.map(n => `<li>${n}</li>`).join('')}</ul>`;
                    colunaDiv.appendChild(grupoDiv); // Adiciona o bloco na coluna
                });
                paginaDiv.appendChild(colunaDiv); // Adiciona a coluna na página
            });
            listaPresencaDiv.appendChild(paginaDiv);
        });
        
        iniciarCarrossel(document.querySelectorAll('.pagina-carrossel'));
    }
    
    function iniciarCarrossel(paginas) {
        if (carrosselInterval) clearInterval(carrosselInterval);
        if (!paginas || paginas.length === 0) return;
        
        paginas.forEach(p => p.classList.remove('visivel'));
        
        if (paginas.length <= 1) {
             if (paginas.length === 1) paginas[0].classList.add('visivel');
             return;
        }
        
        let paginaAtualIndex = 0;
        paginas[paginaAtualIndex].classList.add('visivel');

        carrosselInterval = setInterval(() => {
            paginas[paginaAtualIndex].classList.remove('visivel');
            paginaAtualIndex = (paginaAtualIndex + 1) % paginas.length;
            paginas[paginaAtualIndex].classList.add('visivel');
        }, TEMPO_CARROSSEL_MS);
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
    window.addEventListener('resize', carregarPresencas);
    
    setInterval(() => {
        const novaDataSP = getDataDeHojeSP();
        if (novaDataSP !== dataAtualParaConsulta) {
            window.location.reload();
        }
    }, 60000);
});