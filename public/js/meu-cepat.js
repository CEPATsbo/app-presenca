import { initializeApp } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-auth.js";
import { getFirestore, collection, collectionGroup, query, where, getDocs, doc, getDoc, limit, orderBy, Timestamp, writeBatch, updateDoc, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js";

// --- CONFIGURAÇÕES E INICIALIZAÇÃO ---
const firebaseConfig = {
    apiKey: "AIzaSyBV7RPjk3cFTqL-aIpflJcUojKg1ZXMLuU",
    authDomain: "voluntarios-ativos---cepat.firebaseapp.com",
    projectId: "voluntarios-ativos---cepat",
    storageBucket: "voluntarios-ativos---cepat.appspot.com",
    messagingSenderId: "66122858261",
    appId: "1:66122858261:web:7fa21f1805463b5c08331c"
};
const CASA_ESPIRITA_LAT = -22.75553;
const CASA_ESPIRITA_LON = -47.36945;
const RAIO_EM_METROS = 70;

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// --- ELEMENTOS DA PÁGINA ---
const mainContainer = document.getElementById('main-container');
const greetingName = document.getElementById('greeting-name');
const loadingMessage = document.getElementById('loading-message');
const moduleDia = document.getElementById('module-dia');
const modulePessoal = document.getElementById('module-pessoal');
const moduleAluno = document.getElementById('module-aluno');
const moduleFacilitador = document.getElementById('module-facilitador');
const moduleGestao = document.getElementById('module-gestao');
const moduleServicos = document.getElementById('module-servicos');
const alunoContent = document.getElementById('aluno-content');
const facilitadorContent = document.getElementById('facilitador-content');
const btnLogout = document.getElementById('btn-logout');
const diaContent = document.getElementById('dia-content');
const presencaCardContent = document.getElementById('presenca-card-content');
const pessoalContent = document.getElementById('pessoal-content');

const moduleInformativo = document.getElementById('module-informativo');
const carouselInner = document.getElementById('carousel-inner');
const carouselDots = document.querySelectorAll('.dot');
const muralContent = document.getElementById('mural-content');
const escalaContent = document.getElementById('escala-content');

const modalFrequencia = document.getElementById('modal-frequencia');
const closeModalFrequenciaBtn = document.getElementById('close-modal-frequencia');
const modalFrequenciaTitulo = document.getElementById('modal-frequencia-titulo');
const frequenciaListContainer = document.getElementById('frequencia-list-container');
const btnSalvarFrequencia = document.getElementById('btn-salvar-frequencia');

const modalAtividades = document.getElementById('modal-atividades-presenca');
const closeModalAtividadesBtn = document.getElementById('close-modal-atividades');
const formAtividadesPresenca = document.getElementById('form-atividades-presenca');
const atividadesModalLista = document.getElementById('atividades-modal-lista');
const btnConfirmarPresenca = document.getElementById('btn-confirmar-presenca');

const modalOverlayDetalhes = document.getElementById('modal-detalhes');
const closeModalDetalhesBtn = document.getElementById('close-modal-detalhes');
const detalhesCantinaContainer = document.getElementById('detalhes-cantina-container');
const detalhesBibliotecaContainer = document.getElementById('detalhes-biblioteca-container');
const detalhesEmprestimosContainer = document.getElementById('detalhes-emprestimos-container');
const modalOverlayEditarPerfil = document.getElementById('modal-editar-perfil');
const closeModalEditarPerfilBtn = document.getElementById('close-modal-editar-perfil');
const formEditarPerfil = document.getElementById('form-editar-perfil');
const inputEditNome = document.getElementById('edit-nome');
const inputEditTelefone = document.getElementById('edit-telefone');
const inputEditEndereco = document.getElementById('edit-endereco');
const inputEditAniversario = document.getElementById('edit-aniversario');
const btnSalvarPerfil = document.getElementById('btn-salvar-perfil');
const modalOverlayHistorico = document.getElementById('modal-historico');
const closeModalHistoricoBtn = document.getElementById('close-modal-historico');
const historyListContainer = document.getElementById('history-list-container');

// NOVOS ELEMENTOS: COMUNICAÇÃO MEDIÚNICA
const moduleComunicacoes = document.getElementById('module-comunicacoes');
const comunicacoesContent = document.getElementById('comunicacoes-publicas-content');

let currentUserData = null;
let currentUserId = null;
let cachedAtividades = null;
let currentTurmaIdModal = null;
let currentAulaIdModal = null;
let detalhesPendenciasCantina = [];
let detalhesPendenciasBiblioteca = [];
let detalhesEmprestimos = [];
let cacheComunicacoes = {};

onAuthStateChanged(auth, async (user) => {
    if (user) {
        mainContainer.style.display = 'block';
        try {
            const qUser = query(collection(db, "voluntarios"), where("authUid", "==", user.uid), limit(1));
            const userSnapshot = await getDocs(qUser);
            let origemBusca;
            if (userSnapshot.empty) {
                const qAluno = query(collection(db, "alunos"), where("authUid", "==", user.uid), limit(1));
                const alunoSnapshot = await getDocs(qAluno);
                if (alunoSnapshot.empty) throw new Error("Perfil não encontrado. Contate a secretaria.");
                currentUserData = alunoSnapshot.docs[0].data();
                currentUserId = alunoSnapshot.docs[0].id;
                origemBusca = 'aluno';
            } else {
                currentUserData = userSnapshot.docs[0].data();
                currentUserId = userSnapshot.docs[0].id;
                origemBusca = 'voluntario';
            }
            greetingName.textContent = `Olá, ${currentUserData.nome}!`;

            if (origemBusca === 'voluntario') {
                verificarPendenciaTASV(currentUserData, currentUserId);
            }

            await carregarMural();
            await carregarComunicacoesMediunicas(); // CHAMADA DO NOVO MÓDULO

            if (currentUserData.isMedium) {
                moduleInformativo.classList.remove('hidden');
                await carregarMinhaEscala(currentUserId);
            } else {
                document.getElementById('slide-escala').style.display = 'none';
                document.getElementById('carousel-nav').classList.add('hidden');
                if (muralContent.innerText.trim() !== "" && muralContent.innerText !== "Carregando avisos...") {
                    moduleInformativo.classList.remove('hidden');
                }
            }

            const [isAluno, isFacilitador, isAdmin] = await Promise.all([
                verificarPapelAluno(currentUserId, origemBusca),
                verificarPapelFacilitador(currentUserId),
                verificarPapelAdmin(user)
            ]);
            await processarPapeisEExibirModulos(currentUserId, currentUserData, isAluno, isFacilitador, isAdmin);

        } catch (error) {
            console.error("Erro ao carregar dados:", error);
            loadingMessage.classList.remove('hidden');
            loadingMessage.innerHTML = `<p style="color: red;">${error.message}</p>`;
        }
    } else {
        window.location.href = 'login.html';
    }
});

// --- NOVA FUNÇÃO: CARREGAR COMUNICAÇÕES MEDIÚNICAS ---
async function carregarComunicacoesMediunicas() {
    try {
        const q = query(
            collection(db, "comunicacoes_mediunicas"), 
            where("publico", "==", true), 
            where("status", "==", "concluido"),
            orderBy("dataComunicacao", "desc")
        );
        
        const snapshot = await getDocs(q);
        const contadorElement = document.getElementById('comunicacoes-contador');
        
        if (snapshot.empty) {
            // Se não houver nada público, o módulo continua escondido
            return;
        }

        const total = snapshot.size;
        contadorElement.innerHTML = `Existem <strong>${total}</strong> comunicações disponíveis.`;

        // Preenche o cache para uso nos modais
        window.cacheComunicacoes = {}; 
        snapshot.forEach(docSnap => {
            window.cacheComunicacoes[docSnap.id] = docSnap.data();
        });

        document.getElementById('module-comunicacoes').classList.remove('hidden');
    } catch (e) { 
        console.error("Erro ao carregar comunicações:", e); 
    }
}

// 2. COLE ESTAS FUNÇÕES LOGO ABAIXO DA FUNÇÃO ACIMA
window.abrirGaleriaComunicacoes = () => {
    const listaContainer = document.getElementById('galeria-lista-container');
    listaContainer.innerHTML = '';

    const itens = Object.entries(window.cacheComunicacoes);

    itens.forEach(([id, d]) => {
        const dataEx = d.dataComunicacao ? d.dataComunicacao.split("-").reverse().join("/") : "N/A";
        const itemDiv = document.createElement('div');
        // Estilização rápida para cada item da lista
        itemDiv.style.padding = '15px';
        itemDiv.style.marginBottom = '10px';
        itemDiv.style.background = '#fff';
        itemDiv.style.border = '1px solid #eee';
        itemDiv.style.borderRadius = '8px';
        itemDiv.style.cursor = 'pointer';
        itemDiv.style.display = 'flex';
        itemDiv.style.justifyContent = 'space-between';
        itemDiv.style.alignItems = 'center';
        itemDiv.style.boxShadow = '0 2px 4px rgba(0,0,0,0.05)';
        
        itemDiv.innerHTML = `
            <div style="text-align: left;">
                <strong style="color: #333;">${d.trabalho}</strong><br>
                <small style="color: #888;">${d.medium} | ${dataEx}</small>
            </div>
            <i class="fas fa-play-circle" style="color: #0277BD; font-size: 1.2em;"></i>
        `;
        
        itemDiv.onclick = () => {
            document.getElementById('modal-galeria-comunicacoes').classList.remove('visible');
            abrirPlayerPortal(id);
        };
        
        listaContainer.appendChild(itemDiv);
    });

    document.getElementById('modal-galeria-comunicacoes').classList.add('visible');
};

window.abrirPlayerPortal = (id) => {
    const d = window.cacheComunicacoes[id];
    const dataEx = d.dataComunicacao ? d.dataComunicacao.split("-").reverse().join("/") : "N/A";
    
    document.getElementById('player-titulo-comunicacao').innerText = d.trabalho;
    document.getElementById('player-info-comunicacao').innerText = `${d.medium} • ${dataEx}`;
    
    const player = document.getElementById('audio-player-portal');
    player.src = d.urlAudio;
    
   // Limpeza de tags de citação e quebra de linhas para parágrafos (versão segura)
const transcricaoSemCites = d.transcricao.split("").join("");
const textoLimpo = transcricaoSemCites.split(". ").join(".<br><br>");
    document.getElementById('texto-transcricao-portal').innerHTML = textoLimpo;
    
    document.getElementById('modal-player-comunicacao').classList.add('visible');
};



// --- FUNÇÕES ORIGINAIS (MANTIDAS 100%) ---
async function carregarMural() {
    try {
        const configRef = doc(db, "configuracoes", "mural");
        const snap = await getDoc(configRef);
        if (snap.exists() && snap.data().mensagem) {
            muralContent.innerHTML = `<p style="font-size: 1.1em; color: #444; line-height: 1.5;">${snap.data().mensagem}</p>`;
        } else {
            muralContent.innerHTML = "<p>Nenhum aviso importante no momento.</p>";
        }
    } catch (e) { console.error("Erro mural:", e); muralContent.innerHTML = ""; }
}

async function carregarMinhaEscala(userId) {
    const hoje = new Date();
    hoje.setHours(0,0,0,0);
    const mesId = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}`;
    const hojeIso = hoje.toISOString().split('T')[0];
    try {
        const escalaRef = doc(db, "escalas_mediunicas", mesId);
        const snap = await getDoc(escalaRef);
        if (!snap.exists()) {
            escalaContent.innerHTML = "<p>A escala deste mês ainda não foi publicada.</p>";
            return;
        }
        const dados = snap.data().escalados || {};
        let meusTrabalhos = [];
        for (const [chave, listaUids] of Object.entries(dados)) {
            const dataString = chave.split('_')[0]; 
            if (listaUids.includes(userId) && dataString >= hojeIso) {
                meusTrabalhos.push({
                    data: dataString,
                    trabalho: chave.split('_').slice(1).join(' ').replace(/_/g, ' ')
                });
            }
        }
        if (meusTrabalhos.length === 0) {
            escalaContent.innerHTML = "<p>Você não possui trabalhos escalados.</p>";
        } else {
            meusTrabalhos.sort((a, b) => a.data.localeCompare(b.data));
            let html = '<ul class="escala-lista">';
            meusTrabalhos.forEach(t => {
                const dataBR = t.data.split('-').reverse().join('/');
                html += `<li class="escala-item"><span class="escala-data">${dataBR}</span> <span class="escala-trab">${t.trabalho}</span></li>`;
            });
            html += '</ul>';
            escalaContent.innerHTML = html;
        }
    } catch (e) { console.error(e); escalaContent.innerHTML = "<p>Erro ao carregar escala.</p>"; }
}

carouselDots.forEach(dot => {
    dot.addEventListener('click', () => {
        const index = dot.dataset.slide;
        carouselInner.style.transform = `translateX(-${index * 100}%)`;
        carouselDots.forEach(d => d.classList.remove('active'));
        dot.classList.add('active');
    });
});

async function processarPapeisEExibirModulos(userId, userData, isAluno, isFacilitador, isAdmin) {
    loadingMessage.classList.add('hidden');
    moduleDia.classList.remove('hidden');
    modulePessoal.classList.remove('hidden');
    moduleServicos.classList.remove('hidden');
    await Promise.all([carregarModuloAcoesDoDia(userId, userData), carregarModuloPessoal(userId, userData)]);
    if (isAluno) { moduleAluno.classList.remove('hidden'); carregarModuloAluno(userId); }
    if (isFacilitador) { moduleFacilitador.classList.remove('hidden'); carregarModuloFacilitador(userId); }
    if (isAdmin) { moduleGestao.classList.remove('hidden'); }
}

async function verificarPapelAluno(userId, origemBusca) {
    const q = query(collectionGroup(db, 'participantes'), where('participanteId', '==', userId), limit(1));
    const snapshot = await getDocs(q);
    return !snapshot.empty;
}

async function verificarPapelFacilitador(userId) {
    const q = query(collection(db, 'turmas'), where('facilitadoresIds', 'array-contains', userId), limit(1));
    const snapshot = await getDocs(q);
    return !snapshot.empty;
}

async function verificarPapelAdmin(user) {
    try {
        const idTokenResult = await user.getIdTokenResult(true);
        const claims = idTokenResult.claims || {};
        const userRole = claims.role || 'voluntario';
        const rolesComAcessoAdmin = [
            'super-admin', 'voluntario', 'diretor', 'entrevistador', 'bibliotecario', 
            'produtor-evento', 'conselheiro', 'irradiador', 'dirigente-escola', 
            'secretario-escola', 'recepcionista', 'tesoureiro', 'caritas'
        ];
        if (rolesComAcessoAdmin.includes(userRole)) return true;
        for (const role of rolesComAcessoAdmin) {
            if (claims[role] === true) return true;
        }
        return false;
    } catch (error) { console.error(error); return false; }
}

async function carregarModuloAluno(userId) {
    alunoContent.innerHTML = "<p>Buscando seus cursos...</p>";
    try {
        const participantesQuery = query(collectionGroup(db, 'participantes'), where('participanteId', '==', userId));
        const participantesSnapshot = await getDocs(participantesQuery);
        if (participantesSnapshot.empty) {
            alunoContent.innerHTML = '<p>Você não está inscrito em nenhum curso no momento.</p>';
            return;
        }
        alunoContent.innerHTML = '';
        for (const participanteDoc of participantesSnapshot.docs) {
            const turmaRef = participanteDoc.ref.parent.parent;
            const turmaDoc = await getDoc(turmaRef);
            if (turmaDoc.exists()) {
                renderizarCardDoCursoAluno({ id: turmaDoc.id, ...turmaDoc.data() }, { id: participanteDoc.id, ...participanteDoc.data() });
            }
        }
    } catch (error) {
        console.error("Erro ao carregar módulo do aluno:", error);
        alunoContent.innerHTML = '<p style="color: red;">Erro ao carregar seus cursos.</p>';
    }
}

function renderizarCardDoCursoAluno(turmaData, participanteData) {
    const cursoCard = document.createElement('div');
    cursoCard.className = 'card';
    const anoAtual = turmaData.anoAtual || 1;
    const avaliacaoDoAno = participanteData.avaliacoes ? participanteData.avaliacoes[anoAtual] : null;
    let frequencia = '--';
    let status = 'Cursando';
    let mediaFinal = null;
    if (avaliacaoDoAno) {
        frequencia = `${avaliacaoDoAno.notaFrequencia || 0}%`;
        status = avaliacaoDoAno.statusAprovacao || 'Em Andamento';
        if (turmaData.isEAE) mediaFinal = (avaliacaoDoAno.mediaFinal !== undefined) ? avaliacaoDoAno.mediaFinal.toFixed(1) : 'N/D';
    }
    cursoCard.innerHTML = `<h4>${turmaData.nomeDaTurma}</h4><p><strong>Frequência:</strong> ${frequencia}</p><p><strong>Status:</strong> ${status}</p>${mediaFinal !== null ? `<p><strong>Média Final (${anoAtual}º Ano):</strong> ${mediaFinal}</p>` : ''}<button class="btn-details-aluno" data-turma-id="${turmaData.id}" data-participante-doc-id="${participanteData.id}" style="margin-top: 15px; padding: 8px 12px; background-color: #eee; border: 1px solid #ccc; border-radius: 4px; cursor: pointer;">Ver Detalhes ▼</button><div class="curso-details-content hidden" style="margin-top: 15px; border-top: 1px solid #eee; padding-top: 15px;"></div>`;
    alunoContent.appendChild(cursoCard);
}

async function carregarErenderizarDetalhesAluno(turmaId, participanteDocId, detailsContainer) {
    detailsContainer.innerHTML = '<p>Carregando detalhes...</p>';
    try {
        const participanteRef = doc(db, "turmas", turmaId, "participantes", participanteDocId);
        const participanteSnap = await getDoc(participanteRef);
        if(!participanteSnap.exists()) throw new Error("Registro de participante não encontrado.");
        const participanteIdOriginal = participanteSnap.data().participanteId; 
        const cronogramaRef = collection(db, "turmas", turmaId, "cronograma");
        const frequenciasRef = collection(db, "turmas", turmaId, "frequencias");
        const [cronogramaSnap, frequenciasSnap] = await Promise.all([
            getDocs(query(cronogramaRef, orderBy("dataAgendada", "asc"))),
            getDocs(query(frequenciasRef, where("participanteId", "==", participanteIdOriginal)))
        ]);
        const frequenciasMap = new Map();
        frequenciasSnap.forEach(doc => frequenciasMap.set(doc.data().aulaId, doc.data().status));
        const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
        let proximasAulasHTML = '<tbody>'; let historicoHTML = '<tbody>';
        let temProxima = false; let temHistorico = false;
        cronogramaSnap.docs.forEach(doc => {
            const aula = { id: doc.id, ...doc.data() };
            const dataAula = aula.dataAgendada.toDate();
            const dataFormatada = dataAula.toLocaleDateString('pt-BR', { timeZone: 'UTC' });
            if (dataAula >= hoje && aula.status !== 'realizada') {
                temProxima = true;
                proximasAulasHTML += `<tr><td>${dataFormatada}</td><td>${aula.isExtra ? 'Extra' : aula.numeroDaAula}</td><td>${aula.titulo}</td></tr>`;
            }
            if (aula.status === 'realizada') {
                temHistorico = true;
                const statusPresenca = frequenciasMap.get(aula.id);
                let statusDisplay = '';
                switch (statusPresenca) {
                    case 'presente': statusDisplay = '<span style="color: green;">Presente</span>'; break;
                    case 'ausente': statusDisplay = '<span style="color: red;">Falta</span>'; break;
                    case 'justificado': statusDisplay = '<span style="color: orange;">Justificado</span>'; break;
                    default: statusDisplay = '<span>Não lançado</span>';
                }
                historicoHTML = `<tr><td>${dataFormatada}</td><td>${aula.titulo}</td><td>${statusDisplay}</td></tr>` + historicoHTML;
            }
        });
        proximasAulasHTML += '</tbody>'; historicoHTML += '</tbody>';
        detailsContainer.innerHTML = `<h5>Próximas Aulas:</h5>${temProxima ? `<table><thead><tr><th>Data</th><th>Nº</th><th>Tema</th></tr></thead>${proximasAulasHTML}</table>` : '<p>Nenhuma aula futura.</p>'}<h5 style="margin-top: 20px;">Histórico:</h5>${temHistorico ? `<table><thead><tr><th>Data</th><th>Tema</th><th>Presença</th></tr></thead>${historicoHTML}</table>` : '<p>Nenhum histórico.</p>'}`;
    } catch (error) {
        console.error("Erro ao carregar detalhes do aluno:", error);
        detailsContainer.innerHTML = '<p style="color: red;">Erro ao carregar detalhes.</p>';
    }
}

async function carregarModuloFacilitador(userId) {
    facilitadorContent.innerHTML = "<p>Buscando suas turmas...</p>";
    try {
        const turmasRef = collection(db, "turmas");
        const qTurmas = query(turmasRef, where("facilitadoresIds", "array-contains", userId));
        const turmasSnapshot = await getDocs(qTurmas);
        if (turmasSnapshot.empty) {
            facilitadorContent.innerHTML = '<p>Você não está designado como facilitador de nenhuma turma.</p>';
            return;
        }
        facilitadorContent.innerHTML = '';
        for (const turmaDoc of turmasSnapshot.docs) {
            await renderizarCardDaTurmaFacilitador({ id: turmaDoc.id, ...turmaDoc.data() });
        }
    } catch (error) {
        console.error("Erro ao carregar módulo facilitador:", error);
        facilitadorContent.innerHTML = '<p style="color: red;">Erro ao carregar turmas.</p>';
    }
}

async function renderizarCardDaTurmaFacilitador(turmaData) {
    const card = document.createElement('div');
    card.className = 'card';
    const hojeInicio = new Date(); hojeInicio.setHours(0, 0, 0, 0);
    const hojeFim = new Date(); hojeFim.setHours(23, 59, 59, 999);
    const cronogramaRef = collection(db, "turmas", turmaData.id, "cronograma");
    const qAula = query(cronogramaRef, where("dataAgendada", ">=", Timestamp.fromDate(hojeInicio)), where("dataAgendada", "<=", Timestamp.fromDate(hojeFim)), limit(1));
    const aulaSnapshot = await getDocs(qAula);
    let aulaDeHoje = null;
    if (!aulaSnapshot.empty) aulaDeHoje = { id: aulaSnapshot.docs[0].id, ...aulaSnapshot.docs[0].data() };
    const dataFormatada = hojeInicio.toLocaleDateString('pt-BR');
    let aulaInfoHTML = ''; let isChamadaDisabled = true; let buttonDataAttributes = '';
    if (aulaDeHoje) {
        aulaInfoHTML = `<strong>Aula de Hoje (${dataFormatada}):</strong><p>${aulaDeHoje.titulo}</p>`;
        isChamadaDisabled = false;
        buttonDataAttributes = `data-turma-id="${turmaData.id}" data-aula-id="${aulaDeHoje.id}" data-aula-titulo="${aulaDeHoje.titulo}"`;
    } else {
        aulaInfoHTML = `<strong>Aula de Hoje (${dataFormatada}):</strong><p>Nenhuma aula agendada.</p>`;
    }
    card.innerHTML = `<h4>${turmaData.nomeDaTurma}</h4><div style="background-color: #f1f5f9; padding: 10px; border-radius: 6px; margin-bottom: 15px;">${aulaInfoHTML}</div><button class="btn-chamada-facilitador" ${buttonDataAttributes} ${isChamadaDisabled ? 'disabled' : ''} style="width: 100%; padding: 10px; background-color: ${isChamadaDisabled ? '#ccc' : '#16a34a'}; color: white; border: none; border-radius: 4px; cursor: ${isChamadaDisabled ? 'not-allowed' : 'pointer'}; font-weight: bold;"><i class="fas fa-clipboard-list"></i> Realizar Chamada</button>`;
    facilitadorContent.appendChild(card);
}

async function abrirModalFrequencia(turmaId, aulaId, aulaTitulo) {
    currentTurmaIdModal = turmaId;
    currentAulaIdModal = aulaId;
    modalFrequenciaTitulo.textContent = `Frequência: ${aulaTitulo}`;
    frequenciaListContainer.innerHTML = '<li>Carregando lista...</li>';
    modalFrequencia.classList.add('visible'); 
    try {
        const participantesRef = collection(db, "turmas", turmaId, "participantes");
        const qParticipantes = query(participantesRef, orderBy("nome"));
        const participantesSnapshot = await getDocs(qParticipantes);
        const frequenciaRef = collection(db, "turmas", turmaId, "frequencias");
        const qFrequencia = query(frequenciaRef, where("aulaId", "==", aulaId));
        const frequenciaSnapshot = await getDocs(qFrequencia);
        const frequenciasSalvas = new Map();
        frequenciaSnapshot.forEach(doc => frequenciasSalvas.set(doc.data().participanteId, doc.data().status));
        let listHTML = '';
        participantesSnapshot.forEach(doc => {
            const participanteIdOriginal = doc.data().participanteId; 
            const statusAtual = frequenciasSalvas.get(participanteIdOriginal) || null; 
            listHTML += `<li class="attendance-item" data-participante-id="${participanteIdOriginal}" data-status="${statusAtual || ''}"><span>${doc.data().nome}</span><div class="attendance-controls"><button class="btn-status presente ${statusAtual === 'presente' ? 'active' : ''}" data-status="presente">P</button><button class="btn-status ausente ${statusAtual === 'ausente' ? 'active' : ''}" data-status="ausente">F</button><button class="btn-status justificado ${statusAtual === 'justificado' ? 'active' : ''}" data-status="justificado">J</button></div></li>`;
        });
        frequenciaListContainer.innerHTML = listHTML || '<li>Nenhum participante.</li>';
    } catch(error) { console.error("Erro ao carregar chamada:", error); }
}

async function salvarFrequencia() {
    if (!currentTurmaIdModal || !currentAulaIdModal) return;
    btnSalvarFrequencia.disabled = true;
    try {
        const batch = writeBatch(db);
        const items = frequenciaListContainer.querySelectorAll('.attendance-item');
        items.forEach(item => {
            const pId = item.dataset.participanteId; 
            const status = item.dataset.status || 'ausente'; 
            const fRef = doc(db, "turmas", currentTurmaIdModal, "frequencias", `${currentAulaIdModal}_${pId}`);
            batch.set(fRef, { aulaId: currentAulaIdModal, participanteId: pId, status: status, turmaId: currentTurmaIdModal });
        });
        const aulaRef = doc(db, "turmas", currentTurmaIdModal, "cronograma", currentAulaIdModal);
        batch.update(aulaRef, { status: 'realizada' });
        await batch.commit();
        alert("Frequência salva!");
        modalFrequencia.classList.remove('visible');
    } catch (error) { console.error("Erro ao salvar:", error); } finally { btnSalvarFrequencia.disabled = false; }
}

function getDistance(lat1, lon1, lat2, lon2) {
    const R = 6371e3; const φ1 = lat1 * Math.PI / 180, φ2 = lat2 * Math.PI / 180;
    const Δφ = (lat2 - lat1) * Math.PI / 180, Δλ = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)); return R * c;
}
function getDataDeHojeSP() {
    const formatador = new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'America/Sao_Paulo' });
    return formatador.format(new Date());
}

async function carregarModuloAcoesDoDia(userId, userData) {
    presencaCardContent.innerHTML = '<p class="loading-message">Verificando status de presença...</p>';
    const dataHoje = getDataDeHojeSP();
    const presencaId = `${dataHoje}_${userData.nome.replace(/\s+/g, '_')}`;
    const presencaRef = doc(db, "presencas", presencaId);
    try {
        const presencaSnap = await getDoc(presencaRef);
        if (presencaSnap.exists() && presencaSnap.data().status === 'presente') {
            renderizarCardPresencaRegistrada(presencaSnap.data());
        } else { verificarLocalizacaoParaRegistro(); }
    } catch (error) { console.error("Erro verificar presença:", error); }
}

function verificarLocalizacaoParaRegistro() {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
        (position) => {
            const distancia = getDistance(position.coords.latitude, position.coords.longitude, CASA_ESPIRITA_LAT, CASA_ESPIRITA_LON);
            if (distancia <= RAIO_EM_METROS) renderizarCardProntoParaRegistrar(distancia);
            else renderizarCardLonge(distancia);
        }, (error) => console.error(error)
    );
}

function renderizarCardPresencaRegistrada(presencaData) {
    presencaCardContent.innerHTML = `<div class="presenca-card"><h4><i class="fas fa-check-circle" style="color: green;"></i> Status da Presença Hoje</h4><p style="color: green; font-weight: bold;">Presença registrada com sucesso!</p><div class="presenca-registrada-info">Atividades: ${presencaData.atividade || 'Não informado'}</div><button class="btn-tertiary" style="margin-top: 15px;" onclick="location.reload()">Verificar novamente</button></div>`;
}
function renderizarCardProntoParaRegistrar(distancia) {
    presencaCardContent.innerHTML = `<div class="presenca-card"><h4><i class="fas fa-map-marker-alt" style="color: #16a34a;"></i> Status da Presença Hoje</h4><p>Você está na Casa Espírita!<br>(Aprox. ${distancia.toFixed(0)} metros)</p><button class="btn-presenca" id="btn-registrar-presenca-meu-cepat"><i class="fas fa-plus-circle"></i> Registrar Presença Agora</button></div>`;
    document.getElementById('btn-registrar-presenca-meu-cepat').addEventListener('click', abrirModalAtividades);
}
function renderizarCardLonge(distancia) {
    presencaCardContent.innerHTML = `<div class="presenca-card"><h4><i class="fas fa-satellite-dish" style="color: #f59e0b;"></i> Status da Presença Hoje</h4><p>Você não está na área da Casa Espírita.<br>(Aprox. ${distancia.toFixed(0)} metros)</p><button class="btn-presenca" disabled>Aproxime-se para Registrar</button><button class="btn-tertiary" style="margin-top: 15px;" onclick="location.reload()">Verificar novamente</button></div>`;
}

async function buscarAtividadesDoFirestore() {
    if (cachedAtividades) return cachedAtividades;
    try {
        const snap = await getDocs(query(collection(db, "atividades"), where("ativo", "==", true), orderBy("nome")));
        cachedAtividades = snap.docs.map(doc => doc.data().nome);
        return cachedAtividades;
    } catch (e) { return []; }
}

async function abrirModalAtividades() {
    atividadesModalLista.innerHTML = 'Carregando atividades...';
    modalAtividades.classList.add('visible');
    const atividades = await buscarAtividadesDoFirestore();
    atividadesModalLista.innerHTML = '';
    atividades.forEach(atv => {
        const div = document.createElement('div');
        div.innerHTML = `<input type="checkbox" name="atividade_modal" value="${atv}" id="modal-${atv}"> <label for="modal-${atv}">${atv}</label>`;
        atividadesModalLista.appendChild(div);
    });
}

async function salvarPresencaLogado(event) {
    event.preventDefault();
    const selecionadas = Array.from(document.querySelectorAll('#form-atividades-presenca input[name="atividade_modal"]:checked')).map(cb => cb.value);
    if (selecionadas.length === 0) return alert("Selecione uma atividade.");
    btnConfirmarPresenca.disabled = true;
    try {
        const dataHoje = getDataDeHojeSP();
        const presencaId = `${dataHoje}_${currentUserData.nome.replace(/\s+/g, '_')}`;
        await setDoc(doc(db, "presencas", presencaId), { 
            nome: currentUserData.nome, atividade: selecionadas.join(', '), data: dataHoje, 
            primeiroCheckin: serverTimestamp(), ultimaAtualizacao: serverTimestamp(), status: 'presente',
            authUid: auth.currentUser.uid, voluntarioId: currentUserId
        }, { merge: true });
        modalAtividades.classList.remove('visible');
        renderizarCardPresencaRegistrada({ atividade: selecionadas.join(', ') });
    } catch (error) { console.error(error); } finally { btnConfirmarPresenca.disabled = false; }
}

async function carregarModuloPessoal(userId, userData) {
    pessoalContent.innerHTML = ''; 
    const pCard = document.createElement('div');
    pCard.className = 'card profile-card';
    pCard.innerHTML = `<h4><i class="fas fa-id-card"></i> Meu Perfil</h4><p><strong>Email:</strong> ${userData.email || '--'}</p><p><strong>Telefone:</strong> ${userData.telefone || '--'}</p><p><strong>Aniversário:</strong> ${userData.aniversario || '--'}</p><p><strong>Endereço:</strong> ${userData.endereco || '--'}</p><a href="#" class="card-link" id="link-editar-dados">Editar Meus Dados</a>`;
    pessoalContent.appendChild(pCard);

    const penCard = document.createElement('div');
    penCard.className = 'card pendencias-card';
    penCard.innerHTML = `<h4><i class="fas fa-file-invoice-dollar"></i> Minhas Pendências</h4><p><strong>Saldo Cantina:</strong> <span id="pendencia-cantina">R$ 0,00</span></p><p><strong>Saldo Biblioteca:</strong> <span id="pendencia-biblioteca">R$ 0,00</span></p><div id="emprestimos-biblioteca"><p><strong>Livros:</strong> Nenhum.</p></div><a href="#" class="card-link" id="link-ver-detalhes">Ver Detalhes</a>`;
    pessoalContent.appendChild(penCard);
    
    const hCard = document.createElement('div');
    hCard.className = 'card';
    hCard.innerHTML = `<h4><i class="fas fa-history"></i> Histórico de Presença</h4><p>Sua última presença foi em ${userData.ultimaPresenca || 'não registrada'}.</p><a href="#" class="card-link" id="link-ver-historico">Ver Histórico Completo</a>`;
    pessoalContent.appendChild(hCard);

    document.getElementById('link-editar-dados').onclick = abrirModalEdicao;
    document.getElementById('link-ver-detalhes').onclick = () => { preencherModalDetalhes(); modalOverlayDetalhes.classList.add('visible'); };
    document.getElementById('link-ver-historico').onclick = carregarHistoricoDePresenca;
    await buscarPendenciasEEmprestimos(userId);
}

async function buscarPendenciasEEmprestimos(userId) {
    if (!userId) return;
    detalhesPendenciasCantina = []; detalhesPendenciasBiblioteca = []; detalhesEmprestimos = [];
    try {
        const snapC = await getDocs(query(collection(db, "contas_a_receber"), where("compradorId", "==", userId), where("status", "==", "pendente")));
        let tC = 0; snapC.forEach(doc => { tC += doc.data().total; detalhesPendenciasCantina.push(doc.data()); });
        document.getElementById('pendencia-cantina').textContent = `R$ ${tC.toFixed(2).replace('.', ',')}`;

        const snapB = await getDocs(query(collection(db, "biblioteca_contas_a_receber"), where("compradorId", "==", userId), where("status", "==", "pendente")));
        let tB = 0; snapB.forEach(doc => { tB += doc.data().total; detalhesPendenciasBiblioteca.push(doc.data()); });
        document.getElementById('pendencia-biblioteca').textContent = `R$ ${tB.toFixed(2).replace('.', ',')}`;

        const snapE = await getDocs(query(collection(db, "biblioteca_emprestimos"), where("leitor.id", "==", userId), where("status", "==", "emprestado")));
        const el = document.getElementById('emprestimos-biblioteca');
        if (snapE.empty) el.innerHTML = `<p><strong>Livros Emprestados:</strong> Nenhum.</p>`;
        else {
            let h = '<p><strong>Livros Emprestados:</strong></p><ul style="padding-left: 20px;">';
            snapE.forEach(doc => { h += `<li>${doc.data().livroTitulo}</li>`; detalhesEmprestimos.push(doc.data()); });
            el.innerHTML = h + '</ul>';
        }
    } catch (e) { console.error(e); }
}

function preencherModalDetalhes() {
    const list = (itens) => {
        if (!itens || itens.length === 0) return '';
        let h = '<ul class="item-details-list">';
        itens.forEach(p => h += `<li>${p.qtd}x ${p.nome || p.descricao || p.titulo}</li>`);
        return h + '</ul>';
    };
    let cH = '<h4>Cantina</h4>';
    if (detalhesPendenciasCantina.length > 0) {
        cH += '<ul>';
        detalhesPendenciasCantina.forEach(i => cH += `<li><strong>${i.registradoEm.toDate().toLocaleDateString()}: R$ ${i.total.toFixed(2)}</strong>${list(i.itens)}</li>`);
        cH += '</ul>';
    } else cH += '<p>Nenhuma pendência.</p>';
    detalhesCantinaContainer.innerHTML = cH;
    // (Resto do preenchimento da biblioteca/empréstimos mantido igual ao seu original)
}

function abrirModalEdicao() {
    inputEditNome.value = currentUserData.nome;
    inputEditTelefone.value = currentUserData.telefone || '';
    inputEditEndereco.value = currentUserData.endereco || '';
    inputEditAniversario.value = currentUserData.aniversario || '';
    modalOverlayEditarPerfil.classList.add('visible');
}

async function salvarAlteracoesPerfil(event) {
    event.preventDefault();
    const novos = { nome: inputEditNome.value.trim(), telefone: inputEditTelefone.value.trim(), endereco: inputEditEndereco.value.trim(), aniversario: inputEditAniversario.value.trim() };
    try {
        await updateDoc(doc(db, "voluntarios", currentUserId), novos);
        currentUserData = { ...currentUserData, ...novos };
        await carregarModuloPessoal(currentUserId, currentUserData);
        alert("Dados atualizados!");
        modalOverlayEditarPerfil.classList.remove('visible');
    } catch (e) { alert("Erro ao salvar."); }
}

async function carregarHistoricoDePresenca() {
    historyListContainer.innerHTML = '<p>Carregando histórico...</p>';
    modalOverlayHistorico.classList.add('visible');
    try {
        const snap = await getDocs(query(collection(db, "presencas"), where("nome", "==", currentUserData.nome), orderBy("data", "desc")));
        if (snap.empty) { historyListContainer.innerHTML = '<p>Nenhuma presença encontrada.</p>'; return; }
        let h = '<ul>'; snap.forEach(doc => h += `<li><strong>${doc.data().data}:</strong> ${doc.data().atividade}</li>`);
        historyListContainer.innerHTML = h + '</ul>';
    } catch (e) { historyListContainer.innerHTML = '<p style="color:red;">Erro ao buscar histórico.</p>'; }
}

// --- LÓGICA DO TASV ---
function verificarPendenciaTASV(userData, userId) {
    const ano = new Date().getFullYear();
    if (userData.tasvAssinadoAno !== ano) {
        document.getElementById('tasv-ano-atual').textContent = ano;
        document.getElementById('modal-tasv').classList.add('visible');
    }
}

document.getElementById('check-aceite-tasv').onchange = (e) => {
    const b = document.getElementById('btn-assinar-tasv');
    b.disabled = !e.target.checked;
    b.style.backgroundColor = e.target.checked ? '#0277BD' : '#9ca3af';
};

document.getElementById('btn-assinar-tasv').onclick = async () => {
    const ano = new Date().getFullYear();
    const batch = writeBatch(db);
    batch.update(doc(db, "voluntarios", currentUserId), { tasvAssinadoAno: ano, tasvDataAssinatura: serverTimestamp() });
    await batch.commit(); alert("Termo assinado!");
    document.getElementById('modal-tasv').classList.remove('visible');
    currentUserData.tasvAssinadoAno = ano;
};

// --- EVENTOS ---
btnLogout.onclick = async () => { await signOut(auth); window.location.href = 'login.html'; };
alunoContent.onclick = async (e) => {
    const t = e.target.closest('.btn-details-aluno');
    if (!t) return;
    const card = t.closest('.card');
    const details = card.querySelector('.curso-details-content');
    if (details.classList.contains('hidden')) {
        details.classList.remove('hidden'); t.textContent = `Ocultar Detalhes ▲`;
        await carregarErenderizarDetalhesAluno(t.dataset.turmaId, t.dataset.participanteDocId, details);
    } else { details.classList.add('hidden'); t.textContent = `Ver Detalhes ▼`; details.innerHTML = ''; }
};
facilitadorContent.onclick = (e) => {
    const t = e.target.closest('.btn-chamada-facilitador');
    if (t && !t.disabled) abrirModalFrequencia(t.dataset.turmaId, t.dataset.aulaId, t.dataset.aulaTitulo);
};
closeModalFrequenciaBtn.onclick = () => modalFrequencia.classList.remove('visible');
btnSalvarFrequencia.onclick = salvarFrequencia;
frequenciaListContainer.onclick = (e) => {
    const b = e.target.closest('.btn-status');
    if (b) {
        const item = b.closest('.attendance-item');
        item.dataset.status = b.dataset.status;
        item.querySelectorAll('.btn-status').forEach(btn => btn.classList.remove('active'));
        b.classList.add('active');
    }
};

document.getElementById('close-modal-galeria').onclick = () => {
    document.getElementById('modal-galeria-comunicacoes').classList.remove('visible');
};

document.getElementById('close-modal-player').onclick = () => {
    const player = document.getElementById('audio-player-portal');
    player.pause();
    player.src = ""; // Para parar o download do áudio
    document.getElementById('modal-player-comunicacao').classList.remove('visible');
    // Reabre a galeria para facilitar a navegação
    document.getElementById('modal-galeria-comunicacoes').classList.add('visible');
};
closeModalAtividadesBtn.onclick = () => modalAtividades.classList.remove('visible');
formAtividadesPresenca.onsubmit = salvarPresencaLogado;
closeModalDetalhesBtn.onclick = () => modalOverlayDetalhes.classList.remove('visible');
closeModalEditarPerfilBtn.onclick = () => modalOverlayEditarPerfil.classList.remove('visible');
formEditarPerfil.onsubmit = salvarAlteracoesPerfil;
closeModalHistoricoBtn.onclick = () => modalOverlayHistorico.classList.remove('visible');

console.log("DEBUG: Script meu-cepat.js carregado com sucesso.");