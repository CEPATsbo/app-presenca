// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyBV7RPjk3cFTqL-aIpflJcUojKg1ZXMLuU",
  authDomain: "voluntarios-ativos---cepat.firebaseapp.com",
  projectId: "voluntarios-ativos---cepat",
  storageBucket: "voluntarios-ativos---cepat.firebasestorage.app",
  messagingSenderId: "66122858261",
  appId: "1:66122858261:web:7fa21f1805463b5c08331c"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const firebaseConfig = {
  apiKey: "SEU_API_KEY",
  authDomain: "SEU_AUTH_DOMAIN",
  projectId: "SEU_PROJECT_ID",
  storageBucket: "SEU_STORAGE_BUCKET",
  messagingSenderId: "SEU_MESSAGING_SENDER_ID",
  appId: "SEU_APP_ID"
};
// -------------------------------------------------------------

// Inicializa o Firebase
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

// --- CONFIGURAÇÕES DO LOCAL ---
// Substitua pelas coordenadas REAIS do centro da Casa Espírita
const CASA_ESPIRITA_LAT = -22.75520; // Exemplo: Latitude de Americana-SP
const CASA_ESPIRITA_LON = -47.36947; // Exemplo: Longitude de Americana-SP
const RAIO_EM_METROS = 10; // Raio de 50 metros a partir do centro
// -----------------------------

// Elementos da página
const loginArea = document.getElementById('login-area');
const statusArea = document.getElementById('status-area');
const btnRegistrar = document.getElementById('btn-registrar');
const feedback = document.getElementById('feedback');
const statusText = document.getElementById('status-text');

let userInfo = {};

// Função para calcular distância entre duas coordenadas (Fórmula de Haversine)
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

    return R * c; // Distância em metros
}

// Função principal que verifica a localização
function checarLocalizacao() {
    if (!('geolocation' in navigator)) {
        statusText.textContent = "Geolocalização não é suportada pelo seu navegador.";
        return;
    }

    navigator.geolocation.getCurrentPosition((position) => {
        const userLat = position.coords.latitude;
        const userLon = position.coords.longitude;

        const distancia = getDistance(userLat, userLon, CASA_ESPIRITA_LAT, CASA_ESPIRITA_LON);

        console.log(Distância até o centro: ${distancia.toFixed(2)} metros.);
        feedback.textContent = Você está a ${distancia.toFixed(0)} metros de distância.;

        if (distancia <= RAIO_EM_METROS) {
            feedback.textContent = "Presença registrada com sucesso!";
            feedback.style.color = "green";
            registrarPresenca();
            // Para de verificar após registrar para economizar bateria
            clearInterval(window.monitorInterval); 
        } else {
            feedback.textContent = "Ainda fora da área de registro. Tentando novamente em 30 segundos.";
            feedback.style.color = "orange";
        }
    }, (error) => {
        statusText.textContent = Erro ao obter localização: ${error.message};
        statusText.style.color = 'red';
    });
}

// Função para salvar a presença no banco de dados
function registrarPresenca() {
    const hoje = new Date();
    const dataFormatada = hoje.toISOString().split('T')[0]; // Formato AAAA-MM-DD
    const idDocumento = ${dataFormatada}_${userInfo.nome.replace(/\s+/g, '_')};

    db.collection("presencas").doc(idDocumento).set({
        nome: userInfo.nome,
        atividade: userInfo.atividade,
        timestamp: firebase.firestore.FieldValue.serverTimestamp(),
        data: dataFormatada
    })
    .then(() => {
        console.log("Presença registrada no Firestore!");
    })
    .catch((error) => {
        console.error("Erro ao registrar presença: ", error);
        feedback.textContent = "Erro ao salvar no banco de dados.";
        feedback.style.color = "red";
    });
}

// Evento do botão de registro
btnRegistrar.addEventListener('click', () => {
    const nome = document.getElementById('nome').value;
    const atividade = document.getElementById('atividade').value;

    if (!nome || !atividade) {
        alert("Por favor, preencha nome e atividade.");
        return;
    }

    userInfo = { nome, atividade };

    // Salva os dados no navegador para não precisar digitar de novo
    localStorage.setItem('userInfo', JSON.stringify(userInfo));

    // Pede permissão de localização
    navigator.geolocation.requestPermission().then(permissionResult => {
        if (permissionResult === 'granted') {
            console.log("Permissão concedida!");
            loginArea.classList.add('hidden');
            statusArea.classList.remove('hidden');
            document.getElementById('display-nome').textContent = nome;
            document.getElementById('display-atividade').textContent = atividade;
            
            // Inicia a verificação imediata e depois a cada 30 segundos
            checarLocalizacao();
            window.monitorInterval = setInterval(checarLocalizacao, 30000); // 30 segundos
        } else {
            alert("A permissão de localização é necessária para registrar a presença.");
        }
    });
});

// Verifica se o usuário já se registrou antes
window.onload = () => {
    const savedInfo = localStorage.getItem('userInfo');
    if (savedInfo) {
        userInfo = JSON.parse(savedInfo);
        
        loginArea.classList.add('hidden');
        statusArea.classList.remove('hidden');
        document.getElementById('display-nome').textContent = userInfo.nome;
        document.getElementById('display-atividade').textContent = userInfo.atividade;
        
        // Reinicia o monitoramento
        checarLocalizacao();
        window.monitorInterval = setInterval(checarLocalizacao, 30000);
    }
}