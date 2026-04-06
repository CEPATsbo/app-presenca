const { onSchedule } = require("firebase-functions/v2/scheduler");
const { onRequest } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");
const path = require('path');

const REGIAO = 'southamerica-east1';
const BUCKET_NAME = "voluntarios-ativos---cepat.firebasestorage.app";

// --- FUNÇÃO DE DESENHO (INTERNA) ---
const desenharStoryDiario = async (ctx, mensagem, autor, width, height) => {
    const { loadImage } = require('canvas'); // REQUERIDO SÓ AQUI
    const templatePath = path.join(__dirname, '../templates/story-diario.png');
    try {
        const background = await loadImage(templatePath);
        ctx.drawImage(background, 0, 0, width, height);
    } catch (e) {
        ctx.fillStyle = '#1a237e'; 
        ctx.fillRect(0, 0, width, height);
    }
    ctx.fillStyle = '#1a237e'; 
    ctx.textAlign = 'center';
    ctx.font = 'bold 50pt RobotoCePaT';
    const words = mensagem.split(' ');
    let line = '', lines = [];
    for (let n = 0; n < words.length; n++) {
        let testLine = line + words[n] + ' ';
        if (ctx.measureText(testLine).width > 880 && n > 0) {
            lines.push(line.trim());
            line = words[n] + ' ';
        } else { line = testLine; }
    }
    lines.push(line.trim());
    let y = 300 + (1300 - (lines.length * 70)) / 2;
    lines.forEach((l) => { ctx.fillText(l, width / 2, y); y += 70; });
    ctx.font = 'italic 40pt RobotoCePaT';
    ctx.fillText(autor, width / 2, y + 40);
};

// --- FUNÇÃO AGENDADA ---
exports.postDiarioAutomatico = onSchedule({
    schedule: "0 7 * * *", region: REGIAO, timeZone: "America/Sao_Paulo", memory: "1GiB"
}, async (event) => {
    const { createCanvas, registerFont } = require('canvas'); // REQUERIDO SÓ AQUI
    registerFont(path.join(__dirname, '../assets/fonts/Roboto-Bold.ttf'), { family: 'RobotoCePaT' });
    try {
        const diaDoAno = Math.floor((new Date() - new Date(new Date().getFullYear(), 0, 0)) / 86400000);
        const doc = await admin.firestore().collection('mensagens_diarias').doc(diaDoAno.toString()).get();
        if (!doc.exists) return null;
        const { texto, autor } = doc.data();
        const canvas = createCanvas(1080, 1920);
        await desenharStoryDiario(canvas.getContext('2d'), texto, autor, 1080, 1920);
        const file = admin.storage().bucket(BUCKET_NAME).file(`instagram/stories/diario_${diaDoAno}.png`);
        await file.save(canvas.toBuffer('image/png'), { contentType: 'image/png' });
    } catch (e) { console.error(e); }
});

// --- FUNÇÃO DE TESTE ---
exports.verTesteDiario = onRequest({ region: REGIAO, memory: "1GiB" }, async (req, res) => {
    const { createCanvas, registerFont } = require('canvas'); // REQUERIDO SÓ AQUI
    registerFont(path.join(__dirname, '../assets/fonts/Roboto-Bold.ttf'), { family: 'RobotoCePaT' });
    try {
        const canvas = createCanvas(1080, 1920);
        const doc = await admin.firestore().collection('mensagens_diarias').limit(1).get();
        const { texto, autor } = doc.docs[0].data();
        await desenharStoryDiario(canvas.getContext('2d'), texto, autor, 1080, 1920);
        res.set('Content-Type', 'image/png').send(canvas.toBuffer('image/png'));
    } catch (e) { res.status(500).send(e.message); }
});