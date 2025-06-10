// Passo 1: Importa as funções que precisamos do Firebase.
// Isto agora está no topo do arquivo, como deve ser.
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-app.js";
import { getFirestore, doc, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js";

// Passo 2: Garante que o script só rode depois que a página HTML for totalmente carregada
document.addEventListener('DOMContentLoaded', () => {

    // =================================================================
    //  COLE AQUI O SEU OBJETO 'firebaseConfig' COMPLETO DO SITE DO FIREBASE
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

    // --- LISTA DE ATIVIDADES ATUALIZADA ---
    const listaDeAtividades = [
        "Recepção/Acolhimento", "Passe de Harmonização", "Apoio", "Biblioteca", 
        "Entrevistas", "Encaminhamento", "Câmaras de Passe", "Diretoria", 
        "Preleção", "Música/Coral", "Evangelização infantil", "Mídias digitais"
    ];

    // --- CONFIGURAÇÕES DO LOCAL ---
    const CASA_ESPIRITA_LAT = -22.754655;
    const CASA_ESPIRITA_LON = -47.402106;
    const RAIO_EM_METROS = 30;

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

    // --- LÓGICA ATUALIZADA PARA LIMITAR A SELEÇÃO ---
    function handleCheckboxChange() {
        const checkboxesMarcados = document.querySelectorAll('input[name="atividade"]:checked');
        const totalMarcados = checkboxesMarcados.length;
        const todosCheckboxes = document.querySelectorAll('input[name="atividade"]');

        if (totalMarcados >= 3) {
            // Se 3 ou mais estão marcados, desabilita todos os que NÃO estão marcados
            todosCheckboxes.forEach(checkbox => {
                if (!checkbox.checked) {
                    checkbox.disabled = true;
                }
            });
        } else {
            // Se menos de 3 estão marcados, habilita todos
            todosCheckboxes.forEach(checkbox => {
                checkbox.disabled = false;
            });
        }
    }

    function criarCheckboxesDeAtividade() {
        listaDeAtividades.sort().forEach(atividade => {
            const div = document.createElement('div');
            div.className = 'checkbox-item';
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.id = atividade.replace(/\s+/g, '-');
            checkbox.name = 'atividade';
            checkbox.value = atividade;
            // Adiciona o listener para o evento de mudança (marcar/desmarcar)
            checkbox.addEventListener('change', handleCheckboxChange); 
            const label = document.createElement('label');
            label.htmlFor = checkbox.id;
            label.textContent = atividade;
            div.appendChild(checkbox);
            div.appendChild(label);
            atividadeContainer.appendChild(div);
        });
    }

    // --- LÓGICA PARA O BOTÃO DO MENU SUSPENSO ---
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

    async function registrarPresenca() {
        if (!userInfo.nome) return;
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
                feedback.textContent = `Ainda fora da área de registro. Tentando novamente em 1 minuto.`;
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
            // A validação de > 3 não é mais necessária aqui, pois a UI já impede.
            const atividadesArray = Array.from(atividadesSelecionadas).map(cb => cb.value);
            const atividadesString = atividadesArray.join(', ');
            userInfo = { nome, atividade: atividadesString };
            localStorage.setItem('userInfo', JSON.stringify(userInfo));
            loginArea.classList.add('hidden');
            statusArea.classList.remove('hidden');
            document.getElementById('display-nome').textContent = nome;
            document.getElementById('display-atividade').textContent = atividadesString;
            checarLocalizacao();
            monitorInterval = setInterval(checarLocalizacao, 600000);
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
            monitorInterval = setInterval(checarLocalizacao, 600000);
        }
    }

    inicializarPagina();
});