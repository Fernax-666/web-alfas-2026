/**
 * @file services.test.js
 * @description Suite de Pruebas Unitarias para la Aplicación de Gestión de Servicios Adicionales (Alfas)
 * Certificación de QA Engineer según workflow de Antigravity.
 */

// Carga de módulos refactorizados de producción
const { escapeHTML, safeParse, formatearTurno } = require('../js/utils/helpers.js');
const { calcularCostoTurno } = require('../js/services/calculator.js');

/**
 * Ejecuta todas las aserciones de la suite de pruebas.
 * @returns {boolean} true si todas las pruebas pasan, false si alguna falla.
 */
function runTestSuite() {
    let passed = 0;
    let failed = 0;

    /**
     * Validador de aserciones de prueba.
     * @param {any} actual 
     * @param {any} expected 
     * @param {string} testName 
     */
    function assertEqual(actual, expected, testName) {
        if (JSON.stringify(actual) === JSON.stringify(expected)) {
            console.log(`[PASS] ${testName}`);
            passed++;
        } else {
            console.error(`[FAIL] ${testName}: Esperado ${JSON.stringify(expected)}, Obtenido ${JSON.stringify(actual)}`);
            failed++;
        }
    }

    console.log("=== INICIANDO SUITE DE PRUEBAS DE SERVICIOS ALFA ===");

    // Test 1: Sanitización XSS
    assertEqual(escapeHTML('<script>alert("xss")</script>'), '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;', "Sanitización XSS básica");
    assertEqual(escapeHTML('Paladini & Co "S.A."'), 'Paladini &amp; Co &quot;S.A.&quot;', "Sanitización de caracteres especiales");
    assertEqual(escapeHTML(null), '', "Sanitización de valor nulo");

    // Test 2: Safe Parse de LocalStorage / Objeto Mock
    const mockStorage = { "key1": '{"a": 1}', "key2": 'invalid json' };
    assertEqual(safeParse(mockStorage, "key1", {}), { a: 1 }, "safeParse de JSON válido");
    assertEqual(safeParse(mockStorage, "key2", { fallback: true }), { fallback: true }, "safeParse de JSON corrupto");

    // Test 3: Formateo de turnos
    assertEqual(formatearTurno("07-15"), "07HS A 15HS", "Formateo de turno diurno");
    assertEqual(formatearTurno("22-06"), "22HS A 06HS", "Formateo de turno nocturno");
    assertEqual(formatearTurno(""), "", "Formateo de turno vacío");

    // Test 4: Cálculo de costo turno diurno (Lunes)
    const config = { A: 100, AP: 150 };
    const empData = { turnos: ["07-15", "22-06"], catSemana: "A", catFinde: "AP" };
    const resultDiurno = calcularCostoTurno("07-15", "2026-03-02", empData, config);
    assertEqual(resultDiurno.cost, 800, "Costo de turno diurno en día laboral (8h * 100)");

    // Test 5: Cálculo de costo nocturno con split de medianoche (Viernes a Sábado)
    // Viernes 2026-03-06 (Cat A) a Sábado 2026-03-07 (Cat AP)
    // Turno 22-06 (2h * 100 = 200 + 6h * 150 = 900 -> Total = 1100)
    const resultNocturnoSplit = calcularCostoTurno("22-06", "2026-03-06", empData, config);
    assertEqual(resultNocturnoSplit.cost, 1100, "Costo de turno nocturno con split de medianoche Viernes-Sábado");

    // Test 6: Construcción de parámetros URL para sincronización de addServicio
    const testParams = new URLSearchParams({
        action: "addServicio",
        fecha: "2026-03-15",
        empresa: "PALADINI",
        policia: "Olivera Fernando",
        turno: "15-23",
        categoria: "A",
        hora: "8",
        costo: "119944"
    }).toString();
    assertEqual(testParams.includes("action=addServicio"), true, "URLParams contiene action=addServicio");

    // Test 7: Deduplicación de lista de eventos
    const listaConDuplicados = [
        { fecha: "2026-08-29", policia: "Orellano Roberto", empresa: "PALADINI", turno: "06-14" },
        { fecha: "2026-08-29", policia: "Orellano Roberto", empresa: "PALADINI", turno: "06-14" }
    ];
    const setVistos = new Set();
    const listaDeduplicada = listaConDuplicados.filter(item => {
        const key = `${item.fecha}_${item.policia}_${item.empresa}_${item.turno}`;
        if (setVistos.has(key)) return false;
        setVistos.add(key);
        return true;
    });
    assertEqual(listaDeduplicada.length, 1, "Deduplicación de eventos idénticos reduce a 1 elemento");

    console.log(`\n=== RESUMEN: ${passed} PASARON | ${failed} FALLARON ===`);
    return failed === 0;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { runTestSuite, escapeHTML, safeParse, formatearTurno, calcularCostoTurno };
}

// Autoejecución en entorno de Node.js
if (typeof require !== 'undefined' && typeof window === 'undefined') {
    const success = runTestSuite();
    if (!success) {
        process.exit(1);
    }
}
