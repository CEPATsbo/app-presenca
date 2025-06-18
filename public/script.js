// VERSÃO 2.5 - Adiciona botão Sair/Resetar

import { initializeApp } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-app.js";
import { getFirestore, doc, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js";

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

    const app = initializeApp(firebaseConfig);
    const db = getFirestore(app);

    const listaDeAtividades = [
        "Recepção/Acolhimento", "Passe de Harmonização", "Apoio", "Biblioteca", 
        "Entrevistas", "Encaminhamento", "Câmaras de Passe", "Diretoria", 
        "Preleção", "Música/Coral", "Evangelização infantil", "Mídias digitais", 
        "Mocidade", "Vivência Espírita", "9EAE", "10EAE", "Escola de Pais", "Vibrações", 
        "Colegiado Mediúnico", "Bazar", "Cantina"
    ];

    const CASA_ESPIRITA_LAT = -22.75553; // Coordenadas Reais da Casa
    const CASA_ESPIRITA_LON = -47.36945;
    const RAIO_EM_METROS = 40;

    const loginArea = document.getElementById('login-area');
    const statusArea = document.getElementById('status-area');
    const nomeInput = document.getElementById('nome');
    const btnRegistrar = document.getElementById('btn-registrar');
    const feedback = document.getElementById('feedback');
    const statusText = document.getElementById('status-text');
    const atividadeContainer = document.getElementById('atividade-container');
    const toggleAtividadesBtn = document.getElementById('toggle-atividades');
    const atividadeWrapper = document.getElementById('atividade-wrapper');
    // --- NOVO ELEMENTO ---
    const btnSair = document.getElementById('btn-sair');

    let userInfo = {};
    let monitorInterval;

    function getDataDeHojeSP() {
        const formatador = new Intl.DateTimeFormat('en-CA', {
            year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'America/Sao_Paulo'
        });
        return formatador.format(new Date());
    }

    function handleCheckboxChange() {
        const checkboxesMarcados = document.querySelectorAll('input[name="atividade"]:checked');
        const totalMarcados = checkboxesMarcados.length;
        document.querySelectorAll('input[name="atividade"]').forEach(checkbox => {
            checkbox.disabled = totalMarcados >= 3 && !checkbox.checked;
        });
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
        const R = 6371 * 1000;
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLon = (lon2 - lon1) * Math.PI / 180;
        const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
    }
    
    async function registrarPresenca() {
        if (!userInfo.nome) return;
        const dataFormatada = getDataDeHojeSP();
        const idDocumento = `${dataFormatada}_${userInfo.nome.replace(/\s+/g, '_')}`;
        try {
            await setDoc(doc(db, "presencas", idDocumento), {
                nome: userInfo.nome,
                atividade: userInfo.atividade,
                timestamp: serverTimestamp(),
                data: dataFormatada
            });
            console.log("Presença registrada no Firestore com a data correta:", dataFormatada);
            feedback.textContent = `Presença registrada com sucesso às ${new Date().toLocaleTimeString('pt-BR')}`;
            feedback.style.color = "green";
            if (monitorInterval) clearInterval(monitorInterval);
        } catch (error) {
            console.error("Erro ao registrar presença: ", error);
            feedback.textContent = "Erro ao salvar no banco de dados.";
            feedback.style.color = "red";
        }
    }

    function checarLocalizacao() {
        if (!navigator.geolocation) return;
        navigator.geolocation.getCurrentPosition((position) => {
            const distancia = getDistance(position.coords.latitude, position.coords.longitude, CASA_ESPIRITA_LAT, CASA_ESPIRITA_LON);
            console.log(`Distância até o centro: ${distancia.toFixed(2)} metros.`);
            feedback.textContent = `Você está a ${distancia.toFixed(0)} metros de distância.`;
            if (distancia <= RAIO_EM_METROS) {
                registrarPresenca();
            } else {
                feedback.textContent = `Ainda fora da área de registro. Tentando novamente em 10 minutos.`;
                feedback.style.color = "orange";
            }
        }, () => {
            statusText.textContent = `Não foi possível obter a localização. Verifique as permissões.`;
        }, { enableHighAccuracy: true });
    }
    
    if (btnRegistrar) {
        btnRegistrar.addEventListener('click', () => {
            const nome = nomeInput.value;
            const atividadesSelecionadas = document.querySelectorAll('input[name="atividade"]:checked');
            if (!nome) return alert("Por favor, preencha seu nome.");
            if (atividadesSelecionadas.length === 0) return alert("Por favor, selecione pelo menos uma atividade.");
            
            const atividadesArray = Array.from(atividadesSelecionadas).map(cb => cb.value);
            const dataDeHoje = getDataDeHojeSP();
            
            userInfo = { 
                nome, 
                atividade: atividadesArray.join(', '),
                loginDate: dataDeHoje 
            };
            
            localStorage.setItem('userInfo', JSON.stringify(userInfo));
            mostrarTelaDeStatus();
        });
    }

    function mostrarTelaDeStatus() {
        loginArea.classList.add('hidden');
        statusArea.classList.remove('hidden');
        document.getElementById('display-nome').textContent = userInfo.nome;
        document.getElementById('display-atividade').textContent = userInfo.atividade;
        checarLocalizacao();
        monitorInterval = setInterval(checarLocalizacao, 600000);
    }

    // --- NOVA LÓGICA PARA O BOTÃO SAIR ---
    if (btnSair) {
        btnSair.addEventListener('click', (event) => {
            event.preventDefault(); // Impede o link de pular para o topo da página
            
            const confirmacao = confirm('Tem certeza que deseja sair? Suas atividades de hoje serão esquecidas e você voltará para a tela de cadastro.');
            
            if (confirmacao) {
                localStorage.removeItem('userInfo');
                window.location.reload(); // Recarrega a página para o estado inicial
            }
        });
    }

    function inicializarPagina() {
        criarCheckboxesDeAtividade();
        const savedInfoString = localStorage.getItem('userInfo');
        if (!savedInfoString) return;

        const savedInfo = JSON.parse(savedInfoString);
        const dataDeHoje = getDataDeHojeSP();

        if (savedInfo.loginDate === dataDeHoje) {
            userInfo = savedInfo;
            mostrarTelaDeStatus();
        } else {
            nomeInput.value = savedInfo.nome;
        }
    }

    inicializarPagina();

    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js'));
    }
});