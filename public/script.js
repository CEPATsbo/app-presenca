// VERSÃO FINAL E CORRIGIDA - SCRIPT.JS - 17/06/2025

// Importa as funções que precisamos do Firebase.
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-app.js";
import { getFirestore, doc, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js";

// Garante que o resto do script só rode depois que a página HTML for totalmente carregada.
document.addEventListener('DOMContentLoaded', () => {

    // =================================================================
    //  COLE AQUI O SEU OBJETO 'firebaseConfig' COMPLETO
    // =================================================================
    const firebaseConfig = {
  apiKey: "AIzaSyBV7RPjk3cFTqL-aIpflJcUojKg1ZXMLuU",
  authDomain: "voluntarios-ativos---cepat.firebaseapp.com",
  projectId: "voluntarios-ativos---cepat",
  storageBucket: "voluntarios-ativos---cepat.firebasestorage.app",
  messagingSenderId: "66122858261",
  appId: "1:66122858261:web:7fa21f1805463b5c08331c"
};
    // =================================================================

    // Inicializa o Firebase
    const app = initializeApp(firebaseConfig);
    const db = getFirestore(app);

    // --- LISTA DE ATIVIDADES ---
    const listaDeAtividades = [
        "Recepção/Acolhimento", "Passe de Harmonização", "Apoio", "Biblioteca", 
        "Entrevistas", "Encaminhamento", "Câmaras de Passe", "Diretoria", 
        "Preleção", "Música/Coral", "Evangelização infantil", "Mídias digitais", 
        "Mocidade", "Vivência Espírita", "9EAE", "10EAE", "Escola de Pais", "Vibrações", 
        "Colegiado Mediúnico", "Bazar", "Cantina"
    ];

    // --- CONFIGURAÇÕES DO LOCAL ---
    const CASA_ESPIRITA_LAT = -22.75553; // Coordenadas Reais da Casa
    const CASA_ESPIRITA_LON = -47.36945;
    const RAIO_EM_METROS = 40;

    // Elementos da página
    const loginArea = document.getElementById('login-area');
    const statusArea = document.getElementById('status-area');
    const btnRegistrar = document.getElementById('btn-registrar');
    const feedback = document.getElementById('feedback');
    const statusText = document.getElementById('status-text');
    const atividadeContainer = document.getElementById('atividade-container');
    const toggleAtividadesBtn = document.getElementById('toggle-atividades');
    const atividadeWrapper = document.getElementById('atividade-wrapper');

    let userInfo = {};
    let monitorInterval;

    function handleCheckboxChange() {
        const checkboxesMarcados = document.querySelectorAll('input[name="atividade"]:checked');
        const totalMarcados = checkboxesMarcados.length;
        const todosCheckboxes = document.querySelectorAll('input[name="atividade"]');

        if (totalMarcados >= 3) {
            todosCheckboxes.forEach(checkbox => {
                if (!checkbox.checked) {
                    checkbox.disabled = true;
                }
            });
        } else {
            todosCheckboxes.forEach(checkbox => {
                checkbox.disabled = false;
            });
        }
    }

    function criarCheckboxesDeAtividade() {
        if(!atividadeContainer) return;
        atividadeContainer.innerHTML = '';
        listaDeAtividades.sort().forEach(atividade => {
            const div = document.createElement('div');
            div.className = 'checkbox-item';
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.id = atividade.replace(/\s+/g, '-');
            checkbox.name = 'atividade';
            checkbox.value = atividade;
            checkbox.addEventListener('change', handleCheckboxChange); 
            const label = document.createElement('label');
            label.htmlFor = checkbox.id;
            label.textContent = atividade;
            div.appendChild(checkbox);
            div.appendChild(label);
            atividadeContainer.appendChild(div);
        });
    }

    if (toggleAtividadesBtn) {
        toggleAtividadesBtn.addEventListener('click', () => {
            atividadeWrapper.classList.toggle('hidden');
            const seta = toggleAtividadesBtn.innerHTML.includes('▼') ? '▲' : '▼';
            toggleAtividadesBtn.innerHTML = `Selecione suas atividades (até 3) ${seta}`;
        });
    }

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

    // Função com a correção de Fuso Horário
    async function registrarPresenca() {
        if (!userInfo.nome) return;
        
        const hoje = new Date();
        // Lógica para pegar a data correta de São Paulo
        const ano = hoje.toLocaleString('en-US', { year: 'numeric', timeZone: 'America/Sao_Paulo' });
        const mes = hoje.toLocaleString('en-US', { month: '2-digit', timeZone: 'America/Sao_Paulo' });
        const dia = hoje.toLocaleString('en-US', { day: '2-digit', timeZone: 'America/Sao_Paulo' });
        // Reorganiza para o formato AAAA-MM-DD
        const dataFormatada = `${ano}-${dia}-${mes}`;

        const idDocumento = `${dataFormatada}_${userInfo.nome.replace(/\s+/g, '_')}`;
        
        try {
            await setDoc(doc(db, "presencas", idDocumento), {
                nome: userInfo.nome,
                atividade: userInfo.atividade,
                timestamp: serverTimestamp(),
                data: dataFormatada
            });
            console.log("Presença registrada no Firestore com a data correta:", dataFormatada);
            feedback.textContent = `Presença registrada com sucesso às ${hoje.toLocaleTimeString('pt-BR')}`;
            feedback.style.color = "green";
            if (monitorInterval) clearInterval(monitorInterval);
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
                feedback.textContent = `Ainda fora da área de registro. Tentando novamente em 10 minutos.`;
                feedback.style.color = "orange";
            }
        }, (error) => {
            statusText.textContent = `Erro ao obter localização: ${error.message}`;
            statusText.style.color = 'red';
        }, { enableHighAccuracy: true });
    }
    
    if (btnRegistrar) {
        btnRegistrar.addEventListener('click', () => {
            const nome = document.getElementById('nome').value;
            const atividadesSelecionadas = document.querySelectorAll('input[name="atividade"]:checked');
            if (!nome) {
                alert("Por favor, preencha seu nome.");
                return;
            }
            if (atividadesSelecionadas.length === 0) {
                alert("Por favor, selecione pelo menos uma atividade.");
                return;
            }
            const atividadesArray = Array.from(atividadesSelecionadas).map(cb => cb.value);
            const atividadesString = atividadesArray.join(', ');
            userInfo = { nome, atividade: atividadesString };
            localStorage.setItem('userInfo', JSON.stringify(userInfo));
            loginArea.classList.add('hidden');
            statusArea.classList.remove('hidden');
            document.getElementById('display-nome').textContent = nome;
            document.getElementById('display-atividade').textContent = atividadesString;
            checarLocalizacao();
            monitorInterval = setInterval(checarLocalizacao, 600000); // 10 minutos
        });
    }

    function inicializarPagina() {
        criarCheckboxesDeAtividade();
        const savedInfo = localStorage.getItem('userInfo');
        if (savedInfo) {
            userInfo = JSON.parse(savedInfo);
            loginArea.classList.add('hidden');
            statusArea.classList.remove('hidden');
            document.getElementById('display-nome').textContent = userInfo.nome;
            document.getElementById('display-atividade').textContent = userInfo.atividade;
            checarLocalizacao();
            monitorInterval = setInterval(checarLocalizacao, 600000); // 10 minutos
        }
    }

    inicializarPagina();

    // Registra o Service Worker (se estivermos implementando o PWA)
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js').then(registration => {
          console.log('ServiceWorker registrado com sucesso:', registration);
        }).catch(err => {
          console.log('Registro do ServiceWorker falhou:', err);
        });
      });
    }
});