const admin = require("firebase-admin");
if (!admin.apps.length) {
    admin.initializeApp();
}

// Importação dos Módulos já ajustados
//const adminMod = require("./modulos/admin");
//const educacionalMod = require("./modulos/educacional");
//const bibliotecaMod = require("./modulos/biblioteca");
//const socialMod = require("./modulos/social");
const comunicacoesMod = require("./modulos/comunicacoes");

// Exportação que o Firebase vai ler (Nomes originais preservados)
module.exports = {
   // ...adminMod,
  //  ...educacionalMod,
  //  ...bibliotecaMod,
 //   ...socialMod,
    ...comunicacoesMod
};