// Garante que o script só rode depois que a página HTML for totalmente carregada
document.addEventListener('DOMContentLoaded', () => {

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

    // Importa as funções que precisamos do Firebase v9+
    import { initializeApp } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-app.js";
    import { getFirestore, collection, query, where, onSnapshot } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js";

    // Inicializa o Firebase
    const app = initializeApp(firebaseConfig);
    const db = getFirestore(app);

    const listaPresencaDiv = document.getElementById('lista-presenca');

    // --- FUNÇÃO ATUALIZADA PARA LIDAR COM MÚLTIPLAS ATIVIDADES ---
    function renderizarLista(presentes) {
        // Cria um objeto para agrupar nomes por atividade
        const porAtividade = presentes.reduce((acc, pessoa) => {
            // Separa a string de atividades (ex: "Apoio, Passe") em um array
            const atividadesIndividuais = pessoa.atividade.split(', ');

            // Para cada atividade individual, adiciona o nome do voluntário
            atividadesIndividuais.forEach(atividade => {
                // Se o grupo da atividade ainda não existe, cria um array vazio
                if (!acc[atividade]) {
                    acc[atividade] = [];
                }
                // Adiciona o nome da pessoa ao grupo da atividade
                acc[atividade].push(pessoa.nome);
            });
            
            return acc;
        }, {});

        // Limpa a lista antiga da tela
        listaPresencaDiv.innerHTML = '';

        // Pega as chaves (nomes das atividades) e as ordena alfabeticamente
        const atividadesOrdenadas = Object.keys(porAtividade).sort();

        // Cria o HTML para cada grupo de atividade, agora na ordem correta
        for (const atividade of atividadesOrdenadas) {
            const grupoDiv = document.createElement('div');
            grupoDiv.className = 'atividade-grupo';
            
            const titulo = document.createElement('h2');
            titulo.className = 'atividade-titulo';
            titulo.textContent = atividade;
            grupoDiv.appendChild(titulo);

            const listaUl = document.createElement('ul');
            // Ordena os nomes dos voluntários dentro de cada atividade
            porAtividade[atividade].sort().forEach(nome => {
                const itemLi = document.createElement('li');
                itemLi.textContent = nome;
                listaUl.appendChild(itemLi);
            });
            grupoDiv.appendChild(listaUl);

            listaPresencaDiv.appendChild(grupoDiv);
        }
    }

    function carregarPresencas() {
        const hoje = new Date().toISOString().split('T')[0];
        const q = query(collection(db, "presencas"), where("data", "==", hoje));

        onSnapshot(q, (querySnapshot) => {
            const presentes = [];
            querySnapshot.forEach((doc) => {
                presentes.push(doc.data());
            });
            renderizarLista(presentes);
        }, (error) => {
            console.error("Erro ao buscar presenças: ", error);
            listaPresencaDiv.innerHTML = `<p style="color:red;">Erro ao carregar dados.</p>`;
        });
    }

    // Inicia o carregamento dos dados quando a página abre
    carregarPresencas();
});