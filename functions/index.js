const admin = require("firebase-admin");

if (!admin.apps.length) {
    admin.initializeApp();
}

// Importação dos Módulos (Caminhos ajustados para a pasta modulos)
const adminMod = require("./modulos/admin");
const educacionalMod = require("./modulos/educacional");
const bibliotecaMod = require("./modulos/biblioteca");
const socialMod = require("./modulos/social");
const comunicacoesMod = require("./modulos/comunicacoes");
const instagramMod = require("./modulos/instagram");

// Exportação que o Firebase vai ler (Usando o seu padrão original)
module.exports = {
    ...adminMod,
    ...educacionalMod,
    ...bibliotecaMod,
    ...socialMod,
    ...comunicacoesMod,
    ...instagramMod
};