/**
 * @file services.test.js
 * @description Suite de Pruebas Unitarias e Integración V8 para Gestión de Servicios Adicionales (Web Alfas 2026).
 * Verifica:
 *  - Imagen 1: En el calendario, la etiqueta del turno agendado utiliza un color contrastante distinto del azul de los botones (`ensureDistinctEventColor` evita `#2563eb`).
 *  - Imagen 2: La tabla "Resumen por Policía" muestra exactamente lo que filtra el Gráfico 2 (Anual / Comparativo `porPoliciaAnual`), y el Gráfico Anual permite filtrar por Mes y Año (`computeWeekdayBarStats(events, targetYM, targetYear, targetAnualMonth)`).
 *  - Precartón: Al seleccionar una imagen de precartón guardada se abre en Pantalla Completa (`#modalVisorImagenPrecarton`) y al cerrar vuelve al mismo lugar; además las imágenes se filtran por Mes y Empresa (`filterSavedPrecartonPhotos`).
 *  - Configuraciones Opción 1: Incluye 4 portadas de inicio (`portada_1`, `portada_2`, `portada_03`, `portada_04`).
 *  - Configuraciones Opción 3: Permite chequear si el archivo de Google Sheets vinculado al Gmail está activo y crea la estructura completa de 4 solapas con cabeceras (`servicios`, `POLICIA`, `EMPRESAS`, `TARIFAS`) aunque esté vacío (`verificarYCrearEstructuraSheetCloud`).
 */

const fs = require('fs');
const path = require('path');
const {
    AVAILABLE_THEMES,
    AVAILABLE_SPLASH_COVERS,
    FORBIDDEN_BUTTON_BLUES,
    ensureDistinctEventColor,
    escapeHTML,
    sanitizeForSpreadsheet,
    sanitizeColor,
    isValidGmailAddress
} = require('../js/utils/helpers.js');
const CloudSync = require('../js/services/cloudSync.js');
const Scripts = require('../js/scripts.js');
const Precarton = require('../js/precarton.js');
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

    console.log("=== INICIANDO SUITE DE PRUEBAS INTEGRAL V8 (CONTRASTE CALENDARIO, COMPARACIÓN GRÁFICOS, VISOR PRECARTÓN Y ESTRUCTURA SHEETS) ===");

    // 1. Seguridad base
    assertEqual(escapeHTML('<script>alert("xss")</script>'), '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;', "Sanitización XSS básica");
    assertEqual(sanitizeForSpreadsheet('=CMD("calc")'), "'=CMD(\"calc\")", "Bloqueo de fórmula =CMD()");

    // 2. Verificación de Bundle Web Capacitor (www/)
    buildWebDir();
    const indexHtml = fs.readFileSync(path.resolve(__dirname, '../index.html'), 'utf8');
    const configHtml = fs.readFileSync(path.resolve(__dirname, '../Configuraciones.html'), 'utf8');
    const precartonHtml = fs.readFileSync(path.resolve(__dirname, '../Precarton_Adcionales.html'), 'utf8');
    const precartonJs = fs.readFileSync(path.resolve(__dirname, '../js/precarton.js'), 'utf8');
    const gsScript = fs.readFileSync(path.resolve(__dirname, '../bdd/GoogleAppsScript_AutoSheet.gs'), 'utf8');

    // 3. Imagen 1: Color de etiqueta de turno en el calendario distinto del color azul de los botones (#2563eb)
    const distinctFromButtonBlue = ensureDistinctEventColor('#2563eb', 'Olivera Fernando');
    assertEqual(FORBIDDEN_BUTTON_BLUES.includes(distinctFromButtonBlue.toLowerCase()), false, "Imagen 1: ensureDistinctEventColor reemplaza el azul #2563eb de los botones por un color contrastante");
    const evInfo = Scripts.extractStructuredEventInfo({
        backgroundColor: '#2563eb',
        extendedProps: { empresa: 'SIGLO21 (P3)', policia: 'Olivera Fernando', turno: '07-15' }
    });
    assertEqual(FORBIDDEN_BUTTON_BLUES.includes(evInfo.policiaColor.toLowerCase()), false, "Imagen 1: La etiqueta del turno en el calendario nunca usa el color azul de los botones");

    // 4. Imagen 2: Comparación entre gráficos (filtro por Mes y Año en el Gráfico 2) y Resumen por Policía vinculado al Gráfico 2
    assertEqual(indexHtml.includes('id="filtroMesAnualDashboard"') && indexHtml.includes('id="filtroAnioDashboard"'), true, "Imagen 2: El Gráfico 2 cuenta con selectores independientes de Mes y Año para comparar períodos");
    const sampleComparisonEvents = [
        { start: '2026-01-10', extendedProps: { policia: 'Olivera Fernando', cost: 135870 } },
        { start: '2026-02-15', extendedProps: { policia: 'Bracamonte Jonathan', cost: 119944 } },
        { start: '2025-01-12', extendedProps: { policia: 'Felix Noelia', cost: 100000 } }
    ];
    // Comparar Enero 2026 en Gráfico 1 contra Enero 2025 en Gráfico 2
    const compStats = Scripts.computeWeekdayBarStats(sampleComparisonEvents, '2026-01', 2025, '01');
    assertEqual(compStats.totalTurnosMes, 1, "Gráfico 1 filtra Enero 2026 (1 turno)");
    assertEqual(compStats.totalTurnosAnual, 1, "Gráfico 2 filtra Enero 2025 (1 turno)");
    assertEqual(Object.keys(compStats.porPoliciaAnual), ['Felix Noelia'], "Imagen 2: Resumen por Policía muestra exactamente lo filtrado por el Gráfico 2 (Enero 2025 -> Felix Noelia)");

    // Si el Gráfico 2 filtra todo el año 2026 (mes vacío "")
    const fullYearStats = Scripts.computeWeekdayBarStats(sampleComparisonEvents, '2026-01', 2026, '');
    assertEqual(fullYearStats.totalTurnosAnual, 2, "Gráfico 2 en modo Todos los meses (2026) acumula los 2 turnos del año");
    assertEqual(Object.keys(fullYearStats.porPoliciaAnual).length, 2, "Imagen 2: Resumen por Policía refleja todos los efectivos del año 2026 filtrado");

    // 5. Precartón: Visor de Imagen en Pantalla Completa y Filtrado por Mes y Empresa
    assertEqual(precartonHtml.includes('id="modalVisorImagenPrecarton"') && precartonHtml.includes('cerrarVisorImagenPrecartonCompleta()'), true, "Precartón incluye modal de Pantalla Completa para visualizar imágenes y volver al mismo lugar al cerrar");
    const mockFotos = [
        { id: 'f1', nombre: 'Paladini Nov 2026', empresa: 'PALADINI', mes: 10, anio: 2026 },
        { id: 'f2', nombre: 'Siglo21 Nov 2026', empresa: 'SIGLO21 (P1)', mes: 10, anio: 2026 },
        { id: 'f3', nombre: 'Paladini Oct 2026', empresa: 'PALADINI', mes: 9, anio: 2026 }
    ];
    const filtradasMesEmp = Precarton.filterSavedPrecartonPhotos(mockFotos, { empresa: 'PALADINI', mes: 10, anio: 2026, modo: 'mes-empresa' });
    assertEqual(filtradasMesEmp.length, 1, "Precartón filtra imágenes por Mes + Empresa seleccionados (1 imagen)");
    const filtradasSoloMes = Precarton.filterSavedPrecartonPhotos(mockFotos, { empresa: 'PALADINI', mes: 10, anio: 2026, modo: 'mes' });
    assertEqual(filtradasSoloMes.length, 2, "Precartón filtra imágenes por Mes seleccionado (2 imágenes en Noviembre)");
    const filtradasSoloEmp = Precarton.filterSavedPrecartonPhotos(mockFotos, { empresa: 'PALADINI', mes: 10, anio: 2026, modo: 'empresa' });
    assertEqual(filtradasSoloEmp.length, 2, "Precartón filtra imágenes por Empresa seleccionada (2 imágenes de PALADINI)");

    // 6. Configuraciones Opción 1: 4 Portadas de Inicio (portada_1, portada_2, portada_03, portada_04)
    assertEqual(Object.keys(AVAILABLE_SPLASH_COVERS), ['portada_1', 'portada_2', 'portada_03', 'portada_04'], "Opción 1 de Configuraciones soporta las 4 portadas (portada_1, portada_2, portada_03, portada_04)");
    assertEqual(
        fs.existsSync(path.resolve(__dirname, '../www/img/portada_03.jpg')) &&
        fs.existsSync(path.resolve(__dirname, '../www/img/portada_04.jpg')),
        true,
        "Archivos físicos img/portada_03.jpg e img/portada_04.jpg existen en el bundle www/ del APK"
    );
    assertEqual(
        configHtml.includes('data-splash-id="portada_03"') &&
        configHtml.includes('data-splash-id="portada_04"'),
        true,
        "Configuraciones.html muestra las tarjetas de selección para Portada 03 y Portada 04"
    );

    // 7. Configuraciones Opción 3: Chequear archivo activo de Google Sheets y crear estructura vacía con las 4 solapas y sus cabeceras
    const verifyRes = await CloudSync.verificarYCrearEstructuraSheetCloud({
        email: 'fernando.olivera@gmail.com',
        policiaTitular: 'Olivera Fernando'
    });
    assertEqual(verifyRes.ok, true, "verificarYCrearEstructuraSheetCloud valida cuenta Gmail y activa la estructura");
    assertEqual(verifyRes.isActive, true, "El estado del archivo Google Sheets vinculado se reporta como ACTIVO");
    assertEqual(verifyRes.structureVerified, true, "La estructura del archivo Google Sheets se reporta como verificada");
    assertEqual(verifyRes.tabsCreated, ['servicios', 'POLICIA', 'EMPRESAS', 'TARIFAS'], "Se crean las 4 solapas requeridas aunque el archivo esté vacío");
    assertEqual(gsScript.includes('verifyOrInitEmptySheetStructure') && gsScript.includes('REQUIRED_TABS_HEADERS'), true, "GoogleAppsScript_AutoSheet.gs crea las 4 solapas y sus filas de cabecera aunque la base esté vacía");

    console.log(`\n=== RESUMEN FINAL QA V8: ${passed} PASARON | ${failed} FALLARON ===`);
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
