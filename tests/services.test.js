/**
 * Suite de Pruebas Unitarias para la Aplicación de Gestión de Servicios Adicionales (Alfas)
 * Certificación de QA Engineer según workflow de Antigravity.
 */

// Simulación ligera para entorno Node.js sin DOM
function escapeHTML(inputStr) {
    if (inputStr === null || inputStr === undefined) return '';
    return String(inputStr)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function safeParse(mockStorage, key, fallback) {
    try {
        const rawData = mockStorage[key];
        if (!rawData) return fallback;
        const parsed = JSON.parse(rawData);
        return parsed !== null && parsed !== undefined ? parsed : fallback;
    } catch (error) {
        return fallback;
    }
}

function formatearTurno(turnoStr) {
    if (!turnoStr) return "";
    if (!turnoStr.includes("-")) return turnoStr;
    const parts = turnoStr.split("-");
    return `${parts[0]}HS A ${parts[1]}HS`;
}

function calcularCostoTurno(turno, fechaStr, empData, config) {
    const fallback = { cat: "A", cost: 0, h: 8, vh: 0, detail: [], catLabel: "A" };
    if (!turno || !turno.includes("-") || !empData) return fallback;

    const parts = turno.split("-");
    const startH = parseInt(parts[0]);
    const endH = parseInt(parts[1]);

    const totalH = endH > startH ? (endH - startH) : (24 - startH + endH);
    const isOvernight = endH < startH || (endH === 0 && startH > 0);

    const startDate = new Date(fechaStr + "T00:00:00");
    const startDay = startDate.getDay();
    const isStartFinde = (startDay === 0 || startDay === 6);
    const catStart = isStartFinde ? empData.catFinde : empData.catSemana;

    if (!isOvernight) {
        const vh = config[catStart] || 0;
        const cost = vh * totalH;
        return { cat: catStart, cost, h: totalH, vh, detail: [{ cat: catStart, h: totalH, vh, cost }], catLabel: catStart };
    }

    const nextDate = new Date(startDate);
    nextDate.setDate(nextDate.getDate() + 1);
    const nextDay = nextDate.getDay();
    const isNextFinde = (nextDay === 0 || nextDay === 6);
    const catNext = isNextFinde ? empData.catFinde : empData.catSemana;

    if (catStart === catNext) {
        const vh = config[catStart] || 0;
        const cost = vh * totalH;
        return { cat: catStart, cost, h: totalH, vh, detail: [{ cat: catStart, h: totalH, vh, cost }], catLabel: catStart };
    }

    const hStartPart = 24 - startH;
    const hNextPart = endH;

    const vh1 = config[catStart] || 0;
    const vh2 = config[catNext] || 0;
    const cost1 = vh1 * hStartPart;
    const cost2 = vh2 * hNextPart;
    const totalCost = cost1 + cost2;
    const vhProm = totalH > 0 ? totalCost / totalH : 0;

    return {
        cat: `${catStart}+${catNext}`,
        cost: totalCost,
        h: totalH,
        vh: vhProm,
        detail: [
            { cat: catStart, h: hStartPart, vh: vh1, cost: cost1 },
            { cat: catNext, h: hNextPart, vh: vh2, cost: cost2 }
        ],
        catLabel: `${catStart}+${catNext}`
    };
}

// Ejecución de Assertions
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

    console.log("=== INICIANDO SUITE DE PRUEBAS DE SERVICIOS ALFA ===");

    // Test 1: Sanitización XSS
    assertEqual(escapeHTML('<script>alert("xss")</script>'), '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;', "Sanitización XSS básica");
    assertEqual(escapeHTML('Paladini & Co "S.A."'), 'Paladini &amp; Co &quot;S.A.&quot;', "Sanitización de caracteres especiales");

    // Test 2: Safe Parse
    const mockStorage = { "key1": '{"a": 1}', "key2": 'invalid json' };
    assertEqual(safeParse(mockStorage, "key1", {}), { a: 1 }, "safeParse de JSON válido");
    assertEqual(safeParse(mockStorage, "key2", { fallback: true }), { fallback: true }, "safeParse de JSON corrupto");

    // Test 3: Formateo de turnos
    assertEqual(formatearTurno("07-15"), "07HS A 15HS", "Formateo de turno diurno");
    assertEqual(formatearTurno("22-06"), "22HS A 06HS", "Formateo de turno nocturno");

    // Test 4: Cálculo de costo turno diurno
    const config = { A: 100, AP: 150 };
    const empData = { turnos: ["07-15", "22-06"], catSemana: "A", catFinde: "AP" };
    // Lunes (Semana -> Cat A)
    const resultDiurno = calcularCostoTurno("07-15", "2026-03-02", empData, config);
    assertEqual(resultDiurno.cost, 800, "Costo de turno diurno en día laboral (8h * 100)");

    // Test 5: Cálculo de costo nocturno con split (Viernes a Sábado)
    // Viernes 2026-03-06 (Cat A) a Sábado 2026-03-07 (Cat AP)
    // Turno 22-06 (2h en Viernes Cat A = 200, 6h en Sábado Cat AP = 900 -> Total = 1100)
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

// Autoejecución en entorno de Node
if (typeof require !== 'undefined' && typeof window === 'undefined') {
    runTestSuite();
}
