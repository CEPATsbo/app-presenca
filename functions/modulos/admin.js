const { onCall, HttpsError, onRequest } = require("firebase-functions/v2/https");
const { onDocumentWritten, onDocumentCreated } = require("firebase-functions/v2/firestore");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const admin = require("firebase-admin");
const webpush = require("web-push");
const cors = require("cors")({ origin: true });
const sharp = require('sharp');
const bwipjs = require('bwip-js');

const db = admin.firestore();
const storage = admin.storage();
const REGIAO = 'southamerica-east1';
const OPCOES_FUNCAO = { region: REGIAO };
const OPCOES_FUNCAO_SAOPAULO = { region: REGIAO, timeZone: 'America/Sao_Paulo' };

// --- FUNÇÕES AUXILIARES ---
function configurarWebPush() {
    try {
        const publicKey = process.env.VAPID_PUBLIC_KEY;
        const privateKey = process.env.VAPID_PRIVATE_KEY;
        if (publicKey && privateKey) {
            webpush.setVapidDetails("mailto:cepaulodetarso.sbo@gmail.com", publicKey, privateKey);
            return true;
        }
        return false;
    } catch (error) { return false; }
}

async function enviarNotificacoesParaTodos(titulo, corpo) {
    if (!configurarWebPush()) return { successCount: 0, failureCount: 0, totalCount: 0 };
    const inscricoesSnapshot = await db.collection('inscricoes').get();
    if (inscricoesSnapshot.empty) return { successCount: 0, totalCount: 0, failureCount: 0 };
    const payload = JSON.stringify({ title: titulo, body: corpo });
    let successCount = 0; let failureCount = 0;
    const sendPromises = inscricoesSnapshot.docs.map(doc => {
        return webpush.sendNotification(doc.data(), payload)
            .then(() => { successCount++; })
            .catch(error => {
                failureCount++;
                if (error.statusCode === 410 || error.statusCode === 404) return doc.ref.delete();
            });
    });
    await Promise.all(sendPromises);
    return { successCount, failureCount, totalCount: inscricoesSnapshot.size };
}

const promoverUsuario = async (uid, novoPapel) => {
    if (!uid) return;
    let claims = { role: novoPapel };
    if (['dirigente-escola', 'secretario-escola', 'facilitador'].includes(novoPapel)) {
        claims[novoPapel.replace('-', '_')] = true;
        if (['dirigente-escola', 'secretario-escola'].includes(novoPapel)) claims['facilitador'] = true;
    } else if (novoPapel === 'voluntario') { claims = { role: 'voluntario' }; }
    await admin.auth().setCustomUserClaims(uid, claims);
    const userQuery = await db.collection('voluntarios').where('authUid', '==', uid).limit(1).get();
    if (!userQuery.empty) await userQuery.docs[0].ref.update({ role: novoPapel });
};

// --- EXPORTAÇÕES (ROBÓS ADMIN) ---
const definirSuperAdmin = onRequest(OPCOES_FUNCAO, async (req, res) => {
    if (req.query.senha !== "amorcaridade") return res.status(401).send('Não autorizado.');
    const email = req.query.email;
    try {
        const user = await admin.auth().getUserByEmail(email);
        await admin.auth().setCustomUserClaims(user.uid, { role: 'super-admin' });
        const snapshot = await db.collection('voluntarios').where('authUid', '==', user.uid).get();
        if (!snapshot.empty) await snapshot.docs[0].ref.update({ role: 'super-admin' });
        return res.status(200).send(`Sucesso! ${email} é Super Admin.`);
    } catch (e) { return res.status(500).send(e.message); }
});

const promoverParaDiretor = onCall(OPCOES_FUNCAO, async (req) => { await promoverUsuario(req.data.uid, 'diretor'); return {success:true}; });
const promoverParaTesoureiro = onCall(OPCOES_FUNCAO, async (req) => { await promoverUsuario(req.data.uid, 'tesoureiro'); return {success:true}; });
const promoverParaConselheiro = onCall(OPCOES_FUNCAO, async (req) => { await promoverUsuario(req.data.uid, 'conselheiro'); return {success:true}; });
const promoverParaProdutorEvento = onCall(OPCOES_FUNCAO, async (req) => { await promoverUsuario(req.data.uid, 'produtor-evento'); return {success:true}; });
const promoverParaIrradiador = onCall(OPCOES_FUNCAO, async (req) => { await promoverUsuario(req.data.uid, 'irradiador'); return {success:true}; });
const promoverParaBibliotecario = onCall(OPCOES_FUNCAO, async (req) => { await promoverUsuario(req.data.uid, 'bibliotecario'); return {success:true}; });
const promoverParaRecepcionista = onCall(OPCOES_FUNCAO, async (req) => { await promoverUsuario(req.data.uid, 'recepcionista'); return {success:true}; });
const promoverParaEntrevistador = onCall(OPCOES_FUNCAO, async (req) => { await promoverUsuario(req.data.uid, 'entrevistador'); return {success:true}; });
const promoverParaDirigenteEscola = onCall(OPCOES_FUNCAO, async (req) => { await promoverUsuario(req.data.uid, 'dirigente-escola'); return {success:true}; });
const promoverParaSecretarioEscola = onCall(OPCOES_FUNCAO, async (req) => { await promoverUsuario(req.data.uid, 'secretario-escola'); return {success:true}; });

const revogarAcessoDiretor = onCall(OPCOES_FUNCAO, async (req) => { await promoverUsuario(req.data.uid, 'voluntario'); return {success:true}; });
const revogarAcessoTesoureiro = onCall(OPCOES_FUNCAO, async (req) => { await promoverUsuario(req.data.uid, 'voluntario'); return {success:true}; });
const revogarAcessoConselheiro = onCall(OPCOES_FUNCAO, async (req) => { await promoverUsuario(req.data.uid, 'voluntario'); return {success:true}; });
const revogarAcessoProdutorEvento = onCall(OPCOES_FUNCAO, async (req) => { await promoverUsuario(req.data.uid, 'voluntario'); return {success:true}; });
const revogarAcessoIrradiador = onCall(OPCOES_FUNCAO, async (req) => { await promoverUsuario(req.data.uid, 'voluntario'); return {success:true}; });
const revogarAcessoBibliotecario = onCall(OPCOES_FUNCAO, async (req) => { await promoverUsuario(req.data.uid, 'voluntario'); return {success:true}; });
const revogarAcessoRecepcionista = onCall(OPCOES_FUNCAO, async (req) => { await promoverUsuario(req.data.uid, 'voluntario'); return {success:true}; });
const revogarAcessoEntrevistador = onCall(OPCOES_FUNCAO, async (req) => { await promoverUsuario(req.data.uid, 'voluntario'); return {success:true}; });
const revogarAcessoDirigenteEscola = onCall(OPCOES_FUNCAO, async (req) => { await promoverUsuario(req.data.uid, 'voluntario'); return {success:true}; });
const revogarAcessoSecretarioEscola = onCall(OPCOES_FUNCAO, async (req) => { await promoverUsuario(req.data.uid, 'voluntario'); return {success:true}; });

const sincronizarStatusVoluntario = onDocumentWritten({ ...OPCOES_FUNCAO, document: 'presencas/{presencaId}' }, async (event) => {
    const d = event.data.after.data(); if (!d || d.status !== 'presente') return null;
    const snap = await db.collection('voluntarios').where('nome', '==', d.nome).limit(1).get();
    if (!snap.empty) return snap.docs[0].ref.update({ ultimaPresenca: d.data, statusVoluntario: 'ativo' });
});

const atribuirCodigoVoluntario = onDocumentCreated({ ...OPCOES_FUNCAO, document: 'voluntarios/{voluntarioId}' }, async (event) => {
    const snap = event.data; if (!snap || snap.data().codigoVoluntario) return null;
    const counterRef = db.doc('counters/voluntarios');
    return db.runTransaction(async (t) => {
        const doc = await t.get(counterRef);
        let next = (doc.exists && doc.data().lastCode ? doc.data().lastCode : 1000) + 1;
        t.update(snap.ref, { codigoVoluntario: next }); t.set(counterRef, { lastCode: next }, { merge: true });
    });
});

const atribuirCodigosVoluntarios = onCall(OPCOES_FUNCAO, async (request) => {
    const snap = await db.collection('voluntarios').get();
    const semCodigo = snap.docs.filter(doc => !doc.data().codigoVoluntario);
    if (semCodigo.length === 0) return { message: "Todos OK" };
    const counterRef = db.doc('counters/voluntarios');
    await db.runTransaction(async (t) => {
        const cDoc = await t.get(counterRef);
        let next = cDoc.exists ? cDoc.data().lastCode : 1000;
        semCodigo.forEach(doc => { next++; t.update(doc.ref, { codigoVoluntario: next }); });
        t.set(counterRef, { lastCode: next }, { merge: true });
    });
    return { success: true };
});

const gerarCracha = onCall({ ...OPCOES_FUNCAO, memory: '1GiB', timeoutSeconds: 120 }, async (req) => {
    const { nomeParaCracha, codigoVoluntario } = req.data;
    const bucket = admin.storage().bucket();
    const [template] = await bucket.file('template_cracha.png').download();
    
    const barcode = await bwipjs.toBuffer({ bcid: 'code128', text: String(codigoVoluntario), scale: 3, height: 12, includetext: true, textcolor: '56ad59', barcolor: '56ad59' });
    const textoSvg = Buffer.from(`<svg width="1011" height="150"><text x="50%" y="50%" font-family="sans-serif" font-size="70" font-weight="bold" fill="#56ad59" text-anchor="middle" dominant-baseline="middle">${nomeParaCracha.toUpperCase()}</text></svg>`);
    
    const final = await sharp(template).composite([{ input: textoSvg, top: 380, left: 0 }, { input: barcode, top: 510, left: 425 }]).png().toBuffer();
    return { imageBase64: final.toString('base64') };
});

const atualizarNomesParaCracha = onDocumentWritten({ ...OPCOES_FUNCAO, document: 'voluntarios/{voluntarioId}' }, async (event) => {
    const d = event.data.after.data(); if (!d || !d.nome) return null;
    const pNome = d.nome.trim().split(' ')[0];
    return event.data.after.ref.update({ primeiroNome: pNome, nomeParaCracha: pNome });
});

const enviarNotificacaoImediata = onRequest(OPCOES_FUNCAO, (req, res) => {
    cors(req, res, async () => {
        // Proteção contra chamadas GET acidentais
        if (req.method !== 'POST') return res.status(405).send('Método não permitido');
        
        try {
            const result = await enviarNotificacoesParaTodos(req.body.titulo, req.body.corpo);
            res.status(200).json(result);
        } catch (e) {
            res.status(500).send(e.message);
        }
    });
});

const verificarAgendamentosAgendados = onSchedule({ ...OPCOES_FUNCAO_SAOPAULO, schedule: 'every 1 hours' }, async (event) => {
    const agora = admin.firestore.Timestamp.now();
    const snap = await db.collection('notificacoes_agendadas').where('status', '==', 'pendente').where('enviarEm', '<=', agora).get();
    for (const doc of snap.docs) {
        await enviarNotificacoesParaTodos(doc.data().titulo, doc.data().corpo);
        await doc.ref.update({ status: 'enviada' });
    }
});

const verificarInatividadeVoluntarios = onSchedule({ ...OPCOES_FUNCAO_SAOPAULO, schedule: '5 4 * * *' }, async () => {
    const dataLimite = new Date(); dataLimite.setDate(dataLimite.getDate() - 45);
    const limiteStr = dataLimite.toISOString().split('T')[0];
    const snap = await db.collection('voluntarios').where('statusVoluntario', '==', 'ativo').where('ultimaPresenca', '<', limiteStr).get();
    const batch = db.batch(); snap.forEach(doc => batch.update(doc.ref, { statusVoluntario: 'inativo' }));
    await batch.commit();
});

const registrarLogDeAcesso = onCall(OPCOES_FUNCAO, async (req) => {
    await db.collection('log_auditoria').add({ acao: req.data.acao, autor: req.auth.uid, timestamp: admin.firestore.FieldValue.serverTimestamp() });
    return { success: true };
});

const uploadAtaParaStorage = onCall(OPCOES_FUNCAO, async (req) => {
    const buffer = Buffer.from(req.data.fileData.split(',')[1], 'base64');
    const file = storage.bucket().file(`atas/${Date.now()}-${req.data.fileName}`);
    await file.save(buffer, { metadata: { contentType: req.data.fileType }, public: true });
    await db.collection('atas').add({ titulo: req.data.tituloAta, fileUrl: file.publicUrl(), criadoEm: admin.firestore.FieldValue.serverTimestamp() });
    return { success: true };
});

const backfillNomesCracha = onCall(OPCOES_FUNCAO, async () => {
    const snap = await db.collection('voluntarios').get();
    const batch = db.batch();
    snap.forEach(doc => { const pNome = (doc.data().nome || "").split(' ')[0]; batch.update(doc.ref, { primeiroNome: pNome, nomeParaCracha: pNome }); });
    await batch.commit(); return { success: true };
});

const resetarTasvAnual = onSchedule({ ...OPCOES_FUNCAO_SAOPAULO, schedule: '0 4 1 1 *' }, async () => {
    const snap = await db.collection('voluntarios').get();
    const batch = db.batch(); snap.forEach(doc => batch.update(doc.ref, { tasvAssinadoAno: null }));
    await batch.commit();
});

// --- AJUSTE DE EXPORTAÇÃO (IMPORTANTE) ---
module.exports = {
    definirSuperAdmin,
    promoverParaDiretor,
    promoverParaTesoureiro,
    promoverParaConselheiro,
    promoverParaProdutorEvento,
    promoverParaIrradiador,
    promoverParaBibliotecario,
    promoverParaRecepcionista,
    promoverParaEntrevistador,
    promoverParaDirigenteEscola,
    promoverParaSecretarioEscola,
    revogarAcessoDiretor,
    revogarAcessoTesoureiro,
    revogarAcessoConselheiro,
    revogarAcessoProdutorEvento,
    revogarAcessoIrradiador,
    revogarAcessoBibliotecario,
    revogarAcessoRecepcionista,
    revogarAcessoEntrevistador,
    revogarAcessoDirigenteEscola,
    revogarAcessoSecretarioEscola,
    sincronizarStatusVoluntario,
    atribuirCodigoVoluntario,
    atribuirCodigosVoluntarios,
    gerarCracha,
    atualizarNomesParaCracha,
    enviarNotificacaoImediata,
    verificarAgendamentosAgendados,
    verificarInatividadeVoluntarios,
    registrarLogDeAcesso,
    uploadAtaParaStorage,
    backfillNomesCracha,
    resetarTasvAnual
};