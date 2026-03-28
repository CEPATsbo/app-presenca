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

// Elementos
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
            if (origem === 'voluntario') verificarTASV(currentUserData, currentUserId);

            await carregarMural();
            if (currentUserData.isMedium) {
                moduleInformativo.classList.remove('hidden');
                await carregarMinhaEscala(currentUserId);
            }
            
            // NOVO: Carregar comunicações públicas filtradas pela diretoria
            await carregarComunicacoesPublicas();

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

// --- LÓGICA DE INSTRUÇÕES ESPIRITUAIS ---
async function carregarComunicacoesPublicas() {
    try {
        const q = query(collection(db, "comunicacoes_mediunicas"), where("publico", "==", true), where("status", "==", "concluido"), orderBy("dataComunicacao", "desc"), limit(5));
        const snap = await getDocs(q);
        if (snap.empty) { comunicacoesContent.innerHTML = "<p>Nenhuma instrução pública recente.</p>"; return; }
        comunicacoesContent.innerHTML = "";
        snap.forEach(docSnap => {
            const d = docSnap.data(); cacheDados[docSnap.id] = d;
            const dataBR = d.dataComunicacao.split("-").reverse().join("/");
            const card = document.createElement('div'); card.className = 'card';
            card.innerHTML = `<h4>${d.trabalho}</h4><p>Data: ${dataBR}</p><button class="btn-primary" onclick="abrirPlayerPortal('${docSnap.id}')">Ouvir e Ler</button>`;
            comunicacoesContent.appendChild(card);
        });
    } catch (e) { console.error("Erro comunicacoes:", e); }
}

window.abrirPlayerPortal = (id) => {
    const d = cacheDados[id];
    document.getElementById('player-titulo-comunicacao').innerText = d.trabalho;
    document.getElementById('player-info-comunicacao').innerText = `Médium: ${d.medium} | Data: ${d.dataComunicacao.split("-").reverse().join("/")}`;
    const player = document.getElementById('audio-player-portal');
    player.src = d.urlAudio;
    const tLimpo = d.transcricao.split("").join("").split(". ").join(".<br><br>");
    document.getElementById('texto-transcricao-portal').innerHTML = tLimpo;
    document.getElementById('modal-player-comunicacao').classList.add('visible');
};

document.getElementById('close-modal-player').onclick = () => {
    document.getElementById('audio-player-portal').pause();
    document.getElementById('modal-player-comunicacao').classList.remove('visible');
};

// --- MURAL E ESCALA ---
async function carregarMural() {
    const snap = await getDoc(doc(db, "configuracoes", "mural"));
    if (snap.exists() && snap.data().mensagem) muralContent.innerHTML = `<p>${snap.data().mensagem}</p>`;
}

async function carregarMinhaEscala(uid) {
    const hoje = new Date(); const mesId = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}`;
    const snap = await getDoc(doc(db, "escalas_mediunicas", mesId));
    if (!snap.exists()) { escalaContent.innerHTML = "<p>Escala não publicada.</p>"; return; }
    let trabs = [];
    Object.entries(snap.data().escalados || {}).forEach(([k, uids]) => {
        if (uids.includes(uid)) trabs.push({ d: k.split('_')[0], t: k.split('_').slice(1).join(' ').replace(/_/g, ' ') });
    });
    if (trabs.length === 0) escalaContent.innerHTML = "<p>Sem trabalhos escalados.</p>";
    else {
        let h = '<ul class="escala-lista">';
        trabs.sort((a,b)=>a.d.localeCompare(b.d)).forEach(x => h += `<li class="escala-item"><span>${x.d.split('-').reverse().join('/')}</span><span>${x.t}</span></li>`);
        escalaContent.innerHTML = h + '</ul>';
    }
}

// --- PENDÊNCIAS E PERFIL ---
async function carregarModuloPessoal(uid, userData) {
    const cont = document.getElementById('pessoal-content'); cont.innerHTML = "";
    const cardP = document.createElement('div'); cardP.className = 'card';
    cardP.innerHTML = `<h4>Meu Perfil</h4><p>Email: ${userData.email}</p><p>Fone: ${userData.telefone || '--'}</p><a href="#" class="card-link" id="link-editar">Editar Dados</a>`;
    cont.appendChild(cardP);
    const cardF = document.createElement('div'); cardF.className = 'card';
    cardF.innerHTML = `<h4>Pendências</h4><p>Cantina: <span id="p-cant">R$ 0,00</span></p><p>Biblioteca: <span id="p-bib">R$ 0,00</span></p><a href="#" class="card-link" id="link-detalhes">Ver Detalhes</a>`;
    cont.appendChild(cardF);
    document.getElementById('link-editar').onclick = () => {
        document.getElementById('edit-nome').value = userData.nome;
        document.getElementById('edit-telefone').value = userData.telefone || '';
        document.getElementById('edit-endereco').value = userData.endereco || '';
        document.getElementById('edit-aniversario').value = userData.aniversario || '';
        document.getElementById('modal-editar-perfil').classList.add('visible');
    };
    document.getElementById('link-detalhes').onclick = () => { preencherModalDetalhes(); document.getElementById('modal-detalhes').classList.add('visible'); };
    buscarPendencias(uid);
}

async function buscarPendencias(uid) {
    detalhesCantina = []; detalhesBiblioteca = [];
    const qC = query(collection(db, "contas_a_receber"), where("compradorId", "==", uid), where("status", "==", "pendente"));
    const snapC = await getDocs(qC);
    let totC = 0; snapC.forEach(d => { totC += d.data().total; detalhesCantina.push(d.data()); });
    document.getElementById('p-cant').innerText = `R$ ${totC.toFixed(2)}`;
}

function preencherModalDetalhes() {
    let h = '<h4>Cantina</h4><ul>';
    detalhesCantina.forEach(i => h += `<li>${i.registradoEm.toDate().toLocaleDateString()}: R$ ${i.total.toFixed(2)}</li>`);
    document.getElementById('detalhes-cantina-container').innerHTML = h + '</ul>';
}

// --- TASV ---
function verificarTASV(u, uid) {
    const ano = new Date().getFullYear();
    if (u.tasvAssinadoAno !== ano) {
        document.getElementById('tasv-ano-atual').textContent = ano;
        document.getElementById('modal-tasv').classList.add('visible');
    }
}
document.getElementById('check-aceite-tasv').onchange = (e) => {
    const btn = document.getElementById('btn-assinar-tasv');
    btn.disabled = !e.target.checked; btn.style.backgroundColor = e.target.checked ? '#0277BD' : '#9ca3af';
};
document.getElementById('btn-assinar-tasv').onclick = async () => {
    const b = writeBatch(db); const ano = new Date().getFullYear();
    b.update(doc(db, "voluntarios", currentUserId), { tasvAssinadoAno: ano, tasvDataAssinatura: serverTimestamp() });
    await b.commit(); document.getElementById('modal-tasv').classList.remove('visible'); alert("Termo assinado!");
};

// --- GEOLOCALIZAÇÃO E PRESENÇA ---
function carregarModuloAcoesDoDia(uid, userData) {
    const cont = document.getElementById('presenca-card-content');
    const dataH = new Date().toISOString().split('T')[0];
    const presId = `${dataH}_${userData.nome.replace(/\s+/g, '_')}`;
    getDoc(doc(db, "presencas", presId)).then(snap => {
        if (snap.exists() && snap.data().status === 'presente') {
            cont.innerHTML = `<div class="card"><h4>Presença Confirmada</h4><p>Atividades: ${snap.data().atividade}</p></div>`;
        } else {
            navigator.geolocation.getCurrentPosition(p => {
                const dist = calcularDist(p.coords.latitude, p.coords.longitude, CASA_LAT, CASA_LON);
                if (dist <= RAIO) {
                    cont.innerHTML = `<button class="btn-presenca" id="btn-reg">Registrar Presença (${dist.toFixed(0)}m)</button>`;
                    document.getElementById('btn-reg').onclick = abrirModalAtividades;
                } else cont.innerHTML = `<p>Aproxime-se da Casa para registrar (${dist.toFixed(0)}m)</p>`;
            });
        }
    });
}
function calcularDist(la1, lo1, la2, lo2) {
    const R = 6371e3; const p1 = la1 * Math.PI/180, p2 = la2 * Math.PI/180, dl = (lo2-lo1)*Math.PI/180, da = (la2-la1)*Math.PI/180;
    const a = Math.sin(da/2)**2 + Math.cos(p1)*Math.cos(p2)*Math.sin(dl/2)**2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}
async function abrirModalAtividades() {
    const lista = document.getElementById('atividades-modal-lista'); lista.innerHTML = "Carregando...";
    document.getElementById('modal-atividades-presenca').classList.add('visible');
    const snap = await getDocs(query(collection(db, "atividades"), where("ativo", "==", true), orderBy("nome")));
    lista.innerHTML = "";
    snap.forEach(d => {
        const div = document.createElement('div');
        div.innerHTML = `<input type="checkbox" name="atv" value="${d.data().nome}" id="atv-${d.id}"> <label for="atv-${d.id}">${d.data().nome}</label>`;
        lista.appendChild(div);
    });
}
document.getElementById('form-atividades-presenca').onsubmit = async (e) => {
    e.preventDefault();
    const sel = Array.from(document.querySelectorAll('input[name="atv"]:checked')).map(c => c.value);
    if (sel.length === 0) return alert("Selecione uma atividade.");
    const dataH = new Date().toISOString().split('T')[0];
    const presId = `${dataH}_${currentUserData.nome.replace(/\s+/g, '_')}`;
    await setDoc(doc(db, "presencas", presId), { nome: currentUserData.nome, atividade: sel.join(', '), status: 'presente', voluntarioId: currentUserId, data: dataH, primeiroCheckin: serverTimestamp() }, { merge: true });
    document.getElementById('modal-atividades-presenca').classList.remove('visible');
    location.reload();
};

// --- AUXILIARES ---
async function verificarPapelAluno(uid) { return !(await getDocs(query(collectionGroup(db, 'participantes'), where('participanteId', '==', uid), limit(1)))).empty; }
async function verificarPapelFacilitador(uid) { return !(await getDocs(query(collection(db, 'turmas'), where('facilitadoresIds', 'array-contains', uid), limit(1)))).empty; }
async function verificarPapelAdmin(user) { const c = (await user.getIdTokenResult()).claims; return !!(c.role || c['super-admin']); }

document.getElementById('btn-logout').onclick = () => signOut(auth).then(() => window.location.href='login.html');
document.querySelectorAll('.modal-close-btn').forEach(b => b.onclick = (e) => e.target.closest('.modal-overlay').classList.remove('visible'));