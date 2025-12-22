import { initializeApp } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-app.js";
import { getFirestore, collection, addDoc, onSnapshot, query, orderBy, serverTimestamp } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js";
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

console.log("Sistema Cáritas: Iniciando proteção de página...");

// Proteção de acesso
protegerPagina(['super-admin', 'diretor', 'tesoureiro', 'entrevistador', 'recepcionista', 'conselheiro', 'caritas'])
    .then(user => {
        console.log("Acesso concedido para:", user.email);
        inicializarPagina(user);
    })
    .catch(error => {
        console.error("Erro de acesso:", error);
        window.location.href = '/dashboard.html';
    });

function inicializarPagina(user) {
    const ui = {
        lista: document.getElementById('lista-familias'),
        modal: document.getElementById('modal-familia'),
        form: document.getElementById('form-familia'),
        btnNovo: document.getElementById('btn-abrir-modal'),
        btnFechar: document.getElementById('btn-fechar-modal'),
        btnAddFilho: document.getElementById('btn-add-filho'),
        listaFilhos: document.getElementById('lista-filhos-inputs'),
        checkRua: document.getElementById('situacao-rua-checkbox'),
        inputEndereco: document.getElementById('familia-endereco')
    };

    // --- LOG PARA DEBUG ---
    if (!ui.btnNovo) console.error("ERRO: Botão +Nova Família não encontrado no HTML!");

    // --- LÓGICA DO MODAL ---
    ui.btnNovo.onclick = () => {
        console.log("Abrindo modal de nova família...");
        ui.form.reset();
        ui.listaFilhos.innerHTML = '';
        ui.modal.style.display = 'flex'; // Força a exibição
    };

    ui.btnFechar.onclick = () => {
        ui.modal.style.display = 'none';
    };

    // Fecha ao clicar fora do modal
    window.onclick = (event) => {
        if (event.target == ui.modal) ui.modal.style.display = 'none';
    };

    ui.checkRua.onchange = () => {
        ui.inputEndereco.disabled = ui.checkRua.checked;
        if(ui.checkRua.checked) ui.inputEndereco.value = "EM SITUAÇÃO DE RUA";
        else ui.inputEndereco.value = "";
    };

    ui.btnAddFilho.onclick = () => {
        const div = document.createElement('div');
        div.className = 'filho-item';
        div.innerHTML = `
            <input type="text" placeholder="Nome do filho" class="filho-nome" required>
            <input type="date" class="filho-nasc" required>
            <input type="text" placeholder="Tam." class="filho-tam" style="width: 50px;">
            <button type="button" class="btn-remove-filho"><i class="fas fa-times"></i></button>
        `;
        div.querySelector('.btn-remove-filho').onclick = () => div.remove();
        ui.listaFilhos.appendChild(div);
    };

    ui.form.onsubmit = async (e) => {
        e.preventDefault();
        console.log("Salvando família...");
        
        const filhos = Array.from(document.querySelectorAll('.filho-item')).map(item => ({
            nome: item.querySelector('.filho-nome').value,
            nascimento: item.querySelector('.filho-nasc').value,
            tamanho: item.querySelector('.filho-tam').value
        }));

        const novaFamilia = {
            responsavel1: { 
                nome: document.getElementById('resp1-nome').value, 
                nascimento: document.getElementById('resp1-nasc').value, 
                tipo: document.getElementById('resp1-tipo').value 
            },
            contato: {
                telefone: document.getElementById('familia-tel').value,
                endereco: ui.inputEndereco.value,
                emSituacaoDeRua: ui.checkRua.checked
            },
            filhos: filhos,
            statusGeral: 'Ativa',
            cadastradoEm: serverTimestamp()
        };

        try {
            await addDoc(collection(db, "familiasAssistidas"), novaFamilia);
            await addDoc(collection(db, "logs_auditoria"), {
                timestamp: serverTimestamp(),
                usuarioId: user.uid,
                acao: "CADASTRO_FAMILIA",
                detalhes: `Família de ${novaFamilia.responsavel1.nome} cadastrada.`,
                modulo: "ASSISTÊNCIA SOCIAL"
            });
            alert("Família cadastrada!");
            ui.modal.style.display = 'none';
        } catch (error) {
            console.error("Erro ao salvar:", error);
            alert("Erro: " + error.message);
        }
    };

    // Escutar dados
    onSnapshot(query(collection(db, "familiasAssistidas"), orderBy("cadastradoEm", "desc")), (snapshot) => {
        console.log("Dados recebidos do Firestore:", snapshot.size, "famílias.");
        ui.lista.innerHTML = snapshot.docs.map(doc => {
            const f = doc.data();
            return `
                <div class="familia-card">
                    <div class="familia-info">
                        <h3>${f.responsavel1.nome}</h3>
                        <p>${f.contato.telefone} | ${f.filhos.length} dependentes</p>
                    </div>
                </div>
            `;
        }).join('');
    }, (error) => {
        console.error("Erro no Snapshot (Permissões?):", error);
        ui.lista.innerHTML = `<p style="color:red">Erro ao carregar dados. Verifique as regras do Firestore.</p>`;
    });
}