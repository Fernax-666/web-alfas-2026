/**
 * @file build-apk-assets.js
 * @description Script de preparación de activos estáticos en el directorio `www/` requerido por Capacitor para empaquetar el APK de Android.
 */

const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '..');
const WWW_DIR = path.join(ROOT_DIR, 'www');

const FILES_TO_COPY = [
    'index.html',
    'Configuraciones.html',
    'Precarton_Adcionales.html',
    'manifest.webmanifest',
    'sw.js',
    'css/styles.css',
    'img/portada_1.jpg',
    'img/portada_2.jpg',
    'img/portada_03.jpg',
    'img/portada_04.jpg',
    'img/temas_iconos_portadas.jpg',
    'img/icons/p1_icon_1.png',
    'img/icons/p1_icon_2.png',
    'img/icons/p1_icon_3.png',
    'img/icons/p1_icon_4.png',
    'img/icons/p1_icon_5.png',
    'img/icons/p2_icon_1.png',
    'img/icons/p2_icon_2.png',
    'img/icons/p2_icon_3.png',
    'img/icons/p2_icon_4.png',
    'img/icons/p2_icon_5.png',
    'img/icons/p3_icon_1.png',
    'img/icons/p3_icon_2.png',
    'img/icons/p3_icon_3.png',
    'img/icons/p3_icon_4.png',
    'img/icons/p3_icon_5.png',
    'img/icons/p4_icon_1.png',
    'img/icons/p4_icon_2.png',
    'img/icons/p4_icon_3.png',
    'img/icons/p4_icon_4.png',
    'img/icons/p4_icon_5.png',
    'js/scripts.js',
    'js/configuraciones.js',
    'js/precarton.js',
    'js/utils/helpers.js',
    'js/services/calculator.js',
    'js/services/database.js',
    'js/services/storage.js',
    'js/services/cloudSync.js',
    'js/services/exporter.js',
    'js/services/platformPc.js',
    'js/services/platformApk.js',
    'js/services/notifications.js',
    'bdd/schema.sql',
    'bdd/GoogleAppsScript_AutoSheet.gs'
];

function ensureDir(dirPath) {
    if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
    }
}

function buildWebDir() {
    console.log('=== PREPARANDO BUNDLE WEB (www/) PARA CAPACITOR ANDROID APK ===');
    ensureDir(WWW_DIR);

    let copiedCount = 0;
    FILES_TO_COPY.forEach(relPath => {
        const srcPath = path.join(ROOT_DIR, relPath);
        const destPath = path.join(WWW_DIR, relPath);
        if (fs.existsSync(srcPath)) {
            ensureDir(path.dirname(destPath));
            fs.copyFileSync(srcPath, destPath);
            copiedCount++;
            console.log(`[OK] Copiado: ${relPath} -> www/${relPath}`);
        } else {
            console.warn(`[WARN] Archivo no encontrado: ${relPath}`);
        }
    });

    console.log(`=== BUNDLE COMPLETADO: ${copiedCount} archivos listos en www/ ===`);
}

if (require.main === module) {
    buildWebDir();
}

module.exports = { buildWebDir };
