// Importa as funções que precisamos do Firebase v9+
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-app.js";
import { getFirestore, doc, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js";

// Suas chaves de configuração do Firebase que já corrigimos
const firebaseConfig = {
  apiKey: "AIzaSyBV7RPjk3cFTqL-aIpflJcUojKg1ZXMLuU",
  authDomain: "voluntarios-ativos---cepat.firebaseapp.com",
  projectId: "voluntarios-ativos---cepat",
  storageBucket: "voluntarios-ativos---cepat.firebasestorage.app",
  messagingSenderId: "66122858261",
  appId: "1:66122858261:web:7fa21f1805463b5c08331c"
};

// Inicializa o Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// --- CONFIGURAÇÕES DO LOCAL ---
const CASA_ESPIRITA_LAT = -22.7532; // Latitude
const CASA_ESPIRITA_LON = -47.3334; // Longitude
const RAIO_EM_METROS = 100; // Aumentei para 100m para facilitar testes
// -----------------------------

// Elementos da página
const loginArea = document.getElementById('login-area');
const statusArea = document.getElementById('status-area');
const btnRegistrar = document.getElementById('btn-registrar');
const feedback = document.getElementById('feedback');
const statusText = document.getElementById('status-text');

let userInfo = {};
let monitorInterval;

function getDistance(lat1, lon1, lat2, lon2) {
    const R = 6371e3;
    const φ1 = lat1 * Math.PI / 180;
    const φ2 = lat2 * Math.PI / 180;
    const Δφ = (lat2 - lat1) * Math.PI / 180;
    const Δλ = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

async function registrarPresenca() {
    if (!userInfo.nome) return; // Não faz nada se não tiver info do usuário
    const hoje = new Date();
    const dataFormatada = hoje.toISOString().split('T')[0];
    const idDocumento = `${dataFormatada}_${userInfo.nome.replace(/\s+/g, '_')}`;

    try {
        await setDoc(doc(db, "presencas", idDocumento), {
            nome: userInfo.nome,
            atividade: userInfo.atividade,
            timestamp: serverTimestamp(),
            data: dataFormatada
        });
        console.log("Presença registrada no Firestore!");
        feedback.textContent = `Presença registrada com sucesso às ${hoje.toLocaleTimeString()}`;
        feedback.style.color = "green";
        if (monitorInterval) clearInterval(monitorInterval); // Para de verificar após registrar
    } catch (error) {
        console.error("Erro ao registrar presença: ", error);
        feedback.textContent = "Erro ao salvar no banco de dados.";
        feedback.style.color = "red";
    }
}

function checarLocalizacao() {
    if (!('geolocation' in navigator)) {
        statusText.textContent = "Geolocalização não é suportada.";
        return;
    }

    navigator.geolocation.getCurrentPosition((position) => {
        const userLat = position.coords.latitude;
        const userLon = position.coords.longitude;
        const distancia = getDistance(userLat, userLon, CASA_ESPIRITA_LAT, CASA_ESPIRITA_LON);

        console.log(`Distância até o centro: ${distancia.toFixed(2)} metros.`);
        feedback.textContent = `Você está a ${distancia.toFixed(0)} metros de distância.`;

        if (distancia <= RAIO_EM_METROS) {
            registrarPresenca();
        } else {
            feedback.textContent = `Ainda fora da área de registro. Tentando novamente em 1 minuto.`;
            feedback.style.color = "orange";
        }
    }, (error) => {
        statusText.textContent = `Erro ao obter localização: ${error.message}`;
        statusText.style.color = 'red';
    }, { enableHighAccuracy: true });
}

btnRegistrar.addEventListener('click', () => {
    const nome = document.getElementById('nome').value;
    const atividade = document.getElementById('atividade').value;

    if (!nome || !atividade) {
        alert("Por favor, preencha nome e atividade.");
        return;
    }

    userInfo = { nome, atividade };
    localStorage.setItem('userInfo', JSON.stringify(userInfo));

    loginArea.classList.add('hidden');
    statusArea.classList.remove('hidden');
    document.getElementById('display-nome').textContent = nome;
    document.getElementById('display-atividade').textContent = atividade;

    checarLocalizacao();
    monitorInterval = setInterval(checarLocalizacao, 60000); // Verifica a cada 1 minuto
});

window.onload = () => {
    const savedInfo = localStorage.getItem('userInfo');
    if (savedInfo) {
        userInfo = JSON.parse(savedInfo);
        loginArea.classList.add('hidden');
        statusArea.classList.remove('hidden');
        document.getElementById('display-nome').textContent = userInfo.nome;
        document.getElementById('display-atividade').textContent = userInfo.atividade;

        checarLocalizacao();
        monitorInterval = setInterval(checarLocalizacao, 60000);
    }
};