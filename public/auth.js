// Conteúdo FINAL e CORRIGIDO para o arquivo: public/auth.js

import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-auth.js";
// 1. ADICIONADO: Ferramentas de 'query' para fazer a busca correta
import { getFirestore, collection, query, where, getDocs, doc, getDoc } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js";

export function protegerPagina(rolesPermitidas = []) {
    const auth = getAuth();
    const db = getFirestore();

    return new Promise((resolve, reject) => {
        const unsubscribe = onAuthStateChanged(auth, async (user) => { // A função agora é async
            unsubscribe();
            if (user) {
                try {
                    // ===================================================================
                    // LÓGICA DE BUSCA CORRIGIDA AQUI
                    // ===================================================================
                    // Em vez de procurar pelo ID, fazemos uma pesquisa (query)
                    // onde o CAMPO 'authUid' é igual ao uid do usuário logado.
                    const q = query(collection(db, "voluntarios"), where("authUid", "==", user.uid));
                    const querySnapshot = await getDocs(q);

                    if (!querySnapshot.empty) {
                        // Se encontrarmos um resultado (deve ser apenas um)
                        const voluntarioDoc = querySnapshot.docs[0]; // Pegamos o primeiro documento da lista de resultados
                        if (voluntarioDoc.data().nome) {
                            user.displayName = voluntarioDoc.data().nome;
                        }
                    } else {
                         console.error(`[auth.js] Nenhum documento encontrado em 'voluntarios' com o authUid: ${user.uid}`);
                    }
                    // ===================================================================

                    const idTokenResult = await user.getIdTokenResult(true);
                    user.claims = idTokenResult.claims;
                    const userRole = user.claims.role || 'voluntario';

                    if (rolesPermitidas.length === 0 || rolesPermitidas.includes(userRole)) {
                        resolve(user);
                    } else {
                        reject(new Error('Acesso negado: cargo insuficiente.'));
                    }
                } catch (error) {
                    console.error("Erro ao verificar permissões ou buscar dados do voluntário:", error);
                    reject(error);
                }
            } else {
                const redirectUrl = window.location.pathname;
                window.location.href = `/login.html?redirectUrl=${encodeURIComponent(redirectUrl)}`;
                reject(new Error('Usuário não autenticado.'));
            }
        });
    });
}