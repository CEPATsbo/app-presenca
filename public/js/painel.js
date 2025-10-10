import { initializeApp } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-auth.js";
import { getFirestore, collection, query, where, getDocs, doc, setDoc, serverTimestamp, orderBy, limit, getDoc } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js";

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
const emprestimosBibliotecaElement = document.getElementById('emprestimos-biblioteca');
const infoFrequenciaElement = document.getElementById('info-frequencia');
const btnRegistrarPresenca = document.getElementById('btn-registrar-presenca');
const btnSair = document.getElementById('btn-sair');
const feedbackElement = document.getElementById('feedback-geolocalizacao');
const muralContainer = document.getElementById('mural-container');
const modalOverlayAtividades = document.getElementById('modal-atividades');
const closeModalAtividadesBtn = document.getElementById('close-modal-atividades');
const activitiesListContainer = document.getElementById('activities-list-container');
const btnConfirmarPresenca = document.getElementById('btn-confirmar-presenca');
const modalOverlayDetalhes = document.getElementById('modal-detalhes');
const closeModalDetalhesBtn = document.getElementById('close-modal-detalhes');
const linkVerDetalhes = document.getElementById('link-ver-detalhes');
const detalhesCantinaContainer = document.getElementById('detalhes-cantina-container');
const detalhesBibliotecaContainer = document.getElementById('detalhes-biblioteca-container');
const detalhesEmprestimosContainer = document.getElementById('detalhes-emprestimos-container');

// --- VARIÁVEIS DE ESTADO ---
let currentUser = null;
let voluntarioProfile = null;
let monitorInterval;
let statusAtualVoluntario = 'ausente';
let atividadesDoDia = [];
let detalhesPendenciasCantina = [];
let detalhesPendenciasBiblioteca = [];
let detalhesEmprestimos = [];

// --- LÓGICA PRINCIPAL ---
onAuthStateChanged(auth, async (user) => {
    if (user) {
        currentUser = user;
        carregarMural();
        const voluntariosRef = collection(db, "voluntarios");
        const q = query(voluntariosRef, where("authUid", "==", user.uid), limit(1));
        const querySnapshot = await getDocs(q);
        if (!querySnapshot.empty) {
            const voluntarioDoc = querySnapshot.docs[0];
            voluntarioProfile = { id: voluntarioDoc.id, ...voluntarioDoc.data() };
            preencherPainel(voluntarioProfile);
            buscarPendenciasEEmprestimos(voluntarioProfile);
        } else {
            preencherPainel({ nome: user.displayName || 'Voluntário', email: user.email });
        }
    } else {
        window.location.href = '/index.html';
    }
});

async function carregarMural() {
    if (!muralContainer) return;
    try {
        const docRef = doc(db, "configuracoes", "mural");
        const docSnap = await getDoc(docRef);
        if (docSnap.exists() && docSnap.data().mensagem) {
            muralContainer.innerText = docSnap.data().mensagem;
            muralContainer.style.display = 'block';
        } else {
            muralContainer.style.display = 'none';
        }
    } catch (e) { console.error("Erro ao carregar mural:", e); }
}

function preencherPainel(profile) {
    if (greetingElement) greetingElement.textContent = `Olá, ${profile.nome || 'Voluntário'}! 👋`;
    if (emailElement) emailElement.textContent = profile.email || '--';
    if (telefoneElement) telefoneElement.textContent = profile.telefone || '--';
    if (infoFrequenciaElement) infoFrequenciaElement.textContent = `Sua última presença foi em ${profile.ultimaPresenca || 'não registrada'}.`;
}

async function buscarPendenciasEEmprestimos(profile) {
    if (!profile || !profile.id) return;
    detalhesPendenciasCantina = [];
    detalhesPendenciasBiblioteca = [];
    detalhesEmprestimos = [];

    try {
        const qCantina = query(collection(db, "contas_a_receber"), where("compradorId", "==", profile.id), where("status", "==", "pendente"));
        const snapshotCantina = await getDocs(qCantina);
        let totalCantina = 0;
        snapshotCantina.forEach(doc => { const data = doc.data(); totalCantina += data.total; detalhesPendenciasCantina.push(data); });
        if (pendenciaCantinaElement) pendenciaCantinaElement.textContent = `R$ ${totalCantina.toFixed(2).replace('.', ',')}`;
    } catch (e) { console.error("Erro ao buscar pendências da cantina:", e); }

    try {
        const qBibVendas = query(collection(db, "biblioteca_contas_a_receber"), where("compradorId", "==", profile.id), where("status", "==", "pendente"));
        const snapshotBibVendas = await getDocs(qBibVendas);
        let totalBibVendas = 0;
        snapshotBibVendas.forEach(doc => { const data = doc.data(); totalBibVendas += data.total; detalhesPendenciasBiblioteca.push(data); });
        if (pendenciaBibliotecaElement) pendenciaBibliotecaElement.textContent = `R$ ${totalBibVendas.toFixed(2).replace('.', ',')}`;
    } catch (e) { console.error("Erro ao buscar pendências da biblioteca:", e); }

    try {
        const qBibEmprestimos = query(collection(db, "biblioteca_emprestimos"), where("leitor.id", "==", profile.id), where("status", "==", "emprestado"));
        const snapshotBibEmprestimos = await getDocs(qBibEmprestimos);
        if (emprestimosBibliotecaElement) {
            if (snapshotBibEmprestimos.empty) {
                emprestimosBibliotecaElement.innerHTML = `<p><strong>Livros Emprestados:</strong> Nenhum.</p>`;
            } else {
                let livrosHtml = '<p><strong>Livros Emprestados:</strong></p><ul style="margin: 0; padding-left: 20px;">';
                snapshotBibEmprestimos.forEach(doc => { const data = doc.data(); livrosHtml += `<li>${data.livroTitulo}</li>`; detalhesEmprestimos.push(data); });
                livrosHtml += '</ul>';
                emprestimosBibliotecaElement.innerHTML = livrosHtml;
            }
        }
    } catch (e) { console.error("Erro ao buscar empréstimos da biblioteca:", e); }
}

function preencherModalDetalhes() {
    let cantinaHtml = '<h4>Pendências da Cantina</h4>';
    if (detalhesPendenciasCantina.length > 0) {
        cantinaHtml += '<ul>';
        detalhesPendenciasCantina.forEach(item => {
            const data = item.registradoEm.toDate().toLocaleDateString('pt-BR');
            cantinaHtml += `<li>Em ${data}: R$ ${item.total.toFixed(2).replace('.', ',')}</li>`;
        });
        cantinaHtml += '</ul>';
    } else { cantinaHtml += '<p>Nenhuma pendência na cantina.</p>'; }
    detalhesCantinaContainer.innerHTML = cantinaHtml;

    let bibHtml = '<h4>Pendências da Biblioteca (Vendas)</h4>';
    if (detalhesPendenciasBiblioteca.length > 0) {
        bibHtml += '<ul>';
        detalhesPendenciasBiblioteca.forEach(item => {
            const data = item.registradoEm.toDate().toLocaleDateString('pt-BR');
            bibHtml += `<li>Em ${data}: R$ ${item.total.toFixed(2).replace('.', ',')}</li>`;
        });
        bibHtml += '</ul>';
    } else { bibHtml += '<p>Nenhuma pendência de vendas na biblioteca.</p>'; }
    detalhesBibliotecaContainer.innerHTML = bibHtml;

    let emprestimosHtml = '<h4>Livros Emprestados</h4>';
    if (detalhesEmprestimos.length > 0) {
        emprestimosHtml += '<ul>';
        detalhesEmprestimos.forEach(item => {
            const data = item.dataEmprestimo.toDate().toLocaleDateString('pt-BR');
            emprestimosHtml += `<li>${item.livroTitulo} (retirado em ${data})</li>`;
        });
        emprestimosHtml += '</ul>';
    } else { emprestimosHtml += '<p>Nenhum livro emprestado.</p>'; }
    detalhesEmprestimosContainer.innerHTML = emprestimosHtml;
}

async function carregarAtividadesNoModal() {
    try {
        const q = query(collection(db, "atividades"), where("ativo", "==", true), orderBy("nome"));
        const snapshot = await getDocs(q);
        activitiesListContainer.innerHTML = '';
        if (snapshot.empty) { activitiesListContainer.innerHTML = '<p>Nenhuma atividade encontrada.</p>'; return; }
        snapshot.forEach(doc => {
            const atividadeNome = doc.data().nome;
            const checkboxDiv = document.createElement('div');
            checkboxDiv.innerHTML = `<label><input type="checkbox" name="atividade" value="${atividadeNome}"> ${atividadeNome}</label>`;
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
        const dadosParaSalvar = { status: novoStatus, ultimaAtualizacao: serverTimestamp(), authUid: currentUser.uid, nome: nomeVoluntario, atividade: atividadesDoDia.join(', '), data: dataHoje };
        await setDoc(docRef, dadosParaSalvar, { merge: true });
        statusAtualVoluntario = novoStatus;
        if (feedbackElement) {
            feedbackElement.textContent = novoStatus === 'presente' ? `Presença confirmada.` : `Saída registrada.`;
            feedbackElement.style.color = novoStatus === 'presente' ? "green" : "#1565c0";
        }
    } catch (e) { console.error("Erro ao atualizar presença:", e); }
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

// --- EVENTOS ---
if(btnRegistrarPresenca) btnRegistrarPresenca.addEventListener('click', () => { carregarAtividadesNoModal(); modalOverlayAtividades.classList.add('visible'); });
if(closeModalAtividadesBtn) closeModalAtividadesBtn.addEventListener('click', () => { modalOverlayAtividades.classList.remove('visible'); });
if(modalOverlayAtividades) modalOverlayAtividades.addEventListener('click', (event) => { if (event.target === modalOverlayAtividades) { modalOverlayAtividades.classList.remove('visible'); } });

if(btnConfirmarPresenca) btnConfirmarPresenca.addEventListener('click', () => {
    const selecionadas = activitiesListContainer.querySelectorAll('input[type="checkbox"]:checked');
    if (selecionadas.length === 0) { alert("Por favor, selecione pelo menos uma atividade."); return; }
    atividadesDoDia = Array.from(selecionadas).map(cb => cb.value);
    modalOverlayAtividades.classList.remove('visible');
    if (monitorInterval) clearInterval(monitorInterval);
    checarLocalizacao();
    monitorInterval = setInterval(checarLocalizacao, 600000);
    btnRegistrarPresenca.disabled = true;
    btnRegistrarPresenca.textContent = "MONITORAMENTO ATIVO";
});

if(linkVerDetalhes) linkVerDetalhes.addEventListener('click', () => { preencherModalDetalhes(); modalOverlayDetalhes.classList.add('visible'); });
if(closeModalDetalhesBtn) closeModalDetalhesBtn.addEventListener('click', () => { modalOverlayDetalhes.classList.remove('visible'); });
if(modalOverlayDetalhes) modalOverlayDetalhes.addEventListener('click', (event) => { if (event.target === modalOverlayDetalhes) { modalOverlayDetalhes.classList.remove('visible'); } });

if(btnSair) btnSair.addEventListener('click', () => { if (confirm("Tem certeza que deseja sair?")) { signOut(auth); } });