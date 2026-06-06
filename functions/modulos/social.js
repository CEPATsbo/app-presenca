const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { onDocumentWritten } = require("firebase-functions/v2/firestore");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const admin = require("firebase-admin");

const db = admin.firestore();
const REGIAO = 'southamerica-east1';
const OPCOES_FUNCAO_SAOPAULO = { region: REGIAO, timeZone: 'America/Sao_Paulo' };
const OPCOES_FUNCAO = { region: REGIAO };

// --- FUNÇÃO AUXILIAR (RESTAURADA DO CÓDIGO ORIGINAL) ---
// Esta função calcula o ciclo de 21 dias para arquivamento, garantindo que o gráfico funcione.
function calcularCicloVibracoes(dataBase) {
    const agora = new Date(dataBase);
    const proximaQuinta = new Date(agora);
    
    // Ajuste manual de fuso horário (-3h) que você utilizava no código anterior
    proximaQuinta.setUTCHours(proximaQuinta.getUTCHours() - 3);
    const diaDaSemana = proximaQuinta.getDay();
    
    let diasAteProximaQuinta = (4 - diaDaSemana + 7) % 7;
    if (diasAteProximaQuinta === 0 && agora.getTime() > proximaQuinta.getTime()) {
        diasAteProximaQuinta = 7;
    }
    
    proximaQuinta.setDate(proximaQuinta.getDate() + diasAteProximaQuinta);
    proximaQuinta.setHours(19, 20, 0, 0);
    
    const dataFimCiclo = new Date(proximaQuinta);
    const dataArquivamento = new Date(dataFimCiclo);
    
    // Define o arquivamento para 21 dias após a próxima quinta-feira de trabalho
    dataArquivamento.setDate(dataArquivamento.getDate() + 21);
    
    return {
        dataFimCiclo: admin.firestore.Timestamp.fromDate(dataFimCiclo),
        dataArquivamento: admin.firestore.Timestamp.fromDate(dataArquivamento)
    };
}

// 2. ENVIO DE PEDIDO COM TRAVA DE HORÁRIO (A FUNCIONALIDADE QUE FALTAVA)
const enviarPedidoVibracao = onCall({ region: REGIAO }, async (request) => {
    const { nome, endereco, tipo } = request.data;
    if (!nome || !tipo || (tipo === 'encarnado' && !endereco)) { 
        throw new HttpsError('invalid-argument', 'Dados incompletos.'); 
    }

    // --- RESTAURAÇÃO DA LÓGICA DE HORÁRIO ---
    const agoraSP = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
    const diaDaSemana = agoraSP.getDay();
    const horas = agoraSP.getHours();
    const minutos = agoraSP.getMinutes();
    
    let statusFinal = 'ativo';
    
    // Se for quinta-feira (4) durante o trabalho, entra como PENDENTE
    if (diaDaSemana === 4 && ((horas === 19 && minutos >= 21) || (horas > 19 && horas < 22) || (horas === 22 && minutos <= 30))) {
        statusFinal = 'pendente';
    }
    // --- FIM DA RESTAURAÇÃO ---

    const { dataArquivamento } = calcularCicloVibracoes(agoraSP);
    const col = tipo === 'encarnado' ? 'encarnados' : 'desencarnados';

    const dadosParaSalvar = { 
        nome: nome.trim(), 
        status: statusFinal, // Agora respeita a trava
        dataCriacao: admin.firestore.FieldValue.serverTimestamp(),
        dataArquivamento: dataArquivamento 
    };

    if (tipo === 'encarnado') dadosParaSalvar.endereco = endereco.trim();

    await db.collection(col).add(dadosParaSalvar);
    return { success: true };
});

// 3. ARQUIVAMENTO AUTOMÁTICO (FORMATO COMPATÍVEL COM SEU GRÁFICO)
const arquivarVibracoesConcluidas = onSchedule({ ...OPCOES_FUNCAO_SAOPAULO, schedule: '30 22 * * 4' }, async () => {
    const agora = admin.firestore.Timestamp.now();
    const colecoes = ['encarnados', 'desencarnados'];
    
    for (const c of colecoes) {
        const snap = await db.collection(c).where('dataArquivamento', '<=', agora).get();
        if (snap.empty) continue;

        const batch = db.batch(); 
        snap.forEach(doc => { 
            const dados = doc.data();
            const semanaDeReferencia = new Intl.DateTimeFormat('en-CA').format(dados.dataArquivamento.toDate());
            
            batch.set(db.collection('historico_vibracoes').doc(), {
                ...dados,
                tipo: c.slice(0, -1),
                semanaDeReferencia, // Campo vital para o gráfico
                arquivadoEm: admin.firestore.FieldValue.serverTimestamp()
            }); 
            batch.delete(doc.ref); 
        });
        await batch.commit();
    }
});

// 4. ATIVAÇÃO DE PENDENTES (RODA APÓS O TRABALHO DE QUINTA)
const ativarNovosPedidos = onSchedule({ ...OPCOES_FUNCAO_SAOPAULO, schedule: '31 22 * * 4' }, async () => {
    for (const c of ['encarnados', 'desencarnados']) {
        const snap = await db.collection(c).where('status', '==', 'pendente').get();
        const batch = db.batch(); 
        snap.forEach(doc => batch.update(doc.ref, { status: 'ativo' }));
        await batch.commit();
    }
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

const registrarVotoConselho = onCall({ region: REGIAO }, async (req) => {
    const bRef = db.collection('balancetes').doc(req.data.balanceteId);
    if (req.data.voto === 'aprovado') {
        await bRef.update({ [`aprovacoes.${req.auth.uid}`]: { nome: req.auth.token.name, data: admin.firestore.FieldValue.serverTimestamp() } });
    } else {
        await bRef.update({ status: 'com_ressalva', mensagens: admin.firestore.FieldValue.arrayUnion({ texto: req.data.mensagem, data: new Date() }) });
    }
    return { success: true };
});

const verificarAprovacaoFinal = onDocumentWritten({ ...OPCOES_FUNCAO, document: 'balancetes/{balanceteId}' }, async (event) => {
    if (!event.data.after.exists) return null;
    const d = event.data.after.data(); 
    if (Object.keys(d.aprovacoes || {}).length >= 3) {
        await event.data.after.ref.update({ status: 'aprovado' });
    }
});

// ==========================================
// MÓDULO: VINHA DE LUZ (ADICIONAR AO SEU ARQUIVO MODULAR)
// ==========================================

// Função auxiliar baseada na sua calcularCicloVibracoes, mas adaptada para Quartas-feiras e ciclo de 28 dias (4 semanas)
function calcularCicloVinhaDeLuz(dataBase) {
    const agora = new Date(dataBase);
    const proximaQuarta = new Date(agora);
    
    // Ajuste manual de fuso horário (-3h) idêntico ao que você utiliza no código original
    proximaQuarta.setUTCHours(proximaQuarta.getUTCHours() - 3);
    const diaDaSemana = proximaQuarta.getDay();
    
    // Quarta-feira é dia 3 no Javascript (0=Dom, 1=Seg, 2=Ter, 3=Qua)
    let diasAteProximaQuarta = (3 - diaDaSemana + 7) % 7;
    if (diasAteProximaQuarta === 0 && agora.getTime() > proximaQuarta.getTime()) {
        diasAteProximaQuarta = 7;
    }
    
    proximaQuarta.setDate(proximaQuarta.getDate() + diasAteProximaQuarta);
    proximaQuarta.setHours(19, 20, 0, 0);
    
    const dataFimCiclo = new Date(proximaQuarta);
    const dataArquivamento = new Date(dataFimCiclo);
    
    // Define o arquivamento para 28 dias (4 semanas) após a próxima quarta-feira de trabalho
    dataArquivamento.setDate(dataArquivamento.getDate() + 28);
    
    return {
        dataFimCiclo: admin.firestore.Timestamp.fromDate(dataFimCiclo),
        dataArquivamento: admin.firestore.Timestamp.fromDate(dataArquivamento)
    };
}

// 2. Envio do Pedido do Vinha de Luz (Entra direto criando/atualizando assistido e gerando ficha no arquivo geral)
const enviarPedidoVinhaDeLuz = onCall({ region: REGIAO }, async (request) => {
    const { nomeSolicitante, contatoSolicitante, nomeAssistido, contatoAssistido, idadeAssistido, informacoes } = request.data;
    
    if (!nomeSolicitante || !nomeAssistido || !informacoes || !idadeAssistido) { 
        throw new HttpsError('invalid-argument', 'Dados incompletos.'); 
    }

    // Lógica de horário idêntica à sua, mas travando na QUARTA-FEIRA (dia 3)
    const agoraSP = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
    const diaDaSemana = agoraSP.getDay();
    const horas = agoraSP.getHours();
    const minutos = agoraSP.getMinutes();
    
    let statusFinal = 'ativo';
    
    // Se for quarta-feira (3) durante o horário de trabalho, entra como PENDENTE
    if (diaDaSemana === 3 && ((horas === 19 && minutos >= 21) || (horas > 19 && horas < 22) || (horas === 22 && minutos <= 30))) {
        statusFinal = 'pendente';
    }

    const { dataArquivamento } = calcularCicloVinhaDeLuz(agoraSP);
    const nomeLower = nomeAssistido.trim().toLowerCase();

    // PASSO A: Verificar se o assistido já existe na base global para não duplicar fichas no Arquivo Geral
    const assistidoQuery = await db.collection('assistidos')
        .where('nome_lower', '==', nomeLower)
        .limit(1)
        .get();
        
    let assistidoId;
    if (!assistidoQuery.empty) {
        assistidoId = assistidoQuery.docs[0].id;
        // Atualiza o telefone de contato se veio uma informação nova
        await db.collection('assistidos').doc(assistidoId).update({
            telefone: contatoAssistido.trim() || 'Não informado'
        });
    } else {
        // Se for novo, adiciona na coleção global 'assistidos'
        const novoAssistidoRef = await db.collection('assistidos').add({
            nome: nomeAssistido.trim(),
            nome_lower: nomeLower,
            telefone: contatoAssistido.trim() || 'Não informado',
            dn: '' // Idade capturada vira campo secundário se necessário, mantém padrão compatível
        });
        assistidoId = novoAssistidoRef.id;
    }

    // PASSO B: Criar o documento na coleção 'tratamentos_vl' (Habilita aparição imediata no arquivo-geral-vl.html)
    const novoTratamentoRef = await db.collection('tratamentos_vl').add({
        assistidoId: assistidoId,
        status: statusFinal, 
        dataInicio: admin.firestore.FieldValue.serverTimestamp(),
        dataArquivamento: dataArquivamento,
        retornos_solicitados: 3, // Significa 4 atendimentos no total (1 inicial + 3 retornos)
        atendimentos_realizados: 1, 
        origem: 'online',
        nomeSolicitante: nomeSolicitante.trim(),
        contatoSolicitante: contatoSolicitante.trim(),
        idadeAssistidoOnline: idadeAssistido,
        informacoesIniciais: informacoes.trim()
    });

    // PASSO C: Criar o primeiro atendimento na coleção 'atendimentos_vl'
    await db.collection('atendimentos_vl').add({
        assistidoId: assistidoId,
        tratamentoId: novoTratamentoRef.id,
        dataAtendimento: admin.firestore.FieldValue.serverTimestamp(),
        semana: 1,
        notas: `Pedido Online Recebido.\nInformações do Solicitante: ${informacoes.trim()}`,
        atendente: 'Portal Online',
        detalhes_preenchidos: false // Fica "Aberto" para o atendente complementar internamente
    });

    return { success: true };
});

// 3. Arquivamento Automático do VL (Roda às quartas-feiras às 22:30)
const arquivarVlConcluidos = onSchedule({ ...OPCOES_FUNCAO_SAOPAULO, schedule: '30 22 * * 3' }, async () => {
    const agora = admin.firestore.Timestamp.now();
    
    const snap = await db.collection('tratamentos_vl').where('dataArquivamento', '<=', agora).get();
    if (snap.empty) return;

    const batch = db.batch(); 
    snap.forEach(doc => { 
        const dados = doc.data();
        
        // REGRA DE EXTENSÃO SOLICITADA: Se a mesa de trabalho interna marcou como 'estendido', o sistema ignora o arquivamento automático.
        if (dados.status === 'estendido') {
            return; 
        }

        const semanaDeReferencia = new Intl.DateTimeFormat('en-CA').format(dados.dataArquivamento.toDate());
        
        batch.set(db.collection('historico_vinha_de_luz').doc(), {
            ...dados,
            semanaDeReferencia, 
            arquivadoEm: admin.firestore.FieldValue.serverTimestamp()
        }); 
        batch.delete(doc.ref); 
    });
    await batch.commit();
});

// 4. Ativação de Pendentes do VL (Roda às quartas-feiras às 22:31)
const ativarNovosPedidosVl = onSchedule({ ...OPCOES_FUNCAO_SAOPAULO, schedule: '31 22 * * 3' }, async () => {
    const snap = await db.collection('tratamentos_vl').where('status', '==', 'pendente').get();
    if (snap.empty) return;
    
    const batch = db.batch(); 
    snap.forEach(doc => batch.update(doc.ref, { status: 'ativo' }));
    await batch.commit();
});

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
    verificarAprovacaoFinal,
    enviarPedidoVinhaDeLuz,
    arquivarVlConcluidos,
    ativarNovosPedidosVl
};