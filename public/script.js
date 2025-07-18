// VERSÃO FINAL - LÓGICA DE ATUALIZAÇÃO MOVIDA PARA O BACKEND

import { initializeApp } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-app.js";
import { getFirestore, doc, getDoc, setDoc, updateDoc, serverTimestamp, collection, query, where, getDocs, orderBy, addDoc } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js";
import Fuse from 'https://cdn.jsdelivr.net/npm/fuse.js@7.0.0/dist/fuse.mjs';

document.addEventListener('DOMContentLoaded', async () => {
    
    const firebaseConfig = {
  apiKey: "AIzaSyBV7RPjk3cFTqL-aIpflJcUojKg1ZXMLuU",
  authDomain: "voluntarios-ativos---cepat.firebaseapp.com",
  projectId: "voluntarios-ativos---cepat",
  storageBucket: "voluntarios-ativos---cepat.firebasestorage.app",
  messagingSenderId: "66122858261",
  appId: "1:66122858261:web:7fa21f1805463b5c08331c"
};
    const VAPID_PUBLIC_KEY = 'BMpfTCErYrAMkosCBVdmAg3-gAfv82Q6TTIg2amEmIST0_SipaUpq7AxDZ1VhiGfxilUzugQxrK92Buu6d9FM2Y';

    const app = initializeApp(firebaseConfig);
    const db = getFirestore(app);
    
    const CASA_ESPIRITA_LAT = -22.75553, CASA_ESPIRITA_LON = -47.36945, RAIO_EM_METROS = 40;
    
    const loginArea = document.getElementById('login-area'), statusArea = document.getElementById('status-area'), nomeInput = document.getElementById('nome'), btnRegistrar = document.getElementById('btn-registrar'), feedback = document.getElementById('feedback'), statusText = document.getElementById('status-text'), atividadeContainer = document.getElementById('atividade-container'), toggleAtividadesBtn = document.getElementById('toggle-atividades'), atividadeWrapper = document.getElementById('atividade-wrapper'), btnSair = document.getElementById('btn-sair'), btnVerHistorico = document.getElementById('btn-ver-historico'), historicoContainer = document.getElementById('historico-container'), listaHistorico = document.getElementById('lista-historico'), muralContainer = document.getElementById('mural-container'), btnAtivarNotificacoes = document.getElementById('btn-ativar-notificacoes');
    
    let listaDeAtividades = [];
    let userInfo = {};
    let monitorInterval;
    let statusAtualVoluntario = 'ausente';

    function getDataDeHojeSP() { const formatador = new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'America/Sao_Paulo' }); return formatador.format(new Date()); }
    function urlBase64ToUint8Array(base64String) { const padding = '='.repeat((4 - base64String.length % 4) % 4); const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/'); const rawData = window.atob(base64); const outputArray = new Uint8Array(rawData.length); for (let i = 0; i < rawData.length; ++i) { outputArray[i] = rawData.charCodeAt(i); } return outputArray; }
    async function inscreverParaNotificacoes() { if (!('serviceWorker' in navigator) || !('PushManager' in window)) { return alert('Seu navegador não suporta notificações.'); } if (VAPID_PUBLIC_KEY.includes('SUA_VAPID_PUBLIC_KEY_AQUI')) { return alert('Chave de notificação não configurada.'); } try { const r = await navigator.serviceWorker.ready; const es = await r.pushManager.getSubscription(); if(es) { return alert('As notificações já estão ativas.'); } const p = await Notification.requestPermission(); if (p !== 'granted') { return alert('Permissão não concedida.'); } const s = await r.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) }); const id = btoa(s.endpoint).replace(/=/g, ''); await setDoc(doc(db, "inscricoes", id), { ...JSON.parse(JSON.stringify(s)), nomeVoluntario: userInfo.nome || 'Não identificado', criadoEm: serverTimestamp() }); alert('Tudo pronto! Você receberá notificações.'); } catch (e) { console.error('Erro ao inscrever:', e); alert('Ocorreu um erro ao ativar.'); } }
    async function carregarHistoricoDoVoluntario(nome) { if (!nome || !listaHistorico) return; listaHistorico.innerHTML = '<li>Carregando...</li>'; const q = query(collection(db, "presencas"), where("nome", "==", nome), orderBy("data", "desc")); try { const s = await getDocs(q); listaHistorico.innerHTML = ''; if (s.empty) { listaHistorico.innerHTML = '<li>Nenhuma presença encontrada.</li>'; return; } s.forEach((d) => { const dt = d.data(); const [a, m, dia] = dt.data.split('-'); const df = `${dia}/${m}/${a}`; const i = document.createElement('li'); i.textContent = `Data: ${df} - Atividade(s): ${dt.atividade}`; listaHistorico.appendChild(i); }); } catch (e) { console.error("Erro ao buscar histórico:", e); listaHistorico.innerHTML = '<li>Erro ao carregar.</li>'; } }
    function handleCheckboxChange() { const c = document.querySelectorAll('input[name="atividade"]:checked'); document.querySelectorAll('input[name="atividade"]').forEach(b => { b.disabled = c.length >= 3 && !b.checked; }); }
    async function buscarAtividadesDoFirestore() { try { const q = query(collection(db, "atividades"), where("ativo", "==", true), orderBy("nome")); const s = await getDocs(q); listaDeAtividades = s.docs.map(d => d.data().nome); criarCheckboxesDeAtividade(); } catch (e) { console.error("Erro ao buscar atividades:", e); if(atividadeContainer) atividadeContainer.innerHTML = "<p style='color:red;'>Não foi possível carregar atividades.</p>"; } }
    function criarCheckboxesDeAtividade() { if (!atividadeContainer) return; atividadeContainer.innerHTML = ''; listaDeAtividades.forEach(a => { const d = document.createElement('div'); d.className = 'checkbox-item'; const c = document.createElement('input'); c.type = 'checkbox'; c.id = a.replace(/\s+/g, '-'); c.name = 'atividade'; c.value = a; c.addEventListener('change', handleCheckboxChange); const l = document.createElement('label'); l.htmlFor = c.id; l.textContent = a; d.appendChild(c); d.appendChild(l); atividadeContainer.appendChild(d); }); }
    function getDistance(lat1, lon1, lat2, lon2) { const R = 6371e3; const φ1 = lat1 * Math.PI / 180, φ2 = lat2 * Math.PI / 180; const Δφ = (lat2 - lat1) * Math.PI / 180, Δλ = (lon2 - lon1) * Math.PI / 180; const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2); const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)); return R * c; }
    
    // --- FUNÇÃO ATUALIZAR PRESENÇA SIMPLIFICADA ---
    async function atualizarPresenca(novoStatus) {
        if (!userInfo.nome || !userInfo.atividade) return;
        const df = getDataDeHojeSP();
        const id = `${df}_${userInfo.nome.replace(/\s+/g, '_')}`;
        const docRef = doc(db, "presencas", id);
        try {
            const docSnap = await getDoc(docRef);
            const dadosParaSalvar = { status: novoStatus, ultimaAtualizacao: serverTimestamp() };
            if (!docSnap.exists() && novoStatus === 'presente') {
                dadosParaSalvar.nome = userInfo.nome;
                dadosParaSalvar.atividade = userInfo.atividade;
                dadosParaSalvar.data = df;
                dadosParaSalvar.primeiroCheckin = serverTimestamp();
            }
            await setDoc(docRef, dadosParaSalvar, { merge: true });
            
            // REMOVEMOS A ATUALIZAÇÃO DA FICHA MESTRA DAQUI. O BACKEND FARÁ ISSO.
            
            statusAtualVoluntario = novoStatus;
            if (novoStatus === 'presente') { feedback.textContent = `Presença confirmada.`; feedback.style.color = "green";
            } else { feedback.textContent = `Saída registrada.`; feedback.style.color = "#1565c0"; }
        } catch (e) { console.error("Erro ao atualizar presença:", e); }
    }

    function checarLocalizacao() { if (!navigator.geolocation) return; navigator.geolocation.getCurrentPosition(p => { const d = getDistance(p.coords.latitude, p.coords.longitude, CASA_ESPIRITA_LAT, CASA_ESPIRITA_LON); feedback.textContent = `Você está a ${d.toFixed(0)} metros de distância.`; if (d <= RAIO_EM_METROS) { if (statusAtualVoluntario !== 'presente') { atualizarPresenca('presente'); } } else { if (statusAtualVoluntario === 'presente') { atualizarPresenca('ausente'); } } }, () => { statusText.textContent = `Não foi possível obter localização.`; }, { enableHighAccuracy: true }); }
    function mostrarTelaDeStatus() { loginArea.classList.add('hidden'); statusArea.classList.remove('hidden'); document.getElementById('display-nome').textContent = userInfo.nome; document.getElementById('display-atividade').textContent = userInfo.atividade; if (monitorInterval) clearInterval(monitorInterval); checarLocalizacao(); monitorInterval = setInterval(checarLocalizacao, 600000); }
    async function carregarMural() { if (!muralContainer) return; try { const docSnap = await getDoc(doc(db, "configuracoes", "mural")); if (docSnap.exists() && docSnap.data().mensagem) { muralContainer.style.display = 'block'; muralContainer.innerText = docSnap.data().mensagem; } else { muralContainer.style.display = 'none'; } } catch (e) { console.error("Erro ao carregar mural:", e); muralContainer.style.display = 'none'; } }
    
    // --- FUNÇÃO REGISTRAR VOLUNTÁRIO SIMPLIFICADA ---
    async function registrarVoluntario(voluntario, atividadesSelecionadas) {
        let voluntarioId = voluntario.id;
        let nomeFinal = voluntario.nome;
        
        if (!voluntarioId) {
            const novoVoluntarioDoc = await addDoc(collection(db, "voluntarios"), {
                nome: nomeFinal, statusVoluntario: 'ativo', criadoEm: serverTimestamp(),
                endereco: '', telefone: '', aniversario: '', ultimaPresenca: null, tasvAssinadoAno: null
            });
            voluntarioId = novoVoluntarioDoc.id;
        }
        
        const atividadesArray = Array.from(atividadesSelecionadas).map(cb => cb.value);
        const dataDeHoje = getDataDeHojeSP();
        userInfo = { id: voluntarioId, nome: nomeFinal, atividade: atividadesArray.join(', '), loginDate: dataDeHoje };
        
        localStorage.setItem('userInfo', JSON.stringify(userInfo));
        mostrarTelaDeStatus();
    }
    
    async function inicializarPagina() {
        await Promise.all([carregarMural(), buscarAtividadesDoFirestore()]);
        const savedInfoString = localStorage.getItem('userInfo');
        if (savedInfoString) {
            const savedInfo = JSON.parse(savedInfoString);
            const dataDeHoje = getDataDeHojeSP();
            if (savedInfo.loginDate === dataDeHoje) {
                userInfo = savedInfo;
                const docRef = doc(db, "presencas", `${dataDeHoje}_${userInfo.nome.replace(/\s+/g, '_')}`);
                const docSnap = await getDoc(docRef);
                if(docSnap.exists()){ statusAtualVoluntario = docSnap.data().status || 'ausente'; }
                mostrarTelaDeStatus();
            } else {
                nomeInput.value = savedInfo.nome;
            }
        }
    }
    
    if (toggleAtividadesBtn) { toggleAtividadesBtn.addEventListener('click', () => { atividadeWrapper.classList.toggle('hidden'); const s = toggleAtividadesBtn.innerHTML.includes('▼') ? '▲' : '▼'; toggleAtividadesBtn.innerHTML = `Selecione suas atividades (até 3) ${s}`; }); }
    if (btnSair) { btnSair.addEventListener('click', async (e) => { e.preventDefault(); if (confirm('Tem certeza? Sua inscrição de notificações também será cancelada.')) { try { if (monitorInterval) clearInterval(monitorInterval); if (statusAtualVoluntario === 'presente') { await atualizarPresenca('ausente'); } if ('serviceWorker' in navigator) { const reg = await navigator.serviceWorker.ready; const sub = await reg.pushManager.getSubscription(); if (sub) { await sub.unsubscribe(); } } localStorage.removeItem('userInfo'); window.location.reload(); } catch (err) { console.error('Erro ao sair:', err); localStorage.removeItem('userInfo'); window.location.reload(); } } }); }
    if (btnVerHistorico) { btnVerHistorico.addEventListener('click', () => { historicoContainer.classList.toggle('hidden'); if (!historicoContainer.classList.contains('hidden') && userInfo.nome) { carregarHistoricoDoVoluntario(userInfo.nome); } }); }
    if (btnAtivarNotificacoes) { btnAtivarNotificacoes.addEventListener('click', inscreverParaNotificacoes); }
    if ('serviceWorker' in navigator) { window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js')); }

    if (btnRegistrar) {
        btnRegistrar.addEventListener('click', async () => {
            const nomeDigitado = nomeInput.value.trim();
            const atividadesSelecionadas = document.querySelectorAll('input[name="atividade"]:checked');
            if (!nomeDigitado || nomeDigitado.split(' ').length < 2) { return alert("Por favor, digite seu nome completo (nome e sobrenome)."); }
            if (atividadesSelecionadas.length === 0) { return alert("Por favor, selecione pelo menos uma atividade."); }
            btnRegistrar.disabled = true;
            feedback.textContent = "Verificando cadastro...";
            try {
                const voluntariosSnapshot = await getDocs(query(collection(db, "voluntarios")));
                const listaDeVoluntarios = voluntariosSnapshot.docs.map(d => ({ id: d.id, ...d.data() }));
                const fuse = new Fuse(listaDeVoluntarios, { keys: ['nome'], includeScore: true, threshold: 0.45, distance: 100 });
                const resultados = fuse.search(nomeDigitado);
                let voluntarioParaRegistrar = { id: null, nome: nomeDigitado };
                if (resultados.length > 0) {
                    const melhorResultado = resultados[0].item;
                    if (nomeDigitado.toLowerCase() !== melhorResultado.nome.toLowerCase()) {
                        if (confirm(`Encontramos um nome parecido: "${melhorResultado.nome}".\n\nÉ você?`)) {
                            voluntarioParaRegistrar = melhorResultado;
                        }
                    } else {
                        voluntarioParaRegistrar = melhorResultado;
                    }
                }
                await registrarVoluntario(voluntarioParaRegistrar, atividadesSelecionadas);
            } catch (error) {
                console.error("ERRO CRÍTICO no registro:", error);
                alert("Ocorreu um erro crítico. Tente novamente.");
            } finally {
                btnRegistrar.disabled = false;
                feedback.textContent = "";
            }
        });
    }
    
    inicializarPagina();
});