const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const admin = require("firebase-admin");
const axios = require("axios");

const REGIAO = 'southamerica-east1';

const transcreverAudioMediunico = onDocumentCreated({ 
    region: REGIAO, 
    document: 'comunicacoes_mediunicas/{docId}',
    secrets: ["GOOGLE_CLOUD_SPEECH_API_KEY"] 
}, async (event) => {
    const snap = event.data; 
    if (!snap) return null;
    const d = snap.data(); 
    if (d.status !== 'processando' || !d.urlAudio) return null;

    try {
        console.log(`[CePaT] Baixando arquivo para processamento...`);
        const bucket = admin.storage().bucket(); 
        const parteUrl = d.urlAudio.split('/o/')[1].split('?')[0];
        const caminhoArquivo = decodeURIComponent(parteUrl);
        const [audioBuffer] = await bucket.file(caminhoArquivo).download();
        const audioBase64 = audioBuffer.toString('base64');

        const apiKey = process.env.GOOGLE_CLOUD_SPEECH_API_KEY;
        
        // USANDO A VERSÃO BETA (Ela é a única que aceita MP4 via Base64)
        const urlApi = `https://speech.googleapis.com/v1p1beta1/speech:recognize?key=${apiKey}`;
        
        console.log(`[CePaT] Enviando para motor de decodificação Beta...`);

        const requestBody = {
            config: {
                languageCode: "pt-BR",
                model: "latest_long",
                // O SEGREDO: Ao definir o encoding como MP3 (mesmo sendo MP4), 
                // o motor beta do Google tenta decodificar o arquivo comprimido.
                encoding: "MP3", 
                sampleRateHertz: 16000, 
                enableAutomaticPunctuation: true
            },
            audio: {
                content: audioBase64
            }
        };

        const res = await axios.post(urlApi, requestBody);

        if (res.data && res.data.results) {
            const text = res.data.results.map(r => r.alternatives[0].transcript).join('\n');
            console.log(`[CePaT] Transcrição concluída!`);
            return snap.ref.update({ 
                transcricao: text || "Áudio processado, mas sem texto.", 
                status: 'concluido', 
                processadoEm: admin.firestore.FieldValue.serverTimestamp() 
            });
        } else {
            return snap.ref.update({ status: 'concluido', transcricao: "Sem fala identificada." });
        }

    } catch (e) { 
        const erroMsg = e.response ? JSON.stringify(e.response.data) : e.message;
        console.error(`[CePaT] Erro:`, erroMsg);
        // Se der erro de encoding de novo, tentaremos o último recurso: converter no código.
        return snap.ref.update({ status: 'erro', erroDetalhe: e.message }); 
    }
});

module.exports = { transcreverAudioMediunico };