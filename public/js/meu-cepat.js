import { initializeApp } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-auth.js";
import { getFirestore, collection, collectionGroup, query, where, getDocs, doc, getDoc, limit, orderBy } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js"; // Adicionado orderBy

// --- CONFIGURAÇÕES E INICIALIZAÇÃO ---
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

// --- ELEMENTOS DA PÁGINA ---
const mainContainer = document.getElementById('main-container');
const greetingName = document.getElementById('greeting-name');
const loadingMessage = document.getElementById('loading-message');
const moduleDia = document.getElementById('module-dia');
const modulePessoal = document.getElementById('module-pessoal');
const moduleAluno = document.getElementById('module-aluno');
const moduleFacilitador = document.getElementById('module-facilitador');
const moduleGestao = document.getElementById('module-gestao');
const moduleServicos = document.getElementById('module-servicos');
const alunoContent = document.getElementById('aluno-content');
const facilitadorContent = document.getElementById('facilitador-content');
const btnLogout = document.getElementById('btn-logout');

// --- LÓGICA PRINCIPAL ---
onAuthStateChanged(auth, async (user) => {
    if (user) {
        mainContainer.style.display = 'block';
        try {
            const qUser = query(collection(db, "voluntarios"), where("authUid", "==", user.uid), limit(1));
            const userSnapshot = await getDocs(qUser);
            if (userSnapshot.empty) {
                // ## TENTATIVA DE BUSCAR NA COLEÇÃO 'ALUNOS' SE NÃO FOR VOLUNTÁRIO ##
                const qAluno = query(collection(db, "alunos"), where("authUid", "==", user.uid), limit(1)); // Supondo que alunos possam ter authUid
                const alunoSnapshot = await getDocs(qAluno);
                if (alunoSnapshot.empty) {
                     throw new Error("Perfil não encontrado no sistema. Contate a secretaria.");
                }
                const userData = alunoSnapshot.docs[0].data();
                const userId = alunoSnapshot.docs[0].id; // ID do documento da coleção 'alunos'
                greetingName.textContent = `Olá, ${userData.nome}!`;

                 // Se for encontrado como aluno, verificamos os papéis a partir daqui
                 const [isAluno, isFacilitador, isAdmin] = await Promise.all([
                    verificarPapelAluno(userId, 'aluno'), // Indica que a busca principal foi em 'alunos'
                    verificarPapelFacilitador(userId), // Facilitador sempre será voluntário
                    verificarPapelAdmin(user)
                 ]);
                 await processarPapeisEExibirModulos(userId, userData, isAluno, isFacilitador, isAdmin);

            } else {
                 const userData = userSnapshot.docs[0].data();
                 const userId = userSnapshot.docs[0].id; // ID do documento da coleção 'voluntarios'
                 greetingName.textContent = `Olá, ${userData.nome}!`;

                 const [isAluno, isFacilitador, isAdmin] = await Promise.all([
                    verificarPapelAluno(userId, 'voluntario'), // Indica que a busca principal foi em 'voluntarios'
                    verificarPapelFacilitador(userId), // Usa o ID do voluntário encontrado
                    verificarPapelAdmin(user)
                 ]);
                 await processarPapeisEExibirModulos(userId, userData, isAluno, isFacilitador, isAdmin);
            }

        } catch (error) {
            console.error("Erro ao carregar dados do usuário:", error);
            loadingMessage.classList.remove('hidden');
            loadingMessage.innerHTML = `<p style="color: red;">${error.message}</p>`;
        }
    } else {
        window.location.href = 'login.html';
    }
});

// ## NOVA FUNÇÃO PARA PROCESSAR PAPÉIS E EXIBIR MÓDULOS ##
async function processarPapeisEExibirModulos(userId, userData, isAluno, isFacilitador, isAdmin) {
    loadingMessage.classList.add('hidden');
    
    moduleDia.classList.remove('hidden');
    modulePessoal.classList.remove('hidden');
    moduleServicos.classList.remove('hidden');
    document.getElementById('dia-content').innerHTML = "<p>Carregando status de presença...</p>";
    document.getElementById('pessoal-content').innerHTML = "<p>Carregando seu perfil...</p>";

    if (isAluno) {
        moduleAluno.classList.remove('hidden');
        await carregarModuloAluno(userId); // Chama a função para preencher
    }
    if (isFacilitador) {
        moduleFacilitador.classList.remove('hidden');
        facilitadorContent.innerHTML = "<p>Carregando suas turmas...</p>";
    }
    if (isAdmin) {
        moduleGestao.classList.remove('hidden');
    }
}


// --- FUNÇÕES DE VERIFICAÇÃO DE PAPÉIS ---
async function verificarPapelAluno(userId, origemBusca) {
    // A busca agora precisa saber qual ID usar (de voluntario ou de aluno)
    const idParaBuscar = userId; // Usamos o ID da coleção onde encontramos o usuário
    
    // A busca na subcoleção 'participantes' já usa o 'participanteId' correto
    const q = query(collectionGroup(db, 'participantes'), where('participanteId', '==', idParaBuscar), limit(1));
    const snapshot = await getDocs(q);
    return !snapshot.empty;
}

async function verificarPapelFacilitador(userId) {
    // Facilitador sempre será um voluntário, então o userId aqui é o ID do doc 'voluntarios'
    const q = query(collection(db, 'turmas'), where('facilitadoresIds', 'array-contains', userId), limit(1));
    const snapshot = await getDocs(q);
    return !snapshot.empty;
}

async function verificarPapelAdmin(user) {
    const idTokenResult = await user.getIdTokenResult(true);
    const userRole = idTokenResult.claims.role;
    const adminRoles = ['super-admin', 'diretor', 'tesoureiro'];
    return adminRoles.includes(userRole);
}

// ===================================================================
// ## NOVO BLOCO: LÓGICA DO MÓDULO ALUNO (TRANSPLANTADO DE meu-progresso.js) ##
// ===================================================================

async function carregarModuloAluno(userId) {
    alunoContent.innerHTML = "<p>Buscando seus cursos...</p>";

    try {
        const participantesQuery = query(collectionGroup(db, 'participantes'), where('participanteId', '==', userId));
        const participantesSnapshot = await getDocs(participantesQuery);

        if (participantesSnapshot.empty) {
            alunoContent.innerHTML = '<p>Você não está inscrito em nenhum curso no momento.</p>';
            return;
        }

        alunoContent.innerHTML = ''; // Limpa a mensagem de "carregando"

        for (const participanteDoc of participantesSnapshot.docs) {
            const participanteData = participanteDoc.data();
            const turmaRef = participanteDoc.ref.parent.parent;
            const turmaDoc = await getDoc(turmaRef);

            if (turmaDoc.exists()) {
                const turmaData = { id: turmaDoc.id, ...turmaDoc.data() };
                const participanteComId = { id: participanteDoc.id, ...participanteData };
                renderizarCardDoCursoAluno(turmaData, participanteComId);
            }
        }
    } catch (error) {
        console.error("Erro ao carregar módulo do aluno:", error);
        alunoContent.innerHTML = '<p style="color: red;">Erro ao carregar seus cursos.</p>';
    }
}

function renderizarCardDoCursoAluno(turmaData, participanteData) {
    const cursoCard = document.createElement('div');
    cursoCard.className = 'card'; // Usando a classe 'card' para consistência

    const anoAtual = turmaData.anoAtual || 1;
    const avaliacaoDoAno = participanteData.avaliacoes ? participanteData.avaliacoes[anoAtual] : null;

    let frequencia = '--';
    let status = 'Cursando';
    let mediaFinal = null;

    if (avaliacaoDoAno) {
        frequencia = `${avaliacaoDoAno.notaFrequencia || 0}%`;
        status = avaliacaoDoAno.statusAprovacao || 'Em Andamento';
        if (turmaData.isEAE) {
            mediaFinal = (avaliacaoDoAno.mediaFinal !== undefined) ? avaliacaoDoAno.mediaFinal.toFixed(1) : 'N/D';
        }
    }

    // Adaptando para o estilo de card do dashboard
    cursoCard.innerHTML = `
        <h4>${turmaData.nomeDaTurma}</h4>
        <p><strong>Frequência:</strong> ${frequencia}</p>
        <p><strong>Status:</strong> ${status}</p>
        ${mediaFinal !== null ? `<p><strong>Média Final (${anoAtual}º Ano):</strong> ${mediaFinal}</p>` : ''}
        <button class="btn-details-aluno" data-turma-id="${turmaData.id}" data-participante-doc-id="${participanteData.id}" style="margin-top: 15px; padding: 8px 12px; background-color: #eee; border: 1px solid #ccc; border-radius: 4px; cursor: pointer;">
            Ver Detalhes ▼
        </button>
        <div class="curso-details-content hidden" style="margin-top: 15px; border-top: 1px solid #eee; padding-top: 15px;"></div>
    `;

    alunoContent.appendChild(cursoCard);
}

async function carregarErenderizarDetalhesAluno(turmaId, participanteDocId, detailsContainer) {
    detailsContainer.innerHTML = '<p>Carregando detalhes...</p>';
    try {
        const participanteRef = doc(db, "turmas", turmaId, "participantes", participanteDocId);
        const participanteSnap = await getDoc(participanteRef);
        if(!participanteSnap.exists()) throw new Error("Registro de participante não encontrado.");
        const participanteData = participanteSnap.data();
        const participanteIdOriginal = participanteData.participanteId; // ID do aluno/voluntário

        const cronogramaRef = collection(db, "turmas", turmaId, "cronograma");
        const frequenciasRef = collection(db, "turmas", turmaId, "frequencias");

        const [cronogramaSnap, frequenciasSnap] = await Promise.all([
            getDocs(query(cronogramaRef, orderBy("dataAgendada", "asc"))),
            getDocs(query(frequenciasRef, where("participanteId", "==", participanteIdOriginal))) // Busca pelo ID original
        ]);

        const frequenciasMap = new Map();
        frequenciasSnap.forEach(doc => frequenciasMap.set(doc.data().aulaId, doc.data().status));

        const hoje = new Date();
        hoje.setHours(0, 0, 0, 0);

        let proximasAulasHTML = '<tbody>';
        let historicoHTML = '<tbody>';
        let temProxima = false;
        let temHistorico = false;

        cronogramaSnap.docs.forEach(doc => {
            const aula = { id: doc.id, ...doc.data() };
            const dataAula = aula.dataAgendada.toDate();
            const dataFormatada = dataAula.toLocaleDateString('pt-BR', { timeZone: 'UTC' });
            
            if (dataAula >= hoje && aula.status !== 'realizada') {
                temProxima = true;
                proximasAulasHTML += `<tr><td>${dataFormatada}</td><td>${aula.isExtra ? 'Extra' : aula.numeroDaAula}</td><td>${aula.titulo}</td></tr>`;
            }

            if (aula.status === 'realizada') {
                temHistorico = true;
                const statusPresenca = frequenciasMap.get(aula.id);
                let statusDisplay = '';
                switch (statusPresenca) {
                    case 'presente': statusDisplay = '<span style="color: green;">Presente</span>'; break;
                    case 'ausente': statusDisplay = '<span style="color: red;">Falta</span>'; break;
                    case 'justificado': statusDisplay = '<span style="color: orange;">Justificado</span>'; break;
                    default: statusDisplay = '<span>Não lançado</span>';
                }
                historicoHTML = `<tr><td>${dataFormatada}</td><td>${aula.titulo}</td><td>${statusDisplay}</td></tr>` + historicoHTML; // Prepend para ordem decrescente
            }
        });

        proximasAulasHTML += '</tbody>';
        historicoHTML += '</tbody>';
        
        detailsContainer.innerHTML = `
            <h5>Próximas Aulas:</h5>
            ${temProxima ? `<table><thead><tr><th>Data</th><th>Nº</th><th>Tema</th></tr></thead>${proximasAulasHTML}</table>` : '<p>Nenhuma aula futura agendada.</p>'}
            <h5 style="margin-top: 20px;">Histórico de Frequência:</h5>
            ${temHistorico ? `<table><thead><tr><th>Data</th><th>Tema</th><th>Sua Presença</th></tr></thead>${historicoHTML}</table>` : '<p>Nenhum histórico de frequência.</p>'}
        `;

    } catch (error) {
        console.error("Erro ao carregar detalhes do curso para aluno:", error);
        detailsContainer.innerHTML = '<p style="color: red;">Não foi possível carregar os detalhes.</p>';
    }
}

// ===================================================================
// ## FIM DO BLOCO DO MÓDULO ALUNO ##
// ===================================================================

// --- EVENTOS ---
btnLogout.addEventListener('click', async (e) => {
    e.preventDefault();
    await signOut(auth);
    window.location.href = 'login.html';
});

// ## NOVO EVENTO PARA OS BOTÕES DE DETALHES DO ALUNO ##
alunoContent.addEventListener('click', async (e) => {
    const target = e.target.closest('.btn-details-aluno');
    if (!target) return;

    const card = target.closest('.card');
    const detailsContent = card.querySelector('.curso-details-content');
    const turmaId = target.dataset.turmaId;
    const participanteDocId = target.dataset.participanteDocId; // ID do documento na subcoleção participantes

    const isHidden = detailsContent.classList.contains('hidden');

    if (isHidden) {
        detailsContent.classList.remove('hidden');
        target.innerHTML = `Ocultar Detalhes ▲`;
        await carregarErenderizarDetalhesAluno(turmaId, participanteDocId, detailsContent);
    } else {
        detailsContent.classList.add('hidden');
        target.innerHTML = `Ver Detalhes ▼`;
        detailsContent.innerHTML = '';
    }
});