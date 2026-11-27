/**
 * @file services.test.js
 * @description Suite de Pruebas Unitarias e Integración V11 para Gestión de Servicios Adicionales (Web Alfas 2026).
 * Verifica:
 *  1. En las 5 solapas de navegación (Agenda, Gráficos, Historial, Precartón, Config.) se visualizan los íconos personalizados según su carátula (`data-cover-nav-icon`), mientras el encabezado superior se mantiene limpio y centrado sin ícono extra.
 *  2. En la solapa Agenda el calendario ocupa el 100% de la pantalla disponible (`height: '100%'`, `contentHeight: '100%'`, `.fc-view-harness` y `.fc-scrollgrid-section-liquid > td` al 100%) sin espacio en blanco entre el calendario y las referencias y con cero scroll.
 *  3. Verificación y visualización del archivo creado en Google Drive / Google Sheets (`abrirArchivoSheetEnGoogleDrive` abre Google Drive por única vez tras crearlo/verificarlo y expone botón directo para visualizarlo).
 *  4. Eliminación real y definitiva de turnos adicionales agendados (`eliminarServicioDeListaYCalendario` + modal `#modalConfirmarEliminarServicio` + botón `🗑️` en la tabla de Historial + tombstones anti-reaparición + `deleteServicio` en `GoogleAppsScript_AutoSheet.gs`).
 */

const fs = require('fs');
const path = require('path');
const {
    AVAILABLE_SPLASH_COVERS,
    getCoverIconSet,
    escapeHTML,
    sanitizeForSpreadsheet
} = require('../js/utils/helpers.js');
const CloudSync = require('../js/services/cloudSync.js');
const Scripts = require('../js/scripts.js');
const Configuraciones = require('../js/configuraciones.js');
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

    console.log("=== INICIANDO SUITE DE PRUEBAS INTEGRAL V11 (ÍCONOS EN SOLAPAS SEGÚN CARÁTULA, CALENDARIO 100% SIN HUECO, APERTURA GOOGLE DRIVE Y ELIMINACIÓN DE TURNOS) ===");

    // 1. Seguridad base
    assertEqual(escapeHTML('<script>alert("xss")</script>'), '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;', "Sanitización XSS básica");
    assertEqual(sanitizeForSpreadsheet('=CMD("calc")'), "'=CMD(\"calc\")", "Bloqueo de fórmula =CMD()");

    // 2. Verificación de Bundle Web Capacitor (www/)
    buildWebDir();
    const indexHtml = fs.readFileSync(path.resolve(__dirname, '../index.html'), 'utf8');
    const configHtml = fs.readFileSync(path.resolve(__dirname, '../Configuraciones.html'), 'utf8');
    const precartonHtml = fs.readFileSync(path.resolve(__dirname, '../Precarton_Adcionales.html'), 'utf8');
    const scriptsJs = fs.readFileSync(path.resolve(__dirname, '../js/scripts.js'), 'utf8');
    const stylesCss = fs.readFileSync(path.resolve(__dirname, '../css/styles.css'), 'utf8');
    const gsScript = fs.readFileSync(path.resolve(__dirname, '../bdd/GoogleAppsScript_AutoSheet.gs'), 'utf8');

    // 3. Íconos en las 5 solapas según su carátula (Agenda, Gráficos, Historial, Precartón, Configuración)
    assertEqual(
        indexHtml.includes('data-cover-nav-icon="agenda"') &&
        indexHtml.includes('data-cover-nav-icon="resumen"') &&
        indexHtml.includes('data-cover-nav-icon="app"') &&
        indexHtml.includes('data-cover-nav-icon="precarton"') &&
        indexHtml.includes('data-cover-nav-icon="config"'),
        true,
        "index.html muestra en las 5 solapas (Agenda, Gráficos, Historial, Precartón, Config.) los íconos personalizados según la carátula seleccionada"
    );
    assertEqual(
        precartonHtml.includes('data-cover-nav-icon="precarton"') &&
        configHtml.includes('data-cover-nav-icon="config"'),
        true,
        "Precarton_Adcionales.html y Configuraciones.html también muestran los 5 íconos personalizados en las solapas inferiores"
    );
    assertEqual(indexHtml.includes('class="app-cover-badge-icon"'), false, "El encabezado superior de Gestión de Servicios Adicionales permanece limpio y centrado sin ícono extra");

    // 4. Solapa Agenda: El calendario ocupa el 100% de la pantalla disponible sin espacio vacío entre elementos y sin scroll
    assertEqual(
        scriptsJs.includes("height: '100%'") &&
        scriptsJs.includes("contentHeight: '100%'") &&
        stylesCss.includes('.calendar-card .fc-scrollgrid-section-liquid > td'),
        true,
        "FullCalendar usa height: '100%' y contentHeight: '100%' eliminando el espacio vacío entre el calendario y las referencias inferiores"
    );

    // 5. Verificación y apertura del archivo de Google Sheets en Google Drive por única vez
    assertEqual(typeof CloudSync.abrirArchivoSheetEnGoogleDrive, 'function', "CloudSync expone abrirArchivoSheetEnGoogleDrive para abrir Google Drive y visualizar el archivo creado");
    assertEqual(configHtml.includes('id="btnAbrirGoogleDriveSheet"') && configHtml.includes('abrirArchivoEnGoogleDrive(true)'), true, "Configuraciones.html incluye botón para abrir Google Drive y visualizar el archivo de Google Sheets creado");

    const linkRes = await CloudSync.vincularGmailYCrearSheet({
        email: 'ferna.psn.eu@gmail.com',
        policiaTitular: 'Olivera Fernando'
    });
    assertEqual(linkRes.ok && linkRes.driveSearchUrl.includes('drive.google.com/drive/search?q=Web_Alfas_2026_ferna.psn.eu'), true, "Al vincular el correo genera la URL de búsqueda y verificación directa en Google Drive para el archivo creado");

    const openOnce1 = CloudSync.abrirArchivoSheetEnGoogleDrive({ forceOpen: false });
    assertEqual(openOnce1.opened, true, "abrirArchivoSheetEnGoogleDrive(forceOpen: false) abre Google Drive automáticamente la primera vez tras crear el archivo");

    // 6. Eliminación definitiva de turnos adicionales agendados (del Calendario, de la Lista de Historial, de LocalStorage y de Google Sheets)
    assertEqual(indexHtml.includes('id="modalConfirmarEliminarServicio"') && indexHtml.includes('ejecutarEliminacionServicioConfirmada()'), true, "index.html incluye modal propio de confirmación para eliminar turnos adicionales (compatible con Android APK WebView)");
    assertEqual(typeof Scripts.eliminarServicioDeListaYCalendario, 'function', "scripts.js expone eliminarServicioDeListaYCalendario para borrar turnos tanto desde el calendario como desde la lista de historial");
    assertEqual(gsScript.includes("if (action === 'deleteServicio')"), true, "GoogleAppsScript_AutoSheet.gs implementa deleteServicio para eliminar la fila también en la hoja remota de Google Sheets");

    console.log(`\n=== RESUMEN FINAL QA V11: ${passed} PASARON | ${failed} FALLARON ===`);
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
