// VERSÃO FINAL COMPLETA E INTEGRADA - 21/06/2025

import { initializeApp } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-app.js";
import { getFirestore, doc, setDoc, getDoc, updateDoc, serverTimestamp, collection, query, where, getDocs, orderBy } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js";

document.addEventListener('DOMContentLoaded', async () => {

    // =================================================================
    //  1. COLE AQUI O SEU OBJETO 'firebaseConfig' COMPLETO
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

    // =================================================================
    //  2. COLE AQUI A SUA VAPID PUBLIC KEY GERADA
    // =================================================================
    const VAPID_PUBLIC_KEY = 'BGspwtPwnL8JSgNsgr66ezRkY0pjIUDM4KP8qtRPY_B7soEc3d5dGPDUcIPrxB_MSkEhfxMeeTzt8PecbbqDYD4';
    // =================================================================

    // --- INICIALIZAÇÃO E CONSTANTES GLOBAIS ---
    const app = initializeApp(firebaseConfig);
    const db = getFirestore(app);
    
    let listaDeAtividades = [];
    const CASA_ESPIRITA_LAT = -22.75553; // Coordenadas Reais da Casa
    const CASA_ESPIRITA_LON = -47.36945;
    const RAIO_EM_METROS = 40;
    
    const loginArea = document.getElementById('login-area'), statusArea = document.getElementById('status-area'), nomeInput = document.getElementById('nome'), btnRegistrar = document.getElementById('btn-registrar'), feedback = document.getElementById('feedback'), statusText = document.getElementById('status-text'), atividadeContainer = document.getElementById('atividade-container'), toggleAtividadesBtn = document.getElementById('toggle-atividades'), atividadeWrapper = document.getElementById('atividade-wrapper'), btnSair = document.getElementById('btn-sair'), btnVerHistorico = document.getElementById('btn-ver-historico'), historicoContainer = document.getElementById('historico-container'), listaHistorico = document.getElementById('lista-historico'), muralContainer = document.getElementById('mural-container'), btnAtivarNotificacoes = document.getElementById('btn-ativar-notificacoes');
    
    let userInfo = {};
    let monitorInterval;
    let statusAtualVoluntario = 'ausente';

    // --- DEFINIÇÃO DE TODAS AS FUNÇÕES ---

    function getDataDeHojeSP() {
        const formatador = new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'America/Sao_Paulo' });
        return formatador.format(new Date());
    }

    function urlBase64ToUint8Array(base64String) {
        const padding = '='.repeat((4 - base64String.length % 4) % 4);
        const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
        const rawData = window.atob(base64);
        const outputArray = new Uint8Array(rawData.length);
        for (let i = 0; i < rawData.length; ++i) { outputArray[i] = rawData.charCodeAt(i); }
        return outputArray;
    }

    async function inscreverParaNotificacoes() {
        if (!('serviceWorker' in navigator) || !('PushManager' in window)) { return alert('Seu navegador não suporta notificações push.'); }
        if (VAPID_PUBLIC_KEY.includes('COLE_SUA_VAPID_PUBLIC_KEY_AQUI')) { return alert('Chave de notificação não configurada no aplicativo.'); }
        
        try {
            const registration = await navigator.serviceWorker.ready;
            const existingSubscription = await registration.pushManager.getSubscription();
            if(existingSubscription) { return alert('As notificações já estão ativas para este aparelho.'); }

            const permission = await Notification.requestPermission();
            if (permission !== 'granted') { return alert('Permissão para notificações não concedida.'); }

            const subscription = await registration.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
            });

            const idInscricao = btoa(subscription.endpoint).replace(/=/g, ''); 
            const inscricaoRef = doc(db, "inscricoes", idInscricao);
            await setDoc(inscricaoRef, {
                ...JSON.parse(JSON.stringify(subscription)),
                nomeVoluntario: userInfo.nome || 'Não identificado',
                criadoEm: serverTimestamp()
            });
            alert('Tudo pronto! Você receberá as notificações da Casa.');
        } catch (error) {
            console.error('Erro ao se inscrever para notificações:', error);
            alert('Ocorreu um erro ao ativar as notificações.');
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
            listaHistorico.innerHTML = '<li>Erro ao carregar histórico. (Pode ser necessário criar um índice no Firebase).</li>';
        }
    }

    function handleCheckboxChange() {
        const checkboxesMarcados = document.querySelectorAll('input[name="atividade"]:checked');
        document.querySelectorAll('input[name="atividade"]').forEach(checkbox => {
            checkbox.disabled = checkboxesMarcados.length >= 3 && !checkbox.checked;
        });
    }

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
    
    async function atualizarPresenca(novoStatus) {
        if (!userInfo.nome || !userInfo.atividade) return;
        const dataFormatada = getDataDeHojeSP();
        const idDocumento = `${dataFormatada}_${userInfo.nome.replace(/\s+/g, '_')}`;
        const docRef = doc(db, "presencas", idDocumento);
        try {
            const docSnap = await getDoc(docRef);
            if (!docSnap.exists() && novoStatus === 'presente') {
                await setDoc(docRef, { nome: userInfo.nome, atividade: userInfo.atividade, data: dataFormatada, status: 'presente', primeiroCheckin: serverTimestamp(), ultimaAtualizacao: serverTimestamp() });
            } else {
                await updateDoc(docRef, { status: novoStatus, ultimaAtualizacao: serverTimestamp() });
            }
            statusAtualVoluntario = novoStatus;
            if (novoStatus === 'presente') {
                feedback.textContent = `Presença confirmada. Monitoramento contínuo ativo.`;
                feedback.style.color = "green";
            } else {
                feedback.textContent = `Saída registrada. O monitoramento continua ativo.`;
                feedback.style.color = "#1565c0";
            }
        } catch (error) {
            console.error("Erro ao atualizar presença: ", error);
            feedback.textContent = "Erro ao salvar no banco de dados.";
        }
    }

    function checarLocalizacao() {
        if (!navigator.geolocation) { statusText.textContent = "Geolocalização não suportada."; return; }
        navigator.geolocation.getCurrentPosition((position) => {
            const distancia = getDistance(position.coords.latitude, position.coords.longitude, CASA_ESPIRITA_LAT, CASA_ESPIRITA_LON);
            feedback.textContent = `Você está a ${distancia.toFixed(0)} metros de distância.`;
            if (distancia <= RAIO_EM_METROS) {
                if (statusAtualVoluntario !== 'presente') { atualizarPresenca('presente'); }
            } else {
                if (statusAtualVoluntario === 'presente') { atualizarPresenca('ausente'); }
            }
        }, () => { statusText.textContent = `Não foi possível obter a localização.`; }, { enableHighAccuracy: true });
    }
    
    function getDistance(lat1, lon1, lat2, lon2) {
        const R = 6371 * 1000;
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLon = (lon2 - lon1) * Math.PI / 180;
        const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
    }

    function mostrarTelaDeStatus() {
        loginArea.classList.add('hidden');
        statusArea.classList.remove('hidden');
        document.getElementById('display-nome').textContent = userInfo.nome;
        document.getElementById('display-atividade').textContent = userInfo.atividade;
        if (monitorInterval) clearInterval(monitorInterval);
        checarLocalizacao();
        monitorInterval = setInterval(checarLocalizacao, 600000);
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
            const idDocumento = `${dataDeHoje}_${userInfo.nome.replace(/\s+/g, '_')}`;
            const docRef = doc(db, "presencas", idDocumento);
            const docSnap = await getDoc(docRef);
            if(docSnap.exists()){
                statusAtualVoluntario = docSnap.data().status || 'ausente';
            }
            mostrarTelaDeStatus();
        } else {
            userInfo = { nome: savedInfo.nome };
            nomeInput.value = savedInfo.nome;
        }
    }
    
    // --- LIGAÇÃO DOS EVENTOS (BOTÕES) ---
    if (toggleAtividadesBtn) { toggleAtividadesBtn.addEventListener('click', () => { atividadeWrapper.classList.toggle('hidden'); const seta = toggleAtividadesBtn.innerHTML.includes('▼') ? '▲' : '▼'; toggleAtividadesBtn.innerHTML = `Selecione suas atividades (até 3) ${seta}`; }); }
    
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
        btnSair.addEventListener('click', async (event) => {
            event.preventDefault();
            if (confirm('Tem certeza que deseja sair? Sua inscrição de notificações também será cancelada.')) {
                try {
                    if (monitorInterval) clearInterval(monitorInterval);
                    if (statusAtualVoluntario === 'presente') {
                        await atualizarPresenca('ausente');
                    }
                    if ('serviceWorker' in navigator) {
                        const registration = await navigator.serviceWorker.ready;
                        const subscription = await registration.pushManager.getSubscription();
                        if (subscription) {
                            await subscription.unsubscribe();
                            console.log('Inscrição de notificação cancelada.');
                        }
                    }
                    localStorage.removeItem('userInfo');
                    window.location.reload();
                } catch (error) {
                    console.error('Erro ao sair:', error);
                    alert('Ocorreu um erro ao sair. Limpando dados locais mesmo assim.');
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

    if (btnAtivarNotificacoes) {
        btnAtivarNotificacoes.addEventListener('click', inscreverParaNotificacoes);
    }
    
    if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js'));
    }

    // --- INICIA A APLICAÇÃO ---
    inicializarPagina();
});