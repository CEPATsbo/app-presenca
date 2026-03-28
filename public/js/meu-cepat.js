import { initializeApp } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-auth.js";
import { getFirestore, collection, collectionGroup, query, where, getDocs, doc, getDoc, limit, orderBy, Timestamp, writeBatch, updateDoc, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js";

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

// Elementos da Comunicação Mediúnica
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

            if (origemBusca === 'voluntario') verificarPendenciaTASV(currentUserData, currentUserId);

            await carregarMural();
            await carregarComunicacoesMediunicas();

            if (currentUserData.isMedium) {
                moduleInformativo.classList.remove('hidden');
                await carregarMinhaEscala(currentUserId);
            } else {
                document.getElementById('slide-escala').style.display = 'none';
                if (muralContent.innerText.trim() !== "" && muralContent.innerText !== "Carregando avisos...") {
                    moduleInformativo.classList.remove('hidden');
                }
            }

            const [isAluno, isFacilitador, isAdmin] = await Promise.all([
                verificarPapelAluno(currentUserId),
                verificarPapelFacilitador(currentUserId),
                verificarPapelAdmin(user)
            ]);
            await processarPapeisEExibirModulos(currentUserId, currentUserData, isAluno, isFacilitador, isAdmin);

        } catch (error) {
            console.error("Erro ao carregar dados:", error);
            loadingMessage.innerHTML = `<p style="color: red;">${error.message}</p>`;
        }
    } else {
        window.location.href = 'login.html';
    }
});

// --- LÓGICA DE COMUNICAÇÃO MEDIÚNICA ---
async function carregarComunicacoesMediunicas() {
    try {
        const q = query(
            collection(db, "comunicacoes_mediunicas"), 
            where("publico", "==", true), 
            where("status", "==", "concluido"),
            orderBy("dataComunicacao", "desc"),
            limit(5)
        );
        const snap = await getDocs(q);
        if (snap.empty) {
            comunicacoesContent.innerHTML = '<p>Nenhuma comunicação pública disponível.</p>';
            return;
        }
        comunicacoesContent.innerHTML = '';
        snap.forEach(docSnap => {
            const d = docSnap.data();
            cacheComunicacoes[docSnap.id] = d;
            const dataEx = d.dataComunicacao ? d.dataComunicacao.split("-").reverse().join("/") : "N/A";
            const card = document.createElement('div');
            card.className = 'card';
            card.innerHTML = `<h4>${d.trabalho}</h4><p>Data: ${dataEx}</p><button class="btn-primary" onclick="abrirPlayerPortal('${docSnap.id}')" style="width:100%; margin-top:10px;">Ouvir e Ler</button>`;
            comunicacoesContent.appendChild(card);
        });
        moduleComunicacoes.classList.remove('hidden');
    } catch (e) { console.error("Erro comunicacoes:", e); }
}

window.abrirPlayerPortal = (id) => {
    const d = cacheComunicacoes[id];
    const dataEx = d.dataComunicacao ? d.dataComunicacao.split("-").reverse().join("/") : "N/A";
    document.getElementById('player-titulo-comunicacao').innerText = d.trabalho;
    document.getElementById('player-info-comunicacao').innerText = `Médium: ${d.medium} | Data: ${dataEx}`;
    const player = document.getElementById('audio-player-portal');
    player.src = d.urlAudio;
    const tFormat = d.transcricao.split("").join("").split(". ").join(".<br><br>");
    document.getElementById('texto-transcricao-portal').innerHTML = tFormat;
    document.getElementById('modal-player-comunicacao').classList.add('visible');
};

document.getElementById('close-modal-player').onclick = () => {
    document.getElementById('audio-player-portal').pause();
    document.getElementById('modal-player-comunicacao').classList.remove('visible');
};

// --- FUNÇÕES ORIGINAIS PRESERVADAS ---
async function carregarMural() {
    try {
        const configRef = doc(db, "configuracoes", "mural");
        const snap = await getDoc(configRef);
        if (snap.exists() && snap.data().mensagem) {
            muralContent.innerHTML = `<p style="font-size: 1.1em; color: #444; line-height: 1.5;">${snap.data().mensagem}</p>`;
        } else { muralContent.innerHTML = "<p>Nenhum aviso importante no momento.</p>"; }
    } catch (e) { console.error("Erro mural:", e); }
}

async function carregarMinhaEscala(userId) {
    const hoje = new Date(); hoje.setHours(0,0,0,0);
    const mesId = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}`;
    const hojeIso = hoje.toISOString().split('T')[0];
    try {
        const snap = await getDoc(doc(db, "escalas_mediunicas", mesId));
        if (!snap.exists()) { escalaContent.innerHTML = "<p>Escala não publicada.</p>"; return; }
        let meusTrabalhos = [];
        Object.entries(snap.data().escalados || {}).forEach(([chave, listaUids]) => {
            const dataString = chave.split('_')[0];
            if (listaUids.includes(userId) && dataString >= hojeIso) {
                meusTrabalhos.push({ data: dataString, trabalho: chave.split('_').slice(1).join(' ').replace(/_/g, ' ') });
            }
        });
        if (meusTrabalhos.length === 0) { escalaContent.innerHTML = "<p>Sem trabalhos escalados.</p>"; }
        else {
            meusTrabalhos.sort((a, b) => a.data.localeCompare(b.data));
            let html = '<ul class="escala-lista">';
            meusTrabalhos.forEach(t => html += `<li class="escala-item"><span>${t.data.split('-').reverse().join('/')}</span> <span>${t.trabalho}</span></li>`);
            escalaContent.innerHTML = html + '</ul>';
        }
    } catch (e) { console.error("Erro escala:", e); }
}

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

async function verificarPapelAluno(userId) {
    const q = query(collectionGroup(db, 'participantes'), where('participanteId', '==', userId), limit(1));
    return !(await getDocs(q)).empty;
}

async function verificarPapelFacilitador(userId) {
    const q = query(collection(db, 'turmas'), where('facilitadoresIds', 'array-contains', userId), limit(1));
    return !(await getDocs(q)).empty;
}

async function verificarPapelAdmin(user) {
    try {
        const idTokenResult = await user.getIdTokenResult(true);
        const claims = idTokenResult.claims || {};
        const userRole = claims.role || 'voluntario';
        const rolesComAcessoAdmin = ['super-admin', 'voluntario', 'diretor', 'entrevistador', 'bibliotecario', 'produtor-evento', 'conselheiro', 'irradiador', 'dirigente-escola', 'secretario-escola', 'recepcionista', 'tesoureiro', 'caritas'];
        if (rolesComAcessoAdmin.includes(userRole)) return true;
        for (const role of rolesComAcessoAdmin) { if (claims[role] === true) return true; }
        return false;
    } catch (error) { return false; }
}

async function carregarModuloAluno(userId) {
    alunoContent.innerHTML = "<p>Buscando seus cursos...</p>";
    try {
        const q = query(collectionGroup(db, 'participantes'), where('participanteId', '==', userId));
        const snap = await getDocs(q);
        if (snap.empty) { alunoContent.innerHTML = '<p>Nenhuma inscrição.</p>'; return; }
        alunoContent.innerHTML = '';
        for (const pDoc of snap.docs) {
            const tDoc = await getDoc(pDoc.ref.parent.parent);
            if (tDoc.exists()) renderizarCardDoCursoAluno({ id: tDoc.id, ...tDoc.data() }, { id: pDoc.id, ...pDoc.data() });
        }
    } catch (e) { console.error(e); }
}

function renderizarCardDoCursoAluno(turmaData, participanteData) {
    const div = document.createElement('div'); div.className = 'card';
    const ano = turmaData.anoAtual || 1;
    const aval = participanteData.avaliacoes ? participanteData.avaliacoes[ano] : null;
    let freq = aval ? `${aval.notaFrequencia || 0}%` : '--';
    div.innerHTML = `<h4>${turmaData.nomeDaTurma}</h4><p>Frequência: ${freq}</p><button class="btn-details-aluno" data-turma-id="${turmaData.id}" data-participante-doc-id="${participanteData.id}" style="margin-top:10px;">Ver Detalhes ▼</button><div class="curso-details-content hidden" style="margin-top:10px;"></div>`;
    alunoContent.appendChild(div);
}

async function carregarModuloFacilitador(userId) {
    facilitadorContent.innerHTML = "<p>Buscando suas turmas...</p>";
    try {
        const snap = await getDocs(query(collection(db, "turmas"), where("facilitadoresIds", "array-contains", userId)));
        if (snap.empty) { facilitadorContent.innerHTML = '<p>Nenhuma turma.</p>'; return; }
        facilitadorContent.innerHTML = '';
        for (const tDoc of snap.docs) await renderizarCardDaTurmaFacilitador({ id: tDoc.id, ...tDoc.data() });
    } catch (e) { console.error(e); }
}

async function renderizarCardDaTurmaFacilitador(turmaData) {
    const div = document.createElement('div'); div.className = 'card';
    const hoje = new Date(); hoje.setHours(0,0,0,0);
    const qAula = query(collection(db, "turmas", turmaData.id, "cronograma"), where("dataAgendada", ">=", Timestamp.fromDate(hoje)), where("dataAgendada", "<=", Timestamp.fromDate(new Date(hoje.getTime() + 86399999))), limit(1));
    const snapA = await getDocs(qAula);
    let aulaH = snapA.empty ? null : { id: snapA.docs[0].id, ...snapA.docs[0].data() };
    div.innerHTML = `<h4>${turmaData.nomeDaTurma}</h4><p>Aula: ${aulaH ? aulaH.titulo : 'Nenhuma hoje'}</p><button class="btn-chamada-facilitador" data-turma-id="${turmaData.id}" data-aula-id="${aulaH ? aulaH.id : ''}" data-aula-titulo="${aulaH ? aulaH.titulo : ''}" ${!aulaH ? 'disabled' : ''} style="width:100%; margin-top:10px;">Realizar Chamada</button>`;
    facilitadorContent.appendChild(div);
}

async function carregarModuloAcoesDoDia(userId, userData) {
    const dataHoje = getDataDeHojeSP();
    const snap = await getDoc(doc(db, "presencas", `${dataHoje}_${userData.nome.replace(/\s+/g, '_')}`));
    if (snap.exists() && snap.data().status === 'presente') renderizarCardPresencaRegistrada(snap.data());
    else verificarLocalizacaoParaRegistro();
}

function verificarLocalizacaoParaRegistro() {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition((pos) => {
        const d = getDistance(pos.coords.latitude, pos.coords.longitude, CASA_ESPIRITA_LAT, CASA_ESPIRITA_LON);
        if (d <= RAIO_EM_METROS) renderizarCardProntoParaRegistrar(d);
        else renderizarCardLonge(d);
    }, (e) => console.error(e));
}

function renderizarCardPresencaRegistrada(data) { presencaCardContent.innerHTML = `<div class="presenca-card"><h4><i class="fas fa-check-circle" style="color:green;"></i> Presença Registrada</h4><p>Atividades: ${data.atividade}</p></div>`; }
function renderizarCardProntoParaRegistrar(dist) { presencaCardContent.innerHTML = `<div class="presenca-card"><h4><i class="fas fa-map-marker-alt"></i> Você está na Casa!</h4><p>Distância: ${dist.toFixed(0)}m</p><button class="btn-presenca" id="btn-reg-p">Registrar Presença Agora</button></div>`; document.getElementById('btn-reg-p').onclick = abrirModalAtividades; }
function renderizarCardLonge(dist) { presencaCardContent.innerHTML = `<div class="presenca-card"><h4><i class="fas fa-satellite-dish"></i> Fora da Área</h4><p>Aprox. ${dist.toFixed(0)}m</p></div>`; }

function getDistance(lat1, lon1, lat2, lon2) {
    const R = 6371e3; const φ1 = lat1 * Math.PI/180, φ2 = lat2 * Math.PI/180;
    const Δφ = (lat2-lat1)*Math.PI/180, Δλ = (lon2-lon1)*Math.PI/180;
    const a = Math.sin(Δφ/2)**2 + Math.cos(φ1)*Math.cos(φ2)*Math.sin(Δλ/2)**2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

function getDataDeHojeSP() { return new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'America/Sao_Paulo' }).format(new Date()); }

async function carregarModuloPessoal(userId, userData) {
    pessoalContent.innerHTML = `<div class="card"><h4>Meu Perfil</h4><p>Email: ${userData.email}</p><p>Fone: ${userData.telefone || '--'}</p><a href="#" id="link-editar-dados" class="card-link">Editar</a></div><div class="card"><h4>Minhas Pendências</h4><p>Cantina: <span id="p-cant">R$ 0,00</span></p><a href="#" id="link-ver-detalhes" class="card-link">Detalhes</a></div><div class="card"><h4>Histórico</h4><p>Última em: ${userData.ultimaPresenca || '--'}</p><a href="#" id="link-ver-historico" class="card-link">Ver Tudo</a></div>`;
    document.getElementById('link-editar-dados').onclick = abrirModalEdicao;
    document.getElementById('link-ver-detalhes').onclick = () => { preencherModalDetalhes(); modalOverlayDetalhes.classList.add('visible'); };
    document.getElementById('link-ver-historico').onclick = carregarHistoricoDePresenca;
    await buscarPendenciasEEmprestimos(userId);
}

async function buscarPendenciasEEmprestimos(userId) {
    try {
        const snapC = await getDocs(query(collection(db, "contas_a_receber"), where("compradorId", "==", userId), where("status", "==", "pendente")));
        let total = 0; detalhesPendenciasCantina = [];
        snapC.forEach(d => { total += d.data().total; detalhesPendenciasCantina.push(d.data()); });
        if (document.getElementById('p-cant')) document.getElementById('p-cant').innerText = `R$ ${total.toFixed(2)}`;
    } catch (e) { console.error(e); }
}

async function verificarPendenciaTASV(userData, userId) {
    const ano = new Date().getFullYear();
    if (userData.tasvAssinadoAno !== ano) {
        document.getElementById('tasv-ano-atual').innerText = ano;
        modalTasv.classList.add('visible');
    }
}

document.getElementById('check-aceite-tasv').onchange = (e) => {
    btnAssinarTasv.disabled = !e.target.checked;
    btnAssinarTasv.style.backgroundColor = e.target.checked ? '#0277BD' : '#9ca3af';
};

btnAssinarTasv.onclick = async () => {
    btnAssinarTasv.disabled = true;
    const ano = new Date().getFullYear();
    const batch = writeBatch(db);
    batch.update(doc(db, "voluntarios", currentUserId), { tasvAssinadoAno: ano, tasvDataAssinatura: serverTimestamp() });
    await batch.commit();
    alert("Assinado!");
    modalTasv.classList.remove('visible');
};

// Eventos Globais
btnLogout.onclick = async () => { await signOut(auth); window.location.href = 'login.html'; };
document.querySelectorAll('.modal-close-btn').forEach(btn => btn.onclick = (e) => e.target.closest('.modal-overlay').classList.remove('visible'));

function abrirModalEdicao() {
    inputEditNome.value = currentUserData.nome;
    inputEditTelefone.value = currentUserData.telefone || '';
    inputEditEndereco.value = currentUserData.endereco || '';
    inputEditAniversario.value = currentUserData.aniversario || '';
    modalOverlayEditarPerfil.classList.add('visible');
}

formEditarPerfil.onsubmit = async (e) => {
    e.preventDefault();
    const novos = { nome: inputEditNome.value, telefone: inputEditTelefone.value, endereco: inputEditEndereco.value, aniversario: inputEditAniversario.value };
    await updateDoc(doc(db, "voluntarios", currentUserId), novos);
    currentUserData = { ...currentUserData, ...novos };
    modalOverlayEditarPerfil.classList.remove('visible');
    carregarModuloPessoal(currentUserId, currentUserData);
};