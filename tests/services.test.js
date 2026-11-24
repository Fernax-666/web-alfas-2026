/**
 * @file services.test.js
 * @description Suite de Pruebas Unitarias e Integración para Gestión de Servicios Adicionales (Alfas).
 * Verifica Sanitización XSS, Prevención de CSV/Formula Injection (OWASP), Validación de Esquemas JSON,
 * Motor de Base de Datos Local SQLite/IndexedDB + Outbox, Algoritmo de Costos Nocturnos y Build de APK.
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
    detectPlatformContext
} = require('../js/utils/helpers.js');
const { calcularCostoTurno } = require('../js/services/calculator.js');
const Database = require('../js/services/database.js');
const CloudSync = require('../js/services/cloudSync.js');
const Storage = require('../js/services/storage.js');
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

    console.log("=== INICIANDO SUITE DE PRUEBAS INTEGRAL (SEGURIDAD, SQLITE, MÓVIL & APK) ===");

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

    // 5. Validación de Esquemas de Servicios Importados (validateServicioRecord)
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

    const invalidImport = validateServicioRecord({
        fecha: "fecha-invalida-xss",
        policia: "",
        empresa: ""
    });
    assertEqual(invalidImport.valid, false, "Rechazo de registro con fecha corrupta o campos vacíos");

    // 6. Formateo de turnos y Cálculo de costos con Split Nocturno
    assertEqual(formatearTurno("07-15"), "07HS A 15HS", "Formateo de turno diurno");
    assertEqual(formatearTurno("22-06"), "22HS A 06HS", "Formateo de turno nocturno");
    assertEqual(formatearTurno(""), "", "Formateo de turno vacío");

    const config = { A: 100, AP: 150 };
    const empData = { turnos: ["07-15", "22-06"], catSemana: "A", catFinde: "AP" };
    const resultDiurno = calcularCostoTurno("07-15", "2026-03-02", empData, config);
    assertEqual(resultDiurno.cost, 800, "Costo de turno diurno en día laboral (8h * 100)");

    const resultNocturnoSplit = calcularCostoTurno("22-06", "2026-03-06", empData, config);
    assertEqual(resultNocturnoSplit.cost, 1100, "Costo de turno nocturno con split Viernes-Sábado");

    // 7. Motor de Base de Datos Local SQLite / PostgreSQL Dump & Claves Primarias
    const pkId = Database.buildServicioId("2026-03-15", "Olivera Fernando", "PALADINI", "22-06");
    assertEqual(pkId, "2026-03-15__OLIVERA FERNANDO__PALADINI__22-06", "Generación determinística de clave primaria compuesta");

    const sqlDump = Database.exportSQLDump({
        config: { A: 14993 },
        policias: [{ nombre: "O'Connor Juan", jerarquia: "Cabo" }],
        empresas: { "PALADINI": { turnos: ["06-14"], catSemana: "A", catFinde: "AP" } },
        coloresPolicia: { "O'Connor Juan": "#2563eb" },
        eventos: [{ start: "2026-03-15", extendedProps: { policia: "O'Connor Juan", empresa: "PALADINI", turno: "06-14", cat: "A", h: 8, vh: 14993, cost: 119944 } }]
    });
    assertEqual(sqlDump.includes("CREATE TABLE IF NOT EXISTS servicios"), true, "Dump SQL incluye DDL de tabla servicios");
    assertEqual(sqlDump.includes("'O''Connor Juan'"), true, "Dump SQL escapa comillas simples contra SQL Injection");

    // 8. Sanitización recursiva de payloads hacia Google Sheets (CloudSync)
    const sanitizedCloudPayload = CloudSync.sanitizePayloadForSheets({
        policia: "=IMPORTDATA('http://attacker.tld')",
        empresa: "PALADINI",
        costo: 120000
    });
    assertEqual(sanitizedCloudPayload.policia.startsWith("'="), true, "CloudSync neutraliza fórmulas antes de enviar a Google Sheets");

    // 9. Verificación de Build para Capacitor Android APK (www/)
    buildWebDir();
    const wwwIndexExists = fs.existsSync(path.resolve(__dirname, '../www/index.html'));
    const wwwDatabaseExists = fs.existsSync(path.resolve(__dirname, '../www/js/services/database.js'));
    const capConfigExists = fs.existsSync(path.resolve(__dirname, '../capacitor.config.json'));
    assertEqual(wwwIndexExists && wwwDatabaseExists && capConfigExists, true, "Bundle www/ y capacitor.config.json listos para compilar Android APK");

    // 10. Auditoría estática de Viewport Móvil y Safe Areas en HTML/CSS
    const indexHtml = fs.readFileSync(path.resolve(__dirname, '../index.html'), 'utf8');
    const stylesCss = fs.readFileSync(path.resolve(__dirname, '../css/styles.css'), 'utf8');
    assertEqual(indexHtml.includes('viewport-fit=cover'), true, "index.html incluye viewport-fit=cover para Android APK");
    assertEqual(stylesCss.includes('safe-area-inset-top'), true, "styles.css implementa variables de Safe Area (--sat, --sab)");
    assertEqual(stylesCss.includes('attr(data-label)'), true, "styles.css transforma tablas en tarjetas apiladas móviles con data-label");

    console.log(`\n=== RESUMEN FINAL QA: ${passed} PASARON | ${failed} FALLARON ===`);
    return failed === 0;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { runTestSuite, escapeHTML, sanitizeForSpreadsheet, safeParse, formatearTurno, calcularCostoTurno };
}

if (typeof require !== 'undefined' && typeof window === 'undefined') {
    const success = runTestSuite();
    if (!success) {
        process.exit(1);
    }
}
