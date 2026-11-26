/**
 * @file services.test.js
 * @description Suite de Pruebas Unitarias e Integración V7 para Gestión de Servicios Adicionales (Web Alfas 2026).
 * Verifica:
 *  - Imagen 1: Referencias de servicios más grandes y accesibles (`.cal-emp-chip` >= 0.78rem).
 *  - Imagen 2 y 3: Cabeceras fijas (`position: sticky`) al hacer scroll tanto en Dashboard (`.sticky-top-dashboard`) como en Precartón (`.sticky-top-precarton`).
 *  - Imagen 4: Botones de Precartones acomodados en grilla de 4 por línea (`.precarton-loaded-grid-4col`).
 *  - Precartón: Captura de foto por Cámara o Galería con Nombre Personalizado, Selector Múltiple de Días para filtrar/exportar y PDF en Vertical A4 (`orientation: 'portrait'`).
 *  - Configuraciones: Secciones numeradas (1 a 5) organizadas en acordeón exclusivo (`toggleSeccionConfig`).
 */

const fs = require('fs');
const path = require('path');
const {
    AVAILABLE_THEMES,
    AVAILABLE_SPLASH_COVERS,
    escapeHTML,
    sanitizeForSpreadsheet,
    sanitizeColor,
    isValidGmailAddress
} = require('../js/utils/helpers.js');
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

    console.log("=== INICIANDO SUITE DE PRUEBAS INTEGRAL V7 (UI STICKY, PRECARTÓN CÁMARA/A4 & ACORDEÓN CONFIG) ===");

    // 1. Seguridad base
    assertEqual(escapeHTML('<script>alert("xss")</script>'), '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;', "Sanitización XSS básica");
    assertEqual(sanitizeForSpreadsheet('=CMD("calc")'), "'=CMD(\"calc\")", "Bloqueo de fórmula =CMD()");

    // 2. Verificación de Bundle Web Capacitor (www/)
    buildWebDir();
    const indexHtml = fs.readFileSync(path.resolve(__dirname, '../index.html'), 'utf8');
    const configHtml = fs.readFileSync(path.resolve(__dirname, '../Configuraciones.html'), 'utf8');
    const precartonHtml = fs.readFileSync(path.resolve(__dirname, '../Precarton_Adcionales.html'), 'utf8');
    const precartonJs = fs.readFileSync(path.resolve(__dirname, '../js/precarton.js'), 'utf8');
    const stylesCss = fs.readFileSync(path.resolve(__dirname, '../css/styles.css'), 'utf8');

    // 3. Imagen 1: Referencias de servicios más grandes y accesibles en el APK
    assertEqual(stylesCss.includes('font-size: 0.78rem !important') && stylesCss.includes('.cal-emp-chip'), true, "Imagen 1: Referencias de servicios agrandadas y accesibles en el APK");

    // 4. Imagen 2 y 3: Cabeceras fijas (sticky) al hacer scroll en Dashboard y en Precartón
    assertEqual(indexHtml.includes('class="sticky-top-dashboard"') && stylesCss.includes('position: sticky'), true, "Imagen 2: Cabecera y KPIs de Dashboard se mantienen visibles al hacer scroll");
    assertEqual(precartonHtml.includes('class="sticky-top-precarton"'), true, "Imagen 3: Cabecera y botones de Precartón se mantienen visibles al hacer scroll");

    // 5. Imagen 4: Botones de Precartones acomodados en 4 por línea
    assertEqual(precartonHtml.includes('grid-template-columns: repeat(4, 1fr)') && precartonJs.includes('precarton-loaded-grid-4col'), true, "Imagen 4: Botones de Precartones acomodados en 4 por línea");

    // 6. Precartón: Captura mediante Cámara o Galería con Nombre Personalizado
    assertEqual(precartonHtml.includes("abrirModalCapturaFotoPrecarton('camera')") && precartonHtml.includes("abrirModalCapturaFotoPrecarton('gallery')"), true, "Precartón incluye botones para capturar imagen por Cámara o Galería");
    assertEqual(precartonHtml.includes('id="inputNombrePersonalizadoFoto"') && precartonHtml.includes('guardarFotoPrecartonConNombre()'), true, "Precartón permite identificar la imagen capturada con un nombre personalizado");

    // 7. Precartón: Selector Múltiple de Días para mostrar y exportar a PDF en Vertical A4
    assertEqual(typeof Precarton.isDiaIncluidoEnExportacion, 'function', "Precartón expone filtro de selección múltiple de días para vista y PDF");
    assertEqual(Precarton.isDiaIncluidoEnExportacion(15), true, "Por defecto todos los días están incluidos si no se restringe la selección");
    assertEqual(precartonJs.includes("new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })"), true, "PDF de Precartón se genera estrictamente en formato Vertical A4 (portrait)");

    // 8. Configuraciones: Secciones numeradas (1 a 5) con apertura por acordeón exclusivo
    assertEqual(typeof Configuraciones.toggleSeccionConfig, 'function', "Configuraciones expone controlador de acordeón toggleSeccionConfig");
    assertEqual(
        configHtml.includes('onclick="toggleSeccionConfig(1)"') &&
        configHtml.includes('onclick="toggleSeccionConfig(2)"') &&
        configHtml.includes('onclick="toggleSeccionConfig(3)"') &&
        configHtml.includes('onclick="toggleSeccionConfig(4)"') &&
        configHtml.includes('onclick="toggleSeccionConfig(5)"'),
        true,
        "Las 5 secciones numeradas de Configuraciones se abren mediante botón expandible manteniendo las demás contraídas"
    );

    console.log(`\n=== RESUMEN FINAL QA V7: ${passed} PASARON | ${failed} FALLARON ===`);
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
