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
const RAIO_EM_METROS = 40;
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
        return false; // Retorna falha
    }
    btnRegistrarPresenca.disabled = true;
    btnRegistrarPresenca.textContent = 'Verificando localização...';

    if (!navigator.geolocation) {
        alert("Geolocalização não é suportada pelo seu navegador.");
        btnRegistrarPresenca.disabled = false;
        btnRegistrarPresenca.textContent = 'Registrar Presença';
        return false; // Falha
    }

    // Retorna uma Promessa para que o 'submit' possa esperar
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
                            authUid: null,
                            voluntarioId: voluntarioParaRegistrar.id
                        }, { merge: true });

                        // A linha de salvar no localStorage foi MOVIDA para antes desta função

                        statusNome.textContent = voluntarioParaRegistrar.nome;
                        statusAtividades.textContent = atividadesSelecionadas.join(', ');
                        feedbackGeoRapido.textContent = `Presença confirmada a ${distancia.toFixed(0)} metros.`;
                        registroRapidoSection.classList.add('hidden');
                        statusRapidoSection.classList.remove('hidden');

                        resolve(true); // Sucesso

                    } catch (error) {
                        console.error("Erro ao registrar presença:", error);
                        alert("Ocorreu um erro ao salvar sua presença. Tente novamente.");
                        btnRegistrarPresenca.disabled = false;
                        btnRegistrarPresenca.textContent = 'Registrar Presença';
                        reject(error); // Falha
                    }
                } else {
                    alert(`Você está a ${distancia.toFixed(0)} metros de distância. Por favor, aproxime-se da casa para registrar a presença.`);
                    btnRegistrarPresenca.disabled = false;
                    btnRegistrarPresenca.textContent = 'Registrar Presença';
                    reject(new Error("Fora da área de geolocalização.")); // Falha
                }
            },
            (error) => {
                console.error("Erro de geolocalização:", error);
                let msgErro = "Não foi possível obter sua localização. Verifique as permissões do navegador e tente novamente.";
                if (error.code === error.PERMISSION_DENIED) {
                     msgErro = "Você negou a permissão de localização. Habilite-a nas configurações do navegador para registrar a presença.";
                } else if (error.code === error.POSITION_UNAVAILABLE) {
                     msgErro = "Informação de localização indisponível no momento.";
                } else if (error.code === error.TIMEOUT) {
                     msgErro = "Tempo esgotado ao tentar obter a localização.";
                }
                alert(msgErro);
                btnRegistrarPresenca.disabled = false;
                btnRegistrarPresenca.textContent = 'Registrar Presença';
                reject(error); // Falha
            }
        );
    });
}


async function habilitarNotificacoes() {
    // Esta é a chave VAPID que você tinha no seu arquivo (assumindo que seja a correta)
    const VAPID_PUBLIC_KEY = 'BHvM-GJJ64ePBfttwFiCghI9wqLK6PjN0U2aIBhYAQPI5CdnOFswB4cejXp3AHhgw-I6rJBANaxlgvjTRn463L4'; 

    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
        return alert("Seu navegador não suporta notificações push.");
    }

    try {
        const permissao = await Notification.requestPermission();
        if (permissao !== 'granted') {
            return alert("Permissão para notificações não concedida.");
        }

        const registration = await navigator.serviceWorker.ready;
        let subscription = await registration.pushManager.getSubscription(); 

        if (subscription) {
             console.log("Inscrição antiga encontrada. Removendo...");
             await subscription.unsubscribe();
             console.log("Inscrição antiga removida.");
        }
        
        console.log("Criando nova inscrição com a chave VAPID atualizada...");
        subscription = await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: VAPID_PUBLIC_KEY
        });
        
        const subscriptionId = btoa(subscription.endpoint).replace(/=/g, '');
        await setDoc(doc(db, "inscricoes", subscriptionId), subscription.toJSON());

        alert("Notificações ativadas com sucesso!");
        if(btnAtivarNotificacoes) btnAtivarNotificacoes.style.display = 'none'; // Esconde o botão após sucesso

    } catch (error) {
        console.error("Erro ao se inscrever para notificações:", error);
        alert("Ocorreu um erro ao ativar as notificações.");
    }
}


// --- INICIALIZAÇÃO DA PÁGINA ---

carregarMural();

// Carrega o nome salvo ao iniciar a página
(function carregarNomeSalvo() {
    if (nomeInput) {
        try {
            const nomeSalvo = localStorage.getItem(LOCAL_STORAGE_KEY_NOME);
            if (nomeSalvo) {
                nomeInput.value = nomeSalvo;
                console.log("Nome carregado do localStorage:", nomeSalvo);
            }
        } catch (e) {
            console.warn("Não foi possível ler o nome do localStorage:", e);
        }
    }
})();


if (formLogin) {
    formLogin.addEventListener('submit', (event) => {
        event.preventDefault();
        const emailInput = document.getElementById('email-login');
        const senhaInput = document.getElementById('senha-login');
        const email = emailInput ? emailInput.value : '';
        const senha = senhaInput ? senhaInput.value : '';

        if (!email || !senha) { return alert("Por favor, preencha email e senha."); }

        const btnEntrar = formLogin.querySelector('button[type="submit"]');
        if(btnEntrar) btnEntrar.disabled = true;

        signInWithEmailAndPassword(auth, email, senha)
            .then(() => { window.location.href = '/meu-cepat.html'; })
            .catch((error) => {
                console.error("Erro de login:", error.code);
                alert("Email ou senha incorretos. Tente novamente.");
                 if(btnEntrar) btnEntrar.disabled = false;
            });
    });
}

if (linkEsqueciSenha) {
    linkEsqueciSenha.addEventListener('click', (event) => {
        event.preventDefault(); 

        const email = prompt("Digite seu endereço de email cadastrado para enviarmos o link de redefinição de senha:");

        if (email) { 
             sendPasswordResetEmail(auth, email)
                .then(() => {
                    alert("Email de redefinição de senha enviado com sucesso para " + email + ". Verifique sua caixa de entrada (e spam).");
                })
                .catch((error) => {
                    console.error("Erro ao enviar email de redefinição:", error);
                    let mensagemErro = "Ocorreu um erro ao enviar o email de redefinição. Tente novamente.";
                    if (error.code === 'auth/user-not-found') {
                        mensagemErro = "Este endereço de email não foi encontrado em nosso sistema.";
                    } else if (error.code === 'auth/invalid-email') {
                         mensagemErro = "O endereço de email fornecido não é válido.";
                    }
                    alert(mensagemErro);
                });
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
            if (snapshot.empty) {
                 atividadesContainer.innerHTML = '<p>Nenhuma atividade cadastrada.</p>';
                 return;
            }
            snapshot.forEach(doc => {
                const atividade = doc.data().nome;
                const div = document.createElement('div');
                const inputId = `atividade-${doc.id}`;
                div.innerHTML = `<input type="checkbox" name="atividade" value="${atividade}" id="${inputId}"> <label for="${inputId}">${atividade}</label>`;
                atividadesContainer.appendChild(div);
            });
        } catch (e) { 
            console.error("Erro ao buscar atividades:", e); 
            if(atividadesContainer) atividadesContainer.innerHTML = '<p style="color:red;">Erro ao carregar atividades.</p>';
        }
    })();

    if(btnSelecionarAtividades && atividadesWrapper){
        btnSelecionarAtividades.addEventListener('click', () => {
            atividadesWrapper.style.display = atividadesWrapper.style.display === 'block' ? 'none' : 'block';
        });
    }


    formPresencaRapida.addEventListener('submit', async (event) => {
        event.preventDefault();
        const nomeDigitado = nomeInput ? nomeInput.value.trim() : '';
        const atividadesSelecionadasNode = document.querySelectorAll('#form-presenca-rapida input[name="atividade"]:checked');
        const atividadesSelecionadas = Array.from(atividadesSelecionadasNode).map(cb => cb.value);

        if (!nomeDigitado || nomeDigitado.split(' ').length < 2) { return alert("Por favor, digite seu nome completo."); }
        if (atividadesSelecionadas.length === 0) { return alert("Por favor, selecione pelo menos uma atividade."); }

        try {
            const voluntariosSnapshot = await getDocs(query(collection(db, "voluntarios")));
            const listaDeVoluntarios = voluntariosSnapshot.docs.map(d => ({ id: d.id, ...d.data() }));

            const fuse = new Fuse(listaDeVoluntarios, {
                 keys: ['nome_normalizado', 'nome'],
                 includeScore: true,
                 threshold: 0.35 
             });

             const nomeNormalizadoBusca = normalizarString(nomeDigitado);
            const resultados = fuse.search(nomeNormalizadoBusca);

            let voluntarioParaRegistrar = { id: null, nome: nomeDigitado };
            let encontrado = false;

            if (resultados.length > 0) {
                const melhorResultado = resultados[0].item;
                if (normalizarString(melhorResultado.nome) === nomeNormalizadoBusca) {
                     console.log("Voluntário encontrado por correspondência exata (normalizada):", melhorResultado.nome);
                     voluntarioParaRegistrar = melhorResultado;
                     if(nomeInput) nomeInput.value = melhorResultado.nome;
                     encontrado = true;
                } else if (resultados[0].score < 0.3) {
                    if (confirm(`Encontramos um nome parecido: "${melhorResultado.nome}".\n\nÉ você?`)) {
                        voluntarioParaRegistrar = melhorResultado;
                        if(nomeInput) nomeInput.value = melhorResultado.nome;
                         encontrado = true;
                    } else {
                        // ### AJUSTE: Se o usuário clicar em "Cancelar", para a execução ###
                        alert("Registro cancelado. Por favor, digite seu nome completo exatamente como no cadastro.");
                        return; // Impede que o código continue e salve o nome errado
                    }
                }
            }

            if (!encontrado) {
                const nomeNormalizado = normalizarString(voluntarioParaRegistrar.nome);
                console.log(`Criando novo voluntário órfão: ${voluntarioParaRegistrar.nome} (Normalizado: ${nomeNormalizado})`);
                const novoVoluntarioDoc = await addDoc(collection(db, "voluntarios"), {
                    nome: voluntarioParaRegistrar.nome,
                    nome_normalizado: nomeNormalizado,
                    statusVoluntario: 'ativo',
                    criadoEm: serverTimestamp()
                });
                voluntarioParaRegistrar.id = novoVoluntarioDoc.id;
            }

            // ### AJUSTE: Salva o nome (corrigido ou novo) no localStorage ANTES da geolocalização ###
            try {
                localStorage.setItem(LOCAL_STORAGE_KEY_NOME, voluntarioParaRegistrar.nome);
                console.log("Nome salvo no localStorage (antes do geo):", voluntarioParaRegistrar.nome);
            } catch (e) {
                console.warn("Não foi possível salvar o nome no localStorage:", e);
            }
            // ### FIM DO AJUSTE ###

            await registrarPresencaComGeolocalizacao(voluntarioParaRegistrar, atividadesSelecionadas);

        } catch (error) {
            console.error("ERRO CRÍTICO no registro rápido:", error);
            if (error.message.includes("Fora da área") || (error.code && (error.code === error.PERMISSION_DENIED || error.code === error.POSITION_UNAVAILABLE || error.code === error.TIMEOUT))) {
                 // Erro de geolocalização já tratado, não mostra alerta duplicado
            } else {
                 alert("Ocorreu um erro crítico. Verifique o console para mais detalhes.");
            }
            
            if(btnRegistrarPresenca) {
                btnRegistrarPresenca.disabled = false;
                btnRegistrarPresenca.textContent = 'Registrar Presença';
            }
        }
    });
}

if (btnSairRapido && formPresencaRapida && atividadesWrapper && statusRapidoSection && registroRapidoSection && btnRegistrarPresenca) {
    btnSairRapido.addEventListener('click', () => {
        try {
            localStorage.removeItem(LOCAL_STORAGE_KEY_NOME);
            console.log("Nome removido do localStorage.");
        } catch (e) {
            console.warn("Não foi possível limpar o nome do localStorage:", e);
        }

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
    
    // Nova função auxiliar para verificar a inscrição E a permissão
    async function verificarInscricaoAtual() {
        if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
            if (btnAtivarNotificacoes) btnAtivarNotificacoes.style.display = 'none';
            return; // Navegador não suporta push
        }

        try {
            const registration = await navigator.serviceWorker.ready;
            const subscription = await registration.pushManager.getSubscription();
            
            if (subscription) {
                // O usuário tem uma inscrição ativa
                console.log("Usuário já tem uma inscrição de notificação ativa.");
                if (btnAtivarNotificacoes) btnAtivarNotificacoes.style.display = 'none';
            } else {
                // O usuário NÃO tem inscrição. Verifica a *permissão*
                const permissionStatus = await navigator.permissions.query({name:'push', userVisibleOnly:true});
                if (permissionStatus.state === 'denied') {
                    // Permissão foi negada, esconde o botão (não podemos pedir de novo)
                    if (btnAtivarNotificacoes) btnAtivarNotificacoes.style.display = 'none';
                    console.warn("Permissão de notificação foi negada pelo usuário.");
                } else {
                    // Permissão é 'granted' (mas sem inscrição) ou 'prompt'
                    // MOSTRA O BOTÃO para (re)inscrever
                    if (btnAtivarNotificacoes) btnAtivarNotificacoes.style.display = 'block'; // Mostra o botão
                    console.log("Usuário sem inscrição, botão de ativar visível.");
                }
            }
        } catch (error) {
            console.error("Erro ao verificar inscrição de push:", error);
            if (btnAtivarNotificacoes) btnAtivarNotificacoes.style.display = 'none'; // Esconde por segurança
        }
    }

    // Chama a nova função de verificação ao carregar a página
    verificarInscricaoAtual();
}