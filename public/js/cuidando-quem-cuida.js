import { initializeApp } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-auth.js";
import { getFirestore, collection, query, where, getDocs, setDoc, doc } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js";

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
const auth = getAuth(app); // INICIALIZA A AUTENTICAÇÃO
const bancoDeDados = getFirestore(app);

// Lista de atividades esporádicas ou mensais que devem ficar de fora do controle de faltas
const ATIVIDADES_EXCLUIDAS_DO_CONTROLE = [
    "coral", 
    "projeto musica viva", 
    "musica viva", 
    "caritas", 
    "vivencia espirita", 
    "bazar", 
    "musica", 
    "*em assistencia espiritual", 
    "caravana \" implantacao do evangelho no lar\"", 
    "caravana ' implantacao do evangelho no lar'"
];

// Referências dos elementos do DOM
const containerAcolhimento = document.getElementById('container-acolhimento');
const estadoCarregamento = document.getElementById('estado-carregamento');
const estadoVazio = document.getElementById('estado-vazio');

// ===================================================================
// --- FUNÇÕES AUXILIARES E DE NORMALIZAÇÃO ---
// ===================================================================

function normalizarNomeParaAgrupamento(str) {
    if (!str) return "desconhecido";
    return str.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
}

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

function formatarNumeroWhatsApp(numeroBruto) {
    if (!numeroBruto) return "";
    let numeroLimpo = numeroBruto.toString().replace(/\D/g, '');
    
    if (numeroLimpo.length === 10 || numeroLimpo.length === 11) {
        numeroLimpo = "55" + numeroLimpo;
    }
    return numeroLimpo;
}

// ===================================================================
// --- AÇÃO DE CLICK: REGISTRAR E ABRIR WHATSAPP ---
// ===================================================================

window.registrarAcolhimentoEabrirWhatsApp = async function(eventoDeClique, chaveUnificada, linkDoWhatsApp) {
    eventoDeClique.preventDefault();

    const elementoCard = eventoDeClique.target.closest('.card-acolhimento');
    if (elementoCard) {
        elementoCard.style.display = 'none';
    }

    window.open(linkDoWhatsApp, '_blank');

    try {
        const referenciaDocumento = doc(bancoDeDados, "acolhimentos_log", chaveUnificada);
        const dataDeHojeEmIsoString = new Date().toISOString(); 
        
        await setDoc(referenciaDocumento, { 
            dataUltimoAcolhimento: dataDeHojeEmIsoString 
        }, { merge: true });

    } catch (erroDeGravacao) {
        console.error("Erro ao salvar o log de acolhimento:", erroDeGravacao);
    }
};

// ===================================================================
// --- LÓGICA PRINCIPAL DO ACOLHIMENTO ---
// ===================================================================

async function iniciarAnaliseDeAcolhimento() {
    const dataDeHojeParaCalculo = new Date();
    const dataSessentaDiasAtras = new Date();
    dataSessentaDiasAtras.setDate(dataDeHojeParaCalculo.getDate() - 60);
    const stringDataLimite = formatarDataParaStringFirebase(dataSessentaDiasAtras);

    try {
        const snapshotVoluntarios = await getDocs(collection(bancoDeDados, "voluntarios"));
        const mapaDeTelefones = {};
        
        snapshotVoluntarios.forEach((documentoVoluntario) => {
            const dadosVoluntario = documentoVoluntario.data();
            const chaveNome = normalizarNomeParaAgrupamento(dadosVoluntario.nome);
            const idDoVoluntario = documentoVoluntario.id;

            const numeroTelefone = dadosVoluntario.telefone || dadosVoluntario.celular || dadosVoluntario.whatsapp || "";
            
            if (numeroTelefone) {
                const numeroLimpo = formatarNumeroWhatsApp(numeroTelefone);
                mapaDeTelefones[chaveNome] = numeroLimpo; 
                mapaDeTelefones[idDoVoluntario] = numeroLimpo; 
            }
        });

        const snapshotAcolhimentos = await getDocs(collection(bancoDeDados, "acolhimentos_log"));
        const historicoDeAcolhimentosRealizados = {};
        snapshotAcolhimentos.forEach((documentoLog) => {
            historicoDeAcolhimentosRealizados[documentoLog.id] = documentoLog.data().dataUltimoAcolhimento;
        });

        const consultaPresencasRecentes = query(
            collection(bancoDeDados, "presencas"),
            where("data", ">=", stringDataLimite)
        );

        const snapshotDasPresencas = await getDocs(consultaPresencasRecentes);
        const historicoGeralPorVoluntario = {};

        snapshotDasPresencas.forEach((documento) => {
            const dados = documento.data();

            if (dados.status && dados.status.toLowerCase() !== 'presente') return;

            let stringDataLimpa = dados.data;
            if (stringDataLimpa && typeof stringDataLimpa !== 'string' && stringDataLimpa.toDate) {
                stringDataLimpa = formatarDataParaStringFirebase(stringDataLimpa.toDate());
            } else if (typeof stringDataLimpa === 'string') {
                stringDataLimpa = stringDataLimpa.split("T")[0].split(" ")[0]; 
            }

            if (!stringDataLimpa) return; 

            const chaveUnificada = normalizarNomeParaAgrupamento(dados.nome);

            let telefoneEncontrado = "";
            if (dados.voluntarioId && mapaDeTelefones[dados.voluntarioId]) {
                telefoneEncontrado = mapaDeTelefones[dados.voluntarioId];
            } else if (mapaDeTelefones[chaveUnificada]) {
                telefoneEncontrado = mapaDeTelefones[chaveUnificada];
            }

            if (!historicoGeralPorVoluntario[chaveUnificada]) {
                historicoGeralPorVoluntario[chaveUnificada] = {
                    chaveUnificada: chaveUnificada,
                    nomeCompleto: dados.nome, 
                    telefoneSanitizado: telefoneEncontrado, 
                    listaDeAtividades: new Set(),
                    datasComPresencaConfirmada: [],
                    temAssistenciaEspiritual: false,
                    atividadesPorDiaDaSemana: {
                        0: new Set(), 1: new Set(), 2: new Set(), 3: new Set(), 4: new Set(), 5: new Set(), 6: new Set()
                    }
                };
            }

            const dataConvertidaAoObjeto = new Date(stringDataLimpa + "T12:00:00");
            const indiceDoDiaDaSemana = dataConvertidaAoObjeto.getDay();

            let quantidadeDeAtividadesNoDocumento = 0;
            let quantidadeDeAtividadesExcluidas = 0;
            const atividadesValidasParaExibicao = [];

            if (dados.atividade) {
                if (typeof dados.atividade === 'string') {
                    const atividadesSeparadas = dados.atividade.split(",");
                    for (const atividadeItem of atividadesSeparadas) {
                        const nomeTrimado = atividadeItem.trim();
                        if (!nomeTrimado) continue;

                        quantidadeDeAtividadesNoDocumento++;
                        const nomeNormalizadoAtividade = normalizarNomeParaAgrupamento(nomeTrimado);

                        if (nomeNormalizadoAtividade === "*em assistencia espiritual") {
                            historicoGeralPorVoluntario[chaveUnificada].temAssistenciaEspiritual = true;
                        }

                        if (ATIVIDADES_EXCLUIDAS_DO_CONTROLE.includes(nomeNormalizadoAtividade)) {
                            quantidadeDeAtividadesExcluidas++;
                        } else {
                            atividadesValidasParaExibicao.push(nomeTrimado);
                            historicoGeralPorVoluntario[chaveUnificada].atividadesPorDiaDaSemana[indiceDoDiaDaSemana].add(nomeTrimado);
                        }
                    }
                } else if (Array.isArray(dados.atividade)) {
                    for (const atividadeItem of dados.atividade) {
                        if (typeof atividadeItem === 'string') {
                            const nomeTrimado = atividadeItem.trim();
                            if (!nomeTrimado) continue;

                            quantidadeDeAtividadesNoDocumento++;
                            const nomeNormalizadoAtividade = normalizarNomeParaAgrupamento(nomeTrimado);

                            if (nomeNormalizadoAtividade === "*em assistencia espiritual") {
                                historicoGeralPorVoluntario[chaveUnificada].temAssistenciaEspiritual = true;
                            }

                            if (ATIVIDADES_EXCLUIDAS_DO_CONTROLE.includes(nomeNormalizadoAtividade)) {
                                quantidadeDeAtividadesExcluidas++;
                            } else {
                                atividadesValidasParaExibicao.push(nomeTrimado);
                                historicoGeralPorVoluntario[chaveUnificada].atividadesPorDiaDaSemana[indiceDoDiaDaSemana].add(nomeTrimado);
                            }
                        }
                    }
                }
            }

            if (quantidadeDeAtividadesNoDocumento > 0 && quantidadeDeAtividadesNoDocumento === quantidadeDeAtividadesExcluidas) {
                return;
            }

            if (!historicoGeralPorVoluntario[chaveUnificada].datasComPresencaConfirmada.includes(stringDataLimpa)) {
                historicoGeralPorVoluntario[chaveUnificada].datasComPresencaConfirmada.push(stringDataLimpa);
            }
            
            for (const atividadeValida of atividadesValidasParaExibicao) {
                historicoGeralPorVoluntario[chaveUnificada].listaDeAtividades.add(atividadeValida);
            }
        });

        const voluntariosQuePrecisamDeAcolhimento = [];

        for (const chave in historicoGeralPorVoluntario) {
            const dadosDoVoluntario = historicoGeralPorVoluntario[chave];
            const diasOficiaisDeTrabalho = identificarDiasDeTrabalhoDoVoluntario(dadosDoVoluntario.datasComPresencaConfirmada);

            const relatorioDeFaltasPorDia = [];
            let dataDaUltimaFaltaDesteVoluntario = "2000-01-01"; 

            for (const indiceDoDia of diasOficiaisDeTrabalho) {
                
                if (dadosDoVoluntario.temAssistenciaEspiritual && (indiceDoDia === 2 || indiceDoDia === 3 || indiceDoDia === 4)) {
                    continue; 
                }

                const datasEsperadas = calcularDuasUltimasOcorrenciasDoDia(indiceDoDia, dataDeHojeParaCalculo);
                
                const faltouNaUltimaVez = !dadosDoVoluntario.datasComPresencaConfirmada.includes(datasEsperadas[0]);
                const faltouNaVezRetrasada = !dadosDoVoluntario.datasComPresencaConfirmada.includes(datasEsperadas[1]);

                if (faltouNaUltimaVez && faltouNaVezRetrasada) {
                    const atividadesDoDiaEspecifico = Array.from(dadosDoVoluntario.atividadesPorDiaDaSemana[indiceDoDia]).join(", ");
                    
                    if (datasEsperadas[0] > dataDaUltimaFaltaDesteVoluntario) {
                        dataDaUltimaFaltaDesteVoluntario = datasEsperadas[0];
                    }

                    relatorioDeFaltasPorDia.push({
                        nomeDoDiaDaSemana: obterNomeDoDiaDaSemana(indiceDoDia),
                        atividadesDaFalta: atividadesDoDiaEspecifico || "Atividade Regular",
                        dataFaltaRecente: formatarDataParaExibicaoNoBrasil(datasEsperadas[0]),
                        dataFaltaRetrasada: formatarDataParaExibicaoNoBrasil(datasEsperadas[1])
                    });
                }
            }

            let exibirCard = true;
            if (historicoDeAcolhimentosRealizados[chave]) {
                const dataDoUltimoContato = historicoDeAcolhimentosRealizados[chave].split("T")[0];
                if (dataDoUltimoContato >= dataDaUltimaFaltaDesteVoluntario) {
                    exibirCard = false; 
                }
            }

            if (exibirCard && relatorioDeFaltasPorDia.length > 0) {
                voluntariosQuePrecisamDeAcolhimento.push({
                    chaveUnificada: dadosDoVoluntario.chaveUnificada,
                    nome: dadosDoVoluntario.nomeCompleto,
                    telefone: dadosDoVoluntario.telefoneSanitizado, 
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
// --- RENDERIZAÇÃO NA TELA E GERENCIAMENTO DE ESTADO (AUTH) ---
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

        let htmlDiasFaltosos = '<ul class="lista-dias-faltosos">';
        for (const falta of voluntario.detalhesDasFaltas) {
            htmlDiasFaltosos += `<li><strong>${falta.nomeDoDiaDaSemana} (${falta.atividadesDaFalta})</strong> (dias ${falta.dataFaltaRetrasada} e ${falta.dataFaltaRecente})</li>`;
        }
        htmlDiasFaltosos += '</ul>';

        const primeiroNome = voluntario.nome.split(" ")[0];
        const textoAcolhimento = `Olá, ${primeiroNome}! Tudo bem com você? Aqui é do Acolhimento da Casa Paulo de Tarso. Notamos que você não pôde estar conosco nos últimos dias de suas atividades e viemos apenas dar um oi para saber se está tudo bem com você e sua família, e se precisa de alguma coisa. Sinta-se abraçado por todos nós!`;
        
        let urlBase = "https://wa.me/";
        if (voluntario.telefone) {
            urlBase += voluntario.telefone; 
        }
        const linkWhatsApp = `${urlBase}?text=${encodeURIComponent(textoAcolhimento)}`;

        const avisoSemTelefone = voluntario.telefone ? "" : `<p style="font-size: 11px; color: #d32f2f; margin-top: 5px; text-align: center;">Telefone não cadastrado. A busca no WhatsApp será manual.</p>`;

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
                <a href="#" onclick="registrarAcolhimentoEabrirWhatsApp(event, '${voluntario.chaveUnificada}', '${linkWhatsApp}')" class="botao-whatsapp">
                    Acolher pelo WhatsApp
                </a>
                ${avisoSemTelefone}
            </div>
        `;

        containerAcolhimento.appendChild(elementoCard);
    }
}

// INICIA O PROCESSO SOMENTE SE O DIRETOR ESTIVER LOGADO NO SISTEMA
onAuthStateChanged(auth, (user) => {
    if (user) {
        iniciarAnaliseDeAcolhimento();
    } else {
        // Se não estiver logado, redireciona para a página de login
        window.location.href = '/login.html';
    }
});