const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { onDocumentWritten } = require("firebase-functions/v2/firestore");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const admin = require("firebase-admin");

const db = admin.firestore();
const REGIAO = 'southamerica-east1';
const OPCOES_FUNCAO_SAOPAULO = { region: REGIAO, timeZone: 'America/Sao_Paulo' };
const OPCOES_FUNCAO = { region: REGIAO };

const enviarPedidoVibracao = onCall({ region: REGIAO }, async (req) => {
    const col = req.data.tipo === 'encarnado' ? 'encarnados' : 'desencarnados';
    await db.collection(col).add({ ...req.data, status: 'ativo', dataCriacao: admin.firestore.FieldValue.serverTimestamp() });
    return { success: true };
});

const promoverParaCaritas = onCall({ region: REGIAO }, async (req) => {
    await admin.auth().setCustomUserClaims(req.data.uid, { role: 'caritas' });
    const snap = await db.collection('voluntarios').where('authUid', '==', req.data.uid).limit(1).get();
    if (!snap.empty) await snap.docs[0].ref.update({ role: 'caritas', permissoes: ['assistencia_social'] });
    return { success: true };
});

const revogarAcessoCaritas = onCall({ region: REGIAO }, async (req) => {
    await admin.auth().setCustomUserClaims(req.data.uid, { caritas: false });
    const snap = await db.collection('voluntarios').where('authUid', '==', req.data.uid).limit(1).get();
    if (!snap.empty) await snap.docs[0].ref.update({ role: 'voluntario' });
    return { success: true };
});

const atualizarContagemFilaVL = onDocumentWritten({ region: REGIAO, document: 'fila_atendimento_vl/{docId}' }, async () => {
    const s = await db.collection('fila_atendimento_vl').where('status', '==', 'Aguardando').count().get();
    return db.doc('estatisticas/ao-vivo').set({ total_fila_vl: s.data().count }, { merge: true });
});

const recontarAltaFrequencia = onSchedule({ ...OPCOES_FUNCAO_SAOPAULO, schedule: '*/10 19-21 * * 2,5' }, async () => {
    const [a, v] = await Promise.all([db.collection('assistidos').count().get(), db.collection('tratamentos_vl').where('status', '==', 'ativo').count().get()]);
    await db.doc('estatisticas/ao-vivo').set({ total_assistidos: a.data().count, total_ativos_vl: v.data().count, ultimaAtualizacao: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
});

const recontarDiario = onSchedule({ ...OPCOES_FUNCAO_SAOPAULO, schedule: '0 19 * * *' }, async () => {
    const [a, v] = await Promise.all([db.collection('assistidos').count().get(), db.collection('tratamentos_vl').where('status', '==', 'ativo').count().get()]);
    await db.doc('estatisticas/ao-vivo').set({ total_assistidos: a.data().count, total_ativos_vl: v.data().count }, { merge: true });
});

const arquivarVibracoesConcluidas = onSchedule({ ...OPCOES_FUNCAO_SAOPAULO, schedule: '30 22 * * 4' }, async () => {
    const agora = admin.firestore.Timestamp.now();
    for (const c of ['encarnados', 'desencarnados']) {
        const snap = await db.collection(c).where('dataArquivamento', '<=', agora).get();
        const batch = db.batch(); snap.forEach(doc => { batch.set(db.collection('historico_vibracoes').doc(), doc.data()); batch.delete(doc.ref); });
        await batch.commit();
    }
});

const ativarNovosPedidos = onSchedule({ ...OPCOES_FUNCAO_SAOPAULO, schedule: '31 22 * * 4' }, async () => {
    for (const c of ['encarnados', 'desencarnados']) {
        const snap = await db.collection(c).where('status', '==', 'pendente').get();
        const batch = db.batch(); snap.forEach(doc => batch.update(doc.ref, { status: 'ativo' }));
        await batch.commit();
    }
});

const registrarVotoConselho = onCall({ region: REGIAO }, async (req) => {
    const bRef = db.collection('balancetes').doc(req.data.balanceteId);
    if (req.data.voto === 'aprovado') await bRef.update({ [`aprovacoes.${req.auth.uid}`]: { nome: req.auth.token.name, data: admin.firestore.FieldValue.serverTimestamp() } });
    else await bRef.update({ status: 'com_ressalva', mensagens: admin.firestore.FieldValue.arrayUnion({ texto: req.data.mensagem, data: new Date() }) });
    return { success: true };
});

const verificarAprovacaoFinal = onDocumentWritten({ ...OPCOES_FUNCAO, document: 'balancetes/{balanceteId}' }, async (event) => {
    const d = event.data.after.data(); if (Object.keys(d.aprovacoes || {}).length >= 3) await event.data.after.ref.update({ status: 'aprovado' });
});

// --- AJUSTE DE EXPORTAÇÃO ---
module.exports = {
    enviarPedidoVibracao,
    promoverParaCaritas,
    revogarAcessoCaritas,
    atualizarContagemFilaVL,
    recontarAltaFrequencia,
    recontarDiario,
    arquivarVibracoesConcluidas,
    ativarNovosPedidos,
    registrarVotoConselho,
    verificarAprovacaoFinal
};