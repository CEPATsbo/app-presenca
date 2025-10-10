import { initializeApp } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-auth.js";
import { getFirestore, collection, query, where, getDocs, doc, setDoc, serverTimestamp, orderBy } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js";

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

// --- INICIALIZAÇÃO ---
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
// Elementos do Modal
const modalOverlay = document.getElementById('modal-atividades');
const activitiesListContainer = document.getElementById('activities-list-container');
const btnConfirmarPresenca = document.getElementById('btn-confirmar-presenca');

// --- VARIÁVEIS DE ESTADO ---
let currentUser = null;
let voluntarioProfile = null;
let monitorInterval;
let statusAtualVoluntario = 'ausente';
let atividadesDoDia = []; // Agora é um array

// --- LÓGICA PRINCIPAL ---
onAuthStateChanged(auth, async (user) => {
    if (user) {
        currentUser = user;
        const voluntariosRef = collection(db, "voluntarios");
        const q = query(voluntariosRef, where("authUid", "==", user.uid));
        const querySnapshot = await getDocs(q);

        if (!querySnapshot.empty) {
            const voluntarioDoc = querySnapshot.docs[0];
            voluntarioProfile = { id: voluntarioDoc.id, ...voluntarioDoc.data() };
            preencherPainel(voluntarioProfile);
        } else {
            preencherPainel({ nome: user.displayName || 'Voluntário', email: user.email });
        }
    } else {
        window.location.href = '/index.html';
    }
});

function preencherPainel(profile) {
    if (greetingElement) greetingElement.textContent = `Olá, ${profile.nome || 'Voluntário'}! 👋`;
    if (emailElement) emailElement.textContent = profile.email || '--';
    if (telefoneElement) telefoneElement.textContent = profile.telefone || '--';
    if (infoFrequenciaElement) infoFrequenciaElement.textContent = `Sua última presença foi em ${profile.ultimaPresenca || 'não registrada'}.`;
    if (pendenciaCantinaElement) pendenciaCantinaElement.textContent = 'R$ 0,00';
    if (pendenciaBibliotecaElement) pendenciaBibliotecaElement.textContent = 'Nenhum item pendente.';
}

// --- LÓGICA DO MODAL E ATIVIDADES ---
async function carregarAtividadesNoModal() {
    console.log("Buscando atividades no Firestore...");
    try {
        const q = query(collection(db, "atividades"), where("ativo", "==", true), orderBy("nome"));
        const snapshot = await getDocs(q);
        activitiesListContainer.innerHTML = '';
        
        if (snapshot.empty) {
            activitiesListContainer.innerHTML = '<p>Nenhuma atividade encontrada.</p>';
            return;
        }

        snapshot.forEach(doc => {
            const atividadeNome = doc.data().nome;
            const checkboxDiv = document.createElement('div');
            checkboxDiv.innerHTML = `
                <label>
                    <input type="checkbox" name="atividade" value="${atividadeNome}">
                    ${atividadeNome}
                </label>
            `;
            activitiesListContainer.appendChild(checkboxDiv);
        });

        activitiesListContainer.querySelectorAll('input[type="checkbox"]').forEach(checkbox => {
            checkbox.addEventListener('change', () => {
                const checkedCount = activitiesListContainer.querySelectorAll('input[type="checkbox"]:checked').length;
                if (checkedCount >= 3) {
                    activitiesListContainer.querySelectorAll('input[type="checkbox"]:not(:checked)').forEach(cb => cb.disabled = true);
                } else {
                    activitiesListContainer.querySelectorAll('input[type="checkbox"]:not(:checked)').forEach(cb => cb.disabled = false);
                }
            });
        });

    } catch (error) {
        console.error("Erro ao carregar atividades:", error);
        activitiesListContainer.innerHTML = '<p style="color:red;">Erro ao carregar atividades.</p>';
    }
}

// --- FUNÇÕES DE GEOLOCALIZAÇÃO ---
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
    if (!voluntarioProfile || atividadesDoDia.length === 0) return;
    const dataHoje = getDataDeHojeSP();
    const nomeVoluntario = voluntarioProfile.nome;
    const presencaId = `${dataHoje}_${nomeVoluntario.replace(/\s+/g, '_')}`;
    const docRef = doc(db, "presencas", presencaId);
    try {
        const dadosParaSalvar = {
            status: novoStatus,
            ultimaAtualizacao: serverTimestamp(),
            authUid: currentUser.uid,
            nome: nomeVoluntario,
            atividade: atividadesDoDia.join(', '), // Salva as atividades como string
            data: dataHoje
        };
        await setDoc(docRef, dadosParaSalvar, { merge: true });
        statusAtualVoluntario = novoStatus;
        if (feedbackElement) {
            feedbackElement.textContent = novoStatus === 'presente' ? `Presença confirmada.` : `Saída registrada.`;
            feedbackElement.style.color = novoStatus === 'presente' ? "green" : "#1565c0";
        }
    } catch (e) {
        console.error("Erro ao atualizar presença:", e);
    }
}

function checarLocalizacao() {
    if (!navigator.geolocation) {
        if (feedbackElement) feedbackElement.textContent = "Geolocalização não suportada.";
        return;
    }
    navigator.geolocation.getCurrentPosition(
        (position) => {
            const distancia = getDistance(position.coords.latitude, position.coords.longitude, CASA_ESPIRITA_LAT, CASA_ESPIRITA_LON);
            if (feedbackElement) feedbackElement.textContent = `Distância: ${distancia.toFixed(0)} metros.`;
            if (distancia <= RAIO_EM_METROS) {
                if (statusAtualVoluntario !== 'presente') { atualizarPresenca('presente'); }
            } else {
                if (statusAtualVoluntario === 'presente') { atualizarPresenca('ausente'); }
            }
        },
        () => { if (feedbackElement) feedbackElement.textContent = "Não foi possível obter localização."; },
        { enableHighAccuracy: true }
    );
}

// --- EVENTOS DOS BOTÕES ---
btnRegistrarPresenca.addEventListener('click', () => {
    carregarAtividadesNoModal();
    modalOverlay.classList.add('visible');
});

modalOverlay.addEventListener('click', (event) => {
    if (event.target === modalOverlay) {
        modalOverlay.classList.remove('visible');
    }
});

btnConfirmarPresenca.addEventListener('click', () => {
    const selecionadas = activitiesListContainer.querySelectorAll('input[type="checkbox"]:checked');
    if (selecionadas.length === 0) {
        alert("Por favor, selecione pelo menos uma atividade.");
        return;
    }
    atividadesDoDia = Array.from(selecionadas).map(cb => cb.value);
    console.log("Atividades selecionadas:", atividadesDoDia.join(', '));
    modalOverlay.classList.remove('visible');
    if (monitorInterval) clearInterval(monitorInterval);
    checarLocalizacao();
    monitorInterval = setInterval(checarLocalizacao, 600000);
    btnRegistrarPresenca.disabled = true;
    btnRegistrarPresenca.textContent = "MONITORAMENTO ATIVO";
});

btnSair.addEventListener('click', () => {
    if (confirm("Tem certeza que deseja sair?")) {
        signOut(auth).catch((error) => {
            console.error("Erro ao fazer logout:", error);
            alert("Erro ao tentar sair.");
        });
    }
});