import { initializeApp } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-auth.js";
import { getFirestore, collection, collectionGroup, query, where, getDocs, doc, getDoc, limit, orderBy, Timestamp, writeBatch, updateDoc, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyBV7RPjk3cFTqL-aIpflJcUojKg1ZXMLuU",
    authDomain: "voluntarios-ativos---cepat.firebaseapp.com",
    projectId: "voluntarios-ativos---cepat",
    storageBucket: "voluntarios-ativos---cepat.firebasestorage.app",
    appId: "1:66122858261:web:7fa21f1805463b5c08331c"
};
const CASA_LAT = -22.75553; const CASA_LON = -47.36945; const RAIO = 70;

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const mainContainer = document.getElementById('main-container');
const greetingName = document.getElementById('greeting-name');
const loadingMessage = document.getElementById('loading-message');
const moduleInformativo = document.getElementById('module-informativo');
const muralContent = document.getElementById('mural-content');
const escalaContent = document.getElementById('escala-content');
const moduleComunicacoes = document.getElementById('module-comunicacoes');
const comunicacoesContent = document.getElementById('comunicacoes-publicas-content');

let currentUserData, currentUserId, cacheDados = {};
let detalhesCantina = [], detalhesBiblioteca = [], detalhesEmprestimos = [];

onAuthStateChanged(auth, async (user) => {
    if (user) {
        mainContainer.style.display = 'block';
        try {
            const qV = query(collection(db, "voluntarios"), where("authUid", "==", user.uid), limit(1));
            const snapV = await getDocs(qV);
            let origem;
            if (snapV.empty) {
                const qA = query(collection(db, "alunos"), where("authUid", "==", user.uid), limit(1));
                const snapA = await getDocs(qA);
                if (snapA.empty) throw new Error("Perfil não encontrado.");
                currentUserData = snapA.docs[0].data();
                currentUserId = snapA.docs[0].id;
                origem = 'aluno';
            } else {
                currentUserData = snapV.docs[0].data();
                currentUserId = snapV.docs[0].id;
                origem = 'voluntario';
            }

            greetingName.textContent = `Olá, ${currentUserData.nome}!`;
            if (origem === 'voluntario') verificarPendenciaTASV(currentUserData, currentUserId);

            await carregarMural();
            if (currentUserData.isMedium) {
                moduleInformativo.classList.remove('hidden');
                await carregarMinhaEscala(currentUserId);
            }
            
            await carregarComunicacoesMediunicas();

            const isA = await verificarPapelAluno(currentUserId);
            const isF = await verificarPapelFacilitador(currentUserId);
            const isAdm = await verificarPapelAdmin(user);

            loadingMessage.classList.add('hidden');
            document.getElementById('module-dia').classList.remove('hidden');
            document.getElementById('module-pessoal').classList.remove('hidden');
            document.getElementById('module-servicos').classList.remove('hidden');
            moduleComunicacoes.classList.remove('hidden');

            if (isA) { document.getElementById('module-aluno').classList.remove('hidden'); carregarModuloAluno(currentUserId); }
            if (isF) { document.getElementById('module-facilitador').classList.remove('hidden'); carregarModuloFacilitador(currentUserId); }
            if (isAdm) document.getElementById('module-gestao').classList.remove('hidden');

            carregarModuloAcoesDoDia(currentUserId, currentUserData);
            carregarModuloPessoal(currentUserId, currentUserData);

        } catch (e) { console.error(e); loadingMessage.innerHTML = `<p style="color:red;">${e.message}</p>`; }
    } else { window.location.href = 'login.html'; }
});

// --- COMUNICAÇÕES MEDIÚNICAS ---
async function carregarComunicacoesMediunicas() {
    try {
        const q = query(collection(db, "comunicacoes_mediunicas"), where("publico", "==", true), where("status", "==", "concluido"), orderBy("dataComunicacao", "desc"), limit(5));
        const snap = await getDocs(q);
        if (snap.empty) { comunicacoesContent.innerHTML = "<p>Nenhuma comunicação pública disponível.</p>"; return; }
        comunicacoesContent.innerHTML = "";
        snap.forEach(docSnap => {
            const d = docSnap.data(); cacheDados[docSnap.id] = d;
            const card = document.createElement('div'); card.className = 'card';
            card.innerHTML = `<h4>${d.trabalho}</h4><p>${d.dataComunicacao.split("-").reverse().join("/")}</p><button class="btn-primary" onclick="abrirPlayerPortal('${docSnap.id}')">Ouvir e Ler</button>`;
            comunicacoesContent.appendChild(card);
        });
    } catch (e) { console.error("Erro comunicacoes:", e); }
}

window.abrirPlayerPortal = (id) => {
    const d = cacheDados[id];
    document.getElementById('player-titulo-comunicacao').innerText = d.trabalho;
    document.getElementById('audio-player-portal').src = d.urlAudio;
    document.getElementById('texto-transcricao-portal').innerHTML = d.transcricao.split("").join("").split(". ").join(".<br><br>");
    document.getElementById('modal-player-comunicacao').classList.add('visible');
};

// --- FUNÇÕES DE ALUNO (RESTAURADAS) ---
async function carregarModuloAluno(uid) {
    const cont = document.getElementById('aluno-content'); cont.innerHTML = "Carregando cursos...";
    const q = query(collectionGroup(db, 'participantes'), where('participanteId', '==', uid));
    const snap = await getDocs(q);
    cont.innerHTML = snap.empty ? '<p>Sem inscrições.</p>' : '';
    for (const pDoc of snap.docs) {
        const tSnap = await getDoc(pDoc.ref.parent.parent);
        if (tSnap.exists()) {
            const d = tSnap.data(); const p = pDoc.data();
            const card = document.createElement('div'); card.className = 'card';
            card.innerHTML = `<h4>${d.nomeDaTurma}</h4><p>Freq: ${p.avaliacoes?.[d.anoAtual]?.notaFrequencia || 0}%</p>`;
            cont.appendChild(card);
        }
    }
}

// --- GEOLOCALIZAÇÃO (RESTAURADA) ---
function carregarModuloAcoesDoDia(uid, userData) {
    const cont = document.getElementById('presenca-card-content');
    navigator.geolocation.getCurrentPosition(p => {
        const dist = calcularDist(p.coords.latitude, p.coords.longitude, CASA_LAT, CASA_LON);
        if (dist <= RAIO) cont.innerHTML = `<button class="btn-presenca" onclick="abrirModalAtividades()">Registrar Presença (${dist.toFixed(0)}m)</button>`;
        else cont.innerHTML = `<p>Aproxime-se (${dist.toFixed(0)}m)</p>`;
    }, () => { cont.innerHTML = "<p>GPS necessário.</p>"; });
}
function calcularDist(la1, lo1, la2, lo2) {
    const R = 6371e3; const p1 = la1 * Math.PI/180, p2 = la2 * Math.PI/180, dl = (lo2-lo1)*Math.PI/180, da = (la2-la1)*Math.PI/180;
    const a = Math.sin(da/2)**2 + Math.cos(p1)*Math.cos(p2)*Math.sin(dl/2)**2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

// --- AUXILIARES E EVENTOS (RESTAURADOS) ---
async function carregarMural() {
    const snap = await getDoc(doc(db, "configuracoes", "mural"));
    if (snap.exists()) muralContent.innerHTML = `<p>${snap.data().mensagem}</p>`;
}
async function verificarPapelAluno(uid) { return !(await getDocs(query(collectionGroup(db, 'participantes'), where('participanteId', '==', uid), limit(1)))).empty; }
async function verificarPapelFacilitador(uid) { return !(await getDocs(query(collection(db, 'turmas'), where('facilitadoresIds', 'array-contains', uid), limit(1)))).empty; }
async function verificarPapelAdmin(user) { const c = (await user.getIdTokenResult()).claims; return !!(c.role || c['super-admin']); }

document.getElementById('btn-logout').onclick = () => signOut(auth).then(() => window.location.href='login.html');
document.querySelectorAll('.modal-close-btn').forEach(b => b.onclick = (e) => e.target.closest('.modal-overlay').classList.remove('visible'));