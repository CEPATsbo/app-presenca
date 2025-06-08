// Garante que o script só rode depois que a página HTML for totalmente carregada
document.addEventListener('DOMContentLoaded', () => {
    console.log("Página carregada. Iniciando script de teste.");

    /*
    // PARTE DO FIREBASE TEMPORARIAMENTE DESATIVADA PARA TESTE
    // =================================================================
    const firebaseConfig = {
        // As chaves estariam aqui...
    };
    // =================================================================

    import { initializeApp } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-app.js";
    import { getFirestore, doc, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js";

    const app = initializeApp(firebaseConfig);
    const db = getFirestore(app);
    */

    // --- LISTA DE ATIVIDADES ---
    const listaDeAtividades = [
        "Recepção/Acolhimento", "Passe de Harmonização", "Apoio", "Biblioteca", 
        "Entrevistas", "Encaminhamento", "Câmaras de Passe", "Diretoria", 
        "Preleção", "Música/Coral", "Evangelização infantil", "Mídias digitais"
    ];

    // Elementos da página
    const loginArea = document.getElementById('login-area');
    const statusArea = document.getElementById('status-area');
    const btnRegistrar = document.getElementById('btn-registrar');
    const atividadeContainer = document.getElementById('atividade-container');

    // Função para criar os checkboxes
    function criarCheckboxesDeAtividade() {
        if(!atividadeContainer) return;
        atividadeContainer.innerHTML = ''; // Limpa antes de adicionar
        listaDeAtividades.sort().forEach(atividade => {
            const div = document.createElement('div');
            div.className = 'checkbox-item';
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.id = atividade.replace(/\s+/g, '-');
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

    // --- LÓGICA DO BOTÃO SEM FIREBASE E SEM GEOLOCALIZAÇÃO ---
    if (btnRegistrar) {
        btnRegistrar.addEventListener('click', () => {
            console.log("Botão clicado! Teste de isolamento está funcionando.");
            alert("Teste de clique funcionou! O erro inicial foi evitado.");

            const nome = document.getElementById('nome').value;
            const atividadesSelecionadas = document.querySelectorAll('input[name="atividade"]:checked');

            if (!nome || atividadesSelecionadas.length === 0) {
                alert("Por favor, preencha nome e pelo menos uma atividade para o teste.");
                return;
            }

            const atividadesArray = Array.from(atividadesSelecionadas).map(cb => cb.value);
            const atividadesString = atividadesArray.join(', ');

            loginArea.classList.add('hidden');
            statusArea.classList.remove('hidden');
            document.getElementById('display-nome').textContent = nome;
            document.getElementById('display-atividade').textContent = atividadesString;
            document.getElementById('status-text').textContent = "Interface atualizada com sucesso!";
            document.getElementById('feedback').textContent = "A conexão com Firebase e Geolocalização está desativada para este teste.";
        });
    }

    // Inicia a página
    criarCheckboxesDeAtividade();
});