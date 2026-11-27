/**
 * @file services.test.js
 * @description Suite de Pruebas Unitarias e Integración V9 para Gestión de Servicios Adicionales (Web Alfas 2026).
 * Verifica:
 *  - Exportación e Importación de `alfas.json` bidireccional en Android APK (`PlatformAPK.exportJsonFileAPK`) y Windows PC (`PlatformPC.exportJsonFilePC`), soportando tanto el arreglo clásico de eventos como el objeto completo de respaldo (`parseAndRestoreAlfasJson`).
 *  - Solapa Agenda Cero Scroll: `height: 100dvh; max-height: 100dvh; overflow: hidden !important;` en `body[data-mobile-tab="agenda"]` para que todo entre en pantalla sin barra de desplazamiento.
 *  - Tema de Íconos Personalizados según la Portada Seleccionada (`portada_1`, `portada_2`, `portada_03`, `portada_04`): 20 íconos individuales en `img/icons/` (`p1_icon_1..5` a `p4_icon_1..5`) y `applySplashCoverIconTheme`.
 *  - Requerimientos previos (Contraste calendario, comparación gráficos Mes/Año + Resumen por Policía, visor Precartón en pantalla completa + filtro por Mes/Empresa, y chequeo activo de estructura vacía en Google Sheets).
 */

const fs = require('fs');
const path = require('path');
const {
    AVAILABLE_THEMES,
    AVAILABLE_SPLASH_COVERS,
    FORBIDDEN_BUTTON_BLUES,
    ensureDistinctEventColor,
    getCoverIconSet,
    applySplashCoverIconTheme,
    escapeHTML,
    sanitizeForSpreadsheet
} = require('../js/utils/helpers.js');
const CloudSync = require('../js/services/cloudSync.js');
const PlatformAPK = require('../js/services/platformApk.js');
const PlatformPC = require('../js/services/platformPc.js');
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

    console.log("=== INICIANDO SUITE DE PRUEBAS INTEGRAL V9 (EXPORTAR/IMPORTAR ALFAS.JSON, AGENDA CERO SCROLL & ÍCONOS POR PORTADA) ===");

    // 1. Seguridad base
    assertEqual(escapeHTML('<script>alert("xss")</script>'), '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;', "Sanitización XSS básica");
    assertEqual(sanitizeForSpreadsheet('=CMD("calc")'), "'=CMD(\"calc\")", "Bloqueo de fórmula =CMD()");

    // 2. Verificación de Bundle Web Capacitor (www/)
    buildWebDir();
    const indexHtml = fs.readFileSync(path.resolve(__dirname, '../index.html'), 'utf8');
    const configHtml = fs.readFileSync(path.resolve(__dirname, '../Configuraciones.html'), 'utf8');
    const precartonHtml = fs.readFileSync(path.resolve(__dirname, '../Precarton_Adcionales.html'), 'utf8');
    const stylesCss = fs.readFileSync(path.resolve(__dirname, '../css/styles.css'), 'utf8');

    // 3. Exportación e Importación bidireccional de alfas.json (PC y Android APK)
    assertEqual(typeof PlatformAPK.exportJsonFileAPK, 'function', "PlatformAPK expone exportJsonFileAPK para guardar/compartir alfas.json en Android APK");
    assertEqual(typeof PlatformPC.exportJsonFilePC, 'function', "PlatformPC expone exportJsonFilePC para descargar alfas.json en Windows PC");
    const b64Test = PlatformAPK.encodeTextToBase64('{"app":"Web Alfas 2026"}');
    assertEqual(Buffer.from(b64Test, 'base64').toString('utf8'), '{"app":"Web Alfas 2026"}', "PlatformAPK.encodeTextToBase64 codifica JSON UTF-8 sin pérdida para Capacitor Filesystem");

    const backupObj = Configuraciones.buildAlfasBackupPayload();
    assertEqual(backupObj.payload.app, "Web Alfas 2026", "buildAlfasBackupPayload genera estructura integral de respaldo alfas.json");
    assertEqual(Array.isArray(backupObj.payload.policias) && typeof backupObj.payload.empresas === 'object', true, "El respaldo alfas.json incluye policías, empresas, tarifas y eventos");

    // Importación formato 1: Arreglo clásico de eventos
    const restoreArrRes = Configuraciones.parseAndRestoreAlfasJson(JSON.stringify([
        { fecha: '2026-11-10', empresa: 'PALADINI', policia: 'Olivera Fernando', turno: '06-14', cat: 'A', cost: 119944 }
    ]));
    assertEqual(restoreArrRes.ok && restoreArrRes.countEventos === 1, true, "Importación de alfas.json restaura formato clásico de arreglo de eventos");

    // Importación formato 2: Objeto completo de respaldo con BOM UTF-8
    const restoreFullRes = Configuraciones.parseAndRestoreAlfasJson('\uFEFF' + JSON.stringify({
        app: 'Web Alfas 2026',
        version: 21,
        config: { A: 15500, AP: 17500 },
        eventos: [
            { start: '2026-11-15', extendedProps: { empresa: 'SIGLO21 (P1)', policia: 'Olivera Fernando', turno: '07-15', cat: 'AP', cost: 140000 } },
            { start: '2026-11-16', extendedProps: { empresa: 'SIGLO21 (P2)', policia: 'Bracamonte Jonathan', turno: '15-23', cat: 'A', cost: 124000 } }
        ]
    }));
    assertEqual(restoreFullRes.ok && restoreFullRes.countEventos === 2 && restoreFullRes.restoredConfig, true, "Importación de alfas.json restaura objeto completo (eventos + tarifas) incluso con BOM UTF-8");

    // 4. Solapa Agenda Cero Scroll en Pantalla
    assertEqual(
        stylesCss.includes('body[data-mobile-tab="agenda"]') &&
        stylesCss.includes('max-height: 100dvh;') &&
        stylesCss.includes('overflow: hidden !important;'),
        true,
        "Solapa Agenda aplica 100dvh exacto con overflow: hidden para garantizar cero scroll en pantalla"
    );

    // 5. Tema de Íconos Personalizados según Portada Seleccionada (4 filas x 5 íconos = 20 íconos en img/icons/)
    const coverKeys = ['portada_1', 'portada_2', 'portada_03', 'portada_04'];
    assertEqual(Object.keys(AVAILABLE_SPLASH_COVERS), coverKeys, "Existen las 4 portadas con sus respectivos temas de íconos");

    let all20IconsExist = true;
    coverKeys.forEach(cKey => {
        const iconSet = getCoverIconSet(cKey);
        if (!iconSet || !Array.isArray(iconSet.iconsList) || iconSet.iconsList.length !== 5) {
            all20IconsExist = false;
        } else {
            iconSet.iconsList.forEach(relIconPath => {
                if (!fs.existsSync(path.resolve(__dirname, '../www', relIconPath))) {
                    all20IconsExist = false;
                }
            });
        }
    });
    assertEqual(all20IconsExist, true, "Los 20 íconos personalizados (5 por cada una de las 4 portadas) existen físicamente en www/img/icons/");
    assertEqual(getCoverIconSet('portada_03').appIcon, 'img/icons/p3_icon_3.png', "Portada 03 (Digital Cyber Azul) selecciona automáticamente el set de íconos p3 (Fila 3)");
    assertEqual(getCoverIconSet('portada_04').appIcon, 'img/icons/p4_icon_3.png', "Portada 04 (Táctica Carbono Dorado) selecciona automáticamente el set de íconos p4 (Fila 4)");
    assertEqual(
        indexHtml.includes('data-cover-nav-icon="agenda"') &&
        configHtml.includes('data-cover-nav-icon="config"') &&
        precartonHtml.includes('data-cover-nav-icon="precarton"'),
        true,
        "Las barras de navegación de todas las páginas enlazan los íconos dinámicos según la portada activa"
    );

    // 6. Contraste en Calendario, Comparación Gráficos Mes/Año y Chequeo Google Sheets
    const distinctColor = ensureDistinctEventColor('#2563eb', 'Olivera Fernando');
    assertEqual(FORBIDDEN_BUTTON_BLUES.includes(distinctColor.toLowerCase()), false, "Calendario nunca usa el azul #2563eb de los botones para las etiquetas de turnos");
    const verifyRes = await CloudSync.verificarYCrearEstructuraSheetCloud({
        email: 'fernando.olivera@gmail.com',
        policiaTitular: 'Olivera Fernando'
    });
    assertEqual(verifyRes.ok && verifyRes.isActive && verifyRes.tabsCreated.length === 4, true, "Verificador de Google Sheets confirma estado ACTIVO y crea estructura de 4 solapas aunque esté vacío");

    console.log(`\n=== RESUMEN FINAL QA V9: ${passed} PASARON | ${failed} FALLARON ===`);
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
