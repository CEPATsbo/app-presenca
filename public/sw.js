const CACHE_NAME = 'presenca-voluntaria-v1';
// Lista de arquivos que queremos guardar para acesso offline
const urlsToCache = [
  '/',
  '/index.html',
  '/style.css',
  '/script.js?v=5', // Usamos a mesma versão do HTML
  '/icon-192x192.png',
  '/icon-512x512.png'
];

// Evento de instalação: abre o cache e adiciona os arquivos
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      console.log('Cache aberto');
      return cache.addAll(urlsToCache);
    })
  );
});

// Evento de fetch: intercepta requisições e serve do cache se disponível
self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request).then(response => {
      // Se o arquivo estiver no cache, retorna ele. Senão, busca na rede.
      return response || fetch(event.request);
    })
  );
});