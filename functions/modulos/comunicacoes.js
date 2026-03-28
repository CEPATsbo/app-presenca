const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const admin = require("firebase-admin");

const REGIAO = 'southamerica-east1';

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