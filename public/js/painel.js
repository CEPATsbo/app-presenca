import { initializeApp } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js";

// --- CONFIGURAÇÕES ---
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

// --- INICIALIZAÇÃO DO FIREBASE ---
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// --- ELEMENTOS DA PÁGINA ---
const greetingElement = document.getElementById('greeting');
const btnRegistrarPresenca = document.getElementById('btn-registrar-presenca');
const btnSair = document.getElementById('btn-sair');
const feedbackElement = document.getElementById('feedback-geolocalizacao');

// --- VARIÁVEIS DE ESTADO ---
let currentUser = null;
let monitorInterval;
let statusAtualVoluntario = 'ausente';
// ATENÇÃO: A seleção de atividades será implementada no próximo passo (com um modal)
// Por enquanto, usaremos uma atividade fixa para teste.
let atividadesDoDia = "Atividade de Teste"; 

// --- LÓGICA DE AUTENTICAÇÃO ---
onAuthStateChanged(auth, (user) => {
    if (user) {
        // Usuário está logado
        currentUser = user;
        // Preenche a saudação com o nome do usuário
        if (greetingElement) {
            greetingElement.textContent = `Olá, ${user.displayName || 'Voluntário'}! 👋`;
        }
    } else {
        // Usuário não está logado, redireciona para a página inicial
        console.log("Nenhum usuário logado. Redirecionando...");
        window.location.href = '/index.html';
    }
});

// --- FUNÇÕES DE GEOLOCALIZAÇÃO (Adaptadas do seu script) ---

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

async function atualizarPresenca(novoStatus) {
    if (!currentUser || !atividadesDoDia) return;

    const dataHoje = getDataDeHojeSP();
    const nomeVoluntario = currentUser.displayName;
    const presencaId = `${dataHoje}_${nomeVoluntario.replace(/\s+/g, '_')}`;
    const docRef = doc(db, "presencas", presencaId);

    try {
        const docSnap = await getDoc(docRef);
        const dadosParaSalvar = { 
            status: novoStatus, 
            ultimaAtualizacao: serverTimestamp(),
            authUid: currentUser.uid // Salvando o UID para referência
        };

        if (!docSnap.exists() && novoStatus === 'presente') {
            dadosParaSalvar.nome = nomeVoluntario;
            dadosParaSalvar.atividade = atividadesDoDia;
            dadosParaSalvar.data = dataHoje;
            dadosParaSalvar.primeiroCheckin = serverTimestamp();
        }

        await setDoc(docRef, dadosParaSalvar, { merge: true });
        statusAtualVoluntario = novoStatus;

        if (feedbackElement) {
            if (novoStatus === 'presente') {
                feedbackElement.textContent = `Presença confirmada na casa.`;
                feedbackElement.style.color = "green";
            } else {
                feedbackElement.textContent = `Saída da casa registrada.`;
                feedbackElement.style.color = "#1565c0";
            }
        }
    } catch (e) {
        console.error("Erro ao atualizar presença:", e);
        if (feedbackElement) feedbackElement.textContent = "Erro ao registrar presença.";
    }
}

function checarLocalizacao() {
    if (!navigator.geolocation) {
        if (feedbackElement) feedbackElement.textContent = "Geolocalização não é suportada neste navegador.";
        return;
    }

    navigator.geolocation.getCurrentPosition(
        (position) => {
            const distancia = getDistance(position.coords.latitude, position.coords.longitude, CASA_ESPIRITA_LAT, CASA_ESPIRITA_LON);
            if (feedbackElement) feedbackElement.textContent = `Você está a ${distancia.toFixed(0)} metros de distância.`;

            if (distancia <= RAIO_EM_METROS) {
                if (statusAtualVoluntario !== 'presente') {
                    atualizarPresenca('presente');
                }
            } else {
                if (statusAtualVoluntario === 'presente') {
                    atualizarPresenca('ausente');
                }
            }
        },
        () => {
            if (feedbackElement) feedbackElement.textContent = "Não foi possível obter sua localização. Verifique as permissões.";
        },
        { enableHighAccuracy: true }
    );
}

// --- EVENTOS DOS BOTÕES ---

if (btnRegistrarPresenca) {
    btnRegistrarPresenca.addEventListener('click', () => {
        // ATENÇÃO: Aqui abriremos o MODAL para selecionar atividades.
        // Por enquanto, iniciamos o monitoramento direto.
        alert("Iniciando monitoramento de presença...");

        if (monitorInterval) clearInterval(monitorInterval);
        checarLocalizacao(); // Checa imediatamente
        monitorInterval = setInterval(checarLocalizacao, 600000); // E depois a cada 10 minutos

        btnRegistrarPresenca.disabled = true;
        btnRegistrarPresenca.textContent = "MONITORAMENTO ATIVO";
    });
}

if (btnSair) {
    btnSair.addEventListener('click', () => {
        if (confirm("Tem certeza que deseja sair?")) {
            signOut(auth).then(() => {
                // O onAuthStateChanged vai detectar a saída e redirecionar
                console.log("Logout realizado com sucesso.");
            }).catch((error) => {
                console.error("Erro ao fazer logout:", error);
                alert("Erro ao tentar sair.");
            });
        }
    });
}