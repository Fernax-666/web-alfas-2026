/**
 * @file sw.js
 * @description Service Worker Offline-First para soporte PWA y caché de activos en móvil/PC.
 */

const CACHE_NAME = 'alfas-caminera-v19';
const ASSETS_TO_CACHE = [
    './',
    './index.html',
    './Configuraciones.html',
    './Precarton_Adcionales.html',
    './manifest.webmanifest',
    './css/styles.css?v=19',
    './img/portada_1.jpg',
    './img/portada_2.jpg',
    './js/utils/helpers.js?v=19',
    './js/services/calculator.js?v=19',
    './js/services/database.js?v=19',
    './js/services/storage.js?v=19',
    './js/services/cloudSync.js?v=19',
    './js/services/exporter.js?v=19',
    './js/services/platformPc.js?v=19',
    './js/services/platformApk.js?v=19',
    './js/services/notifications.js?v=19',
    './js/scripts.js?v=19',
    './js/configuraciones.js?v=19',
    './js/precarton.js?v=19'
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS_TO_CACHE)).then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) =>
            Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
        ).then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', (event) => {
    const reqUrl = new URL(event.request.url);
    if (reqUrl.hostname.includes('script.google.com') || reqUrl.hostname.includes('googleusercontent.com')) {
        return;
    }
    event.respondWith(
        caches.match(event.request).then((cachedResponse) => {
            return cachedResponse || fetch(event.request).catch(() => caches.match('./index.html'));
        })
    );
});
