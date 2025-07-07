// Conteúdo para o novo arquivo: public/auth.js

import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-auth.js";

// Função para ser chamada no início de cada página protegida
export function protegerPagina(rolesPermitidas = []) {
    const auth = getAuth();

    return new Promise((resolve, reject) => {
        onAuthStateChanged(auth, (user) => {
            // Espera o Firebase confirmar o status do usuário
            if (user) {
                // USUÁRIO ESTÁ LOGADO
                user.getIdTokenResult(true).then((idTokenResult) => {
                    const userRole = idTokenResult.claims.role || 'voluntario';

                    // Verifica se o cargo do usuário está na lista de cargos permitidos para a página
                    if (rolesPermitidas.length === 0 || rolesPermitidas.includes(userRole)) {
                        // TUDO CERTO! Acesso permitido.
                        // Mostra o conteúdo principal e esconde a mensagem de 'acesso negado'
                        const mainContent = document.getElementById('main-content');
                        const acessoNegado = document.getElementById('acesso-negado');
                        if (mainContent) mainContent.style.display = 'block';
                        if (acessoNegado) acessoNegado.style.display = 'none';
                        resolve(user); // Resolva a promessa, enviando o objeto do usuário
                    } else {
                        // USUÁRIO LOGADO, MAS SEM PERMISSÃO PARA ESTA PÁGINA
                        const mainContent = document.getElementById('main-content');
                        const acessoNegado = document.getElementById('acesso-negado');
                        if (mainContent) mainContent.style.display = 'none';
                        if (acessoNegado) acessoNegado.style.display = 'block';
                        reject(new Error('Acesso negado: cargo insuficiente.'));
                    }
                });
            } else {
                // USUÁRIO NÃO ESTÁ LOGADO
                // Redirecionamento inteligente: envia para o login e informa a página de destino
                const redirectUrl = window.location.pathname;
                window.location.href = `/login.html?redirectUrl=${redirectUrl}`;
                reject(new Error('Usuário não autenticado.'));
            }
        });
    });
}