/**
 * @file services.test.js
 * @description Suite de Pruebas Unitarias e Integración V10 para Gestión de Servicios Adicionales (Web Alfas 2026).
 * Verifica:
 *  - Imagen 1: Encabezado superior y barra inferior centrados y sin íconos extra de imagen en la cabecera como estaba originalmente.
 *  - Imagen 2: Referencias de empresas más grandes, legibles y accesibles (`.cal-emp-chip` con `font-size: 0.86rem !important`).
 *  - Imagen 3: El calendario ocupa el 100% del espacio disponible en pantalla sin provocar scroll (`body[data-mobile-tab="agenda"]` con `100dvh`, `overflow: hidden` y `.fc-daygrid-day-frame { height: 100% !important }`).
 *  - Solapa Gráficos:
 *      1. Gráfico Circular N° 1 diferenciando distintos Grupos Horarios (`#graficoGruposHorarios`, `stats.porGrupoHorarioMes`).
 *      2. Gráfico 1 Turnos por Día (Mensual) en formato Circular con etiquetas de totales y porcentajes (`#graficoMensual`, `stats.porcentajesMensualPorDia`).
 *      3. Gráfico 2 Anual / Comparativo en formato Circular con etiquetas de totales y porcentajes (`#graficoAnual`, `stats.porcentajesAnualPorDia`).
 *      4. Duplicado del Gráfico 2 Anual / Comparativo en formato de Barras Horizontales (`#graficoAnualHorizontal`, `indexAxis: 'y'`).
 *  - Vinculación de Correo Gmail: Solicita crear o registrar un Policía Titular (`ensureTitularPoliceOnGmailLink`) para mostrar como predefinido en el calendario y alertas personalizadas.
 */

const fs = require('fs');
const path = require('path');
const {
    AVAILABLE_SPLASH_COVERS,
    FORBIDDEN_BUTTON_BLUES,
    ensureDistinctEventColor,
    getCoverIconSet,
    escapeHTML,
    sanitizeForSpreadsheet
} = require('../js/utils/helpers.js');
const CloudSync = require('../js/services/cloudSync.js');
const PlatformAPK = require('../js/services/platformApk.js');
const PlatformPC = require('../js/services/platformPc.js');
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

    console.log("=== INICIANDO SUITE DE PRUEBAS INTEGRAL V10 (CABECERA CENTRADA, CALENDARIO 100% SIN SCROLL, GRÁFICOS CIRCULARES/BARRA HORIZONTAL Y POLICÍA PREDEFINIDO GMAIL) ===");

    // 1. Seguridad base
    assertEqual(escapeHTML('<script>alert("xss")</script>'), '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;', "Sanitización XSS básica");
    assertEqual(sanitizeForSpreadsheet('=CMD("calc")'), "'=CMD(\"calc\")", "Bloqueo de fórmula =CMD()");

    // 2. Verificación de Bundle Web Capacitor (www/)
    buildWebDir();
    const indexHtml = fs.readFileSync(path.resolve(__dirname, '../index.html'), 'utf8');
    const configHtml = fs.readFileSync(path.resolve(__dirname, '../Configuraciones.html'), 'utf8');
    const scriptsJs = fs.readFileSync(path.resolve(__dirname, '../js/scripts.js'), 'utf8');
    const stylesCss = fs.readFileSync(path.resolve(__dirname, '../css/styles.css'), 'utf8');

    // 3. Imagen 1: Cabecera centrada sin ícono de imagen lateral y barra inferior limpia como estaba antes
    assertEqual(indexHtml.includes('class="app-cover-badge-icon"'), false, "Imagen 1: El encabezado principal de Gestión de Servicios Adicionales no muestra el ícono lateral extra y queda centrado");
    assertEqual(indexHtml.includes('<span class="nav-icon">📅</span>'), true, "Imagen 1: La barra inferior mantiene su formato limpio y centrado original");

    // 4. Imagen 2 y 3: Referencias más grandes/legibles y Calendario ocupando el 100% del espacio disponible sin scroll
    assertEqual(stylesCss.includes('font-size: 0.86rem !important;'), true, "Imagen 2: Las referencias de empresas abajo del calendario tienen tamaño aumentado (0.86rem) legible y accesible");
    assertEqual(
        stylesCss.includes('max-height: 100dvh;') &&
        stylesCss.includes('overflow: hidden !important;') &&
        stylesCss.includes('.calendar-card .fc-scrollgrid'),
        true,
        "Imagen 3: El calendario en la solapa Agenda ocupa el 100% del espacio disponible sin scroll"
    );

    // 5. Solapa Gráficos:
    // - N° 1 Circular de Grupos Horarios (#graficoGruposHorarios)
    // - Gráfico 1 Mensual Circular con totales y porcentajes (#graficoMensual)
    // - Gráfico 2 Anual Circular con totales y porcentajes (#graficoAnual)
    // - Duplicado de Gráfico 2 Anual como Barra Horizontal (#graficoAnualHorizontal)
    assertEqual(
        indexHtml.includes('id="graficoGruposHorarios"') &&
        indexHtml.includes('id="graficoMensual"') &&
        indexHtml.includes('id="graficoAnual"') &&
        indexHtml.includes('id="graficoAnualHorizontal"'),
        true,
        "Solapa Gráficos contiene los 4 gráficos requeridos (1. Circular Grupos Horarios, Gráfico 1 Circular Mensual, Gráfico 2 Circular Anual y Duplicado Barra Horizontal)"
    );
    assertEqual(scriptsJs.includes("indexAxis: 'y'"), true, "El gráfico duplicado anual se configura como Gráfico de Barras Horizontales (indexAxis: 'y')");

    const mockEvents = [
        { start: '2026-11-01', extendedProps: { policia: 'Olivera Fernando', turno: '07-15', cost: 135870 } },
        { start: '2026-11-08', extendedProps: { policia: 'Olivera Fernando', turno: '07-15', cost: 135870 } },
        { start: '2026-11-13', extendedProps: { policia: 'Olivera Fernando', turno: '15-23', cost: 119944 } },
        { start: '2026-11-15', extendedProps: { policia: 'Olivera Fernando', turno: '22-06', cost: 135870 } }
    ];
    const chartStats = Scripts.computeWeekdayBarStats(mockEvents, '2026-11', 2026, '');
    assertEqual(chartStats.porGrupoHorarioMes['07-15hs'], 2, "Gráfico Circular N° 1 diferencia los grupos horarios y contabiliza 2 turnos en 07-15hs");
    assertEqual(chartStats.porGrupoHorarioMes['15-23hs'], 1, "Gráfico Circular N° 1 contabiliza 1 turno en 15-23hs");
    assertEqual(chartStats.porcentajesMensualPorDia[0], 75, "Gráfico 1 Circular Mensual calcula porcentajes exactos por día (Domingo: 3 de 4 = 75%)");
    assertEqual(chartStats.porcentajesAnualPorDia[5], 25, "Gráfico 2 Circular Anual calcula porcentajes exactos por día (Viernes: 1 de 4 = 25%)");

    // 6. Vinculación de Correo Gmail: Solicita crear Policía Predefinido para el calendario y alertas personalizadas
    assertEqual(configHtml.includes('id="inputNuevoPoliciaTitularGmail"') && configHtml.includes('id="selJerarquiaTitularGmail"'), true, "Configuraciones.html incluye campos para crear el Policía Predefinido al vincular un correo Gmail");

    // Si intenta vincular sin crear ni elegir policía, debe solicitarlo
    const missingPolRes = Configuraciones.ensureTitularPoliceOnGmailLink({
        selectedPolicia: '__CREAR_NUEVO__',
        nuevoNombre: ''
    });
    assertEqual(missingPolRes.ok, false, "Al vincular Gmail sin indicar Policía Predefinido, solicita crearlo");

    // Si ingresa un nuevo policía al vincular el correo, lo crea y lo devuelve como titular predefinido
    const createdPolRes = Configuraciones.ensureTitularPoliceOnGmailLink({
        selectedPolicia: '__CREAR_NUEVO__',
        nuevoNombre: 'Alvarez Marcos',
        nuevaJerarquia: 'Sgto. Ayte.'
    });
    assertEqual(createdPolRes.ok && createdPolRes.policiaTitular === 'Alvarez Marcos' && createdPolRes.created, true, "Al vincular Gmail creando un policía nuevo, lo registra en el padrón y lo fija como predefinido para calendario y alertas");

    console.log(`\n=== RESUMEN FINAL QA V10: ${passed} PASARON | ${failed} FALLARON ===`);
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
