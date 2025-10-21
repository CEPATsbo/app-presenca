import { initializeApp } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-auth.js";
import { getFirestore, collection, collectionGroup, query, where, getDocs, doc, getDoc, limit, orderBy, Timestamp, writeBatch, updateDoc, setDoc } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js"; // Adicionado orderBy, Timestamp, writeBatch, updateDoc, setDoc

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

// Elementos do Modal de Frequência (Reaproveitados)
const modalFrequencia = document.getElementById('modal-frequencia');
const closeModalFrequenciaBtn = document.getElementById('close-modal-frequencia');
const modalFrequenciaTitulo = document.getElementById('modal-frequencia-titulo');
const frequenciaListContainer = document.getElementById('frequencia-list-container');
const btnSalvarFrequencia = document.getElementById('btn-salvar-frequencia');

// Variáveis de estado para o modal de frequência
let currentTurmaIdModal = null; // Renomeado para evitar conflito
let currentAulaIdModal = null; // Renomeado para evitar conflito

// --- LÓGICA PRINCIPAL ---
onAuthStateChanged(auth, async (user) => {
    if (user) {
        mainContainer.style.display = 'block';
        try {
            const qUser = query(collection(db, "voluntarios"), where("authUid", "==", user.uid), limit(1));
            const userSnapshot = await getDocs(qUser);
            let userData, userId, origemBusca;

            if (userSnapshot.empty) {
                const qAluno = query(collection(db, "alunos"), where("authUid", "==", user.uid), limit(1));
                const alunoSnapshot = await getDocs(qAluno);
                if (alunoSnapshot.empty) throw new Error("Perfil não encontrado. Contate a secretaria.");
                userData = alunoSnapshot.docs[0].data();
                userId = alunoSnapshot.docs[0].id;
                origemBusca = 'aluno';
            } else {
                userData = userSnapshot.docs[0].data();
                userId = userSnapshot.docs[0].id;
                origemBusca = 'voluntario';
            }
            greetingName.textContent = `Olá, ${userData.nome}!`;

            const [isAluno, isFacilitador, isAdmin] = await Promise.all([
                verificarPapelAluno(userId, origemBusca),
                verificarPapelFacilitador(userId),
                verificarPapelAdmin(user)
            ]);
            await processarPapeisEExibirModulos(userId, userData, isAluno, isFacilitador, isAdmin);

        } catch (error) {
            console.error("Erro ao carregar dados:", error);
            loadingMessage.classList.remove('hidden');
            loadingMessage.innerHTML = `<p style="color: red;">${error.message}</p>`;
        }
    } else {
        window.location.href = 'login.html';
    }
});

async function processarPapeisEExibirModulos(userId, userData, isAluno, isFacilitador, isAdmin) {
    loadingMessage.classList.add('hidden');
    
    moduleDia.classList.remove('hidden');
    modulePessoal.classList.remove('hidden');
    moduleServicos.classList.remove('hidden');
    document.getElementById('dia-content').innerHTML = "<p>Carregando status de presença...</p>";
    document.getElementById('pessoal-content').innerHTML = "<p>Carregando seu perfil...</p>";

    // Executa o carregamento dos módulos em paralelo
    const promises = [];
    if (isAluno) {
        moduleAluno.classList.remove('hidden');
        promises.push(carregarModuloAluno(userId));
    }
    if (isFacilitador) {
        moduleFacilitador.classList.remove('hidden');
        promises.push(carregarModuloFacilitador(userId)); // Chama a função para preencher
    }
    if (isAdmin) {
        moduleGestao.classList.remove('hidden');
    }
    await Promise.all(promises);
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


// ===================================================================
// ## NOVO BLOCO: LÓGICA DO MÓDULO FACILITADOR (TRANSPLANTADO DE portal-facilitador.js) ##
// ===================================================================
async function carregarModuloFacilitador(userId) {
    facilitadorContent.innerHTML = "<p>Buscando suas turmas...</p>";
    try {
        const turmasRef = collection(db, "turmas");
        const qTurmas = query(turmasRef, where("facilitadoresIds", "array-contains", userId));
        const turmasSnapshot = await getDocs(qTurmas);

        if (turmasSnapshot.empty) {
            facilitadorContent.innerHTML = '<p>Você não está designado como facilitador de nenhuma turma no momento.</p>';
            return;
        }

        facilitadorContent.innerHTML = ''; // Limpa "carregando"
        for (const turmaDoc of turmasSnapshot.docs) {
            await renderizarCardDaTurmaFacilitador({ id: turmaDoc.id, ...turmaDoc.data() });
        }
    } catch (error) {
        console.error("Erro ao carregar módulo do facilitador:", error);
        facilitadorContent.innerHTML = '<p style="color: red;">Erro ao carregar suas turmas.</p>';
    }
}

async function renderizarCardDaTurmaFacilitador(turmaData) {
    const card = document.createElement('div');
    card.className = 'card'; // Usando classe 'card'

    const hojeInicio = new Date();
    hojeInicio.setHours(0, 0, 0, 0);
    const hojeFim = new Date();
    hojeFim.setHours(23, 59, 59, 999);

    const cronogramaRef = collection(db, "turmas", turmaData.id, "cronograma");
    const qAula = query(cronogramaRef, 
        where("dataAgendada", ">=", Timestamp.fromDate(hojeInicio)),
        where("dataAgendada", "<=", Timestamp.fromDate(hojeFim)),
        limit(1)
    );
    const aulaSnapshot = await getDocs(qAula);
    
    let aulaDeHoje = null;
    if (!aulaSnapshot.empty) {
        aulaDeHoje = { id: aulaSnapshot.docs[0].id, ...aulaSnapshot.docs[0].data() };
    }
    
    const dataFormatada = hojeInicio.toLocaleDateString('pt-BR');
    let aulaInfoHTML = '';
    let isChamadaDisabled = true;
    let buttonDataAttributes = '';

    if (aulaDeHoje) {
        aulaInfoHTML = `<strong>Aula de Hoje (${dataFormatada}):</strong><p>${aulaDeHoje.titulo}</p>`;
        isChamadaDisabled = false;
        buttonDataAttributes = `data-turma-id="${turmaData.id}" data-aula-id="${aulaDeHoje.id}" data-aula-titulo="${aulaDeHoje.titulo}"`;
    } else {
        aulaInfoHTML = `<strong>Aula de Hoje (${dataFormatada}):</strong><p>Nenhuma aula agendada.</p>`;
    }

    // Adaptando para o estilo de card do dashboard
    card.innerHTML = `
        <h4>${turmaData.nomeDaTurma}</h4>
        <div style="background-color: #f1f5f9; padding: 10px; border-radius: 6px; margin-bottom: 15px;">
            ${aulaInfoHTML}
        </div>
        <button class="btn-chamada-facilitador" ${buttonDataAttributes} ${isChamadaDisabled ? 'disabled' : ''} style="width: 100%; padding: 10px; background-color: ${isChamadaDisabled ? '#ccc' : '#16a34a'}; color: white; border: none; border-radius: 4px; cursor: ${isChamadaDisabled ? 'not-allowed' : 'pointer'}; font-weight: bold;">
            <i class="fas fa-clipboard-list"></i> Realizar Chamada
        </button>
    `;
    facilitadorContent.appendChild(card);
}

// ===================================================================
// ## FUNÇÕES DO MODAL DE FREQUÊNCIA (REAPROVEITADAS) ##
// ===================================================================
async function abrirModalFrequencia(turmaId, aulaId, aulaTitulo) {
    currentTurmaIdModal = turmaId;
    currentAulaIdModal = aulaId;
    modalFrequenciaTitulo.textContent = `Frequência: ${aulaTitulo}`;
    frequenciaListContainer.innerHTML = '<li>Carregando lista...</li>';
    modalFrequencia.classList.add('visible'); // Assume que o modal já existe no HTML

    try {
        const participantesRef = collection(db, "turmas", turmaId, "participantes");
        const qParticipantes = query(participantesRef, orderBy("nome"));
        const participantesSnapshot = await getDocs(qParticipantes);

        const frequenciaRef = collection(db, "turmas", turmaId, "frequencias");
        const qFrequencia = query(frequenciaRef, where("aulaId", "==", aulaId));
        const frequenciaSnapshot = await getDocs(qFrequencia);
        
        const frequenciasSalvas = new Map();
        frequenciaSnapshot.forEach(doc => frequenciasSalvas.set(doc.data().participanteId, doc.data().status));

        let listHTML = '';
        participantesSnapshot.forEach(doc => {
            const participanteId = doc.id; // ID do documento na subcoleção 'participantes'
            const participante = doc.data();
            const participanteIdOriginal = participante.participanteId; // ID do aluno/voluntário
            const statusAtual = frequenciasSalvas.get(participanteIdOriginal) || null; // Busca pelo ID original
            
            listHTML += `
                <li class="attendance-item" data-participante-id="${participanteIdOriginal}" data-status="${statusAtual || ''}">
                    <span>${participante.nome}</span>
                    <div class="attendance-controls">
                        <button class="btn-status presente ${statusAtual === 'presente' ? 'active' : ''}" data-status="presente">P</button>
                        <button class="btn-status ausente ${statusAtual === 'ausente' ? 'active' : ''}" data-status="ausente">F</button>
                        <button class="btn-status justificado ${statusAtual === 'justificado' ? 'active' : ''}" data-status="justificado">J</button>
                    </div>
                </li>`;
        });
        frequenciaListContainer.innerHTML = listHTML || '<li>Nenhum participante.</li>';
    } catch(error) {
        console.error("Erro ao carregar chamada:", error);
        frequenciaListContainer.innerHTML = '<li>Erro ao carregar.</li>';
    }
}

async function salvarFrequencia() {
    if (!currentTurmaIdModal || !currentAulaIdModal) return;
    btnSalvarFrequencia.disabled = true;
    
    try {
        const batch = writeBatch(db);
        const items = frequenciaListContainer.querySelectorAll('.attendance-item');

        items.forEach(item => {
            const participanteIdOriginal = item.dataset.participanteId; // ID do aluno/voluntário
            const status = item.dataset.status || 'ausente';
            const frequenciaDocId = `${currentAulaIdModal}_${participanteIdOriginal}`; // ID único usando ID original
            const frequenciaRef = doc(db, "turmas", currentTurmaIdModal, "frequencias", frequenciaDocId);
            batch.set(frequenciaRef, {
                aulaId: currentAulaIdModal,
                participanteId: participanteIdOriginal,
                status: status,
                turmaId: currentTurmaIdModal
            });
        });
        
        const aulaRef = doc(db, "turmas", currentTurmaIdModal, "cronograma", currentAulaIdModal);
        batch.update(aulaRef, { status: 'realizada' });

        await batch.commit();
        alert("Frequência salva!");
        modalFrequencia.classList.remove('visible');
        // Opcional: Recarregar apenas o módulo do facilitador ou a página inteira
        // location.reload(); 
    } catch (error) {
        console.error("Erro ao salvar frequência:", error);
        alert("Erro ao salvar.");
    } finally {
        btnSalvarFrequencia.disabled = false;
    }
}


// --- EVENTOS ---
btnLogout.addEventListener('click', async (e) => {
    e.preventDefault();
    await signOut(auth);
    window.location.href = 'login.html';
});

alunoContent.addEventListener('click', async (e) => {
    const target = e.target.closest('.btn-details-aluno');
    if (!target) return;
    const card = target.closest('.card');
    const detailsContent = card.querySelector('.curso-details-content');
    const turmaId = target.dataset.turmaId;
    const participanteDocId = target.dataset.participanteDocId;
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

// ## NOVO EVENTO PARA OS BOTÕES DE CHAMADA DO FACILITADOR ##
facilitadorContent.addEventListener('click', (e) => {
    const target = e.target.closest('.btn-chamada-facilitador');
    if (target && !target.disabled) {
        const { turmaId, aulaId, aulaTitulo } = target.dataset;
        abrirModalFrequencia(turmaId, aulaId, aulaTitulo);
    }
});

// ## EVENTOS DO MODAL DE FREQUÊNCIA (REAPROVEITADOS) ##
if(closeModalFrequenciaBtn) closeModalFrequenciaBtn.addEventListener('click', () => modalFrequencia.classList.remove('visible'));
if(btnSalvarFrequencia) btnSalvarFrequencia.addEventListener('click', salvarFrequencia);
if(frequenciaListContainer) frequenciaListContainer.addEventListener('click', (event) => {
    if (event.target.classList.contains('btn-status')) {
        const targetBtn = event.target;
        const parentItem = targetBtn.closest('.attendance-item');
        parentItem.dataset.status = targetBtn.dataset.status;
        parentItem.querySelectorAll('.btn-status').forEach(btn => btn.classList.remove('active'));
        targetBtn.classList.add('active');
    }
});