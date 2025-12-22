import { initializeApp } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-app.js";
import { getFirestore, collection, addDoc, getDocs, query, where, orderBy, serverTimestamp, Timestamp } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js";
import { protegerPagina } from '/auth.js';

const firebaseConfig = {
    apiKey: "AIzaSyBV7RPjk3cFTqL-aIpflJcUojKg1ZXMLuU",
    authDomain: "voluntarios-ativos---cepat.firebaseapp.com",
    projectId: "voluntarios-ativos---cepat",
    storageBucket: "voluntarios-ativos---cepat.firebasestorage.app",
    messagingSenderId: "66122858261",
    appId: "1:66122858261:web:7fa21f1805463b5c08331c"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

protegerPagina(['super-admin', 'diretor', 'tesoureiro', 'entrevistador', 'recepcionista', 'conselheiro', 'caritas'])
    .then(user => inicializarPlanner(user))
    .catch(() => window.location.href = '/dashboard.html');

async function inicializarPlanner(user) {
    console.log("Iniciando Planner...");
    const inputData = document.getElementById('data-trabalho');
    const inputMes = document.getElementById('mes-referencia');
    const form = document.getElementById('form-escala');

    try {
        const hoje = new Date();
        let dataSugerida = calcularTerceiroDomingo(hoje.getMonth(), hoje.getFullYear());
        
        // Ajuste para não dar erro de fuso horário no input
        const offset = dataSugerida.getTimezoneOffset();
        dataSugerida = new Date(dataSugerida.getTime() - (offset * 60 * 1000));
        inputData.value = dataSugerida.toISOString().split('T')[0];
        
        atualizarMesReferencia(dataSugerida);
    } catch (e) {
        console.error("Erro ao definir data inicial:", e);
    }

    await carregarVoluntarios();

    form.onsubmit = async (e) => {
        e.preventDefault();
        // Lógica de salvar (Igual à anterior)
    };
}

function calcularTerceiroDomingo(mes, ano) {
    let data = new Date(ano, mes, 1);
    let domingos = 0;
    while (domingos < 3) {
        if (data.getDay() === 0) {
            domingos++;
            if (domingos === 3) return data;
        }
        data.setDate(data.getDate() + 1);
    }
    return data;
}

function atualizarMesReferencia(data) {
    const meses = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
    document.getElementById('mes-referencia').value = `${meses[data.getMonth()]} / ${data.getFullYear()}`;
}

async function carregarVoluntarios() {
    console.log("Carregando voluntários para escala...");
    const selects = document.querySelectorAll('.select-voluntario');
    try {
        const q = query(collection(db, "voluntarios"), where("statusVoluntario", "==", "ativo"), orderBy("nome"));
        const snap = await getDocs(q);
        let options = '<option value="">Selecione...</option>';
        snap.forEach(doc => { options += `<option value="${doc.id}">${doc.data().nome}</option>`; });
        selects.forEach(s => s.innerHTML = options);
    } catch (error) {
        console.error("Erro ao carregar voluntários:", error);
    }
}