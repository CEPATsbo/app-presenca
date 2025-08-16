// Conteúdo CORRIGIDO e FINAL para o arquivo: public/auth.js

import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-auth.js";
// 1. ADICIONADO: Ferramentas do Firestore para buscar o nome do voluntário
import { getFirestore, doc, getDoc } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js";

export function protegerPagina(rolesPermitidas = []) {
    const auth = getAuth();
    // 2. ADICIONADO: Referência ao Firestore
    const db = getFirestore();

    return new Promise((resolve, reject) => {
        const unsubscribe = onAuthStateChanged(auth, async (user) => { // A função agora é async
            unsubscribe(); // Evita múltiplas execuções
            if (user) {
                try {
                    // 3. ADICIONADO: Bloco para buscar o nome do voluntário no Firestore
                    const voluntarioRef = doc(db, 'voluntarios', user.uid);
                    const voluntarioSnap = await getDoc(voluntarioRef);
                    if (voluntarioSnap.exists()) {
                        // Se encontrarmos o documento, anexamos o nome ao objeto 'user'
                        user.displayName = voluntarioSnap.data().nome;
                    }

                    // O resto do código continua como antes, mas agora com 'user.displayName' preenchido
                    const idTokenResult = await user.getIdTokenResult(true);
                    user.claims = idTokenResult.claims; // Anexa os cargos ao objeto do usuário
                    const userRole = user.claims.role || 'voluntario';

                    if (rolesPermitidas.length === 0 || rolesPermitidas.includes(userRole)) {
                        // Acesso permitido! Resolve a promessa e envia o usuário ENRIQUECIDO com o nome.
                        resolve(user);
                    } else {
                        // Logado, mas sem permissão de cargo. Rejeita a promessa.
                        reject(new Error('Acesso negado: cargo insuficiente.'));
                    }
                } catch (error) {
                    console.error("Erro ao verificar permissões ou buscar dados do voluntário:", error);
                    reject(error);
                }
            } else {
                // Usuário não está logado. Redireciona e rejeita a promessa.
                const redirectUrl = window.location.pathname;
                window.location.href = `/login.html?redirectUrl=${encodeURIComponent(redirectUrl)}`;
                reject(new Error('Usuário não autenticado.'));
            }
        });
    });
}