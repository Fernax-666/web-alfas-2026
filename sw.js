/**
 * @file sw.js
 * @description Service Worker Offline-First para soporte PWA y caché de activos en móvil/PC.
 */

const CACHE_NAME = 'alfas-caminera-v22';
const ASSETS_TO_CACHE = [
    './',
    './index.html',
    './Configuraciones.html',
    './Precarton_Adcionales.html',
    './manifest.webmanifest',
    './css/styles.css?v=22',
    './img/portada_1.jpg',
    './img/portada_2.jpg',
    './img/portada_03.jpg',
    './img/portada_04.jpg',
    './img/icons/p1_icon_1.png',
    './img/icons/p1_icon_2.png',
    './img/icons/p1_icon_3.png',
    './img/icons/p1_icon_4.png',
    './img/icons/p1_icon_5.png',
    './img/icons/p2_icon_1.png',
    './img/icons/p2_icon_2.png',
    './img/icons/p2_icon_3.png',
    './img/icons/p2_icon_4.png',
    './img/icons/p2_icon_5.png',
    './img/icons/p3_icon_1.png',
    './img/icons/p3_icon_2.png',
    './img/icons/p3_icon_3.png',
    './img/icons/p3_icon_4.png',
    './img/icons/p3_icon_5.png',
    './img/icons/p4_icon_1.png',
    './img/icons/p4_icon_2.png',
    './img/icons/p4_icon_3.png',
    './img/icons/p4_icon_4.png',
    './img/icons/p4_icon_5.png',
    './js/utils/helpers.js?v=22',
    './js/services/calculator.js?v=22',
    './js/services/database.js?v=22',
    './js/services/storage.js?v=22',
    './js/services/cloudSync.js?v=22',
    './js/services/exporter.js?v=22',
    './js/services/platformPc.js?v=22',
    './js/services/platformApk.js?v=22',
    './js/services/notifications.js?v=22',
    './js/scripts.js?v=22',
    './js/configuraciones.js?v=22',
    './js/precarton.js?v=22'
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
