const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { onRequest } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");
const { createCanvas, loadImage, registerFont } = require('canvas');
const path = require('path');

const REGIAO = 'southamerica-east1';
const BUCKET_NAME = "voluntarios-ativos---cepat.firebasestorage.app";

// 1. Registrar a fonte profissional
const fontPath = path.join(__dirname, '../assets/fonts/Roboto-Bold.ttf');
registerFont(fontPath, { family: 'RobotoCePaT' });

// --- FUNÇÃO AUXILIAR: QUEBRA DE LINHA INTELIGENTE ---
// Esta função calcula a altura total para centralizar o texto verticalmente.
function wrapText(ctx, text, x, y, maxWidth, lineHeight, draw = true) {
    const words = text.split(' ');
    let line = '';
    let totalHeight = 0;
    let lines = [];

    for (let n = 0; n < words.length; n++) {
        let testLine = line + words[n] + ' ';
        let metrics = ctx.measureText(testLine);
        if (metrics.width > maxWidth && n > 0) {
            lines.push(line.trim());
            line = words[n] + ' ';
            totalHeight += lineHeight;
        } else {
            line = testLine;
        }
    }
    lines.push(line.trim());
    totalHeight += lineHeight;

    if (draw) {
        lines.forEach((l, index) => {
            ctx.fillText(l, x, y + (index * lineHeight));
        });
    }
    return totalHeight;
}

// --- FUNÇÃO CENTRAL DE DESENHO DO STORY DIÁRIO ---
const desenharStoryDiario = async (ctx, mensagem, autor, width, height) => {
    // 1. Carregar o template carregado (confirme se o nome é 'story-diario.png' no Storage/Pasta)
    const templatePath = path.join(__dirname, '../templates/story-diario.png');
    
    // Se não tiver o template, gera fundo azul
    let background;
    try {
        background = await loadImage(templatePath);
        ctx.drawImage(background, 0, 0, width, height);
    } catch (e) {
        console.log(`[CePaT] Aviso: Template story-diario.png não encontrado, usando fundo sólido. Erro: ${e.message}`);
        ctx.fillStyle = '#1a237e'; // Azul CePaT
        ctx.fillRect(0, 0, width, height);
    }

    // 2. Configurações de texto (Centralizado em azul escuro para contraste)
    ctx.fillStyle = '#1a237e'; 
    ctx.textAlign = 'center';

    const maxWidth = 880; // Margens de ~100px considerando a borda do template

    // Área útil vertical (excluindo logo e bordas superiores)
    const yInicialValido = 300; 
    const yFinalValido = 1600; // Antes do logo da CePaT no rodapé
    const usableHeight = yFinalValido - yInicialValido;

    // 3. Calcular altura para centralizar verticalmente
    const lineHeightMensagem = 70;
    ctx.font = 'bold 50pt RobotoCePaT';
    
    // Simula o desenho para calcular altura total (passando draw = false)
    const heightMensagem = wrapText(ctx, mensagem, width / 2, 0, maxWidth, lineHeightMensagem, false);
    
    // Adiciona espaço para o autor
    const lineHeightAutor = 50;
    const heightAutor = heightMensagem + 80; // 80px de espaçamento

    // 4. Desenhar o texto centralizado verticalmente na área útil
    const yTextoStart = yInicialValido + (usableHeight - heightAutor) / 2;

    // Desenha Mensagem
    ctx.font = 'bold 50pt RobotoCePaT';
    wrapText(ctx, mensagem, width / 2, yTextoStart, maxWidth, lineHeightMensagem, true);

    // Desenha Autor (italico e menor)
    ctx.font = 'italic 40pt RobotoCePaT';
    ctx.fillText(autor, width / 2, yTextoStart + heightMensagem + 60);
};

// --- FUNÇÃO AGENDADA (GATILHO DIÁRIO ÀS 07:00) ---
exports.postDiarioAutomatico = onSchedule({
    schedule: "0 7 * * *", // Todo dia às 07:00
    region: REGIAO,
    timeZone: "America/Sao_Paulo",
    memory: "1GiB"
}, async (event) => {
    console.log("[CePaT] Iniciando geração do Post Diário Automático...");
    
    try {
        // 1. Descobrir qual o dia do ano (1 a 366)
        const agora = new Date();
        const inicioAno = new Date(agora.getFullYear(), 0, 0);
        const dif = agora - inicioAno;
        const umDia = 1000 * 60 * 60 * 24;
        const diaDoAno = Math.floor(dif / umDia);
        console.log(`[CePaT] Dia do ano calculado: ${diaDoAno}`);

        // 2. Buscar a mensagem no Firestore
        const doc = await admin.firestore().collection('mensagens_diarias').doc(diaDoAno.toString()).get();
        
        if (!doc.exists) {
            console.log(`[CePaT] Aviso: Mensagem para o dia ${diaDoAno} não encontrada no banco.`);
            // Mensagem de fallback caso não encontre no banco
            return null; 
        }

        const dados = doc.data();
        const mensagem = dados.texto;
        const autor = dados.autor;

        // 3. Gerar a imagem Story (Canvas)
        const width = 1080;
        const height = 1920; // Formato Story padrão
        const canvas = createCanvas(width, height);
        const ctx = canvas.getContext('2d');
        
        await desenharStoryDiario(ctx, mensagem, autor, width, height);

        // 4. Salvar no Storage e obter URL (Necessário para a API do Instagram buscar)
        const buffer = canvas.toBuffer('image/png');
        const bucket = admin.storage().bucket(BUCKET_NAME);
        const caminhoArquivo = `instagram/stories/diario_${diaDoAno}.png`;
        const file = bucket.file(caminhoArquivo);
        
        await file.save(buffer, { contentType: 'image/png' });

        const [url] = await file.getSignedUrl({
            action: 'read',
            expires: '01-01-2030'
        });

        console.log(`[CePaT] Arte gerada e salva em Storage: ${caminhoArquivo}. URL: ${url}`);

        // 5. REGISTRAR O POST NO FIRESTORE (A SER DESENVOLVIDA: PUBLICAÇÃO INSTAGRAM)
        // Criaremos um documento na coleção 'posts_instagram' para a função de publicação consumir.
        await admin.firestore().collection('posts_instagram').add({
            urlImagem: url,
            status: 'aguardando_publicacao', // A função de publicação buscará por este status
            tipo: 'story_diario',
            geradoEm: admin.firestore.FieldValue.serverTimestamp()
        });

        console.log(`[CePaT] Geração diária concluída. Post registrado em 'posts_instagram' para publicação.`);

    } catch (error) {
        console.error(`[CePaT] Erro Final (postDiarioAutomatico):`, error);
        // ... logar erro em escala ou notificar admin ...
    }
});

// ... MANTENHA SUA FUNÇÃO DE TRANSCRIÇÃO ABAIXO ...

exports.transcreverAudioMediunico = onDocumentCreated({ 
    region: REGIAO, 
    document: 'comunicacoes_mediunicas/{docId}',
    secrets: ["GOOGLE_CLOUD_SPEECH_API_KEY"],
    timeoutSeconds: 540, 
    memory: "1GiB" 
}, async (event) => {
    const snap = event.data; 
    if (!snap) return null;
    const d = snap.data();
    if (d.status !== 'processando' || !d.urlAudio) return null;

    try {
        console.log(`[CePaT] Transcrevendo via Stream (Fluxo contínuo): ${d.nomeArquivo}`);
        
        const speech = require('@google-cloud/speech');
        const client = new speech.SpeechClient({ apiKey: process.env.GOOGLE_CLOUD_SPEECH_API_KEY });

        const bucket = admin.storage().bucket("voluntarios-ativos---cepat.firebasestorage.app");
        const parteUrl = d.urlAudio.split('/o/')[1].split('?')[0];
        const caminhoArquivo = decodeURIComponent(parteUrl);
        const file = bucket.file(caminhoArquivo);

        const request = {
            config: {
                encoding: 'MP3', 
                sampleRateHertz: 16000,
                languageCode: 'pt-BR',
                model: 'latest_long',
                enableAutomaticPunctuation: true,
            }
        };

        let transcricaoFinal = '';

        // O motor de Stream (Ele vai "escutando" o arquivo que vamos enviar)
        const recognizeStream = client
            .streamingRecognize(request)
            .on('error', (err) => { 
                console.error("[CePaT] Erro no Stream do Google:", err);
                throw err; 
            })
            .on('data', (data) => {
                if (data.results[0] && data.results[0].alternatives[0]) {
                    transcricaoFinal += data.results[0].alternatives[0].transcript + ' ';
                }
            });

        // O Pulo do Gato: Lê o arquivo e "toca" para o Google bit a bit
        await new Promise((resolve, reject) => {
            file.createReadStream()
                .on('error', reject)
                .pipe(recognizeStream)
                .on('finish', resolve)
                .on('error', reject);
        });

        // Espera um segundinho para o Google processar o último pedaço
        await new Promise(res => setTimeout(res, 2000));

        console.log(`[CePaT] Transcrição via Stream finalizada!`);

        return snap.ref.update({
            transcricao: transcricaoFinal.trim() || "Processado, mas sem texto detectado.",
            status: 'concluido',
            processadoEm: admin.firestore.FieldValue.serverTimestamp()
        });

    } catch (e) {
        console.error(`[CePaT] Erro Final:`, e.message);
        return snap.ref.update({ status: 'erro', erroDetalhe: e.message });
    }
});


// --- FUNÇÃO PARA VOCÊ TESTAR O VISUAL AGORA MESMO ---
exports.verTesteDiario = onRequest({ region: REGIAO, memory: "1GiB" }, async (req, res) => {
    try {
        // Testando com o dia de hoje
        const agora = new Date();
        const inicioAno = new Date(agora.getFullYear(), 0, 0);
        const dif = agora - inicioAno;
        const diaDoAno = Math.floor(dif / (1000 * 60 * 60 * 24));

        const doc = await admin.firestore().collection('mensagens_diarias').doc(diaDoAno.toString()).get();
        
        if (!doc.exists) return res.send("Mensagem não encontrada no Firestore!");

        const { texto, autor } = doc.data();

        // Criar Canvas
        const canvas = createCanvas(1080, 1920);
        const ctx = canvas.getContext('2d');

        // Carregar seu template (Certifique-se que o nome do arquivo na pasta é story-diario.jpg ou .png)
        const template = await loadImage(path.join(__dirname, '../templates/story-diario.png'));
        ctx.drawImage(template, 0, 0, 1080, 1920);

        // Configurar Texto
        ctx.fillStyle = '#2D4A22'; // Verde escuro para combinar com o logo
        ctx.textAlign = 'center';
        
        // Posição: Começando abaixo do logo (ajuste se necessário)
        const x = 540;
        const yBase = 800; 

        ctx.font = 'bold 50pt RobotoCePaT';
        const alturaTexto = wrapText(ctx, `"${texto}"`, x, yBase, 850, 80, true);

        ctx.font = 'italic 40pt RobotoCePaT';
        ctx.fillText(`— ${autor}`, x, yBase + alturaTexto + 100);

        const buffer = canvas.toBuffer('image/png');
        res.set('Content-Type', 'image/png');
        res.send(buffer);
    } catch (e) {
        res.status(500).send("Erro no teste: " + e.message);
    }
});