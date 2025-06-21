// Define um nome e versão para o nosso cache.
// IMPORTANTE: Toda vez que você fizer uma atualização no site (ex: mudar um texto, uma cor),
// mude a versão aqui (ex: de v4 para v5). Isso forçará a atualização em todos os celulares.
const CACHE_NAME = 'presenca-voluntaria-v4'; 

// Lista de arquivos essenciais para o funcionamento offline do app.
const urlsToCache = [
  '/',
  '/index.html',
  '/tv.html',
  '/style.css',
  '/script.js',
  '/tv.js',
  '/relatorio.html',
  '/estatisticas.html',
  '/mural.html',
  '/atividades.html',
  '/icon-192x192.png',
  '/icon-512x512.png'
];

// 1. Evento de Instalação: Ocorre quando um novo Service Worker é detectado.
self.addEventListener('install', event => {
  console.log('[Service Worker] Instalando nova versão...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('[Service Worker] Cache aberto. Guardando arquivos principais...');
        return cache.addAll(urlsToCache);
      })
  );
});

// 2. Evento de Ativação: Ocorre depois da instalação, quando o novo Service Worker é ativado.
self.addEventListener('activate', event => {
  console.log('[Service Worker] Ativando e limpando caches antigos...');
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          // Se o nome do cache não for o atual, ele será deletado.
          if (cacheName !== CACHE_NAME) {
            console.log('[Service Worker] Deletando cache antigo:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});

// 3. Evento de Fetch: Intercepta todas as requisições de rede da página.
self.addEventListener('fetch', event => {
  event.respondWith(
    // Tenta primeiro buscar o recurso na rede (internet).
    fetch(event.request)
      .catch(() => {
        // Se a busca na rede falhar (ex: sem internet),
        // ele tenta encontrar o recurso no cache que guardamos.
        console.log(`[Service Worker] Falha na rede. Buscando ${event.request.url} no cache.`);
        return caches.match(event.request);
      })
  );
});

// =================================================================
//  NOVA LÓGICA PARA NOTIFICAÇÕES PUSH
// =================================================================

// 4. Evento de Push: Ocorre quando o app recebe uma notificação do servidor.
self.addEventListener('push', event => {
  console.log('[Service Worker] Notificação push recebida.');
  
  // Pega os dados da notificação. Assumimos que o backend envia um JSON com 'title' e 'body'.
  const data = event.data.json();
  
  const title = data.title || "Novo Lembrete da Casa";
  const options = {
    body: data.body || "Você tem uma nova mensagem.",
    icon: '/icon-192x192.png', // Ícone que aparece na notificação
    badge: '/icon-192x192.png' // Ícone menor para a barra de status (Android)
  };

  // Mostra a notificação na tela do celular
  event.waitUntil(self.registration.showNotification(title, options));
});

// 5. Evento de Clique na Notificação: Ocorre quando o usuário toca na notificação.
self.addEventListener('notificationclick', event => {
  console.log('[Service Worker] Notificação clicada.');
  
  // Fecha a notificação
  event.notification.close();
  
  // Abre a janela do nosso aplicativo
  event.waitUntil(
    clients.openWindow('/')
  );
});