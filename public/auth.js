// Conteúdo de DIAGNÓSTICO para o arquivo: public/auth.js

import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-auth.js";
import { getFirestore, doc, getDoc } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js";

export function protegerPagina(rolesPermitidas = []) {
    console.log("[auth.js Debug] A função 'protegerPagina' foi chamada.");
    const auth = getAuth();
    const db = getFirestore();

    return new Promise((resolve, reject) => {
        const unsubscribe = onAuthStateChanged(auth, async (user) => {
            unsubscribe();
            if (user) {
                console.log("[auth.js Debug] Usuário autenticado encontrado. UID:", user.uid);
                try {
                    console.log("[auth.js Debug] Tentando buscar documento em 'voluntarios' com este UID.");
                    const voluntarioRef = doc(db, 'voluntarios', user.uid);
                    const voluntarioSnap = await getDoc(voluntarioRef);
                    
                    if (voluntarioSnap.exists()) {
                        console.log("[auth.js Debug] Documento do voluntário ENCONTRADO!");
                        const voluntarioData = voluntarioSnap.data();
                        console.log("[auth.js Debug] Dados do documento:", voluntarioData);
                        
                        // Verificando se o campo 'nome' existe
                        if (voluntarioData.nome) {
                            console.log("[auth.js Debug] Campo 'nome' encontrado:", voluntarioData.nome);
                            user.displayName = voluntarioData.nome;
                        } else {
                            console.error("[auth.js Debug] ERRO: O documento do voluntário existe, mas não contém um campo chamado 'nome'.");
                        }
                    } else {
                        console.error("[auth.js Debug] ERRO: Nenhum documento encontrado na coleção 'voluntarios' com o ID:", user.uid);
                    }

                    const idTokenResult = await user.getIdTokenResult(true);
                    user.claims = idTokenResult.claims;
                    const userRole = user.claims.role || 'voluntario';
                    console.log(`[auth.js Debug] Cargo do usuário ('role'): ${userRole}`);

                    if (rolesPermitidas.length === 0 || rolesPermitidas.includes(userRole)) {
                        console.log("[auth.js Debug] Acesso PERMITIDO. Resolvendo a promessa.");
                        console.log("[auth.js Debug] Objeto 'user' final, com displayName:", user.displayName);
                        resolve(user);
                    } else {
                        console.error("[auth.js Debug] Acesso NEGADO: cargo insuficiente.");
                        reject(new Error('Acesso negado: cargo insuficiente.'));
                    }
                } catch (error) {
                    console.error("[auth.js Debug] Ocorreu um erro CRÍTICO durante a busca no Firestore ou verificação de permissões:", error);
                    reject(error);
                }
            } else {
                console.error("[auth.js Debug] Nenhum usuário autenticado. Redirecionando para o login.");
                const redirectUrl = window.location.pathname;
                window.location.href = `/login.html?redirectUrl=${encodeURIComponent(redirectUrl)}`;
                reject(new Error('Usuário não autenticado.'));
            }
        });
    });
}