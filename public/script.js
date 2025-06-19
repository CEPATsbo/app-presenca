// VERSÃO FINAL - CHECK-OUT AUTOMÁTICO INTEGRADO

import { initializeApp } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-app.js";
import { getFirestore, doc, setDoc, getDoc, serverTimestamp, collection, query, where, getDocs, orderBy } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js";

document.addEventListener('DOMContentLoaded', async () => {

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
    
    let listaDeAtividades = [];
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
    const btnSair = document.getElementById('btn-sair');
    const btnVerHistorico = document.getElementById('btn-ver-historico');
    const historicoContainer = document.getElementById('historico-container');
    const listaHistorico = document.getElementById('lista-historico');
    const muralContainer = document.getElementById('mural-container');
    
    let userInfo = {};
    let monitorInterval;
    let statusAtualVoluntario = 'ausente'; // Variável para controlar o estado (presente ou ausente)

    function getDataDeHojeSP() {
        const formatador = new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'America/Sao_Paulo' });
        return formatador.format(new Date());
    }

    async function atualizarPresenca(novoStatus) {
        if (!userInfo.nome || !userInfo.atividade) return;
        const dataFormatada = getDataDeHojeSP();
        const idDocumento = `${dataFormatada}_${userInfo.nome.replace(/\s+/g, '_')}`;
        const docRef = doc(db, "presencas", idDocumento);

        try {
            // Usamos setDoc com merge:true para criar ou atualizar o documento
            await setDoc(docRef, {
                nome: userInfo.nome,
                atividade: userInfo.atividade,
                timestamp: serverTimestamp(),
                data: dataFormatada,
                status: novoStatus // O novo campo de status
            }, { merge: true });

            statusAtualVoluntario = novoStatus; // Atualiza nosso controle local
            console.log(`Status do voluntário atualizado para: ${novoStatus}`);

            if (novoStatus === 'presente') {
                feedback.textContent = `Presença confirmada. Monitoramento contínuo ativo.`;
                feedback.style.color = "green";
            } else {
                feedback.textContent = `Saída registrada. O monitoramento continua ativo.`;
                feedback.style.color = "#1565c0"; // Um azul para diferenciar
            }
        } catch (error) {
            console.error("Erro ao atualizar presença: ", error);
            feedback.textContent = "Erro ao salvar no banco de dados.";
            feedback.style.color = "red";
        }
    }

    function checarLocalizacao() {
        if (!navigator.geolocation) {
            statusText.textContent = "Geolocalização não suportada.";
            return;
        }
        navigator.geolocation.getCurrentPosition((position) => {
            const distancia = getDistance(position.coords.latitude, position.coords.longitude, CASA_ESPIRITA_LAT, CASA_ESPIRITA_LON);
            feedback.textContent = `Você está a ${distancia.toFixed(0)} metros de distância.`;

            // Lógica de Check-in e Check-out
            if (distancia <= RAIO_EM_METROS) { // Se está DENTRO do raio
                if (statusAtualVoluntario !== 'presente') {
                    console.log("Detectado dentro da área. Registrando presença...");
                    atualizarPresenca('presente');
                }
            } else { // Se está FORA do raio
                if (statusAtualVoluntario === 'presente') {
                    console.log("Detectado fora da área. Registrando saída...");
                    atualizarPresenca('ausente');
                }
            }
        }, () => {
            statusText.textContent = `Não foi possível obter a localização. Verifique as permissões do navegador.`;
        }, { enableHighAccuracy: true });
    }

    function mostrarTelaDeStatus() {
        loginArea.classList.add('hidden');
        statusArea.classList.remove('hidden');
        document.getElementById('display-nome').textContent = userInfo.nome;
        document.getElementById('display-atividade').textContent = userInfo.atividade;
        
        // Limpa qualquer monitoramento antigo para evitar duplicação
        if (monitorInterval) clearInterval(monitorInterval);
        
        // Inicia a verificação e a repete a cada 10 minutos
        checarLocalizacao(); // Verifica imediatamente
        monitorInterval = setInterval(checarLocalizacao, 600000); // E depois a cada 10 minutos
    }

    // O restante das funções (inicializarPagina, carregarMural, criarCheckboxes, etc.)
    // permanece o mesmo da nossa última versão funcional. Para garantir, todo o código está abaixo.

    async function buscarAtividadesDoFirestore() { /* ...código não muda... */ }
    async function carregarHistoricoDoVoluntario(nome) { /* ...código não muda... */ }
    function handleCheckboxChange() { /* ...código não muda... */ }
    function criarCheckboxesDeAtividade() { /* ...código não muda... */ }
    if (toggleAtividadesBtn) { /* ...código não muda... */ }
    function getDistance(lat1, lon1, lat2, lon2) { /* ...código não muda... */ }
    if (btnRegistrar) { /* ...código não muda... */ }
    if (btnSair) { /* ...código não muda... */ }
    if (btnVerHistorico) { /* ...código não muda... */ }
    async function carregarMural() { /* ...código não muda... */ }

    // --- Colando as funções completas para garantir ---
    async function buscarAtividadesDoFirestore() {
        try {
            const q = query(collection(db, "atividades"), where("ativo", "==", true), orderBy("nome"));
            const querySnapshot = await getDocs(q);
            listaDeAtividades = querySnapshot.docs.map(doc => doc.data().nome);
            criarCheckboxesDeAtividade();
        } catch (error) {
            console.error("Erro ao buscar atividades: ", error);
            if(atividadeContainer) atividadeContainer.innerHTML = "<p style='color:red;'>Não foi possível carregar as atividades.</p>";
        }
    }
    
    async function carregarHistoricoDoVoluntario(nomeDoVoluntario) {
        if (!nomeDoVoluntario || !listaHistorico) return;
        listaHistorico.innerHTML = '<li>Carregando...</li>';
        const q = query(collection(db, "presencas"), where("nome", "==", nomeDoVoluntario), orderBy("data", "desc"));
        try {
            const querySnapshot = await getDocs(q);
            listaHistorico.innerHTML = '';
            if (querySnapshot.empty) {
                listaHistorico.innerHTML = '<li>Nenhuma presença encontrada.</li>';
                return;
            }
            querySnapshot.forEach((doc) => {
                const dados = doc.data();
                const [ano, mes, dia] = dados.data.split('-');
                const dataFormatada = `${dia}/${mes}/${ano}`;
                const item = document.createElement('li');
                item.textContent = `Data: ${dataFormatada} - Atividade(s): ${dados.atividade}`;
                listaHistorico.appendChild(item);
            });
        } catch (error) {
            console.error("Erro ao buscar histórico: ", error);
            listaHistorico.innerHTML = '<li>Erro ao carregar histórico. Verifique o console (F12).</li>';
        }
    }

    function handleCheckboxChange() {
        const checkboxesMarcados = document.querySelectorAll('input[name="atividade"]:checked');
        document.querySelectorAll('input[name="atividade"]').forEach(checkbox => {
            checkbox.disabled = checkboxesMarcados.length >= 3 && !checkbox.checked;
        });
    }
    
    function criarCheckboxesDeAtividade() {
        if (!atividadeContainer) return;
        atividadeContainer.innerHTML = '';
        listaDeAtividades.forEach(atividade => {
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
    
    if (btnRegistrar) {
        btnRegistrar.addEventListener('click', () => {
            const nome = nomeInput.value;
            const atividadesSelecionadas = document.querySelectorAll('input[name="atividade"]:checked');
            if (!nome) return alert("Por favor, preencha seu nome.");
            if (atividadesSelecionadas.length === 0) return alert("Por favor, selecione pelo menos uma atividade.");
            const atividadesArray = Array.from(atividadesSelecionadas).map(cb => cb.value);
            const dataDeHoje = getDataDeHojeSP();
            userInfo = { nome, atividade: atividadesArray.join(', '), loginDate: dataDeHoje };
            localStorage.setItem('userInfo', JSON.stringify(userInfo));
            mostrarTelaDeStatus();
        });
    }

    if (btnSair) {
        btnSair.addEventListener('click', (event) => {
            event.preventDefault();
            if (confirm('Tem certeza que deseja sair? O monitoramento será interrompido.')) {
                if (statusAtualVoluntario === 'presente') {
                    atualizarPresenca('ausente').then(() => {
                        localStorage.removeItem('userInfo');
                        window.location.reload();
                    });
                } else {
                    localStorage.removeItem('userInfo');
                    window.location.reload();
                }
            }
        });
    }

    if (btnVerHistorico) {
        btnVerHistorico.addEventListener('click', () => {
            historicoContainer.classList.toggle('hidden');
            if (!historicoContainer.classList.contains('hidden') && userInfo.nome) {
                carregarHistoricoDoVoluntario(userInfo.nome);
            }
        });
    }
    
    async function carregarMural() {
        if (!muralContainer) return;
        try {
            const muralDoc = await getDoc(doc(db, "configuracoes", "mural"));
            if (muralDoc.exists() && muralDoc.data().mensagem) {
                muralContainer.style.display = 'block';
                muralContainer.innerText = muralDoc.data().mensagem;
            } else {
                muralContainer.style.display = 'none';
            }
        } catch (error) {
            console.error("Erro ao carregar mural:", error);
            muralContainer.style.display = 'none';
        }
    }

    async function inicializarPagina() {
        await carregarMural();
        await buscarAtividadesDoFirestore();
        const savedInfoString = localStorage.getItem('userInfo');
        if (!savedInfoString) return;
        const savedInfo = JSON.parse(savedInfoString);
        const dataDeHoje = getDataDeHojeSP();
        if (savedInfo.loginDate === dataDeHoje) {
            userInfo = savedInfo;
            mostrarTelaDeStatus();
        } else {
            userInfo = { nome: savedInfo.nome };
            nomeInput.value = savedInfo.nome;
        }
    }

    inicializarPagina();

    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js'));
    }
});