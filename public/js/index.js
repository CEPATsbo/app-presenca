import { initializeApp } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-app.js";
import { getAuth, signInWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-auth.js";
import { getFirestore, collection, query, where, getDocs, addDoc, serverTimestamp, setDoc, doc, getDoc, orderBy } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js";
import Fuse from 'https://cdn.jsdelivr.net/npm/fuse.js@7.0.0/dist/fuse.mjs';

const firebaseConfig = {
    apiKey: "AIzaSyBV7RPjk3cFTqL-aIpflJcUojKg1ZXMLuU",
    authDomain: "voluntarios-ativos---cepat.firebaseapp.com",
    projectId: "voluntarios-ativos---cepat",
    storageBucket: "voluntarios-ativos---cepat.appspot.com",
    messagingSenderId: "66122858261",
    appId: "1:66122858261:web:7fa21f1805463b5c08331c"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// --- LÓGICA DO PORTAL DE LOGIN ---
const formLogin = document.getElementById('form-login-portal');
if (formLogin) {
    formLogin.addEventListener('submit', (event) => {
        event.preventDefault();
        const email = document.getElementById('email-login').value;
        const senha = document.getElementById('senha-login').value;
        if (!email || !senha) { return alert("Por favor, preencha email e senha."); }
        signInWithEmailAndPassword(auth, email, senha)
            .then(() => { window.location.href = '/painel.html'; })
            .catch((error) => {
                console.error("Erro de login:", error.code);
                alert("Email ou senha incorretos. Tente novamente.");
            });
    });
}

// --- LÓGICA DO REGISTRO DE PRESENÇA RÁPIDO (CLÁSSICO) ---
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

async function buscarAtividadesDoFirestore() {
    if (!atividadesContainer) return;
    try {
        const q = query(collection(db, "atividades"), where("ativo", "==", true), orderBy("nome"));
        const snapshot = await getDocs(q);
        atividadesContainer.innerHTML = '';
        snapshot.forEach(doc => {
            const atividade = doc.data().nome;
            const div = document.createElement('div');
            div.innerHTML = `<input type="checkbox" name="atividade" value="${atividade}" id="classic-${atividade}"> <label for="classic-${atividade}">${atividade}</label>`;
            atividadesContainer.appendChild(div);
        });
    } catch (e) { console.error("Erro ao buscar atividades:", e); }
}

if (btnSelecionarAtividades) {
    btnSelecionarAtividades.addEventListener('click', () => {
        atividadesWrapper.style.display = atividadesWrapper.style.display === 'block' ? 'none' : 'block';
    });
    buscarAtividadesDoFirestore();
}

function getDataDeHojeSP() {
    const formatador = new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'America/Sao_Paulo' });
    return formatador.format(new Date());
}

if (formPresencaRapida) {
    formPresencaRapida.addEventListener('submit', async (event) => {
        event.preventDefault();
        const nomeDigitado = nomeInput.value.trim();
        const atividadesSelecionadasNode = document.querySelectorAll('#form-presenca-rapida input[name="atividade"]:checked');
        const atividadesSelecionadas = Array.from(atividadesSelecionadasNode).map(cb => cb.value);

        if (!nomeDigitado || nomeDigitado.split(' ').length < 2) { return alert("Por favor, digite seu nome completo (nome e sobrenome)."); }
        if (atividadesSelecionadas.length === 0) { return alert("Por favor, selecione pelo menos uma atividade."); }

        const btnSubmit = formPresencaRapida.querySelector('button[type="submit"]');
        btnSubmit.disabled = true;
        btnSubmit.textContent = 'Registrando...';

        try {
            const voluntariosSnapshot = await getDocs(query(collection(db, "voluntarios")));
            const listaDeVoluntarios = voluntariosSnapshot.docs.map(d => ({ id: d.id, ...d.data() }));
            const fuse = new Fuse(listaDeVoluntarios, { keys: ['nome'], includeScore: true, threshold: 0.45 });
            const resultados = fuse.search(nomeDigitado);

            let nomeFinalParaRegistro = nomeDigitado;
            if (resultados.length > 0) {
                const melhorResultado = resultados[0].item.nome;
                if (nomeDigitado.toLowerCase() !== melhorResultado.toLowerCase()) {
                    if (confirm(`Encontramos um nome parecido: "${melhorResultado}".\n\nÉ você?`)) { nomeFinalParaRegistro = melhorResultado; }
                } else { nomeFinalParaRegistro = melhorResultado; }
            }

            const dataHoje = getDataDeHojeSP();
            const presencaId = `${dataHoje}_${nomeFinalParaRegistro.replace(/\s+/g, '_')}`;
            const docRef = doc(db, "presencas", presencaId);
            await setDoc(docRef, { nome: nomeFinalParaRegistro, atividade: atividadesSelecionadas.join(', '), data: dataHoje, primeiroCheckin: serverTimestamp(), ultimaAtualizacao: serverTimestamp(), status: 'presente', authUid: null }, { merge: true });

            statusNome.textContent = nomeFinalParaRegistro;
            statusAtividades.textContent = atividadesSelecionadas.join(', ');
            registroRapidoSection.classList.add('hidden');
            statusRapidoSection.classList.remove('hidden');

        } catch (error) {
            console.error("ERRO CRÍTICO no registro rápido:", error);
            alert("Ocorreu um erro crítico ao registrar a presença. Tente novamente.");
        } finally {
            btnSubmit.disabled = false;
            btnSubmit.textContent = 'Registrar Presença';
        }
    });
}

if (btnSairRapido) {
    btnSairRapido.addEventListener('click', () => {
        formPresencaRapida.reset();
        atividadesWrapper.style.display = 'none';
        statusRapidoSection.classList.add('hidden');
        registroRapidoSection.classList.remove('hidden');
    });
}