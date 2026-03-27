const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const admin = require("firebase-admin");
const axios = require("axios");

const REGIAO = 'southamerica-east1';

const transcreverAudioMediunico = onDocumentCreated({ region: REGIAO, document: 'comunicacoes_mediunicas/{docId}' }, async (event) => {
    const snap = event.data; if (!snap) return null;
    const d = snap.data(); if (d.status !== 'processando' || !d.urlAudio) return null;
    try {
        const url = `https://speech.googleapis.com/v1/speech:recognize?key=${process.env.GOOGLE_CLOUD_SPEECH_API_KEY}`;
        // Nota: A Google Speech API v1 geralmente espera o formato gs:// para URIs. 
        // O replace abaixo tenta converter a URL de download para o formato de bucket.
        const res = await axios.post(url, { 
            config: { 
                languageCode: "pt-BR", 
                enableAutomaticPunctuation: true 
            }, 
            audio: { 
                uri: d.urlAudio.replace("https://firebasestorage.googleapis.com", "gs://") 
            } 
        });
        const text = res.data.results.map(r => r.alternatives[0].transcript).join('\n');
        return snap.ref.update({ 
            transcricao: text, 
            status: 'concluido', 
            processadoEm: admin.firestore.FieldValue.serverTimestamp() 
        });
    } catch (e) { 
        return snap.ref.update({ 
            status: 'erro', 
            erroDetalhe: e.message 
        }); 
    }
});

// --- AJUSTE DE EXPORTAÇÃO ---
module.exports = {
    transcreverAudioMediunico
};