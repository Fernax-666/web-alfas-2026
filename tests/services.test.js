/**
 * @file services.test.js
 * @description Suite de Pruebas Unitarias e Integración V6 para Gestión de Servicios Adicionales (Web Alfas 2026).
 * Verifica:
 *  - Portadas de Inicio (Splash Screen única al iniciar el programa + Selector de 2 portadas debajo de Temas).
 *  - Vinculación con Correo Gmail y Creación Automática de Google Sheets en la cuenta activa (`vincularGmailYCrearSheet`).
 *  - Motor de Notificaciones (`js/services/notifications.js`):
 *      * Solicitud de permisos (`@capacitor/local-notifications` + Web Notifications).
 *      * Lectura periódica de base de datos 3 veces al día (08:00, 14:00, 20:00 hs).
 *      * 2 Alertas programadas 1 día antes del servicio designado (09:00 y 20:00 hs del día previo) con posicionamiento en fecha.
 */

const fs = require('fs');
const path = require('path');
const {
    AVAILABLE_THEMES,
    AVAILABLE_SPLASH_COVERS,
    escapeHTML,
    sanitizeForSpreadsheet,
    sanitizeColor,
    isValidGmailAddress,
    setSplashCover,
    getSavedSplashCover
} = require('../js/utils/helpers.js');
const CloudSync = require('../js/services/cloudSync.js');
const Notifications = require('../js/services/notifications.js');
const PlatformPC = require('../js/services/platformPc.js');
const PlatformAPK = require('../js/services/platformApk.js');
const { buildWebDir } = require('../scripts/build-apk-assets.js');

async function runTestSuite() {
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

    console.log("=== INICIANDO SUITE DE PRUEBAS INTEGRAL V6 (PORTADAS, GMAIL SHEETS & NOTIFICACIONES 24H) ===");

    // 1. Verificación de las 2 Portadas Oficiales y Selector
    assertEqual(Object.keys(AVAILABLE_SPLASH_COVERS), ['portada_1', 'portada_2'], "Existen las 2 portadas oficiales (portada_1 y portada_2)");
    assertEqual(setSplashCover('portada_2').src, 'img/portada_2.jpg', "Selector de portada cambia a Portada 2 (Ilustrada Diurna)");
    assertEqual(setSplashCover('portada_1').src, 'img/portada_1.jpg', "Selector de portada cambia a Portada 1 (Realista Institucional)");
    const img1Exists = fs.existsSync(path.resolve(__dirname, '../img/portada_1.jpg'));
    const img2Exists = fs.existsSync(path.resolve(__dirname, '../img/portada_2.jpg'));
    assertEqual(img1Exists && img2Exists, true, "Archivos físicos img/portada_1.jpg e img/portada_2.jpg existen en el repositorio");

    // 2. Verificación de Validación y Vinculación de Cuenta Gmail para crear Google Sheets en la nube
    assertEqual(isValidGmailAddress('fernando.olivera@gmail.com'), true, "Correo @gmail.com válido es aceptado");
    assertEqual(isValidGmailAddress('correo-invalido-sin-arroba'), false, "Correo inválido es rechazado");
    const linkRes = await CloudSync.vincularGmailYCrearSheet({
        email: 'fernando.olivera@gmail.com',
        policiaTitular: 'Olivera Fernando'
    });
    assertEqual(linkRes.ok, true, "vincularGmailYCrearSheet vincula cuenta Gmail y aprovisiona archivo Google Sheets");
    assertEqual(linkRes.account.sheetName, 'Web_Alfas_2026_fernando.olivera', "Nombre de archivo Google Sheets generado para la cuenta Gmail activa");

    // 3. Verificación del Motor de Notificaciones: 3 lecturas al día y 2 alertas 1 día antes del servicio
    assertEqual(Notifications.DAILY_SYNC_HOURS, [8, 14, 20], "Lectura automática de Base de Datos configurada 3 veces al día (08:00, 14:00, 20:00 hs)");
    assertEqual(Notifications.DAY_BEFORE_ALERT_HOURS, [9, 20], "Alertas de servicio próximo configuradas 2 veces al día (09:00 y 20:00 hs) el día anterior");

    // Simular hoy = 2026-11-25 y un servicio designado para mañana = 2026-11-26
    const refToday = new Date(2026, 10, 25, 10, 0, 0); // 25 Nov 2026 10:00
    const mockEvents = [
        {
            start: "2026-11-26",
            extendedProps: {
                policia: "Olivera Fernando",
                empresa: "SIGLO21 (P3)",
                turno: "07-15",
                cat: "A"
            }
        }
    ];
    const alertPlan = Notifications.computeUpcomingServiceAlerts(mockEvents, refToday);
    assertEqual(alertPlan.tomorrowYMD, "2026-11-26", "Motor de alertas identifica correctamente la fecha de mañana (1 día antes del servicio)");
    assertEqual(alertPlan.tomorrowServices.length, 1, "Detecta el servicio vigente programado para mañana");
    assertEqual(alertPlan.scheduledAlerts.length, 2, "Genera exactamente 2 alertas al día (09:00 y 20:00 hs) para el día anterior al servicio");
    assertEqual(alertPlan.scheduledAlerts[0].slotHour, 9, "Primera alerta programada a las 09:00 hs del día anterior");
    assertEqual(alertPlan.scheduledAlerts[1].slotHour, 20, "Segunda alerta programada a las 20:00 hs del día anterior");
    assertEqual(alertPlan.scheduledAlerts[0].serviceDate, "2026-11-26", "Alerta incluye la fecha exacta del servicio para posicionar el calendario");

    // 4. Verificación de Bundle Web Capacitor (www/) con imágenes de portada y notificaciones
    buildWebDir();
    const wwwSplash1 = fs.existsSync(path.resolve(__dirname, '../www/img/portada_1.jpg'));
    const wwwSplash2 = fs.existsSync(path.resolve(__dirname, '../www/img/portada_2.jpg'));
    const wwwNotifJs = fs.existsSync(path.resolve(__dirname, '../www/js/services/notifications.js'));
    assertEqual(wwwSplash1 && wwwSplash2 && wwwNotifJs, true, "Bundle www/ incluye las 2 imágenes de portada y notifications.js para el APK");

    // 5. Verificación de UI en index.html y Configuraciones.html
    const indexHtml = fs.readFileSync(path.resolve(__dirname, '../index.html'), 'utf8');
    const configHtml = fs.readFileSync(path.resolve(__dirname, '../Configuraciones.html'), 'utf8');
    const pkg = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../package.json'), 'utf8'));

    assertEqual(indexHtml.includes('id="splashScreenOverlay"'), true, "index.html incluye overlay de Portada de Inicio única por sesión");
    assertEqual(indexHtml.includes('id="upcomingServiceAlertBanner"'), true, "index.html incluye banner interactivo de servicio próximo con botón Ir al Turno");
    assertEqual(configHtml.includes('seleccionarPortadaApp(\'portada_1\')') && configHtml.includes('seleccionarPortadaApp(\'portada_2\')'), true, "Configuraciones.html incluye selector de las 2 portadas debajo de Temas");
    assertEqual(configHtml.includes('vincularCuentaGmailYCrearSheet()'), true, "Configuraciones.html incluye vinculación con Gmail en sección 3");
    assertEqual(Boolean(pkg.dependencies['@capacitor/local-notifications']), true, "package.json incluye plugin nativo @capacitor/local-notifications para Android APK");

    console.log(`\n=== RESUMEN FINAL QA V6: ${passed} PASARON | ${failed} FALLARON ===`);
    return failed === 0;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { runTestSuite };
}

if (typeof require !== 'undefined' && typeof window === 'undefined') {
    runTestSuite().then(success => {
        if (!success) process.exit(1);
    });
}
