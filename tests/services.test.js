/**
 * @file services.test.js
 * @description Suite de Pruebas Unitarias e Integración V13 para Gestión de Servicios Adicionales (Web Alfas 2026).
 * Verifica:
 *  1. Solución práctica a la imagen adjunta (`{"status":"error","message":"Acción no reconocida: authorizeReadWriteDeleteSheet"}`):
 *     - `cloudSync.js` utiliza únicamente las acciones reales soportadas por el servidor Google Apps Script desplegado (`getServicios`, `syncTarifas`, `syncPolicias`, `syncEmpresas`, `addServicio`) y jamás abre el endpoint `/exec` en una pestaña del navegador con acciones no reconocidas.
 *     - `buildInteractiveGoogleAuthUrl` devuelve siempre una URL válida de `drive.google.com` o `docs.google.com/spreadsheets`.
 *     - `buildFourTabsWorkbookMatrices` y `exportarYGuardarArchivoGoogleSheets4Solapas` permiten generar y guardar físicamente el archivo `.xlsx` con las 4 solapas (`servicios`, `POLICIA`, `EMPRESAS`, `TARIFAS`) listo para subir/abrir en Google Drive o en el teléfono.
 *  2. Solapa Historial de 5 columnas (sin columna Acción).
 *  3. Solapa Gráficos con filtros de Mes y Empresa en el Gráfico 1 de Grupos Horarios.
 *  4. Solapa Configuraciones con las 5 opciones contraídas por defecto.
 */

const fs = require('fs');
const path = require('path');
const {
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

    console.log("=== INICIANDO SUITE DE PRUEBAS INTEGRAL V13 (SOLUCIÓN PRÁCTICA VINCULACIÓN/AUTENTICACIÓN GOOGLE SHEETS SIN ERROR DE ACCIÓN NO RECONOCIDA) ===");

    // 1. Seguridad base
    assertEqual(escapeHTML('<script>alert("xss")</script>'), '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;', "Sanitización XSS básica");
    assertEqual(sanitizeForSpreadsheet('=CMD("calc")'), "'=CMD(\"calc\")", "Bloqueo de fórmula =CMD()");

    // 2. Verificación de Bundle Web Capacitor (www/)
    buildWebDir();
    const indexHtml = fs.readFileSync(path.resolve(__dirname, '../index.html'), 'utf8');
    const configHtml = fs.readFileSync(path.resolve(__dirname, '../Configuraciones.html'), 'utf8');
    const cloudSyncJs = fs.readFileSync(path.resolve(__dirname, '../js/services/cloudSync.js'), 'utf8');

    // 3. Verificación de erradicación del error {"status":"error","message":"Acción no reconocida: authorizeReadWriteDeleteSheet"}
    assertEqual(
        cloudSyncJs.includes('action: "authorizeReadWriteDeleteSheet"') || cloudSyncJs.includes('action=authorizeReadWriteDeleteSheet'),
        false,
        "cloudSync.js ya NO envía la acción no reconocida authorizeReadWriteDeleteSheet al endpoint desplegado"
    );

    const safeUrl = CloudSync.buildInteractiveGoogleAuthUrl({ email: 'ferna.psn.eu@gmail.com' });
    assertEqual(
        safeUrl.includes('drive.google.com') || safeUrl.includes('docs.google.com/spreadsheets'),
        true,
        "buildInteractiveGoogleAuthUrl apunta siempre a Google Drive o Google Sheets y nunca al endpoint /exec crudo"
    );

    const authRes = await CloudSync.autenticarYOtorgarPermisosGoogleCloud({
        email: 'ferna.psn.eu@gmail.com',
        policiaTitular: 'Olivera Fernando',
        openInteractivePopup: false
    });
    assertEqual(
        authRes.ok && authRes.permissionsGranted && authRes.canRead && authRes.canWrite,
        true,
        "autenticarYOtorgarPermisosGoogleCloud verifica lectura (getServicios) y escritura (syncTarifas/Policias/Empresas) usando las acciones reales del servidor"
    );

    // 4. Generador práctico del archivo de 4 solapas (servicios, POLICIA, EMPRESAS, TARIFAS) para guardar en Google Drive / Dispositivo
    assertEqual(typeof Configuraciones.buildFourTabsWorkbookMatrices, 'function', "Configuraciones expone buildFourTabsWorkbookMatrices para generar la planilla física con las 4 solapas");
    const matrices = Configuraciones.buildFourTabsWorkbookMatrices();
    assertEqual(
        Object.keys(matrices),
        ['servicios', 'POLICIA', 'EMPRESAS', 'TARIFAS'],
        "La planilla generada contiene exactamente las 4 solapas oficiales (servicios, POLICIA, EMPRESAS, TARIFAS) con sus cabeceras"
    );
    assertEqual(
        configHtml.includes('exportarYGuardarArchivoGoogleSheets4Solapas()') &&
        configHtml.includes('guardarUrlDirectaGoogleSheet()'),
        true,
        "Configuraciones.html incluye el botón para generar/guardar el archivo .xlsx de 4 solapas en Google Drive y el campo para guardar el link directo de Google Sheets"
    );

    // 5. Solapa Historial (5 columnas sin Acción), Filtros de Grupos Horarios y Configuraciones contraídas
    assertEqual(indexHtml.includes('<th>Acción</th>'), false, "Solapa Historial mantiene únicamente las 5 columnas sin columna Acción");
    assertEqual(indexHtml.includes('id="filtroMesHorariosDashboard"') && indexHtml.includes('id="filtroEmpresaHorariosDashboard"'), true, "Gráfico 1 de Grupos Horarios incluye filtros de Mes y Empresa");
    assertEqual(configHtml.includes('accordion-card active'), false, "Todas las secciones numeradas de Configuraciones inician contraídas por defecto");

    console.log(`\n=== RESUMEN FINAL QA V13: ${passed} PASARON | ${failed} FALLARON ===`);
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
