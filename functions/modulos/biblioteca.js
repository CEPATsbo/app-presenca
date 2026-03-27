const { onCall, HttpsError } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");
const axios = require("axios");

const db = admin.firestore();
const REGIAO = 'southamerica-east1';
const OPCOES_FUNCAO = { region: REGIAO };

const buscarDadosLivroPorISBN = onCall(OPCOES_FUNCAO, async (req) => {
    const res = await axios.get(`https://www.googleapis.com/books/v1/volumes?q=isbn:${req.data.isbn}`);
    if (res.data.totalItems > 0) {
        const b = res.data.items[0].volumeInfo;
        return { titulo: b.title, autor: b.authors?.join(', '), editora: b.publisher };
    } else throw new HttpsError('not-found', 'Não encontrado');
});

const registrarVendaBiblioteca = onCall(OPCOES_FUNCAO, async (req) => {
    await db.runTransaction(async (t) => {
        for (const i of req.data.itens) {
            const r = db.collection('biblioteca_livros').doc(i.id);
            const s = await t.get(r);
            if (s.data().quantidade < i.qtd) throw new Error('Estoque baixo');
            t.update(r, { quantidade: admin.firestore.FieldValue.increment(-i.qtd) });
        }
        const col = req.data.tipoVenda === 'vista' ? 'biblioteca_vendas_avista' : 'biblioteca_contas_a_receber';
        t.set(db.collection(col).doc(), { ...req.data, registradoEm: admin.firestore.FieldValue.serverTimestamp() });
    });
    return { success: true };
});

const registrarVendaCantina = onCall(OPCOES_FUNCAO, async (req) => {
    const col = req.data.tipoVenda === 'vista' ? 'cantina_vendas_avista' : 'contas_a_receber';
    await db.collection(col).add({ ...req.data, registradoEm: admin.firestore.FieldValue.serverTimestamp() });
    return { success: true };
});

const gerenciarEmprestimoBiblioteca = onCall(OPCOES_FUNCAO, async (req) => {
    const r = db.collection('biblioteca_livros').doc(req.data.livroId);
    await db.runTransaction(async (t) => {
        if (req.data.acao === 'emprestar') {
            t.set(db.collection('biblioteca_emprestimos').doc(), { ...req.data, status: 'emprestado', dataEmprestimo: admin.firestore.FieldValue.serverTimestamp() });
            t.update(r, { quantidade: admin.firestore.FieldValue.increment(-1) });
        } else {
            t.update(db.collection('biblioteca_emprestimos').doc(req.data.emprestimoId), { status: 'devolvido', dataDevolucao: admin.firestore.FieldValue.serverTimestamp() });
            t.update(r, { quantidade: admin.firestore.FieldValue.increment(1) });
        }
    });
    return { success: true };
});

const gerarRelatorioBiblioteca = onCall(OPCOES_FUNCAO, async (req) => {
    const snap = await db.collection('biblioteca_vendas_avista').where('ano', '==', req.data.ano).get();
    return { vendas: snap.docs.map(doc => doc.data()) };
});

const estornarVendaBiblioteca = onCall(OPCOES_FUNCAO, async (req) => {
    const col = req.data.tipoVenda === 'vista' ? 'biblioteca_vendas_avista' : 'biblioteca_contas_a_receber';
    await db.runTransaction(async (t) => {
        const s = await t.get(db.collection(col).doc(req.data.vendaId));
        s.data().itens.forEach(i => t.update(db.collection('biblioteca_livros').doc(i.id), { quantidade: admin.firestore.FieldValue.increment(i.qtd) }));
        t.delete(s.ref);
    });
    return { success: true };
});

// --- AJUSTE DE EXPORTAÇÃO ---
module.exports = {
    buscarDadosLivroPorISBN,
    registrarVendaBiblioteca,
    registrarVendaCantina,
    gerenciarEmprestimoBiblioteca,
    gerarRelatorioBiblioteca,
    estornarVendaBiblioteca
};