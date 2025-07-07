// Conteúdo CORRIGIDO e FINAL para o arquivo: public/auth.js

import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-auth.js";

export function protegerPagina(rolesPermitidas = []) {
    const auth = getAuth();

    return new Promise((resolve, reject) => {
        const unsubscribe = onAuthStateChanged(auth, (user) => {
            unsubscribe(); // Evita múltiplas execuções
            if (user) {
                // Usuário está logado, vamos verificar o cargo
                user.getIdTokenResult(true).then((idTokenResult) => {
                    user.claims = idTokenResult.claims; // Anexa os cargos ao objeto do usuário
                    const userRole = user.claims.role || 'voluntario';

                    if (rolesPermitidas.length === 0 || rolesPermitidas.includes(userRole)) {
                        // Acesso permitido! Resolve a promessa e envia o usuário.
                        resolve(user);
                    } else {
                        // Logado, mas sem permissão de cargo. Rejeita a promessa.
                        reject(new Error('Acesso negado: cargo insuficiente.'));
                    }
                });
            } else {
                // Usuário não está logado. Redireciona e rejeita a promessa.
                const redirectUrl = window.location.pathname;
                window.location.href = `/login.html?redirectUrl=${redirectUrl}`;
                reject(new Error('Usuário não autenticado.'));
            }
        });
    });
}