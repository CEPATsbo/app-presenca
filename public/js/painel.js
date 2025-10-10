import { initializeApp } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-auth.js";
import { getFirestore, collection, query, where, getDocs, doc, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js";

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
const emailElement = document.getElementById('profile-email');
const telefoneElement = document.getElementById('profile-telefone');
const pendenciaCantinaElement = document.getElementById('pendencia-cantina');
const pendenciaBibliotecaElement = document.getElementById('pendencia-biblioteca');
const infoFrequenciaElement = document.getElementById('info-frequencia');
const btnRegistrarPresenca = document.getElementById('btn-registrar-presenca');
const btnSair = document.getElementById('btn-sair');
const feedbackElement = document.getElementById('feedback-geolocalizacao');

// --- VARIÁVEIS DE ESTADO ---
let currentUser = null;
let voluntarioProfile = null; // Armazenará o perfil completo do Firestore
let monitorInterval;
let statusAtualVoluntario = 'ausente';
// ATENÇÃO: A seleção de atividades será implementada no próximo passo (com um modal)
// Por enquanto, usaremos uma atividade fixa para teste.
let atividadesDoDia = "Atividade de Teste"; 

// --- LÓGICA PRINCIPAL ---
onAuthStateChanged(auth, async (user) => {
    if (user) {
        currentUser = user;
        console.log("Usuário autenticado:", user.uid);

        // Busca o perfil completo do voluntário no Firestore usando o UID do login.
        const voluntariosRef = collection(db, "voluntarios");
        const q = query(voluntariosRef, where("authUid", "==", user.uid));
        const querySnapshot = await getDocs(q);

        if (!querySnapshot.empty) {
            const voluntarioDoc = querySnapshot.docs[0];
            voluntarioProfile = { id: voluntarioDoc.id, ...voluntarioDoc.data() };
            console.log("Perfil do voluntário encontrado no Firestore:", voluntarioProfile);
            
            // Agora, preenchemos a página com os dados do FIRESTORE (a fonte da verdade)
            preencherPainel(voluntarioProfile);
        } else {
            // Cenário raro: usuário autenticado mas sem perfil no Firestore.
            // Usamos o que tivermos do Auth como fallback.
            console.warn("Usuário autenticado mas não encontrado no Firestore. Usando dados de fallback.");
            preencherPainel({ nome: user.displayName || 'Voluntário', email: user.email });
        }

    } else {
        // Usuário não está logado, redireciona para a página inicial
        console.log("Nenhum usuário logado. Redirecionando...");
        window.location.href = '/index.html';
    }
});

function preencherPainel(profile) {
    if (greetingElement) greetingElement.textContent = `Olá, ${profile.nome || 'Voluntário'}! 👋`;
    if (emailElement) emailElement.textContent = profile.email || '--';
    if (telefoneElement) telefoneElement.textContent = profile.telefone || '--';
    if (infoFrequenciaElement) infoFrequenciaElement.textContent = `Sua última presença foi em ${profile.ultimaPresenca || 'não registrada'}.`;
    
    // Futuramente, buscaremos os dados reais de pendências aqui
    if (pendenciaCantinaElement) pendenciaCantinaElement.textContent = 'R$ 0,00';
    if (pendenciaBibliotecaElement) pendenciaBibliotecaElement.textContent = 'Nenhum item pendente.';
}

// --- FUNÇÕES DE GEOLOCALIZAÇÃO ---
function getDistance(lat1, lon1, lat2, lon2) {
    const R = 6371e3; // Raio da Terra em metros
    const φ1 = lat1 * Math.PI / 180;
    const φ2 = lat2 * Math.PI / 180;
    const Δφ = (lat2 - lat1) * Math.PI / 180;
    const Δλ = (lon2 - lon1) * Math.PI / 180;

    const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c;
}

function getDataDeHojeSP() {
    const formatador = new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'America/Sao_Paulo' });
    return formatador.format(new Date());
}

async function atualizarPresenca(novoStatus) {
    if (!voluntarioProfile || !atividadesDoDia) return;

    const dataHoje = getDataDeHojeSP();
    const nomeVoluntario = voluntarioProfile.nome;
    // Cria um ID de presença único para o dia e para o voluntário
    const presencaId = `${dataHoje}_${nomeVoluntario.replace(/\s+/g, '_')}`;
    const docRef = doc(db, "presencas", presencaId);

    try {
        const dadosParaSalvar = { 
            status: novoStatus, 
            ultimaAtualizacao: serverTimestamp(),
            authUid: currentUser.uid, // Salvando o UID para referência
            nome: nomeVoluntario,
            atividade: atividadesDoDia,
            data: dataHoje
        };

        // Usamos { merge: true } para não sobrescrever os dados de primeiro checkin
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
            if (feedbackElement) feedbackElement.textContent = "Não foi possível obter sua localização. Verifique as permissões do navegador.";
        },
        { enableHighAccuracy: true }
    );
}

// --- EVENTOS DOS BOTÕES ---
if (btnRegistrarPresenca) {
    btnRegistrarPresenca.addEventListener('click', () => {
        // ATENÇÃO: Futuramente, aqui abriremos o MODAL para selecionar atividades.
        alert("Iniciando monitoramento de presença... Por favor, aceite a permissão de localização.");
        
        if (monitorInterval) clearInterval(monitorInterval);
        checarLocalizacao(); // Checa imediatamente ao clicar
        monitorInterval = setInterval(checarLocalizacao, 600000); // E depois a cada 10 minutos

        btnRegistrarPresenca.disabled = true;
        btnRegistrarPresenca.textContent = "MONITORAMENTO ATIVO";
    });
}

if (btnSair) {
    btnSair.addEventListener('click', () => {
        if (confirm("Tem certeza que deseja sair?")) {
            signOut(auth).catch((error) => {
                console.error("Erro ao fazer logout:", error);
                alert("Erro ao tentar sair.");
            });
            // O onAuthStateChanged vai detectar a saída e redirecionar automaticamente.
        }
    });
}