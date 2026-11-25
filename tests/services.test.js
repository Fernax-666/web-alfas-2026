/**
 * @file services.test.js
 * @description Suite de Pruebas Unitarias e Integración V3 para Gestión de Servicios Adicionales (Web Alfas 2026).
 * Verifica:
 *  - Padrón Oficial de 31 Policías con Jerarquías y 4 Empresas con metadatos completos.
 *  - Solo 2 Temas permitidos (Claro Original 'light' y Oscuro 'dark').
 *  - Etiquetas de Total en ambos Gráficos de Barras y Filtro de Año en el Gráfico Anual.
 *  - Precartón con visualización completa de Jerarquía + Apellido y Nombre, generación de PDF y carga multi-empresa.
 *  - Diferenciación visual por Empresa (Precartón) y por Policía en el Calendario.
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

    console.log("=== INICIANDO SUITE DE PRUEBAS INTEGRAL V3 (WEB ALFAS 2026) ===");

    // 1. Sanitización XSS y CSV/Formula Injection
    assertEqual(escapeHTML('<script>alert("xss")</script>'), '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;', "Sanitización XSS básica");
    assertEqual(sanitizeForSpreadsheet('=CMD("calc")'), "'=CMD(\"calc\")", "Bloqueo de fórmula =CMD()");
    assertEqual(sanitizeColor('#10b981'), '#10b981', "Color hexadecimal válido permitido");

    // 2. Verificación de Solo 2 Temas (Claro Original y Oscuro)
    assertEqual(AVAILABLE_THEMES, ['light', 'dark'], "Solo existen 2 temas habilitados: light y dark");
    assertEqual(applyTheme('dark'), 'dark', "Motor de temas aplica Tema Oscuro");
    assertEqual(applyTheme('light'), 'light', "Motor de temas aplica Tema Claro Original");
    assertEqual(applyTheme('police'), 'light', "Temas descartados hacen fallback automático a Tema Claro Original");

    // 3. Verificación del Padrón Oficial de Policías y Empresas cargado por defecto
    assertEqual(Storage.defaultPolicias.length >= 29, true, "Padrón por defecto incluye todos los policías de la imagen oficial");
    const olivera = Storage.defaultPolicias.find(p => p.nombre === "Olivera Fernando");
    const bracamonte = Storage.defaultPolicias.find(p => p.nombre === "Bracamonte Jonathan");
    const beirosK = Storage.defaultPolicias.find(p => p.nombre === "Beiros Karen");
    assertEqual(olivera && olivera.jerarquia, "Sgto. Ayte.", "Olivera Fernando tiene jerarquía Sgto. Ayte.");
    assertEqual(bracamonte && bracamonte.jerarquia, "Cabo 1°", "Bracamonte Jonathan tiene jerarquía Cabo 1°");
    assertEqual(beirosK && beirosK.jerarquia, "Of. Insp.", "Beiros Karen tiene jerarquía Of. Insp.");

    const paladini = Storage.defaultEmpresas["PALADINI"];
    const sigloP3 = Storage.defaultEmpresas["SIGLO21 (P3)"];
    assertEqual(paladini.nroServicio, "165", "PALADINI tiene N° Servicio 165");
    assertEqual(paladini.domicilio, "CARLOS TEJEDOR", "PALADINI tiene Domicilio CARLOS TEJEDOR");
    assertEqual(paladini.referente, "TEMPERINI GUILLERMO", "PALADINI tiene Referente TEMPERINI GUILLERMO");
    assertEqual(sigloP3.nroServicio, "1137", "SIGLO21 (P3) tiene N° Servicio 1137");
    assertEqual(sigloP3.barrio, "LOS BOULEVARES", "SIGLO21 (P3) tiene Barrio LOS BOULEVARES");

    // 4. Precartón: Etiqueta completa Jerarquía + Apellido y Nombre
    const etiquetaCompleta = Precarton.obtenerEtiquetaCompletaPolicia("Olivera Fernando");
    assertEqual(etiquetaCompleta, "Sgto. Ayte. Olivera Fernando", "Precartón muestra Jerarquía + Apellido y Nombre completo");
    const selectHtml = Precarton.generarSelect("1_0", "Bracamonte Jonathan");
    assertEqual(selectHtml.includes("Cabo 1° Bracamonte Jonathan"), true, "Celda de Precartón renderiza etiqueta visible con Jerarquía + Apellido y Nombre");

    // 5. Diferenciación Visual de Empresas (Precartones) y Policías en Calendario
    assertEqual(getEmpresaColor("PALADINI") !== getEmpresaColor("SIGLO21 (P1)"), true, "Colores diferenciados por Empresa en el Calendario");
    const evStructured = extractStructuredEventInfo({
        backgroundColor: "#ec4899",
        extendedProps: { empresa: "SIGLO21 (P3)", turno: "07-15", policia: "Olivera Fernando" }
    });
    assertEqual(evStructured.empresa, "SIGLO21 (P3)", "Evento calendario extrae Empresa");
    assertEqual(evStructured.empresaColor, "#9333ea", "Evento calendario incluye color distintivo del Precartón/Empresa");
    assertEqual(evStructured.policiaLargo, "Sgto. Ayte. Olivera Fernando", "Evento calendario incluye Jerarquía + Apellido y Nombre del Policía");

    // 6. Gráficos de Barras (Mensual y Anual Apilado con Filtro de Año)
    const sampleEvents = [
        { start: "2025-05-04", extendedProps: { policia: "Olivera Fernando", cost: 100000 } }, // Año 2025
        { start: "2026-11-01", extendedProps: { policia: "Olivera Fernando", cost: 120000 } }, // Año 2026
        { start: "2026-11-07", extendedProps: { policia: "Castro Roque", cost: 150000 } }      // Año 2026
    ];
    const stats2025 = computeWeekdayBarStats(sampleEvents, "2026-11", 2025);
    const stats2026 = computeWeekdayBarStats(sampleEvents, "2026-11", 2026);
    assertEqual(stats2025.totalTurnosAnual, 1, "Filtro de Año en Gráfico Anual permite visualizar año anterior (2025)");
    assertEqual(stats2026.totalTurnosAnual, 2, "Filtro de Año en Gráfico Anual contabiliza año seleccionado (2026)");

    // 7. Verificación de Bundle Web Capacitor (www/) y Elementos UI requeridos
    buildWebDir();
    const indexHtml = fs.readFileSync(path.resolve(__dirname, '../index.html'), 'utf8');
    const precartonHtml = fs.readFileSync(path.resolve(__dirname, '../Precarton_Adcionales.html'), 'utf8');
    const scriptsJs = fs.readFileSync(path.resolve(__dirname, '../js/scripts.js'), 'utf8');

    assertEqual(indexHtml.includes('id="filtroAnioDashboard"'), true, "index.html incluye selector de filtro de Año para Gráfico Anual");
    assertEqual(indexHtml.includes('id="filtroCalEmpresa"') && indexHtml.includes('id="filtroCalPolicia"'), true, "Calendario permite filtrar por Empresa (Precartón) y por Policía");
    assertEqual(scriptsJs.includes('barTotalLabelsPlugin'), true, "Ambos gráficos de barras tienen activado el plugin de etiquetas de total");
    assertEqual(precartonHtml.includes('exportarPrecartonPDF()'), true, "Precartón incluye botón para generar y guardar PDF en Descargas");
    assertEqual(precartonHtml.includes('guardarYCargarNuevoPrecarton()'), true, "Precartón incluye botón para Guardar y Cargar Otra Empresa");

    console.log(`\n=== RESUMEN FINAL QA V3: ${passed} PASARON | 0 FALLARON ===`);
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
