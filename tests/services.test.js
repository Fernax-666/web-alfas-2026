/**
 * @file services.test.js
 * @description Suite de Pruebas Unitarias e Integración V14 para Gestión de Servicios Adicionales (Web Alfas 2026).
 * Verifica:
 *  1. Rastreo y diagnóstico real del archivo de Google Sheets (`rastrearYVerificarUbicacionRealArchivoCloud` y `#panelRastreoRealGoogleSheets`):
 *     - Distingue con transparencia si `"Web_Alfas_2026_ferna.psn.eu"` está guardado como perfil local o si se creó un archivo nuevo en Drive, e informa que en la nube los registros se están guardando dentro de la planilla maestra `"alfas_rec.gsheet"` vinculada al servidor Google Apps Script.
 *  2. Generador físico de las 4 solapas (`buildFourTabsWorkbookMatrices` -> `servicios`, `POLICIA`, `EMPRESAS`, `TARIFAS`) para subir directamente el archivo `.xlsx` a Google Drive.
 *  3. Solapa Historial de 5 columnas (sin columna Acción), filtros de Mes y Empresa en Gráfico 1 de Grupos Horarios, y todas las secciones de Configuraciones contraídas por defecto.
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

    console.log("=== INICIANDO SUITE DE PRUEBAS INTEGRAL V14 (RASTREO REAL LOCAL VS GOOGLE DRIVE / ALFAS_REC.GSHEET) ===");

    // 1. Seguridad base
    assertEqual(escapeHTML('<script>alert("xss")</script>'), '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;', "Sanitización XSS básica");
    assertEqual(sanitizeForSpreadsheet('=CMD("calc")'), "'=CMD(\"calc\")", "Bloqueo de fórmula =CMD()");

    // 2. Verificación de Bundle Web Capacitor (www/)
    buildWebDir();
    const indexHtml = fs.readFileSync(path.resolve(__dirname, '../index.html'), 'utf8');
    const configHtml = fs.readFileSync(path.resolve(__dirname, '../Configuraciones.html'), 'utf8');

    // 3. Rastreo real de ubicación del archivo (Local vs Google Drive / Planilla Maestra alfas_rec.gsheet)
    assertEqual(typeof CloudSync.rastrearYVerificarUbicacionRealArchivoCloud, 'function', "CloudSync expone rastrearYVerificarUbicacionRealArchivoCloud para rastrear dónde se guarda el archivo realmente");
    assertEqual(
        configHtml.includes('id="panelRastreoRealGoogleSheets"') &&
        configHtml.includes('ejecutarRastreoYDiagnosticoRealSheet()'),
        true,
        "Configuraciones.html incluye el panel visual de Rastreo Real (Local vs Google Drive)"
    );

    const traceRes = await CloudSync.rastrearYVerificarUbicacionRealArchivoCloud({
        email: 'ferna.psn.eu@gmail.com'
    });
    assertEqual(traceRes.ok && traceRes.requestedFileName === 'Web_Alfas_2026_ferna.psn.eu', true, "El rastreador identifica el nombre solicitado Web_Alfas_2026_ferna.psn.eu");
    assertEqual(
        CloudSync.getEndpointUrl(),
        "https://script.google.com/macros/s/AKfycbw2QbxTAlP_k_76-zpeDhdrSGvX0PbZpbNyOpvrS94xd1S_FMW-COmpXqh738Ty2Bpneg/exec",
        "CloudSync apunta a la nueva implementación Versión 10 de Google Apps Script"
    );
    assertEqual(
        traceRes.newFileCreatedInDrive && traceRes.realCloudSheetName === 'Web_Alfas_2026_ferna.psn.eu',
        true,
        "El rastreador verifica en vivo que el archivo nuevo Web_Alfas_2026_ferna.psn.eu fue creado en Google Drive con la Versión 10 del Apps Script"
    );
    assertEqual(Object.keys(traceRes.tabsStatus), ['servicios', 'POLICIA', 'EMPRESAS', 'TARIFAS'], "El rastreador verifica el estado de las 4 solapas (servicios, POLICIA, EMPRESAS, TARIFAS)");

    // 4. Generador de archivo físico .xlsx con las 4 solapas para Google Drive
    const matrices = Configuraciones.buildFourTabsWorkbookMatrices();
    assertEqual(Object.keys(matrices), ['servicios', 'POLICIA', 'EMPRESAS', 'TARIFAS'], "buildFourTabsWorkbookMatrices genera las 4 solapas completas con sus cabeceras para subir a Google Drive");

    // 5. Solapa Historial (5 columnas sin Acción), Filtros de Grupos Horarios y Configuraciones contraídas
    assertEqual(indexHtml.includes('<th>Acción</th>'), false, "Solapa Historial mantiene únicamente las 5 columnas sin columna Acción");
    assertEqual(indexHtml.includes('id="filtroMesHorariosDashboard"') && indexHtml.includes('id="filtroEmpresaHorariosDashboard"'), true, "Gráfico 1 de Grupos Horarios incluye filtros de Mes y Empresa");
    assertEqual(configHtml.includes('accordion-card active'), false, "Todas las secciones numeradas de Configuraciones inician contraídas por defecto");

    console.log(`\n=== RESUMEN FINAL QA V14: ${passed} PASARON | ${failed} FALLARON ===`);
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
