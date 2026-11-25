/**
 * @file services.test.js
 * @description Suite de Pruebas Unitarias e Integración V4 para Gestión de Servicios Adicionales (Web Alfas 2026).
 */

const fs = require('fs');
const path = require('path');
const {
    AVAILABLE_THEMES,
    escapeHTML,
    sanitizeForSpreadsheet,
    sanitizeColor,
    safeParse,
    validateServicioRecord,
    formatearTurno,
    formatearTurnoCorto,
    abreviarNombrePolicia,
    getEmpresaColor,
    applyTheme
} = require('../js/utils/helpers.js');
const { calcularCostoTurno } = require('../js/services/calculator.js');
const Database = require('../js/services/database.js');
const Storage = require('../js/services/storage.js');
const { extractStructuredEventInfo, computeWeekdayBarStats } = require('../js/scripts.js');
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

    console.log("=== INICIANDO SUITE DE PRUEBAS INTEGRAL V4 (WEB ALFAS 2026) ===");

    // 1. Sanitización XSS y CSV/Formula Injection
    assertEqual(escapeHTML('<script>alert("xss")</script>'), '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;', "Sanitización XSS básica");
    assertEqual(sanitizeForSpreadsheet('=CMD("calc")'), "'=CMD(\"calc\")", "Bloqueo de fórmula =CMD()");
    assertEqual(sanitizeColor('#10b981'), '#10b981', "Color hexadecimal válido permitido");

    // 2. Verificación de Solo 2 Temas (Claro Original y Oscuro)
    assertEqual(AVAILABLE_THEMES, ['light', 'dark'], "Solo existen 2 temas habilitados: light y dark");
    assertEqual(applyTheme('dark'), 'dark', "Motor de temas aplica Tema Oscuro");
    assertEqual(applyTheme('light'), 'light', "Motor de temas aplica Tema Claro Original");

    // 3. Padrón Oficial de Policías y Empresas
    assertEqual(Storage.defaultPolicias.length >= 29, true, "Padrón por defecto incluye todos los policías oficiales");
    const paladini = Storage.defaultEmpresas["PALADINI"];
    assertEqual(paladini.nroServicio, "165", "PALADINI tiene N° Servicio 165");

    // 4. Precartón: Etiqueta completa y Visor Automático de PDF
    const etiquetaCompleta = Precarton.obtenerEtiquetaCompletaPolicia("Olivera Fernando");
    assertEqual(etiquetaCompleta, "Sgto. Ayte. Olivera Fernando", "Precartón muestra Jerarquía + Apellido y Nombre completo");
    assertEqual(typeof Precarton.cerrarVisorPDFPrecarton, "function", "Precartón expone función cerrarVisorPDFPrecarton para volver a la aplicación");

    // 5. Calendario: Etiquetas completas sin truncamiento (Empresa, Horario, Policía)
    const evStructured = extractStructuredEventInfo({
        backgroundColor: "#ec4899",
        extendedProps: { empresa: "SIGLO21 (P3)", turno: "07-15", policia: "Olivera Fernando" }
    });
    assertEqual(evStructured.empresa, "SIGLO21 (P3)", "Evento calendario muestra Empresa completa");
    assertEqual(evStructured.horarioCorto, "07-15hs", "Evento calendario muestra Horario completo");
    assertEqual(evStructured.policiaCorto, "Olivera F.", "Evento calendario muestra Apellido + Inicial limpio para lectura completa en celda móvil");

    // 6. Verificación de Ajustes Visuales en HTML/CSS solicitados en las 4 imágenes
    buildWebDir();
    const indexHtml = fs.readFileSync(path.resolve(__dirname, '../index.html'), 'utf8');
    const configHtml = fs.readFileSync(path.resolve(__dirname, '../Configuraciones.html'), 'utf8');
    const precartonHtml = fs.readFileSync(path.resolve(__dirname, '../Precarton_Adcionales.html'), 'utf8');
    const stylesCss = fs.readFileSync(path.resolve(__dirname, '../css/styles.css'), 'utf8');

    // Imagen 2: Referencias ubicadas en la parte de abajo del calendario
    const posCalendar = indexHtml.indexOf('id="calendar"');
    const posLegend = indexHtml.indexOf('id="leyendaEmpresasCal"');
    assertEqual(posLegend > posCalendar, true, "Referencias de empresas ubicadas en la parte inferior del calendario (Imagen 2)");

    // Imagen 3: Filtros de calendario en 1 sola línea (grid-template-columns: 1fr 1fr)
    assertEqual(stylesCss.includes('.cal-filters-bar') && stylesCss.includes('grid-template-columns: 1fr 1fr'), true, "Filtros de calendario entran en 1 sola línea (Imagen 3)");

    // Imagen 4: Botón flotante para capturar calendario y compartir por WhatsApp
    assertEqual(indexHtml.includes('capturarYCompartirCalendarioWhatsApp()'), true, "Botón flotante (FAB) para captura de calendario y envío por WhatsApp (Imagen 4)");

    // Precartón: Modal de visor automático de PDF con botón Cerrar y Volver
    assertEqual(precartonHtml.includes('id="modalVisorPDFPrecarton"') && precartonHtml.includes('cerrarVisorPDFPrecarton()'), true, "Precartón abre visor automático de PDF y vuelve a la app al cerrar");

    // Configuraciones: 2 items por línea en Actualización de Montos y eliminación de los 3 botones en Base de Datos Local
    assertEqual(configHtml.includes('class="panel-costos-2col"'), true, "Actualización de Montos acomoda 2 categorías por línea (Cat. A, Cat. AP)");
    assertEqual(configHtml.includes('exportarBaseDatosSQL()'), false, "Eliminado botón Exportar Base SQL (.sql) en Configuraciones");
    assertEqual(configHtml.includes('Exportar Reportes (PDF/Excel)'), false, "Eliminado botón Exportar Reportes (PDF/Excel) en Configuraciones");
    assertEqual(configHtml.includes('sincronizarColaOutbox()'), false, "Eliminado botón Sincronizar Cola Outbox en Configuraciones");

    console.log(`\n=== RESUMEN FINAL QA V4: ${passed} PASARON | ${failed} FALLARON ===`);
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
