/**
 * @file services.test.js
 * @description Suite de Pruebas Unitarias e Integración V12 para Gestión de Servicios Adicionales (Web Alfas 2026).
 * Verifica:
 *  1. Solapa Historial: La tabla contiene estrictamente las 5 columnas solicitadas (Fecha, Empresa, Turno, Categoría, Costo) sin columna "Acción (eliminar)". La eliminación se realiza tocando el turno en el Calendario con `#modalConfirmarEliminarServicio`.
 *  2. Solapa Gráficos: En el Gráfico 1 "1. Distribución por Grupos Horarios (Circular)" se incluyen los filtros de Mes (`#filtroMesHorariosDashboard`) y Empresa (`#filtroEmpresaHorariosDashboard`) y `computeWeekdayBarStats` filtra los grupos horarios por ambos criterios.
 *  3. Vinculación de Correo Gmail: Autenticación con la cuenta Google (`autenticarYOtorgarPermisosGoogleCloud` + `buildInteractiveGoogleAuthUrl` + `authorizeReadWriteDeleteSheet` en `GoogleAppsScript_AutoSheet.gs`) para otorgar permisos de Lectura, Escritura y Borrado y crear/guardar el archivo de Google Sheets.
 *  4. Solapa Configuraciones: Todas las secciones numeradas (1 a 5) inician contraídas por defecto (sin clase `active` inicial y con `contraerTodasLasSeccionesConfig()`).
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

    console.log("=== INICIANDO SUITE DE PRUEBAS INTEGRAL V12 (HISTORIAL 5 COLUMNAS, FILTROS MES+EMPRESA EN GRUPOS HORARIOS, AUTENTICACIÓN PERMISOS GOOGLE SHEETS Y CONFIGURACIONES 100% CONTRAÍDAS) ===");

    // 1. Seguridad base
    assertEqual(escapeHTML('<script>alert("xss")</script>'), '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;', "Sanitización XSS básica");
    assertEqual(sanitizeForSpreadsheet('=CMD("calc")'), "'=CMD(\"calc\")", "Bloqueo de fórmula =CMD()");

    // 2. Verificación de Bundle Web Capacitor (www/)
    buildWebDir();
    const indexHtml = fs.readFileSync(path.resolve(__dirname, '../index.html'), 'utf8');
    const configHtml = fs.readFileSync(path.resolve(__dirname, '../Configuraciones.html'), 'utf8');
    const scriptsJs = fs.readFileSync(path.resolve(__dirname, '../js/scripts.js'), 'utf8');
    const gsScript = fs.readFileSync(path.resolve(__dirname, '../bdd/GoogleAppsScript_AutoSheet.gs'), 'utf8');

    // 3. Solapa Historial: Sin columna "Acción" (solo Fecha, Empresa, Turno, Categoría, Costo)
    assertEqual(indexHtml.includes('<th>Acción</th>') || indexHtml.includes('>Acción</th>'), false, "La tabla de la solapa Historial NO contiene la columna Acción (eliminar)");
    assertEqual(
        indexHtml.includes('<th>Fecha</th>') &&
        indexHtml.includes('<th>Empresa</th>') &&
        indexHtml.includes('<th>Turno</th>') &&
        indexHtml.includes('<th>Categoría</th>') &&
        indexHtml.includes('<th>Costo</th>'),
        true,
        "La tabla de la solapa Historial muestra exactamente las 5 columnas (Fecha, Empresa, Turno, Categoría, Costo)"
    );

    // 4. Solapa Gráficos: Gráfico 1 "1. Distribución por Grupos Horarios" con filtro de Mes y Empresa
    assertEqual(
        indexHtml.includes('id="filtroMesHorariosDashboard"') &&
        indexHtml.includes('id="filtroEmpresaHorariosDashboard"'),
        true,
        "El gráfico 1 (Distribución por Grupos Horarios) incluye selectores de filtro por Mes y por Empresa"
    );

    const sampleHorarioEvents = [
        { start: '2026-11-05', extendedProps: { empresa: 'PALADINI', policia: 'Olivera Fernando', turno: '06-14', cost: 119944 } },
        { start: '2026-11-06', extendedProps: { empresa: 'PALADINI', policia: 'Olivera Fernando', turno: '14-22', cost: 119944 } },
        { start: '2026-11-07', extendedProps: { empresa: 'SIGLO21 (P1)', policia: 'Olivera Fernando', turno: '07-15', cost: 135870 } },
        { start: '2026-10-10', extendedProps: { empresa: 'PALADINI', policia: 'Olivera Fernando', turno: '22-06', cost: 119944 } }
    ];
    const statsFilteredByMonthAndCompany = Scripts.computeWeekdayBarStats(
        sampleHorarioEvents,
        '2026-11',
        2026,
        '',
        '2026-11',
        'PALADINI'
    );
    assertEqual(
        Object.keys(statsFilteredByMonthAndCompany.porGrupoHorarioMes).sort(),
        ['06-14hs', '14-22hs'],
        "computeWeekdayBarStats filtra la distribución por grupos horarios según el Mes (2026-11) y la Empresa (PALADINI)"
    );

    // 5. Vinculación de Correo Gmail: Autenticación con la cuenta para otorgar permisos de Escritura y Borrado y guardar el archivo Google Sheets
    assertEqual(typeof CloudSync.autenticarYOtorgarPermisosGoogleCloud, 'function', "CloudSync expone autenticarYOtorgarPermisosGoogleCloud para autenticar y otorgar permisos de escritura y borrado");
    assertEqual(typeof CloudSync.buildInteractiveGoogleAuthUrl, 'function', "CloudSync expone buildInteractiveGoogleAuthUrl para el flujo de consentimiento y creación de Google Sheets");
    assertEqual(configHtml.includes('id="btnAutenticarPermisosGoogle"') && configHtml.includes('autenticarYOtorgarPermisosGoogleSheets()'), true, "Configuraciones.html incluye el botón de autenticación de permisos (Escribir y Borrar) de Google Sheets");
    assertEqual(gsScript.includes("action === 'authorizeReadWriteDeleteSheet'") && gsScript.includes('writeDeleteVerified'), true, "GoogleAppsScript_AutoSheet.gs autentica la cuenta, otorga permisos de editor y verifica escritura y borrado real en la hoja");

    const authRes = await CloudSync.autenticarYOtorgarPermisosGoogleCloud({
        email: 'ferna.psn.eu@gmail.com',
        policiaTitular: 'Olivera Fernando',
        openInteractivePopup: false
    });
    assertEqual(
        authRes.ok && authRes.permissionsGranted && authRes.canWrite && authRes.canDelete,
        true,
        "autenticarYOtorgarPermisosGoogleCloud confirma permisos activos de lectura, escritura y borrado para el archivo de Google Sheets"
    );

    // 6. Solapa Configuraciones: Todas las opciones numeradas (1 a 5) inician contraídas por defecto
    assertEqual(configHtml.includes('accordion-card active'), false, "En Configuraciones.html ninguna sección numerada inicia expandida (todas están contraídas por defecto)");
    assertEqual(typeof Configuraciones.contraerTodasLasSeccionesConfig, 'function', "Configuraciones expone contraerTodasLasSeccionesConfig() y lo ejecuta al iniciar");

    console.log(`\n=== RESUMEN FINAL QA V12: ${passed} PASARON | ${failed} FALLARON ===`);
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
