import { initializeApp } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-app.js";
import { getAuth, signInWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-auth.js";
import { getFirestore, collection, query, where, getDocs, serverTimestamp, setDoc, doc, orderBy, getDoc } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js";
import Fuse from 'https://cdn.jsdelivr.net/npm/fuse.js@7.0.0/dist/fuse.mjs';

// --- CONFIGURAÇÕES GLOBAIS ---
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

// --- INICIALIZAÇÃO ---
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// --- ELEMENTOS DA PÁGINA ---
const muralContainer = document.getElementById('mural-container');
const formLogin = document.getElementById('form-login-portal');
const formPresencaRapida = document.getElementById('form-presenca-rapida');
const nomeInput = document.getElementById('nome-presenca');
const btnSelecionarAtividades = document.getElementById('btn-selecionar-atividades');
const atividadesWrapper = document.getElementById('atividades-wrapper');
const atividadesContainer = document.getElementById('atividades-container');
const registroRapidoSection = document.getElementById('registro-rapido-section');
const statusRapidoSection = document.getElementById('status-rapido-section');
const statusNome = document.getElementById('status-nome');
const statusAtividades = document.getElementById('status-atividades');
const btnSairRapido = document.getElementById('btn-sair-rapido');
const feedbackGeoRapido = document.getElementById('feedback-geolocalizacao-rapido');

let monitorIntervalRapido;
let statusAtualVoluntarioRapido = 'ausente';

// --- FUNÇÕES AUXILIARES ---
async function carregarMural() {
    if (!muralContainer) return;
    try {
        const docRef = doc(db, "configuracoes", "mural");
        const docSnap = await getDoc(docRef);
        if (docSnap.exists() && docSnap.data().mensagem) {
            muralContainer.innerText = docSnap.data().mensagem;
            muralContainer.style.display = 'block';
        } else {
            muralContainer.style.display = 'none';
        }
    } catch (e) {
        console.error("Erro ao carregar mural:", e);
        muralContainer.style.display = 'none';
    }
}

function getDistance(lat1, lon1, lat2, lon2) {
    const R = 6371e3;
    const φ1 = lat1 * Math.PI / 180, φ2 = lat2 * Math.PI / 180;
    const Δφ = (lat2 - lat1) * Math.PI / 180, Δλ = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

function getDataDeHojeSP() {
    const formatador = new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'America/Sao_Paulo' });
    return formatador.format(new Date());
}

async function atualizarStatusPresenca(novoStatus, nome) {
    const dataHoje = getDataDeHojeSP();
    const presencaId = `${dataHoje}_${nome.replace(/\s+/g, '_')}`;
    const docRef = doc(db, "presencas", presencaId);
    try {
        await setDoc(docRef, { status: novoStatus, ultimaAtualizacao: serverTimestamp() }, { merge: true });
        statusAtualVoluntarioRapido = novoStatus;
    } catch (e) { console.error("Erro ao atualizar status da presença:", e); }
}

function checarLocalizacaoRapida(nome) {
    if (!navigator.geolocation) {
        if (feedbackGeoRapido) feedbackGeoRapido.textContent = "Geolocalização não suportada.";
        return;
    }
    navigator.geolocation.getCurrentPosition(
        (position) => {
            const distancia = getDistance(position.coords.latitude, position.coords.longitude, CASA_ESPIRITA_LAT, CASA_ESPIRITA_LON);
            if (distancia <= RAIO_EM_METROS) {
                if (statusAtualVoluntarioRapido !== 'presente') {
                    feedbackGeoRapido.textContent = "✅ Presença confirmada na casa!";
                    feedbackGeoRapido.style.color = "green";
                    atualizarStatusPresenca('presente', nome);
                }
            } else {
                if (statusAtualVoluntarioRapido === 'presente') {
                    feedbackGeoRapido.textContent = "Saída da casa registrada.";
                    feedbackGeoRapido.style.color = "#1565c0";
                    atualizarStatusPresenca('ausente', nome);
                } else {
                    feedbackGeoRapido.textContent = `Você está a ${distancia.toFixed(0)} metros de distância.`;
                    feedbackGeoRapido.style.color = "#333";
                }
            }
        },
        () => { if (feedbackGeoRapido) feedbackGeoRapido.textContent = "Não foi possível obter localização."; },
        { enableHighAccuracy: true }
    );
}

// --- LÓGICA PRINCIPAL ---
carregarMural();

if (formLogin) {
    formLogin.addEventListener('submit', (event) => {
        event.preventDefault();
        const email = document.getElementById('email-login').value;
        const senha = document.getElementById('senha-login').value;
        if (!email || !senha) { return alert("Por favor, preencha email e senha."); }
        signInWithEmailAndPassword(auth, email, senha)
            .then(() => { window.location.href = '/painel.html'; })
            .catch((error) => {
                console.error("Erro de login:", error.code);
                alert("Email ou senha incorretos. Tente novamente.");
            });
    });
}

if (formPresencaRapida) {
    (async function buscarAtividadesDoFirestore() {
        if (!atividadesContainer) return;
        try {
            const q = query(collection(db, "atividades"), where("ativo", "==", true), orderBy("nome"));
            const snapshot = await getDocs(q);
            atividadesContainer.innerHTML = '';
            snapshot.forEach(doc => {
                const atividade = doc.data().nome;
                const div = document.createElement('div');
                div.innerHTML = `<input type="checkbox" name="atividade" value="${atividade}" id="classic-${atividade}"> <label for="classic-${atividade}">${atividade}</label>`;
                atividadesContainer.appendChild(div);
            });
        } catch (e) { console.error("Erro ao buscar atividades:", e); }
    })();

    btnSelecionarAtividades.addEventListener('click', () => {
        atividadesWrapper.style.display = atividadesWrapper.style.display === 'block' ? 'none' : 'block';
    });

    formPresencaRapida.addEventListener('submit', async (event) => {
        event.preventDefault();
        const nomeDigitado = nomeInput.value.trim();
        const atividadesSelecionadasNode = document.querySelectorAll('#form-presenca-rapida input[name="atividade"]:checked');
        const atividadesSelecionadas = Array.from(atividadesSelecionadasNode).map(cb => cb.value);
        if (!nomeDigitado || nomeDigitado.split(' ').length < 2) { return alert("Por favor, digite seu nome completo."); }
        if (atividadesSelecionadas.length === 0) { return alert("Por favor, selecione pelo menos uma atividade."); }
        const btnSubmit = formPresencaRapida.querySelector('button[type="submit"]');
        btnSubmit.disabled = true;
        try {
            const voluntariosSnapshot = await getDocs(query(collection(db, "voluntarios")));
            const listaDeVoluntarios = voluntariosSnapshot.docs.map(d => ({ id: d.id, ...d.data() }));
            const fuse = new Fuse(listaDeVoluntarios, { keys: ['nome'], includeScore: true, threshold: 0.45 });
            const resultados = fuse.search(nomeDigitado);
            let nomeFinalParaRegistro = nomeDigitado;
            if (resultados.length > 0) {
                const melhorResultado = resultados[0].item.nome;
                if (nomeDigitado.toLowerCase() !== melhorResultado.toLowerCase()) {
                    if (confirm(`Encontramos um nome parecido: "${melhorResultado}".\n\nÉ você?`)) { nomeFinalParaRegistro = melhorResultado; }
                } else { nomeFinalParaRegistro = melhorResultado; }
            }
            const dataHoje = getDataDeHojeSP();
            const presencaId = `${dataHoje}_${nomeFinalParaRegistro.replace(/\s+/g, '_')}`;
            const docRef = doc(db, "presencas", presencaId);
            await setDoc(docRef, { nome: nomeFinalParaRegistro, atividade: atividadesSelecionadas.join(', '), data: dataHoje, primeiroCheckin: serverTimestamp(), ultimaAtualizacao: serverTimestamp(), status: 'ausente', authUid: null }, { merge: true });
            statusNome.textContent = nomeFinalParaRegistro;
            statusAtividades.textContent = atividadesSelecionadas.join(', ');
            registroRapidoSection.classList.add('hidden');
            statusRapidoSection.classList.remove('hidden');
            if (monitorIntervalRapido) clearInterval(monitorIntervalRapido);
            checarLocalizacaoRapida(nomeFinalParaRegistro);
            monitorIntervalRapido = setInterval(() => checarLocalizacaoRapida(nomeFinalParaRegistro), 600000);
        } catch (error) {
            console.error("ERRO CRÍTICO no registro rápido:", error);
            alert("Ocorreu um erro crítico ao registrar a presença.");
            btnSubmit.disabled = false;
        }
    });
}

if (btnSairRapido) {
    btnSairRapido.addEventListener('click', () => {
        if (monitorIntervalRapido) clearInterval(monitorIntervalRapido);
        formPresencaRapida.reset();
        atividadesWrapper.style.display = 'none';
        statusRapidoSection.classList.add('hidden');
        registroRapidoSection.classList.remove('hidden');
        const btnSubmit = formPresencaRapida.querySelector('button[type="submit"]');
        btnSubmit.disabled = false;
        statusAtualVoluntarioRapido = 'ausente';
    });
}