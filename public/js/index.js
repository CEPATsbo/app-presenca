import { initializeApp } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, sendPasswordResetEmail } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-auth.js";
import { getFirestore, collection, query, where, getDocs, serverTimestamp, setDoc, doc, orderBy, getDoc, addDoc } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js";
import Fuse from 'https://cdn.jsdelivr.net/npm/fuse.js@7.0.0/dist/fuse.mjs';

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
const RAIO_EM_METROS = 70;
const LOCAL_STORAGE_KEY_NOME = 'cepatPresencaNome';

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// ===================================================================
// --- FUNÇÃO DE NORMALIZAÇÃO ---
// ===================================================================
function normalizarString(str) {
    if (!str) return "";
    return str
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "");
}
// ===================================================================

const muralContainer = document.getElementById('mural-container');
const formLogin = document.getElementById('form-login-portal');
const formPresencaRapida = document.getElementById('form-presenca-rapida');
const nomeInput = document.getElementById('nome-presenca');
const btnSelecionarAtividades = document.getElementById('btn-selecionar-atividades');
const atividadesWrapper = document.getElementById('atividades-wrapper');
const atividadesContainer = document.getElementById('atividades-container');
const registroRapidoSection = document.getElementById('registro-rapido-section');
const statusRapidoSection = document.getElementById('status-rapido-section');
const statusNome = document.getElementById('status-nome');
const statusAtividades = document.getElementById('status-atividades');
const btnSairRapido = document.getElementById('btn-sair-rapido');
const feedbackGeoRapido = document.getElementById('feedback-geolocalizacao-rapido');
const btnRegistrarPresenca = document.getElementById('btn-registrar-presenca');
const btnAtivarNotificacoes = document.getElementById('btn-ativar-notificacoes');
const linkEsqueciSenha = document.getElementById('link-esqueci-senha');


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

async function registrarPresencaComGeolocalizacao(voluntarioParaRegistrar, atividadesSelecionadas) {
    if (!btnRegistrarPresenca || !registroRapidoSection || !statusRapidoSection || !statusNome || !statusAtividades || !feedbackGeoRapido) {
        console.error("Elementos do DOM ausentes para registro de presença.");
        return false;
    }
    btnRegistrarPresenca.disabled = true;
    btnRegistrarPresenca.textContent = 'Verificando localização...';

    if (!navigator.geolocation) {
        alert("Geolocalização não é suportada pelo seu navegador.");
        btnRegistrarPresenca.disabled = false;
        btnRegistrarPresenca.textContent = 'Registrar Presença';
        return false;
    }

    return new Promise((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(
            async (position) => {
                const distancia = getDistance(position.coords.latitude, position.coords.longitude, CASA_ESPIRITA_LAT, CASA_ESPIRITA_LON);

                if (distancia <= RAIO_EM_METROS) {
                    try {
                        btnRegistrarPresenca.textContent = 'Registrando...';
                        
                        const dataHoje = getDataDeHojeSP();
                        const presencaId = `${dataHoje}_${voluntarioParaRegistrar.nome.replace(/\s+/g, '_')}`;
                        const docRef = doc(db, "presencas", presencaId);

                        await setDoc(docRef, { 
                            nome: voluntarioParaRegistrar.nome, 
                            atividade: atividadesSelecionadas.join(', '), 
                            data: dataHoje, 
                            primeiroCheckin: serverTimestamp(), 
                            ultimaAtualizacao: serverTimestamp(), 
                            status: 'presente',
                            authUid: voluntarioParaRegistrar.authUid || null, // Garante que a presença herde o UID se houver
                            voluntarioId: voluntarioParaRegistrar.id
                        }, { merge: true });

                        statusNome.textContent = voluntarioParaRegistrar.nome;
                        statusAtividades.textContent = atividadesSelecionadas.join(', ');
                        feedbackGeoRapido.textContent = `Presença confirmada a ${distancia.toFixed(0)} metros.`;
                        registroRapidoSection.classList.add('hidden');
                        statusRapidoSection.classList.remove('hidden');

                        resolve(true);

                    } catch (error) {
                        console.error("Erro ao registrar presença:", error);
                        alert("Ocorreu um erro ao salvar sua presença. Tente novamente.");
                        btnRegistrarPresenca.disabled = false;
                        btnRegistrarPresenca.textContent = 'Registrar Presença';
                        reject(error);
                    }
                } else {
                    alert(`Você está a ${distancia.toFixed(0)} metros de distância. Por favor, aproxime-se da casa para registrar a presença.`);
                    btnRegistrarPresenca.disabled = false;
                    btnRegistrarPresenca.textContent = 'Registrar Presença';
                    reject(new Error("Fora da área de geolocalização."));
                }
            },
            (error) => {
                console.error("Erro de geolocalização:", error);
                let msgErro = "Não foi possível obter sua localização.";
                alert(msgErro);
                btnRegistrarPresenca.disabled = false;
                btnRegistrarPresenca.textContent = 'Registrar Presença';
                reject(error);
            }
        );
    });
}


async function habilitarNotificacoes() {
    const VAPID_PUBLIC_KEY = 'BHvM-GJJ64ePBfttwFiCghI9wqLK6PjN0U2aIBhYAQPI5CdnOFswB4cejXp3AHhgw-I6rJBANaxlgvjTRn463L4'; 

    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
        return alert("Seu navegador não suporta notificações push.");
    }

    try {
        const permissao = await Notification.requestPermission();
        if (permissao !== 'granted') return alert("Permissão não concedida.");

        const registration = await navigator.serviceWorker.ready;
        let subscription = await registration.pushManager.getSubscription(); 

        if (subscription) await subscription.unsubscribe();
        
        subscription = await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: VAPID_PUBLIC_KEY
        });
        
        const subscriptionId = btoa(subscription.endpoint).replace(/=/g, '');
        await setDoc(doc(db, "inscricoes", subscriptionId), subscription.toJSON());

        alert("Notificações ativadas!");
        if(btnAtivarNotificacoes) btnAtivarNotificacoes.style.display = 'none';

    } catch (error) {
        console.error("Erro notificações:", error);
        alert("Erro ao ativar notificações.");
    }
}


carregarMural();

(function carregarNomeSalvo() {
    if (nomeInput) {
        try {
            const nomeSalvo = localStorage.getItem(LOCAL_STORAGE_KEY_NOME);
            if (nomeSalvo) nomeInput.value = nomeSalvo;
        } catch (e) { console.warn("Erro localStorage:", e); }
    }
})();


if (formLogin) {
    formLogin.addEventListener('submit', (event) => {
        event.preventDefault();
        const email = document.getElementById('email-login')?.value || '';
        const senha = document.getElementById('senha-login')?.value || '';

        if (!email || !senha) return alert("Preencha email e senha.");

        const btnEntrar = formLogin.querySelector('button[type="submit"]');
        if(btnEntrar) btnEntrar.disabled = true;

        signInWithEmailAndPassword(auth, email, senha)
            .then(() => { window.location.href = '/meu-cepat.html'; })
            .catch((error) => {
                alert("Email ou senha incorretos.");
                if(btnEntrar) btnEntrar.disabled = false;
            });
    });
}

if (linkEsqueciSenha) {
    linkEsqueciSenha.addEventListener('click', (event) => {
        event.preventDefault(); 
        const email = prompt("Digite seu email para redefinição:");
        if (email) { 
             sendPasswordResetEmail(auth, email)
                .then(() => alert("Email enviado!"))
                .catch(() => alert("Erro ao enviar email."));
        }
    });
}


if (formPresencaRapida) {
    (async function buscarAtividadesDoFirestore() {
        if (!atividadesContainer) return;
        try {
            const q = query(collection(db, "atividades"), where("ativo", "==", true), orderBy("nome"));
            const snapshot = await getDocs(q);
            atividadesContainer.innerHTML = ''; 
            if (snapshot.empty) return;
            snapshot.forEach(doc => {
                const atividade = doc.data().nome;
                const div = document.createElement('div');
                div.innerHTML = `<input type="checkbox" name="atividade" value="${atividade}" id="atv-${doc.id}"> <label for="atv-${doc.id}">${atividade}</label>`;
                atividadesContainer.appendChild(div);
            });
        } catch (e) { console.error("Erro atividades:", e); }
    })();

    if(btnSelecionarAtividades && atividadesWrapper){
        btnSelecionarAtividades.addEventListener('click', () => {
            atividadesWrapper.style.display = atividadesWrapper.style.display === 'block' ? 'none' : 'block';
        });
    }

    formPresencaRapida.addEventListener('submit', async (event) => {
        event.preventDefault();
        const nomeDigitado = nomeInput?.value.trim() || '';
        const atividadesSelecionadasNode = document.querySelectorAll('#form-presenca-rapida input[name="atividade"]:checked');
        const atividadesSelecionadas = Array.from(atividadesSelecionadasNode).map(cb => cb.value);

        if (nomeDigitado.split(' ').length < 2) return alert("Digite seu nome completo.");
        if (atividadesSelecionadas.length === 0) return alert("Selecione uma atividade.");

        try {
            if(btnRegistrarPresenca) {
                btnRegistrarPresenca.disabled = true;
                btnRegistrarPresenca.textContent = 'Processando...';
            }
            
            const voluntariosSnapshot = await getDocs(query(collection(db, "voluntarios")));
            const listaDeVoluntarios = voluntariosSnapshot.docs.map(d => ({ id: d.id, ...d.data() }));

            const fuse = new Fuse(listaDeVoluntarios, {
                 keys: ['nome_normalizado', 'nome'],
                 includeScore: true,
                 threshold: 0.4 
             });

            const nomeNormalizadoBusca = normalizarString(nomeDigitado);
            const resultados = fuse.search(nomeNormalizadoBusca);

            let voluntarioParaRegistrar = { id: null, nome: nomeDigitado, authUid: null };
            let encontrado = false;

            if (resultados.length > 0) {
                const melhorResultado = resultados[0].item;
                const score = resultados[0].score;

                if (normalizarString(melhorResultado.nome) === nomeNormalizadoBusca) {
                     voluntarioParaRegistrar = melhorResultado;
                     if(nomeInput) nomeInput.value = melhorResultado.nome;
                     encontrado = true;
                } 
                else if (score < 0.45) {
                    if (confirm(`Você quis dizer: "${melhorResultado.nome}"?`)) {
                        voluntarioParaRegistrar = melhorResultado;
                        if(nomeInput) nomeInput.value = melhorResultado.nome;
                        encontrado = true;
                    } else {
                        btnRegistrarPresenca.disabled = false;
                        btnRegistrarPresenca.textContent = 'Registrar Presença';
                        return;
                    }
                }
            }

            if (!encontrado) {
                const nomeNormalizado = normalizarString(voluntarioParaRegistrar.nome);
                const novoVoluntarioDoc = await addDoc(collection(db, "voluntarios"), {
                    nome: voluntarioParaRegistrar.nome,
                    nome_normalizado: nomeNormalizado,
                    statusVoluntario: 'ativo',
                    authUid: null, // MUDANÇA ESSENCIAL: Garante que o campo exista para o Cadastro encontrar
                    criadoEm: serverTimestamp()
                });
                voluntarioParaRegistrar.id = novoVoluntarioDoc.id;
            }

            try {
                localStorage.setItem(LOCAL_STORAGE_KEY_NOME, voluntarioParaRegistrar.nome);
            } catch (e) {}

            await registrarPresencaComGeolocalizacao(voluntarioParaRegistrar, atividadesSelecionadas);

        } catch (error) {
            console.error("Erro crítico:", error);
            alert("Erro ao processar. Tente novamente.");
            if(btnRegistrarPresenca) { 
                btnRegistrarPresenca.disabled = false;
                btnRegistrarPresenca.textContent = 'Registrar Presença';
            }
        }
    });
}

if (btnSairRapido) {
    btnSairRapido.addEventListener('click', () => {
        localStorage.removeItem(LOCAL_STORAGE_KEY_NOME);
        formPresencaRapida.reset();
        atividadesWrapper.style.display = 'none';
        statusRapidoSection.classList.add('hidden');
        registroRapidoSection.classList.remove('hidden');
        btnRegistrarPresenca.disabled = false;
        btnRegistrarPresenca.textContent = 'Registrar Presença';
        if (feedbackGeoRapido) feedbackGeoRapido.textContent = '';
    });
}

if (btnAtivarNotificacoes) {
    btnAtivarNotificacoes.addEventListener('click', habilitarNotificacoes);
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
        btnAtivarNotificacoes.style.display = 'none';
    } else {
        btnAtivarNotificacoes.style.display = 'block'; 
    }
}