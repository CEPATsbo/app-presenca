import { initializeApp } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-app.js";
import { getFirestore, collection, query, where, getDocs } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js";

// Configuração exata do seu projeto Firebase
const firebaseConfig = {
    apiKey: "AIzaSyBV7RPjk3cFTqL-aIpflJcUojKg1ZXMLuU",
    authDomain: "voluntarios-ativos---cepat.firebaseapp.com",
    projectId: "voluntarios-ativos---cepat",
    storageBucket: "voluntarios-ativos---cepat.appspot.com",
    messagingSenderId: "66122858261",
    appId: "1:66122858261:web:7fa21f1805463b5c08331c"
};

// Inicialização dos serviços do Firebase
const app = initializeApp(firebaseConfig);
const bancoDeDados = getFirestore(app);

// Referências dos elementos do DOM
const containerAcolhimento = document.getElementById('container-acolhimento');
const estadoCarregamento = document.getElementById('estado-carregamento');
const estadoVazio = document.getElementById('estado-vazio');

// ===================================================================
// --- FUNÇÕES AUXILIARES DE DATA (FUSO HORÁRIO DE SP) ---
// ===================================================================

function formatarDataParaStringFirebase(dataOriginal) {
    const formatadorDeData = new Intl.DateTimeFormat('en-CA', { 
        year: 'numeric', 
        month: '2-digit', 
        day: '2-digit', 
        timeZone: 'America/Sao_Paulo' 
    });
    return formatadorDeData.format(dataOriginal);
}

function formatarDataParaExibicaoNoBrasil(dataStringFormatoFirebase) {
    // Transforma "2026-06-15" em "15/06/2026"
    const partesDaData = dataStringFormatoFirebase.split("-");
    if (partesDaData.length === 3) {
        return `${partesDaData[2]}/${partesDaData[1]}/${partesDaData[0]}`;
    }
    return dataStringFormatoFirebase;
}

function obterNomeDoDiaDaSemana(indiceDoDia) {
    const nomesDosDias = ["Domingo", "Segunda-feira", "Terça-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira", "Sábado"];
    return nomesDosDias[indiceDoDia];
}

function identificarDiasDeTrabalhoDoVoluntario(arrayDeDatasPresentes) {
    const contagemDiasDaSemana = [0, 0, 0, 0, 0, 0, 0];

    for (const dataString of arrayDeDatasPresentes) {
        const dataConvertida = new Date(dataString + "T12:00:00");
        const indiceDoDia = dataConvertida.getDay();
        contagemDiasDaSemana[indiceDoDia]++;
    }

    const diasEsperadosConfirmados = [];
    const NUMERO_MINIMO_DE_PRESENCAS = 3;

    for (let indice = 0; indice < contagemDiasDaSemana.length; indice++) {
        if (contagemDiasDaSemana[indice] >= NUMERO_MINIMO_DE_PRESENCAS) {
            diasEsperadosConfirmados.push(indice);
        }
    }

    return diasEsperadosConfirmados;
}

function calcularDuasUltimasOcorrenciasDoDia(indiceDiaDaSemanaAlvo, dataReferenciaAtual) {
    const diaDaSemanaAtual = dataReferenciaAtual.getDay();
    let diasParaVoltarAteAUltimaVez = diaDaSemanaAtual - indiceDiaDaSemanaAlvo;
    
    if (diasParaVoltarAteAUltimaVez <= 0) {
        diasParaVoltarAteAUltimaVez += 7;
    }

    const dataDaUltimaOcorrencia = new Date(dataReferenciaAtual);
    dataDaUltimaOcorrencia.setDate(dataReferenciaAtual.getDate() - diasParaVoltarAteAUltimaVez);

    const dataDaOcorrenciaRetrasada = new Date(dataDaUltimaOcorrencia);
    dataDaOcorrenciaRetrasada.setDate(dataDaUltimaOcorrencia.getDate() - 7);

    return [
        formatarDataParaStringFirebase(dataDaUltimaOcorrencia),
        formatarDataParaStringFirebase(dataDaOcorrenciaRetrasada)
    ];
}

// ===================================================================
// --- LÓGICA PRINCIPAL DO ACOLHIMENTO ---
// ===================================================================

async function iniciarAnaliseDeAcolhimento() {
    const dataDeHojeParaCalculo = new Date();
    const dataSessentaDiasAtras = new Date();
    dataSessentaDiasAtras.setDate(dataDeHojeParaCalculo.getDate() - 60);
    const stringDataLimite = formatarDataParaStringFirebase(dataSessentaDiasAtras);

    try {
        const consultaPresencasRecentes = query(
            collection(bancoDeDados, "presencas"),
            where("data", ">=", stringDataLimite)
        );

        const snapshotDasPresencas = await getDocs(consultaPresencasRecentes);
        const historicoGeralPorVoluntario = {};

        snapshotDasPresencas.forEach((documento) => {
            const dados = documento.data();
            const chaveDoVoluntario = dados.voluntarioId || dados.nome; 

            if (!historicoGeralPorVoluntario[chaveDoVoluntario]) {
                historicoGeralPorVoluntario[chaveDoVoluntario] = {
                    nomeCompleto: dados.nome,
                    listaDeAtividades: new Set(),
                    datasComPresencaConfirmada: []
                };
            }

            historicoGeralPorVoluntario[chaveDoVoluntario].datasComPresencaConfirmada.push(dados.data);
            
            // Tratamento robusto: verifica se a atividade é Texto ou Lista (Array)
            if (dados.atividade) {
                if (typeof dados.atividade === 'string') {
                    // Se for um texto separado por vírgula
                    const atividadesSeparadas = dados.atividade.split(",");
                    for (const atv of atividadesSeparadas) {
                        historicoGeralPorVoluntario[chaveDoVoluntario].listaDeAtividades.add(atv.trim());
                    }
                } else if (Array.isArray(dados.atividade)) {
                    // Se já for uma lista/Array estruturada no banco
                    for (const atv of dados.atividade) {
                        if (typeof atv === 'string') {
                            historicoGeralPorVoluntario[chaveDoVoluntario].listaDeAtividades.add(atv.trim());
                        }
                    }
                }
            }
        });

        const voluntariosQuePrecisamDeAcolhimento = [];

        for (const chave in historicoGeralPorVoluntario) {
            const dadosDoVoluntario = historicoGeralPorVoluntario[chave];
            const diasOficiaisDeTrabalho = identificarDiasDeTrabalhoDoVoluntario(dadosDoVoluntario.datasComPresencaConfirmada);

            const relatorioDeFaltasPorDia = [];

            for (const indiceDoDia of diasOficiaisDeTrabalho) {
                const datasEsperadas = calcularDuasUltimasOcorrenciasDoDia(indiceDoDia, dataDeHojeParaCalculo);
                
                const faltouNaUltimaVez = !dadosDoVoluntario.datasComPresencaConfirmada.includes(datasEsperadas[0]);
                const faltouNaVezRetrasada = !dadosDoVoluntario.datasComPresencaConfirmada.includes(datasEsperadas[1]);

                if (faltouNaUltimaVez && faltouNaVezRetrasada) {
                    relatorioDeFaltasPorDia.push({
                        nomeDoDiaDaSemana: obterNomeDoDiaDaSemana(indiceDoDia),
                        dataFaltaRecente: formatarDataParaExibicaoNoBrasil(datasEsperadas[0]),
                        dataFaltaRetrasada: formatarDataParaExibicaoNoBrasil(datasEsperadas[1])
                    });
                }
            }

            if (relatorioDeFaltasPorDia.length > 0) {
                voluntariosQuePrecisamDeAcolhimento.push({
                    nome: dadosDoVoluntario.nomeCompleto,
                    atividades: Array.from(dadosDoVoluntario.listaDeAtividades).join(" | "),
                    detalhesDasFaltas: relatorioDeFaltasPorDia
                });
            }
        }

        renderizarCardsDeAcolhimento(voluntariosQuePrecisamDeAcolhimento);

    } catch (erro) {
        console.error("Erro ao buscar dados do Firebase para o acolhimento:", erro);
        if (estadoCarregamento) {
            estadoCarregamento.innerHTML = "<p>Ocorreu um erro ao carregar os dados. Verifique sua conexão e recarregue a página.</p>";
        }
    }
}

// ===================================================================
// --- RENDERIZAÇÃO NA TELA E AÇÃO DO WHATSAPP ---
// ===================================================================

function renderizarCardsDeAcolhimento(listaDeVoluntarios) {
    estadoCarregamento.classList.add('escondido');

    if (listaDeVoluntarios.length === 0) {
        estadoVazio.classList.remove('escondido');
        return;
    }

    containerAcolhimento.innerHTML = '';

    for (const voluntario of listaDeVoluntarios) {
        const elementoCard = document.createElement('div');
        elementoCard.className = 'card-acolhimento';

        // Constrói a lista HTML de dias faltosos
        let htmlDiasFaltosos = '<ul class="lista-dias-faltosos">';
        for (const falta of voluntario.detalhesDasFaltas) {
            htmlDiasFaltosos += `<li><strong>${falta.nomeDoDiaDaSemana}</strong> (dias ${falta.dataFaltaRetrasada} e ${falta.dataFaltaRecente})</li>`;
        }
        htmlDiasFaltosos += '</ul>';

        // Prepara o texto e o link do WhatsApp
        const primeiroNome = voluntario.nome.split(" ")[0];
        const textoAcolhimento = `Olá, ${primeiroNome}! Tudo bem com você? Aqui é do Acolhimento da Casa Paulo de Tarso. Notamos que você não pôde estar conosco nos últimos dias de suas atividades e viemos apenas dar um oi para saber se está tudo bem com você e sua família, e se precisa de alguma coisa. Sinta-se abraçado por todos nós!`;
        const linkWhatsApp = `https://wa.me/?text=${encodeURIComponent(textoAcolhimento)}`;

        // Estrutura interna do Card
        elementoCard.innerHTML = `
            <div class="cabecalho-card">
                <h3 class="nome-voluntario">${voluntario.nome}</h3>
                <span class="etiqueta-alerta">Atenção</span>
            </div>
            
            <div class="corpo-card">
                <div class="informacao-linha">
                    <strong>Atividades Desenvolvidas:</strong> 
                    ${voluntario.atividades || 'Não informada'}
                </div>
                
                <div class="alerta-faltas">
                    <div class="titulo-falta">
                        <span class="icone-alerta">⚠️</span> 
                        <span>Ausente nas últimas 2 ocorrências de:</span>
                    </div>
                    ${htmlDiasFaltosos}
                </div>
            </div>
            
            <div class="rodape-card">
                <a href="${linkWhatsApp}" target="_blank" class="botao-whatsapp">
                    Acolher pelo WhatsApp
                </a>
            </div>
        `;

        containerAcolhimento.appendChild(elementoCard);
    }
}

// Inicia o processo assim que o arquivo é carregado
iniciarAnaliseDeAcolhimento();