// Conteúdo CORRIGIDO para o arquivo: public/auth.js

import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-auth.js";

// Função para ser chamada no início de cada página protegida
export function protegerPagina(rolesPermitidas = []) {
    // A chamada para getAuth() foi movida para DENTRO da função.
    // Isso garante que ela só execute quando a página já tiver inicializado o Firebase.
    const auth = getAuth();

    return new Promise((resolve, reject) => {
        onAuthStateChanged(auth, (user) => {
            if (user) {
                user.getIdTokenResult(true).then((idTokenResult) => {
                    const userRole = idTokenResult.claims.role || 'voluntario';

                    if (rolesPermitidas.length === 0 || rolesPermitidas.includes(userRole)) {
                        const mainContent = document.getElementById('main-content');
                        const acessoNegado = document.getElementById('acesso-negado');
                        if (mainContent) mainContent.style.display = 'flex'; // Usando flex para o layout principal
                        if (acessoNegado) acessoNegado.style.display = 'none';
                        resolve(user);
                    } else {
                        const mainContent = document.getElementById('main-content');
                        const acessoNegado = document.getElementById('acesso-negado');
                        if (mainContent) mainContent.style.display = 'none';
                        if (acessoNegado) acessoNegado.style.display = 'block';
                        reject(new Error('Acesso negado: cargo insuficiente.'));
                    }
                });
            } else {
                const redirectUrl = window.location.pathname;
                window.location.href = `/login.html?redirectUrl=${redirectUrl}`;
                reject(new Error('Usuário não autenticado.'));
            }
        });
    });
}