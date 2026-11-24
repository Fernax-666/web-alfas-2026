/**
 * @file sw.js
 * @description Service Worker Offline-First para soporte PWA y caché de activos en móvil/PC.
 */

const CACHE_NAME = 'alfas-caminera-v12';
const ASSETS_TO_CACHE = [
    './',
    './index.html',
    './Precarton_Adcionales.html',
    './manifest.webmanifest',
    './css/styles.css?v=12',
    './js/utils/helpers.js?v=12',
    './js/services/calculator.js?v=12',
    './js/services/database.js?v=12',
    './js/services/storage.js?v=12',
    './js/services/cloudSync.js?v=12',
    './js/services/exporter.js?v=12',
    './js/scripts.js?v=12',
    './js/precarton.js?v=12'
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
    // Las peticiones hacia Google Apps Script siempre van directo a red (el Outbox de AlfaDatabase maneja el offline)
    if (reqUrl.hostname.includes('script.google.com') || reqUrl.hostname.includes('googleusercontent.com')) {
        return;
    }
    event.respondWith(
        caches.match(event.request).then((cachedResponse) => {
            return cachedResponse || fetch(event.request).catch(() => caches.match('./index.html'));
        })
    );
});
