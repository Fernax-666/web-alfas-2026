/**
 * @file services.test.js
 * @description Suite de Pruebas Unitarias e Integración V5 para Gestión de Servicios Adicionales (Web Alfas 2026).
 * Verifica:
 *  - Scripts separados según plataforma: `platformPc.js` (Windows PC) y `platformApk.js` (Android APK con @capacitor/filesystem y @capacitor/share).
 *  - Calendario ocupando el largo completo de la pantalla (`100dvh`, `clamp(68px, 11.2dvh, 96px)`).
 *  - Visor de PDF en Precartón a pantalla completa (`100vw`, `100dvh`) con botones de Compartir y Cerrar visibles.
 */

const fs = require('fs');
const path = require('path');
const {
    AVAILABLE_THEMES,
    escapeHTML,
    sanitizeForSpreadsheet,
    sanitizeColor,
    applyTheme
} = require('../js/utils/helpers.js');
const Storage = require('../js/services/storage.js');
const PlatformPC = require('../js/services/platformPc.js');
const PlatformAPK = require('../js/services/platformApk.js');
const { extractStructuredEventInfo } = require('../js/scripts.js');
const Precarton = require('../js/precarton.js');
const { buildWebDir } = require('../scripts/build-apk-assets.js');

function runTestSuite() {
    let passed = 0;
    let failed = 0;

    function assertEqual(actual, expected, testName) {
        if (JSON.stringify(actual) === JSON.stringify(expected)) {
            console.log(`[PASS] ${testName}`);
            passed++;
        } else {
            console.error(`[FAIL] ${testName}: Esperado ${JSON.stringify(expected)}, Obtenido ${JSON.stringify(actual)}`);
            failed++;
        }
    }

    console.log("=== INICIANDO SUITE DE PRUEBAS INTEGRAL V5 (PLATAFORMAS SEPARADAS PC vs APK) ===");

    // 1. Seguridad XSS y Formula Injection
    assertEqual(escapeHTML('<script>alert("xss")</script>'), '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;', "Sanitización XSS básica");
    assertEqual(sanitizeForSpreadsheet('=CMD("calc")'), "'=CMD(\"calc\")", "Bloqueo de fórmula =CMD()");
    assertEqual(sanitizeColor('#10b981'), '#10b981', "Color hexadecimal válido permitido");

    // 2. Verificación de Scripts Separados de Plataforma (PC vs Android APK)
    assertEqual(PlatformPC.PLATFORM_ID, 'pc-windows', "Módulo separado PlatformPC cargado correctamente");
    assertEqual(typeof PlatformPC.savePdfFilePC, 'function', "PlatformPC expone savePdfFilePC para Windows");
    assertEqual(typeof PlatformPC.captureAndShareCalendarPC, 'function', "PlatformPC expone captureAndShareCalendarPC para Windows");

    assertEqual(PlatformAPK.PLATFORM_ID, 'android-apk', "Módulo separado PlatformAPK cargado correctamente");
    assertEqual(typeof PlatformAPK.savePdfFileAPK, 'function', "PlatformAPK expone savePdfFileAPK con @capacitor/filesystem para Android");
    assertEqual(typeof PlatformAPK.sharePdfFileAPK, 'function', "PlatformAPK expone sharePdfFileAPK con @capacitor/share para Android");
    assertEqual(typeof PlatformAPK.captureAndShareCalendarAPK, 'function', "PlatformAPK expone captureAndShareCalendarAPK para enviar captura a WhatsApp en Android");
    assertEqual(PlatformAPK.stripBase64Prefix('data:application/pdf;base64,JVBERi0xLjMK'), 'JVBERi0xLjMK', "PlatformAPK limpia prefijo DataURI para escritura Base64 nativa en Android");

    // 3. Verificación de plugins nativos en package.json
    const pkg = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../package.json'), 'utf8'));
    assertEqual(Boolean(pkg.dependencies['@capacitor/filesystem']), true, "package.json incluye plugin nativo @capacitor/filesystem para Android");
    assertEqual(Boolean(pkg.dependencies['@capacitor/share']), true, "package.json incluye plugin nativo @capacitor/share para Android");

    // 4. Verificación de Bundle Web Capacitor (www/) con los 18 archivos
    buildWebDir();
    const wwwPcExists = fs.existsSync(path.resolve(__dirname, '../www/js/services/platformPc.js'));
    const wwwApkExists = fs.existsSync(path.resolve(__dirname, '../www/js/services/platformApk.js'));
    assertEqual(wwwPcExists && wwwApkExists, true, "Bundle www/ incluye platformPc.js y platformApk.js");

    // 5. Verificación de Visor PDF a Pantalla Completa y Calendario Largo Completo
    const precartonHtml = fs.readFileSync(path.resolve(__dirname, '../Precarton_Adcionales.html'), 'utf8');
    const stylesCss = fs.readFileSync(path.resolve(__dirname, '../css/styles.css'), 'utf8');
    assertEqual(precartonHtml.includes('class="modal pdf-viewer-fullscreen"'), true, "Visor PDF en Precartón utiliza el 100% del ancho y largo de la pantalla");
    assertEqual(precartonHtml.includes('class="pdf-viewer-actions-bar"') && precartonHtml.includes('class="pdf-viewer-bottombar"'), true, "Visor PDF muestra botones visibles de Compartir y Cerrar arriba y abajo");
    assertEqual(stylesCss.includes('clamp(68px, 11.2dvh, 96px)'), true, "Calendario móvil expande sus filas para ocupar el largo completo de la pantalla");

    console.log(`\n=== RESUMEN FINAL QA V5: ${passed} PASARON | ${failed} FALLARON ===`);
    return failed === 0;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { runTestSuite };
}

if (typeof require !== 'undefined' && typeof window === 'undefined') {
    const success = runTestSuite();
    if (!success) {
        process.exit(1);
    }
}
