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
const RAIO_EM_METROS = 40;

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
const modalAtividades = document.getElementById('modal-atividades-presenca');
const closeModalAtividadesBtn = document.getElementById('close-modal-atividades');
const formAtividadesPresenca = document.getElementById('form-atividades-presenca');
const atividadesModalLista = document.getElementById('atividades-modal-lista');
const btnConfirmarPresenca = document.getElementById('btn-confirmar-presenca');
const modalFrequencia = document.getElementById('modal-frequencia');
const closeModalFrequenciaBtn = document.getElementById('close-modal-frequencia');
const modalFrequenciaTitulo = document.getElementById('modal-frequencia-titulo');
const frequenciaListContainer = document.getElementById('frequencia-list-container');
const btnSalvarFrequencia = document.getElementById('btn-salvar-frequencia');

// --- VARIÁVEIS DE ESTADO ---
let currentUserData = null;
let currentUserId = null;
let cachedAtividades = null;
let currentTurmaIdModal = null;
let currentAulaIdModal = null;

// --- LÓGICA PRINCIPAL ---
onAuthStateChanged(auth, async (user) => {
    if (user) {
        mainContainer.style.display = 'block';
        try {
            const qUser = query(collection(db, "voluntarios"), where("authUid", "==", user.uid), limit(1));
            const userSnapshot = await getDocs(qUser);
            let origemBusca;

            if (userSnapshot.empty) {
                const qAluno = query(collection(db, "alunos"), where("authUid", "==", user.uid), limit(1)); // Supondo que alunos possam ter authUid associado
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

            const [isAluno, isFacilitador, isAdmin] = await Promise.all([
                verificarPapelAluno(currentUserId, origemBusca),
                verificarPapelFacilitador(currentUserId), // Facilitador é sempre voluntário
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

async function processarPapeisEExibirModulos(userId, userData, isAluno, isFacilitador, isAdmin) {
    loadingMessage.classList.add('hidden');
    
    moduleDia.classList.remove('hidden');
    modulePessoal.classList.remove('hidden');
    moduleServicos.classList.remove('hidden');
    document.getElementById('pessoal-content').innerHTML = "<p>Carregando seu perfil...</p>"; // Placeholder

    const promises = [carregarModuloAcoesDoDia(userId, userData)]; 

    if (isAluno) {
        moduleAluno.classList.remove('hidden');
        promises.push(carregarModuloAluno(userId));
    }
    if (isFacilitador) {
        moduleFacilitador.classList.remove('hidden');
        promises.push(carregarModuloFacilitador(userId));
    }
    if (isAdmin) {
        moduleGestao.classList.remove('hidden');
    }
    await Promise.all(promises);
}


// --- FUNÇÕES DE VERIFICAÇÃO DE PAPÉIS ---
async function verificarPapelAluno(userId, origemBusca) {
    const idParaBuscar = userId; 
    const q = query(collectionGroup(db, 'participantes'), where('participanteId', '==', idParaBuscar), limit(1));
    const snapshot = await getDocs(q);
    return !snapshot.empty;
}

async function verificarPapelFacilitador(userId) {
    const q = query(collection(db, 'turmas'), where('facilitadoresIds', 'array-contains', userId), limit(1));
    const snapshot = await getDocs(q);
    return !snapshot.empty;
}

async function verificarPapelAdmin(user) {
    const idTokenResult = await user.getIdTokenResult(true);
    const userRole = idTokenResult.claims.role;
    const adminRoles = ['super-admin', 'diretor', 'tesoureiro'];
    return adminRoles.includes(userRole);
}

// --- LÓGICA DO MÓDULO ALUNO ---
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

// --- LÓGICA DO MÓDULO FACILITADOR ---
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

// --- FUNÇÕES DO MODAL DE FREQUÊNCIA ---
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
    } catch(error) {
        console.error("Erro ao carregar chamada:", error);
        frequenciaListContainer.innerHTML = '<li>Erro ao carregar.</li>';
    }
}

async function salvarFrequencia() {
    if (!currentTurmaIdModal || !currentAulaIdModal) return;
    btnSalvarFrequencia.disabled = true;
    try {
        const batch = writeBatch(db);
        const items = frequenciaListContainer.querySelectorAll('.attendance-item');
        items.forEach(item => {
            const participanteIdOriginal = item.dataset.participanteId; 
            const status = item.dataset.status || 'ausente'; 
            const frequenciaDocId = `${currentAulaIdModal}_${participanteIdOriginal}`; 
            const frequenciaRef = doc(db, "turmas", currentTurmaIdModal, "frequencias", frequenciaDocId);
            batch.set(frequenciaRef, { aulaId: currentAulaIdModal, participanteId: participanteIdOriginal, status: status, turmaId: currentTurmaIdModal });
        });
        const aulaRef = doc(db, "turmas", currentTurmaIdModal, "cronograma", currentAulaIdModal);
        batch.update(aulaRef, { status: 'realizada' });
        await batch.commit();
        alert("Frequência salva!");
        modalFrequencia.classList.remove('visible');
    } catch (error) {
        console.error("Erro ao salvar frequência:", error);
        alert("Erro ao salvar.");
    } finally {
        btnSalvarFrequencia.disabled = false;
    }
}


// --- LÓGICA DO MÓDULO AÇÕES DO DIA ---
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
        } else {
            verificarLocalizacaoParaRegistro();
        }
    } catch (error) {
        console.error("Erro ao verificar presença:", error);
        presencaCardContent.innerHTML = '<p style="color: red;">Erro ao verificar presença.</p>';
    }
}

function verificarLocalizacaoParaRegistro() {
    if (!navigator.geolocation) return renderizarCardErroGeo("Geolocalização não suportada.");
    navigator.geolocation.getCurrentPosition(
        (position) => {
            const distancia = getDistance(position.coords.latitude, position.coords.longitude, CASA_ESPIRITA_LAT, CASA_ESPIRITA_LON);
            if (distancia <= RAIO_EM_METROS) renderizarCardProntoParaRegistrar(distancia);
            else renderizarCardLonge(distancia);
        },
        (error) => {
            console.error("Erro de geolocalização:", error);
            renderizarCardErroGeo("Não foi possível obter localização.");
        }
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
function renderizarCardErroGeo(mensagem) {
     presencaCardContent.innerHTML = `<div class="presenca-card"><h4><i class="fas fa-exclamation-triangle" style="color: red;"></i> Status da Presença Hoje</h4><p style="color: red;">${mensagem}</p><button class="btn-presenca" disabled>Registro Indisponível</button><button class="btn-tertiary" style="margin-top: 15px;" onclick="location.reload()">Tentar novamente</button></div>`;
}

async function buscarAtividadesDoFirestore() {
    if (cachedAtividades) return cachedAtividades;
    try {
        const q = query(collection(db, "atividades"), where("ativo", "==", true), orderBy("nome"));
        const snapshot = await getDocs(q);
        cachedAtividades = snapshot.docs.map(doc => doc.data().nome);
        return cachedAtividades;
    } catch (e) { console.error("Erro ao buscar atividades:", e); return []; }
}

async function abrirModalAtividades() {
    atividadesModalLista.innerHTML = 'Carregando atividades...';
    modalAtividades.classList.add('visible');
    const atividades = await buscarAtividadesDoFirestore();
    atividadesModalLista.innerHTML = '';
    if (atividades.length === 0) { atividadesModalLista.innerHTML = '<p>Nenhuma atividade.</p>'; return; }
    atividades.forEach(atividade => {
        const div = document.createElement('div');
        div.innerHTML = `<input type="checkbox" name="atividade_modal" value="${atividade}" id="modal-${atividade}"> <label for="modal-${atividade}">${atividade}</label>`;
        atividadesModalLista.appendChild(div);
    });
}

async function salvarPresencaLogado(event) {
    event.preventDefault();
    const atividadesSelecionadasNode = document.querySelectorAll('#form-atividades-presenca input[name="atividade_modal"]:checked');
    const atividadesSelecionadas = Array.from(atividadesSelecionadasNode).map(cb => cb.value);
    if (atividadesSelecionadas.length === 0) return alert("Selecione pelo menos uma atividade.");
    btnConfirmarPresenca.disabled = true; btnConfirmarPresenca.textContent = 'Registrando...';
    try {
        const dataHoje = getDataDeHojeSP();
        const presencaId = `${dataHoje}_${currentUserData.nome.replace(/\s+/g, '_')}`;
        const docRef = doc(db, "presencas", presencaId);
        await setDoc(docRef, { 
            nome: currentUserData.nome, atividade: atividadesSelecionadas.join(', '), data: dataHoje, 
            primeiroCheckin: serverTimestamp(), ultimaAtualizacao: serverTimestamp(), status: 'presente',
            authUid: auth.currentUser.uid, voluntarioId: currentUserId
        }, { merge: true });
        modalAtividades.classList.remove('visible');
        renderizarCardPresencaRegistrada({ atividade: atividadesSelecionadas.join(', ') });
    } catch (error) {
        console.error("Erro ao registrar presença:", error);
        alert("Erro ao salvar presença.");
    } finally {
        btnConfirmarPresenca.disabled = false; btnConfirmarPresenca.textContent = 'Confirmar Presença';
    }
}


// --- EVENTOS ---
btnLogout.addEventListener('click', async (e) => {
    e.preventDefault();
    await signOut(auth);
    window.location.href = 'login.html';
});

alunoContent.addEventListener('click', async (e) => {
    const target = e.target.closest('.btn-details-aluno');
    if (!target) return;
    const card = target.closest('.card');
    const detailsContent = card.querySelector('.curso-details-content');
    const turmaId = target.dataset.turmaId;
    const participanteDocId = target.dataset.participanteDocId;
    const isHidden = detailsContent.classList.contains('hidden');
    if (isHidden) {
        detailsContent.classList.remove('hidden');
        target.innerHTML = `Ocultar Detalhes ▲`;
        await carregarErenderizarDetalhesAluno(turmaId, participanteDocId, detailsContent);
    } else {
        detailsContent.classList.add('hidden');
        target.innerHTML = `Ver Detalhes ▼`;
        detailsContent.innerHTML = '';
    }
});

facilitadorContent.addEventListener('click', (e) => {
    const target = e.target.closest('.btn-chamada-facilitador');
    if (target && !target.disabled) {
        const { turmaId, aulaId, aulaTitulo } = target.dataset;
        abrirModalFrequencia(turmaId, aulaId, aulaTitulo);
    }
});

if(closeModalFrequenciaBtn) closeModalFrequenciaBtn.addEventListener('click', () => modalFrequencia.classList.remove('visible'));
if(btnSalvarFrequencia) btnSalvarFrequencia.addEventListener('click', salvarFrequencia);
if(frequenciaListContainer) frequenciaListContainer.addEventListener('click', (event) => {
    if (event.target.classList.contains('btn-status')) {
        const targetBtn = event.target;
        const parentItem = targetBtn.closest('.attendance-item');
        parentItem.dataset.status = targetBtn.dataset.status;
        parentItem.querySelectorAll('.btn-status').forEach(btn => btn.classList.remove('active'));
        targetBtn.classList.add('active');
    }
});

if(closeModalAtividadesBtn) closeModalAtividadesBtn.addEventListener('click', () => modalAtividades.classList.remove('visible'));
if(formAtividadesPresenca) formAtividadesPresenca.addEventListener('submit', salvarPresencaLogado);

console.log("DEBUG: Script meu-cepat.js carregado e eventos adicionados.");