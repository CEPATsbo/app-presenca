const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const admin = require("firebase-admin");
const speech = require('@google-cloud/speech');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegInstaller = require('@ffmpeg-installer/ffmpeg');
const path = require('path');
const os = require('os');
const fs = require('fs');

ffmpeg.setFfmpegPath(ffmpegInstaller.path);

const REGIAO = 'southamerica-east1';
const BUCKET_NAME = "voluntarios-ativos---cepat.firebasestorage.app";

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

    const tempFilePath = path.join(os.tmpdir(), `orig_${event.params.docId}`);
    const targetFilePath = path.join(os.tmpdir(), `${event.params.docId}.wav`);

    try {
        console.log(`[CePaT] Baixando para converter e Streamar: ${d.nomeArquivo}`);
        const bucket = admin.storage().bucket(BUCKET_NAME);
        const parteUrl = d.urlAudio.split('/o/')[1].split('?')[0];
        const caminhoNoStorage = decodeURIComponent(parteUrl);

        // 1. Baixa o original
        await bucket.file(caminhoNoStorage).download({ destination: tempFilePath });

        // 2. Converte para WAV temporário (LINEAR16 é o padrão ouro do Stream)
        console.log(`[CePaT] Convertendo para WAV...`);
        await new Promise((resolve, reject) => {
            ffmpeg(tempFilePath)
                .toFormat('wav')
                .audioChannels(1)
                .audioFrequency(16000)
                .on('end', resolve)
                .on('error', reject)
                .save(targetFilePath);
        });

        // 3. Configura o Stream do Speech
        const client = new speech.SpeechClient({ apiKey: process.env.GOOGLE_CLOUD_SPEECH_API_KEY });
        const request = {
            config: {
                encoding: 'LINEAR16',
                sampleRateHertz: 16000,
                languageCode: 'pt-BR',
                enableAutomaticPunctuation: true,
                model: 'latest_long'
            },
            interimResults: false,
        };

        let transcricaoFinal = '';

        const recognizeStream = client
            .streamingRecognize(request)
            .on('error', (err) => console.error('[CePaT] Erro IA:', err))
            .on('data', (data) => {
                if (data.results[0] && data.results[0].alternatives[0]) {
                    transcricaoFinal += data.results[0].alternatives[0].transcript + ' ';
                }
            });

        // 4. Faz o Pipe do arquivo convertido DIRETO para o Stream da IA
        console.log(`[CePaT] Iniciando Streaming do WAV convertido...`);
        await new Promise((resolve, reject) => {
            fs.createReadStream(targetFilePath)
                .on('error', reject)
                .pipe(recognizeStream)
                .on('error', reject)
                .on('finish', resolve);
        });

        // Aguarda um segundo para garantir o último retorno
        await new Promise(res => setTimeout(res, 1500));

        console.log(`[CePaT] Sucesso total!`);

        return snap.ref.update({
            transcricao: transcricaoFinal.trim() || "Conversão ok, mas sem fala detectada.",
            status: 'concluido',
            processadoEm: admin.firestore.FieldValue.serverTimestamp()
        });

    } catch (e) {
        console.error(`[CePaT] Erro:`, e.message);
        return snap.ref.update({ status: 'erro', erroDetalhe: e.message });
    } finally {
        if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);
        if (fs.existsSync(targetFilePath)) fs.unlinkSync(targetFilePath);
    }
});