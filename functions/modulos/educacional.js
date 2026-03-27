const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { onDocumentCreated, onDocumentWritten } = require("firebase-functions/v2/firestore");
const admin = require("firebase-admin");
const axios = require("axios");

const db = admin.firestore();
const REGIAO = 'southamerica-east1';
const OPCOES_FUNCAO = { region: REGIAO };

const aulasEAE = [
    { numeroDaAula: 1, titulo: "Aula inaugural", ano: 1 },
    { numeroDaAula: 2, titulo: "A Criação", ano: 1 },
    { numeroDaAula: 3, titulo: "O nosso Planeta", ano: 1 },
    { numeroDaAula: 4, titulo: "As raças primitivas", ano: 1 },
    { numeroDaAula: 5, titulo: "Constituição Geográfica da Terra", ano: 1 },
    { numeroDaAula: 6, titulo: "Civilização da Mesopotâmia", ano: 1 },
    { numeroDaAula: 7, titulo: "Missão Planetária de Moisés/Preparação dos Hebreus no deserto", ano: 1 },
    { numeroDaAula: 8, titulo: "Introdução ao Processo de Reforma Íntima", ano: 1 },
    { numeroDaAula: 9, titulo: "O Decálogo/Regresso a Canaã/A morte de Moisés", ano: 1 },
    { numeroDaAula: 10, titulo: "O governo dos Juízes/O governo dos Reis até Salomão", ano: 1 },
    { numeroDaAula: 11, titulo: "Separação dos Reinos/Sua Destruição/O período do cativeiro até a rec de Jerusalém", ano: 1 },
    { numeroDaAula: 12, titulo: "History de Israel e dominação estrangeira", ano: 1 },
    { numeroDaAula: 13, titulo: "Implantação do Caderno de Temas", ano: 1 },
    { numeroDaAula: 14, titulo: "O nascimento e controvérsias doutrinárias", ano: 1 },
    { numeroDaAula: 15, titulo: "Os reis magos e o exílio no estrangeiro", ano: 1 },
    { numeroDaAula: 16, titulo: "Infância e juventude do Messias", ano: 1 },
    { numeroDaAula: 17, titulo: "Jerusalém e o grande templo/Reis e líderes", ano: 1 },
    { numeroDaAula: 18, titulo: "As seitas nacionais/Os costumes da época", ano: 1 },
    { numeroDaAula: 19, titulo: "A Fraternidade Essênia", ano: 1 },
    { numeroDaAula: 20, titulo: "O precursor", ano: 1 },
    { numeroDaAula: 21, titulo: "O início da tarefa pública/Os primeiros discípulos", ano: 1 },
    { numeroDaAula: 22, titulo: "A volta a Jerusalém e as escolas rabínicas", ano: 1 },
    { numeroDaAula: 23, titulo: "Promoção do candidato ao grau de aprendiz", ano: 1 },
    { numeroDaAula: 24, titulo: "Implantação da Caderneta Pessoal", ano: 1 },
    { numeroDaAula: 25, titulo: "Regresso à Galiléia/A morte de João Batista", ano: 1 },
    { numeroDaAula: 26, titulo: "Os trabalhos na Galiléia", ano: 1 },
    { numeroDaAula: 27, titulo: "As parábolas. Introdução. (I) Usos e costumes sociais", ano: 1 },
    { numeroDaAula: 28, titulo: "Pregações e curas", ano: 1 },
    { numeroDaAula: 29, titulo: "Hostilidades do Sinédrio", ano: 1 },
    { numeroDaAula: 30, titulo: "O desenvolvimento da pregação", ano: 1 },
    { numeroDaAula: 31, titulo: "As parábolas. (II) Domésticas e Familiares. Distribuição do 1º teste", ano: 1 },
    { numeroDaAula: 32, titulo: "Implantação das Caravanas de Evangelização e Auxílio", ano: 1 },
    { numeroDaAula: 33, titulo: "O quadro dos apóstolos e a consagração", ano: 1 },
    { numeroDaAula: 34, titulo: "Excursões ao estrangeiro", ano: 1 },
    { numeroDaAula: 35, titulo: "As parábolas. (III) Vida rural", ano: 1 },
    { numeroDaAula: 36, titulo: "O Sermão do Monte", ano: 1 },
    { numeroDaAula: 37, titulo: "A gênese da alma", ano: 1 },
    { numeroDaAula: 38, titulo: "Atos finais na Galiléia", ano: 1 },
    { numeroDaAula: 39, titulo: "Últimos dias em Jerusalém", ano: 1 },
    { numeroDaAula: 40, titulo: "Encerramento da Tarefa Planetária", ano: 1 },
    { numeroDaAula: 41, titulo: "Prisão e entrega aos romanos. Distribuição do 2º teste", ano: 1 },
    { numeroDaAula: 42, titulo: "O tribunal judaíco", ano: 1 },
    { numeroDaAula: 43, titulo: "O julgamento de Pilatos", ano: 1 },
    { numeroDaAula: 44, titulo: "O Calvário", ano: 1 },
    { numeroDaAula: 45, titulo: "Ressurreição", ano: 1 },
    { numeroDaAula: 46, titulo: "Exame espiritual", ano: 1 },
    { numeroDaAula: 47, titulo: "Exame espiritual", ano: 1 },
    { numeroDaAula: 48, titulo: "Passagem para o grau de servidor/Inscrição para o Curso de Médiuns", ano: 2 },
    { numeroDaAula: 49, titulo: "Evolução do Homem animal para o homem espiritual", ano: 2 },
    { numeroDaAula: 50, titulo: "Interpretação do Sermão do Monte", ano: 2 },
    { numeroDaAula: 51, titulo: "Interpretação do Sermão do Monte", ano: 2 },
    { numeroDaAula: 52, titulo: "Interpretação do Sermão do Monte", ano: 2 },
    { numeroDaAula: 53, titulo: "Interpretação do Sermão do Monte", ano: 2 },
    { numeroDaAula: 54, titulo: "Fundação da igreja cristã", ano: 2 },
    { numeroDaAula: 55, titulo: "Ascensão", ano: 2 },
    { numeroDaAula: 56, titulo: "Vida Plena – Conceito", ano: 2 },
    { numeroDaAula: 57, titulo: "Instituição dos diáconos. Distribuição do 3º teste", ano: 2 },
    { numeroDaAula: 58, titulo: "A conversão de Paulo", ano: 2 },
    { numeroDaAula: 59, titulo: "O apóstolo Paulo e suas pregações", ano: 2 },
    { numeroDaAula: 60, titulo: "Paulo defende-se em Jerusalém", ano: 2 },
    { numeroDaAula: 61, titulo: "Os apóstolos que mais se destacaram e seus principais atos", ano: 2 },
    { numeroDaAula: 62, titulo: "Preconceito – Definição", ano: 2 },
    { numeroDaAula: 63, titulo: "Preconceito / Vivência (Exercício de Vida Plena)", ano: 2 },
    { numeroDaAula: 64, titulo: "O estudo das epístolas", ano: 2 },
    { numeroDaAula: 65, titulo: "A predestinação segundo a doutrina de Paulo", ano: 2 },
    { numeroDaAula: 66, titulo: "Justificação dos pecados", ano: 2 },
    { numeroDaAula: 67, titulo: "Continuação das epístolas", ano: 2 },
    { numeroDaAula: 68, titulo: "Vícios e defeitos – Conceitos", ano: 2 },
    { numeroDaAula: 69, titulo: "A doutrina de Tiago sobre a salvação", ano: 2 },
    { numeroDaAula: 70, titulo: "A doutrina de Pedro, João e Judas", ano: 2 },
    { numeroDaAula: 71, titulo: "O apocalipse de João", ano: 2 },
    { numeroDaAula: 72, titulo: "O apocalipse de João. Distrib. do 4º teste", ano: 2 },
    { numeroDaAula: 73, titulo: "Vícios e defeitos / Vivência (Exercício de Vida Plena)", ano: 2 },
    { numeroDaAula: 74, titulo: "Ciência e Religião", ano: 2 },
    { numeroDaAula: 75, titulo: "Pensamento e Vontade", ano: 2 },
    { numeroDaAula: 76, titulo: "Lei de Ação e Reação", ano: 2 },
    { numeroDaAula: 77, titulo: "Amor como lei soberana, o valor científico da prece, lei da solidariedade", ano: 2 },
    { numeroDaAula: 78, titulo: "A Medicina Psicossomática", ano: 2 },
    { numeroDaAula: 79, titulo: "Exercício de Vida Plena", ano: 2 },
    { numeroDaAula: 80, titulo: "Curas e milagres do Evangelho", ano: 2 },
    { numeroDaAula: 81, titulo: "Cosmogonias e concepções do Universo", ano: 2 },
    { numeroDaAula: 82, titulo: "Estudos dos seres e das formas", ano: 2 },
    { numeroDaAula: 83, titulo: "Evolução nos diferentes reinos/Histórico da evolução dos seres vivos", ano: 2 },
    { numeroDaAula: 84, titulo: "Leis universais", ano: 2 },
    { numeroDaAula: 85, titulo: "Exercício de Vida Plena", ano: 2 },
    { numeroDaAula: 86, titulo: "O Plano Divino / A Lei da Evolução. Distrib. do 5º teste", ano: 2 },
    { numeroDaAula: 87, titulo: "A Lei do Trabalho / A Lei da Justiça", ano: 2 },
    { numeroDaAula: 88, titulo: "A Lei do Amor", ano: 2 },
    { numeroDaAula: 89, titulo: "Amor a Deus, ao próximo e aos inimigos", ano: 2 },
    { numeroDaAula: 90, titulo: "A filosofia da dor", ano: 2 },
    { numeroDaAula: 91, titulo: "Normas da vida espiritual", ano: 2 },
    { numeroDaAula: 92, titulo: "Exame espiritual", ano: 2 },
    { numeroDaAula: 93, titulo: "Exame espiritual", ano: 2 },
    { numeroDaAula: 94, titulo: "Estrutura da Aliança e de um Centro Espírtia. Como abrir um Centro Espírita", ano: 3 },
    { numeroDaAula: 95, titulo: "Nova frente de trabalho", ano: 3 },
    { numeroDaAula: 96, titulo: "Evolução Anímica (I)", ano: 3 },
    { numeroDaAula: 97, titulo: "Evolução Anímica (II)", ano: 3 },
    { numeroDaAula: 98, titulo: "Categoria dos mundos", ano: 3 },
    { numeroDaAula: 99, titulo: "Imortalidade", ano: 3 },
    { numeroDaAula: 100, titulo: "A Fraternidade do Trevo e FDJ", ano: 3 },
    { numeroDaAula: 101, titulo: "Reencarnação", ano: 3 },
    { numeroDaAula: 102, titulo: "Exercício de Vida Plena", ano: 3 },
    { numeroDaAula: 103, titulo: "Regras para a educação. Conduta e aperfeiçoamento dos seres", ano: 3 },
    { numeroDaAula: 104, titulo: "Regras para a educação. Conduta e aperfeiçoamento dos seres", ano: 3 },
    { numeroDaAula: 105, titulo: "Regras para a educação. Conduta e aperfeiçoamento dos seres", ano: 3 },
    { numeroDaAula: 106, titulo: "O papel do discípulo. Distrib. do 6º teste", ano: 3 },
    { numeroDaAula: 107, titulo: "O cristão no lar", ano: 3 },
    { numeroDaAula: 108, titulo: "O cristão no meio religioso e no meio profano", ano: 3 },
    { numeroDaAula: 109, titulo: "Os recursos do cristão", ano: 3 },
    { numeroDaAula: 110, titulo: "Exercício de Vida Plena", ano: 3 },
    { numeroDaAula: 111, titulo: "Iniciação espiritual", ano: 3 },
    { numeroDaAula: 112, titulo: "Estudo do perispírito / Centros de força", ano: 3 },
    { numeroDaAula: 113, titulo: "Regras de conduta", ano: 3 },
    { numeroDaAula: 114, titulo: "O espírito e o sexo", ano: 3 },
    { numeroDaAula: 115, titulo: "Problemas da propagação do Espiritismo", ano: 3 },
    { numeroDaAula: 116, titulo: "Exame espiritual", ano: 3 },
    { numeroDaAula: 117, titulo: "Exame espiritual", ano: 3 },
    { numeroDaAula: 118, titulo: "Exame espiritual. Devolução das cadernetas.", ano: 3 }
];

const aulasMediuns = [
    { n: 1, t: "Apresentação do programa", r: "" },
    { n: 2, t: "Teorias sobre Mediunidade. Resumo histórico. Evolução da Mediunidade", r: "M. Cap. 1 a 6" },
    { n: 3, t: "Sensibilidade individual. Divisão e classificação das faculdades. Estudos dos fluidos", r: "M. Cap.7 e 8 PR. Cap.8 G. Cap. 14" },
    { n: 4, t: "Faculdade de lucidez", r: "M. Cap. 9 e 10" },
    { n: 5, t: "Incorporação e sua divisão. Incorporações parciais", r: "M. Cap. 11" },
    { n: 6, t: "Mediunidade de efeitos físicos", r: "M. Cap. 12" },
    { n: 7, t: "Fenômenos correlatos", r: "M. Cap. 13 Item 1 a 4" },
    { n: 8, t: "Mediunidade de cura", r: "M. Cap. 13-Item 5" },
    { n: 9, t: "Educação dos médiuns. Pré-mediunismo", r: "M. Cap. 15 a 18" },
    { n: 10, t: "Verificações iniciais. Adaptação psíquica", r: "M. Cap. 20 e 21" },
    { n: 11, t: "Sinais precursores. Passividade mediúnica. Oportunidade do desenvolvimento", r: "M. Cap. 22 a 24" },
    { n: 12, t: "As comunicações. O trabalho dos guias. Auxiliares invisíveis", r: "M. Cap. 30, 31 e 33" },
    { n: 13, t: "Passes Teoria 1", r: "PR. Cap. 1 e 3" },
    { n: 14, t: "Passes Teoria 2", r: "PR. Cap. 4 a 9 e 30" },
    { n: 15, t: "Passes Teoria 3", r: "PR. Cap. 2,18,19, 25 e 28" },
    { n: 16, t: "Estudo do psiquismo Cérebro material", r: "MEC. Parte 1, Item I" },
    { n: 17, t: "Estudo do psiquismo Sistema nervoso", r: "MEC. Parte 1, Item II" },
    { n: 18, t: "Estudo do psiquismo Reencarnação", r: "MEC. Parte 1, Item III." },
    { n: 19, t: "Estudo do psiquismo O cérebro espiritual", r: "MEC. Parte 1, Item IV" },
    { n: 20, t: "Estados conscienciais", r: "M. Cap. 26 e 27" },
    { n: 21, t: "Estágios de desenvolvimento", r: "M. Cap. 25" },
    { n: 22, t: "Missão social dos médiuns", r: "M. Cap. 39 e 40" },
    { n: 23, t: "Mediunidade nos animais", r: "M. Cap. 13-Item 5 (final)" },
    { n: 24, t: "Os Elementais", r: "M. Cap 14." },
    { n: 25, t: "Cromoterapia - Noções gerais", r: "MEC. Parte 2- Item I" },
    { n: 26, t: "Cromoterapia Cores básicas e elementares. Propriedade das cores", r: "MEC. Parte 2-Itens: II e III" },
    { n: 27, t: "Cromoterapia As cores nas auras humanas. Efeitos das cores nas curas.", r: "MEC. Parte 2 Itens: IV e V" },
    { n: 28, t: "Cromoterapia - Aplicações práticas", r: "MEC. Parte 2-Item: VI" },
    { n: 29, t: "Auto passe e passe de limpeza", r: "PR. Cap. 17 e 18" },
    { n: 30, t: "Desenvolvimento Primário - Preliminares. Definições - Explicação necessária", r: "DM. Item II" },
    { n: 31, t: "Preparação do ambiente. Intercâmbio inicial. Abertura dos trabalhos", r: "DM. Item II" },
    { n: 32, t: "Relaxamento, Concentração e Desdobramento. 1", r: "" },
    { n: 33, t: "Relaxamento, Concentração e Desdobramento. 2", r: "" },
    { n: 34, t: "Considerações sobre o método das 5 fases", r: "DM. Item II (as 5 fases do transe)" },
    { n: 35, t: "Primeira fase: percepção de fluidos 1", r: "DM. Item II: 1a Fase" },
    { n: 36, t: "Primeira fase: percepção de fluidos 2", r: "DM. Item II: 1a Fase" },
    { n: 37, t: "Primeira fase: percepção de fluidos 3", r: "DM. Item II: 1a Fase" },
    { n: 38, t: "Segunda fase: aproximação 1", r: "DM. Item II: 2a Fase" },
    { n: 39, t: "Segunda fase: aproximação 2", r: "DM. Item II: 2a Fase" },
    { n: 40, t: "Terceira fase: Contato. 1", r: "DM. Item II: 3a Fase" },
    { n: 41, t: "Terceira fase: Contato. 2", r: "DM. Item II: 3a Fase" },
    { n: 42, t: "Quarta fase: envolvimento 1", r: "DM. Item II: 4a Fase" },
    { n: 43, t: "Quarta fase: envolvimento 2", r: "DM. Item II: 4a Fase" },
    { n: 44, t: "Quarta fase: envolvimento 3", r: "DM. Item II: 4a Fase" },
    { n: 45, t: "Quinta fase: manifestação 1", r: "DM. Item II: 5a Fase" },
    { n: 46, t: "Quinta fase: manifestação 2", r: "DM. Item II: 5a Fase" },
    { n: 47, t: "Quinta fase: manifestação 3", r: "DM. Item II: 5a Fase" },
    { n: 48, t: "Quinta fase: manifestação 4", r: "DM. Item II: 5a Fase" },
    { n: 49, t: "Relaxamento, Concentração e Desdobramento. Intercâmbio com a Espiritualidade Superior 1", r: "" },
    { n: 50, t: "Relaxamento, Concentração e Desdobramento. Intercâmbio com a Espiritualidade Superior 2", r: "" },
    { n: 51, t: "Classificação de faculdades individuais para desenvolvimentos especificos. (Avaliação Espiritual)", r: "DM.Item II pg.38" },
    { n: 52, t: "Apuração de resultados", r: "DM.Item II pg. 51" },
    { n: 53, t: "Passes-Prática", r: "PR. Cap, 10 a 16" },
    { n: 54, t: "Passes Prática 1", r: "PR. Cap. 17, 20 a 23" },
    { n: 55, t: "Passes Prática 2", r: "PR. Cap. 24, 26, 27, 29, 31" },
    { n: 56, t: "Radiações e Assuntos Complementares", r: "PR. Cap. 23" },
    { n: 57, t: "Relaxamento, Concentração, Desdobramento e Intercâmbio com Espiritos Superiores 1", r: "" },
    { n: 58, t: "Relaxamento, Concentração, Desdobramento e Intercâmbio com Espíritos Superiores. 2", r: "" },
    { n: 59, t: "Desenvolvimento progressivo. Orientações Preliminares para Estagio", r: "DM. Item III" },
    { n: 60, t: "Estágio em suportes e correntes de cura 1", r: "DM. Item IV" },
    { n: 61, t: "Estágio em suportes e correntes de cura 2", r: "DM. Item IV" },
    { n: 62, t: "Estágio em suportes e correntes de cura 3", r: "DM. Item IV" },
    { n: 63, t: "Orientações preliminares para Atendimento de Espiritos Sofredores e Obsessores", r: "" },
    { n: 64, t: "Doutrinação de sofredores e obsessores 1", r: "M. Cap. 29 e 30" },
    { n: 65, t: "Doutrinação de sofredores e obsessores 2", r: "M. Cap. 29 e 30" },
    { n: 66, t: "Doutrinação de sofredores e obsessores 3", r: "M. Cap. 29 e 30" },
    { n: 67, t: "Doutrinação de sofredores e obsessores 4", r: "M. Cap. 29 e 30" },
    { n: 68, t: "Doutrinação de sofredores e obsessores 5", r: "M. Cap. 29 e 30" },
    { n: 69, t: "Doutrinação de sofredores e obsessores 6", r: "M. Cap. 30, 31, 33 e 34" },
    { n: 70, t: "Desenvolvimento completivo. Aprimoramento de faculdades", r: "M. Cap. 34 a 36/DM. Item IV" },
    { n: 71, t: "Vampirismo e trabalhos inferiores 1", r: "DM. Pág. 61 a 69" },
    { n: 72, t: "Vampirismo e trabalhos inferiores 2", r: "DM. Pág. 61 a 69" },
    { n: 73, t: "Vampirismo e trabalhos inferiores 3", r: "DM. Pág. 61 a 69" },
    { n: 74, t: "Vampirismo e trabalhos inferiores 4", r: "DM. Pág. 61 a 69" },
    { n: 75, t: "Desdobramentos consciente e inconsciente 1", r: "M. Cap. 13/DM. Item IV" },
    { n: 76, t: "Desdobramentos consciente e inconsciente 2", r: "M. Cap. 13/DM. Item IV" },
    { n: 77, t: "Desdobramentos consciente e inconsciente 3", r: "M. Cap. 13/DM. Item IV" },
    { n: 78, t: "Desdobramentos consciente e inconsciente 4", r: "M. Cap. 13/DM. Item IV" },
    { n: 79, t: "Desdobramentos consciente e inconsciente 5", r: "M. Cap. 13/DM. Item IV" },
    { n: 80, t: "Intercâmbio com Espiritos superiores 1", r: "M. Cap. 35" },
    { n: 81, t: "Intercâmbio com Espiritos superiores 2", r: "M. Cap. 35" },
    { n: 82, t: "Intercâmbio com Espíritos superiores 3", r: "M. Cap. 35." },
    { n: 83, t: "Intercâmbio com Espiritos superiores 4", r: "M. Cap. 35" },
    { n: 84, t: "Intercâmbio com Espíritos superiores 5", r: "M. Cap. 35" }
];

const cadastrarAulasAutomaticamente = onDocumentCreated({ ...OPCOES_FUNCAO, document: 'cursos/{cursoId}' }, async (event) => {
    const snap = event.data; if (!snap) return null;
    const d = snap.data(); const curriculoRef = db.collection('cursos').doc(event.params.cursoId).collection('curriculo');
    const batch = db.batch(); let aulas = [];
    if (d.isEAE) aulas = aulasEAE.map(a => ({ numero: a.numeroDaAula, titulo: a.titulo, ano: a.ano }));
    else if ((d.nome || "").toLowerCase().includes("médium")) aulas = aulasMediuns.map(a => ({ numero: a.n, titulo: a.t }));
    else return null;
    aulas.forEach(a => { const r = curriculoRef.doc(); batch.set(r, a); });
    return batch.commit();
});

const gerarCronogramaAutomaticamente = onDocumentCreated({ ...OPCOES_FUNCAO, document: 'turmas/{turmaId}' }, async (event) => {
    const d = event.data.data(); const aulas = await db.collection('cursos').doc(d.cursoId).collection('curriculo').orderBy('numeroDaAula').get();
    let data = d.dataInicio.toDate(); while (data.getUTCDay() !== d.diaDaSemana) data.setDate(data.getDate() + 1);
    const batch = db.batch();
    aulas.forEach(doc => {
        const ref = db.collection('turmas').doc(event.params.turmaId).collection('cronograma').doc();
        batch.set(ref, { ...doc.data(), dataAgendada: admin.firestore.Timestamp.fromDate(new Date(data)), status: 'agendada', isExtra: false });
        data.setDate(data.getDate() + 7);
    });
    return batch.commit();
});

const recalcularCronogramaCompleto = onDocumentWritten({ ...OPCOES_FUNCAO, document: 'turmas/{turmaId}/{subcolecao}/{docId}' }, async (event) => {
    const { turmaId, subcolecao } = event.params; if (subcolecao !== "cronograma" && subcolecao !== "recessos") return null;
    const tDoc = await db.collection("turmas").doc(turmaId).get();
    const d = tDoc.data(); let data = d.dataInicio.toDate();
    const aulas = await db.collection("turmas").doc(turmaId).collection("cronograma").where("isExtra", "==", false).orderBy("numeroDaAula").get();
    const batch = db.batch();
    for (const doc of aulas.docs) {
        while (data.getUTCDay() !== d.diaDaSemana) data.setDate(data.getDate() + 1);
        batch.update(doc.ref, { dataAgendada: admin.firestore.Timestamp.fromDate(new Date(data)) });
        data.setDate(data.getDate() + 7);
    }
    return batch.commit();
});

const calcularFrequencia = onDocumentWritten({ ...OPCOES_FUNCAO, document: 'turmas/{turmaId}/frequencias/{frequenciaId}' }, async (event) => {
    const f = event.data.after.data(); const tId = event.params.turmaId;
    const tData = (await db.collection('turmas').doc(tId).get()).data();
    const aulas = await db.collection('turmas').doc(tId).collection('cronograma').where('status', '==', 'realizada').where('isExtra', '==', false).get();
    const freqs = await db.collection('turmas').doc(tId).collection('frequencias').where('participanteId', '==', f.participanteId).get();
    let pVal = 0; freqs.forEach(doc => { if (['presente', 'justificado'].includes(doc.data().status)) pVal++; });
    const porc = Math.round((pVal / (aulas.size || 1)) * 100);
    const nF = porc >= 80 ? 10 : (porc >= 60 ? 5 : 1);
    const pRef = db.collection('turmas').doc(tId).collection('participantes').doc(f.participanteDocId);
    const pSnap = await pRef.get(); const a = pSnap.data().avaliacoes || {}; const aA = a[tData.anoAtual || 1] || {};
    const mAT = (nF + (aA.notaCadernoTemas || 0)) / 2;
    const mRI = ((aA.notaCadernetaPessoal || 0) + (aA.notaTrabalhos || 0) + (aA.notaExameEspiritual || 0)) / 3;
    return pRef.update({ [`avaliacoes.${tData.anoAtual || 1}`]: { notaFrequencia: porc, mediaAT: parseFloat(mAT.toFixed(1)), mediaRI: parseFloat(mRI.toFixed(1)), mediaFinal: parseFloat(((mAT + mRI) / 2).toFixed(1)), statusAprovacao: (mAT + mRI >= 11) ? "Aprovado" : "Reprovado" } });
});

const matricularNovoAluno = onCall(OPCOES_FUNCAO, async (req) => {
    const aluno = await db.collection("alunos").add({ nome: req.data.nome, criadoEm: admin.firestore.FieldValue.serverTimestamp() });
    await db.collection('turmas').doc(req.data.turmaId).collection('participantes').add({ participanteId: aluno.id, nome: req.data.nome, origem: 'aluno', statusGeral: 'ativo', avaliacoes: { 1: { notaFrequencia: 0, statusAprovacao: 'Em Andamento' } } });
    return { success: true };
});

const promoverAlunoParaVoluntario = onCall(OPCOES_FUNCAO, async (req) => {
    const pRef = db.collection('turmas').doc(req.data.turmaId).collection('participantes').doc(req.data.participanteDocId);
    const pS = await pRef.get(); const aS = await db.collection('alunos').doc(pS.data().participanteId).get();
    const novoV = await db.collection('voluntarios').add({ nome: aS.data().nome, statusVoluntario: 'ativo', criadoEm: admin.firestore.FieldValue.serverTimestamp() });
    await pRef.update({ origem: 'voluntario', participanteId: novoV.id });
    return { success: true };
});

const avancarAnoComVerificacao = onCall(OPCOES_FUNCAO, async (req) => {
    const tRef = db.collection('turmas').doc(req.data.turmaId); const tS = await tRef.get();
    const parts = await tRef.collection('participantes').get();
    const batch = db.batch(); parts.forEach(doc => { const st = (doc.data().avaliacoes?.[tS.data().anoAtual || 1]?.statusAprovacao === 'Aprovado') ? "ativo" : "reprovado"; batch.update(doc.ref, { statusGeral: st }); });
    batch.update(tRef, { anoAtual: (tS.data().anoAtual || 1) + 1 });
    await batch.commit(); return { success: true };
});

const importarFeriadosNacionais = onCall(OPCOES_FUNCAO, async (req) => {
    const resp = await axios.get(`https://brasilapi.com.br/api/feriados/v1/${new Date().getFullYear()}`);
    const batch = db.batch(); resp.data.forEach(f => { if (f.type === 'national') batch.set(db.collection('eventos').doc(), { titulo: f.name, tipo: 'feriado', dataInicio: admin.firestore.Timestamp.fromDate(new Date(f.date + 'T12:00:00Z')) }); });
    await batch.commit(); return { success: true };
});

// --- AJUSTE DE EXPORTAÇÃO ---
module.exports = {
    cadastrarAulasAutomaticamente,
    gerarCronogramaAutomaticamente,
    recalcularCronogramaCompleto,
    calcularFrequencia,
    matricularNovoAluno,
    promoverAlunoParaVoluntario,
    avancarAnoComVerificacao,
    importarFeriadosNacionais
};