const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const { onSchedule } = require("firebase-functions/v2/scheduler"); // v2 para agendamento
const admin = require("firebase-admin");
const { createCanvas, loadImage, registerFont } = require('canvas');
const path = require('path');

const REGIAO = 'southamerica-east1';
const BUCKET_NAME = "voluntarios-ativos---cepat.firebasestorage.app";

// 1. Registrar a fonte profissional que você subiu
const fontPath = path.join(__dirname, '../assets/fonts/Roboto-Bold.ttf');
registerFont(fontPath, { family: 'RobotoCePaT' });

// --- FUNÇÃO AUXILIAR: QUEBRA DE LINHA ---
function wrapText(ctx, text, x, y, maxWidth, lineHeight) {
    const words = text.split(' ');
    let line = '';
    for (let n = 0; n < words.length; n++) {
        let testLine = line + words[n] + ' ';
        let metrics = ctx.measureText(testLine);
        if (metrics.width > maxWidth && n > 0) {
            ctx.fillText(line.trim(), x, y);
            line = words[n] + ' ';
            y += lineHeight;
        } else {
            line = testLine;
        }
    }
    ctx.fillText(line.trim(), x, y);
}

// --- FUNÇÃO DE DESENHO: MODELO 2 (Mostarda) ---
const desenharModelo2 = async (ctx, dados) => {
    const template = await loadImage(path.join(__dirname, '../templates/evangelho-2.png'));
    ctx.drawImage(template, 0, 0, 1080, 1528); // Ajuste para o tamanho da sua imagem

    ctx.fillStyle = '#333333'; // Cor escura para o texto
    
    // DATA (Topo Esquerdo)
    ctx.textAlign = 'left';
    ctx.font = 'bold 60pt RobotoCePaT';
    ctx.fillText("MAR", 70, 140); 
    ctx.font = '35pt RobotoCePaT';
    ctx.fillText("24", 70, 210);

    // TÍTULO (Centro)
    ctx.textAlign = 'center';
    ctx.font = 'bold 45pt RobotoCePaT';
    const tituloFull = `Cap. ${dados.capitulo} - ${dados.tema.toUpperCase()}`;
    wrapText(ctx, tituloFull, 540, 540, 850, 65);

    // ITENS (Abaixo do Título)
    ctx.font = '35pt RobotoCePaT';
    ctx.fillText(`Itens: ${dados.itens}`, 540, 780);

    // MENSAGEM FINAL (Canto inferior esquerdo)
    ctx.textAlign = 'left';
    ctx.font = 'italic 50pt RobotoCePaT';
    wrapText(ctx, (dados.fraseFinal || "DAR-SE-Á ÀQUELE QUE TEM"), 100, 1050, 700, 75);
};

// --- GATILHO AUTOMÁTICO: TODO DOMINGO ÀS 07:00 ---
exports.agendarPostsSemana = onSchedule({
    schedule: "0 7 * * 0", // Domingo às 07h
    region: REGIAO,
    timeZone: "America/Sao_Paulo",
    memory: "1GiB"
}, async (event) => {
    console.log("[CePaT] Iniciando geração automática da semana...");
    
    // 1. Lógica para achar a próxima terça
    const hoje = new Date();
    const proximaTerca = new Date(hoje);
    proximaTerca.setDate(hoje.getDate() + (2 + 7 - hoje.getDay()) % 7);
    const dataBusca = proximaTerca.toISOString().split('T')[0];

    // 2. Buscar na escala
    const doc = await admin.firestore().collection('escala_prelecoes').doc(dataBusca).get();
    if (!doc.exists) {
        console.log("[CePaT] Escala não encontrada para " + dataBusca);
        return;
    }
    const dados = doc.data();

    // 3. Gerar imagem (Aqui usamos o Modelo 2 como teste)
    const canvas = createCanvas(1080, 1528);
    const ctx = canvas.getContext('2d');
    await desenharModelo2(ctx, dados);

    // 4. Salvar no Storage
    const buffer = canvas.toBuffer('image/png');
    const fileName = `posts/evangelho_${dataBusca}.png`;
    const bucket = admin.storage().bucket(BUCKET_NAME);
    const file = bucket.file(fileName);
    await file.save(buffer, { contentType: 'image/png' });

    const [url] = await file.getSignedUrl({ action: 'read', expires: '01-01-2030' });

    // 5. Criar os 3 registros no Firestore (Domingo, Segunda, Terça)
    const dias = [0, 1, 2]; // Hoje, Amanhã, Depois
    const batch = admin.firestore().batch();
    
    dias.forEach(dia => {
        const dataPost = new Date(hoje);
        dataPost.setDate(hoje.getDate() + dia);
        const postRef = admin.firestore().collection('posts_instagram').doc();
        batch.set(postRef, {
            urlImagem: url,
            status: 'aguardando_publicacao',
            dataAgendada: dataPost.toISOString().split('T')[0],
            tipo: 'evangelho_semanal',
            geradoEm: admin.firestore.FieldValue.serverTimestamp()
        });
    });

    await batch.commit();
    console.log("[CePaT] 3 posts agendados com sucesso!");
});

// MANTENHA SUA FUNÇÃO DE TRANSCRIÇÃO ABAIXO...

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