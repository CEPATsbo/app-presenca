// Garante que o script só rode depois que a página HTML for totalmente carregada
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


    // Importa as funções que precisamos do Firebase v9+
    import { initializeApp } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-app.js";
    import { getFirestore, doc, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js";

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
    const CASA_ESPIRITA_LAT = -22.7532; // Latitude
    const CASA_ESPIRITA_LON = -47.3334; // Longitude
    const RAIO_EM_METROS = 100;
    // -----------------------------

    // Elementos da página
    const loginArea = document.getElementById('login-area');
    const statusArea = document.getElementById('status-area');
    const btnRegistrar = document.getElementById('btn-registrar');
    const feedback = document.getElementById('feedback');
    const statusText = document.getElementById('status-text');
    const atividadeContainer = document.getElementById('atividade-container');

    let userInfo = {};
    let monitorInterval;

    // Função para criar os checkboxes de atividade dinamicamente
    function criarCheckboxesDeAtividade() {
        listaDeAtividades.sort().forEach(atividade => {
            const div = document.createElement('div');
            div.className = 'checkbox-item';

            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.id = atividade.replace(/\s+/g, '-'); // Cria um ID único
            checkbox.name = 'atividade';
            checkbox.value = atividade;

            const label = document.createElement('label');
            label.htmlFor = checkbox.id;
            label.textContent = atividade;

            div.appendChild(checkbox);
            div.appendChild(label);
            atividadeContainer.appendChild(div);
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
                atividade: userInfo.atividade, // Agora será uma string com múltiplas atividades
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
    
    // --- LÓGICA DO BOTÃO ATUALIZADA ---
    if (btnRegistrar) {
        btnRegistrar.addEventListener('click', () => {
            const nome = document.getElementById('nome').value;
            
            // Pega todas as checkboxes marcadas
            const atividadesSelecionadas = document.querySelectorAll('input[name="atividade"]:checked');
            
            // Validação
            if (!nome) {
                alert("Por favor, preencha seu nome.");
                return;
            }
            if (atividadesSelecionadas.length === 0) {
                alert("Por favor, selecione pelo menos uma atividade.");
                return;
            }
            if (atividadesSelecionadas.length > 3) {
                alert("Você pode selecionar no máximo 3 atividades.");
                return;
            }

            // Transforma as atividades em uma única string separada por vírgula
            const atividadesArray = Array.from(atividadesSelecionadas).map(cb => cb.value);
            const atividadesString = atividadesArray.join(', ');
            
            userInfo = { nome, atividade: atividadesString };
            localStorage.setItem('userInfo', JSON.stringify(userInfo));

            loginArea.classList.add('hidden');
            statusArea.classList.remove('hidden');
            document.getElementById('display-nome').textContent = nome;
            document.getElementById('display-atividade').textContent = atividadesString;
            
            checarLocalizacao();
            monitorInterval = setInterval(checarLocalizacao, 60000);
        });
    }

    // Função que é chamada assim que a página carrega
    function inicializarPagina() {
        criarCheckboxesDeAtividade(); // Cria as opções de atividade

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
    }

    // Inicia a página
    inicializarPagina();
});