// Conteúdo CORRIGIDO e FINAL para o arquivo: public/auth.js

import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-auth.js";

// Função para ser chamada no início de cada página protegida
export function protegerPagina(rolesPermitidas = []) {
    const auth = getAuth();

    return new Promise((resolve, reject) => {
        const unsubscribe = onAuthStateChanged(auth, (user) => {
            unsubscribe(); 
            if (user) {
                // USUÁRIO ESTÁ LOGADO
                user.getIdTokenResult(true).then((idTokenResult) => {
                    // ===================================================================
                    // LINHA DA CORREÇÃO: Anexa os cargos ao objeto do usuário
                    // ===================================================================
                    user.claims = idTokenResult.claims;
                    
                    const userRole = user.claims.role || 'voluntario';

                    if (rolesPermitidas.length === 0 || rolesPermitidas.includes(userRole)) {
                        const mainContent = document.querySelector('#main-content, .painel-container, .container');
                        const acessoNegado = document.getElementById('acesso-negado');
                        if (mainContent) mainContent.style.display = 'block';
                        // Ajuste para o layout flex do conselho-fiscal
                        if (mainContent && mainContent.classList.contains('main-container')) {
                            mainContent.style.display = 'flex';
                        }
                        if (acessoNegado) acessoNegado.style.display = 'none';
                        resolve(user); // Resolva a promessa, enviando o objeto do usuário ENRIQUECIDO
                    } else {
                        const mainContent = document.querySelector('#main-content, .painel-container, .container');
                        const acessoNegado = document.getElementById('acesso-negado');
                        if (mainContent) mainContent.style.display = 'none';
                        if (acessoNegado) acessoNegado.style.display = 'block';
                        reject(new Error('Acesso negado: cargo insuficiente.'));
                    }
                });
            } else {
                // USUÁRIO NÃO ESTÁ LOGADO
                const redirectUrl = window.location.pathname;
                window.location.href = `/login.html?redirectUrl=${redirectUrl}`;
                reject(new Error('Usuário não autenticado.'));
            }
        });
    });
}