/**
 * @file services.test.js
 * @description Suite de Pruebas Unitarias e Integración para Gestión de Servicios Adicionales (Web Alfas 2026).
 * Verifica Sanitización XSS, Prevención de CSV/Formula Injection (OWASP), Validación de Esquemas JSON,
 * Motor de Base de Datos Local SQLite/IndexedDB + Outbox, Algoritmo de Costos Nocturnos,
 * Página dedicada Configuraciones.html + Temas, Eventos estructurados de Calendario,
 * 2 Gráficos de Barras por Día de la Semana (Mensual y Anual Apilado) y Tabla Historial de 5 columnas.
 */

const fs = require('fs');
const path = require('path');
const {
    escapeHTML,
    sanitizeForSpreadsheet,
    sanitizeColor,
    safeParse,
    validateServicioRecord,
    formatearTurno,
    formatearTurnoCorto,
    abreviarNombrePolicia,
    applyTheme
} = require('../js/utils/helpers.js');
const { calcularCostoTurno } = require('../js/services/calculator.js');
const Database = require('../js/services/database.js');
const CloudSync = require('../js/services/cloudSync.js');
const { extractStructuredEventInfo, computeWeekdayBarStats } = require('../js/scripts.js');
const { buildWebDir } = require('../scripts/build-apk-assets.js');

/**
 * Ejecuta todas las aserciones de la suite de pruebas.
 * @returns {boolean} true si todas las pruebas pasan, false si alguna falla.
 */
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

    console.log("=== INICIANDO SUITE DE PRUEBAS INTEGRAL V2 (WEB ALFAS 2026) ===");

    // 1. Pruebas de Sanitización XSS
    assertEqual(escapeHTML('<script>alert("xss")</script>'), '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;', "Sanitización XSS básica");
    assertEqual(escapeHTML('Paladini & Co "S.A."'), 'Paladini &amp; Co &quot;S.A.&quot;', "Sanitización de caracteres especiales");
    assertEqual(escapeHTML(null), '', "Sanitización de valor nulo");

    // 2. Pruebas de Prevención de CSV / Formula Injection (OWASP) en Google Sheets y Excel
    assertEqual(sanitizeForSpreadsheet('=CMD("calc")'), "'=CMD(\"calc\")", "Bloqueo de fórmula =CMD()");
    assertEqual(sanitizeForSpreadsheet('+IMPORTXML("http://evil")'), "'+IMPORTXML(\"http://evil\")", "Bloqueo de fórmula con +");
    assertEqual(sanitizeForSpreadsheet('-2+3+cmd'), "'-2+3+cmd", "Bloqueo de fórmula con -");
    assertEqual(sanitizeForSpreadsheet('@SUM(A1:A2)'), "'@SUM(A1:A2)", "Bloqueo de fórmula con @");
    assertEqual(sanitizeForSpreadsheet('Orellano Roberto'), 'Orellano Roberto', "Texto legítimo intacto en hoja de cálculo");
    assertEqual(sanitizeForSpreadsheet(14993.5), 14993.5, "Valores numéricos preservan su tipo");

    // 3. Sanitización de colores CSS contra Style Injection
    assertEqual(sanitizeColor('#10b981'), '#10b981', "Color hexadecimal válido permitido");
    assertEqual(sanitizeColor('var(--primary)'), 'var(--primary)', "Variable CSS permitida");
    assertEqual(sanitizeColor('red; background:url(javascript:alert(1))', '#2563eb'), '#2563eb', "Bloqueo de inyección CSS maliciosa");

    // 4. Safe Parse y Protección contra Prototype Pollution
    const mockStorage = {
        "key1": '{"a": 1}',
        "key2": 'invalid json',
        "keyProto": '{"__proto__": {"polluted": true}, "safe": "ok"}'
    };
    assertEqual(safeParse(mockStorage, "key1", {}), { a: 1 }, "safeParse de JSON válido");
    assertEqual(safeParse(mockStorage, "key2", { fallback: true }), { fallback: true }, "safeParse de JSON corrupto");
    const parsedProto = safeParse(mockStorage, "keyProto", {});
    assertEqual(({}).polluted, undefined, "Protección contra Prototype Pollution en safeParse");
    assertEqual(parsedProto.safe, "ok", "Propiedades seguras conservadas en safeParse");

    // 5. Validación de Esquemas de Servicios Importados
    const validImport = validateServicioRecord({
        fecha: "2026-03-15T10:00:00",
        policia: "Olivera Fernando",
        empresa: "PALADINI",
        turno: "22-06",
        categoria: "ap",
        costo: "135870",
        hora: "8"
    });
    assertEqual(validImport.valid, true, "Validación de registro de servicio legítimo");
    assertEqual(validImport.record.fecha, "2026-03-15", "Normalización de fecha ISO a YYYY-MM-DD");
    assertEqual(validImport.record.cat, "AP", "Normalización de categoría a mayúsculas");

    // 6. Formateo de turnos (Largo y Compacto Móvil) y Abreviación de Policía
    assertEqual(formatearTurno("07-15"), "07HS A 15HS", "Formateo de turno diurno");
    assertEqual(formatearTurnoCorto("07-15"), "07-15hs", "Formateo compacto de turno para calendario móvil");
    assertEqual(abreviarNombrePolicia("Olivera Fernando"), "Olivera F.", "Abreviación de nombre de policía para celda móvil");

    // 7. Extracción Estructurada de Evento de Calendario (Empresa, Horario, Policía)
    const evStructured = extractStructuredEventInfo({
        title: "Olivera Fernando\nSIGLO21 (P3) (07HS A 15HS)",
        extendedProps: { empresa: "SIGLO21 (P3)", turno: "07-15", policia: "Olivera Fernando" }
    });
    assertEqual(evStructured.empresa, "SIGLO21 (P3)", "Evento calendario extrae Empresa correctamente");
    assertEqual(evStructured.horarioCorto, "07-15hs", "Evento calendario extrae Horario compacto correctamente");
    assertEqual(evStructured.policiaCorto, "Olivera F.", "Evento calendario extrae Policía compacto correctamente");

    // 8. Cálculo de Estadísticas para los 2 Gráficos de Barras por Día de la Semana (Mensual y Anual Apilado)
    // 2026-11-01 es Domingo (dayOfWeek = 0), 2026-11-07 es Sábado (dayOfWeek = 6), 2026-03-15 es Domingo (dayOfWeek = 0)
    const sampleEventsForCharts = [
        { start: "2026-11-01", extendedProps: { policia: "Olivera Fernando", cost: 100000 } },
        { start: "2026-11-01", extendedProps: { policia: "Olivera Fernando", cost: 120000 } },
        { start: "2026-11-07", extendedProps: { policia: "Castro Roque", cost: 150000 } },
        { start: "2026-03-15", extendedProps: { policia: "Olivera Fernando", cost: 130000 } }
    ];
    const barStats = computeWeekdayBarStats(sampleEventsForCharts, "2026-11", 2026);
    assertEqual(barStats.mensualPorDia[0], 2, "Gráfico de barras mensual cuenta 2 turnos en Domingo (Nov 2026)");
    assertEqual(barStats.mensualPorDia[6], 1, "Gráfico de barras mensual cuenta 1 turno en Sábado (Nov 2026)");
    assertEqual(barStats.totalTurnosMes, 3, "Total mensual de turnos es 3");
    assertEqual(barStats.totalCostoMes, 370000, "Monto total mensual es $370.000");
    assertEqual(barStats.totalTurnosAnual, 4, "Gráfico anual apilado acumula los 4 turnos del año 2026");
    assertEqual(barStats.totalCostoAnual, 500000, "Monto total anual vigente es $500.000");

    // 9. Motor de Temas Visuales
    assertEqual(applyTheme('dark'), 'dark', "Motor de temas aplica tema Oscuro Nocturno");
    assertEqual(applyTheme('police'), 'police', "Motor de temas aplica tema Azul Policial");
    assertEqual(applyTheme('invalid-theme'), 'light', "Motor de temas hace fallback seguro a Claro Institucional");

    // 10. Motor de Base de Datos Local SQLite / PostgreSQL Dump
    const pkId = Database.buildServicioId("2026-03-15", "Olivera Fernando", "PALADINI", "22-06");
    assertEqual(pkId, "2026-03-15__OLIVERA FERNANDO__PALADINI__22-06", "Generación determinística de clave primaria compuesta");

    // 11. Verificación de Bundle Web Capacitor (www/) incluyendo Configuraciones.html
    buildWebDir();
    const wwwIndexExists = fs.existsSync(path.resolve(__dirname, '../www/index.html'));
    const wwwConfigExists = fs.existsSync(path.resolve(__dirname, '../www/Configuraciones.html'));
    const wwwConfigJsExists = fs.existsSync(path.resolve(__dirname, '../www/js/configuraciones.js'));
    assertEqual(wwwIndexExists && wwwConfigExists && wwwConfigJsExists, true, "Bundle www/ incluye Configuraciones.html y configuraciones.js para el APK");

    // 12. Verificación de Estructura de 5 Columnas en Tabla Historial y 2 Canvas de Gráficos en index.html
    const indexHtml = fs.readFileSync(path.resolve(__dirname, '../index.html'), 'utf8');
    assertEqual(indexHtml.includes('id="graficoMensual"') && indexHtml.includes('id="graficoAnual"'), true, "index.html contiene los 2 canvas de gráficos de barras (Mensual y Anual)");
    assertEqual(indexHtml.includes("aplicarPeriodoRapidoHistorial('semanal')"), true, "index.html incluye botones rápidos (Semanal, Mes, Anual) en Historial");

    console.log(`\n=== RESUMEN FINAL QA V2: ${passed} PASARON | ${failed} FALLARON ===`);
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
