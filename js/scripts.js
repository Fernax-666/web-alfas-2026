/**
 * @file scripts.js
 * @description Orquestador principal de UI para Dashboard, Calendario Adaptativo sin scroll con referencias abajo,
 * etiquetas completas (Empresa, Horario, Policía), botón flotante de captura para WhatsApp,
 * 2 Gráficos de Barras con etiquetas de Total y filtro de Año, y Tabla de Historial de 5 Columnas.
 */

// --- SERVICIOS MODULARES E INICIALIZACIÓN ---
const Utils = (typeof window !== 'undefined' && window.AlfaUtils) ? window.AlfaUtils : require('./utils/helpers.js');
const Calculator = (typeof window !== 'undefined' && window.AlfaCalculator) ? window.AlfaCalculator : require('./services/calculator.js');
const Database = (typeof window !== 'undefined' && window.AlfaDatabase) ? window.AlfaDatabase : require('./services/database.js');
const Storage = (typeof window !== 'undefined' && window.AlfaStorage) ? window.AlfaStorage : require('./services/storage.js');
const CloudSync = (typeof window !== 'undefined' && window.AlfaCloudSync) ? window.AlfaCloudSync : require('./services/cloudSync.js');
const Exporter = (typeof window !== 'undefined' && window.AlfaExporter) ? window.AlfaExporter : require('./services/exporter.js');
const PlatformPC = (typeof window !== 'undefined' && window.AlfaPlatformPC) ? window.AlfaPlatformPC : require('./services/platformPc.js');
const PlatformAPK = (typeof window !== 'undefined' && window.AlfaPlatformAPK) ? window.AlfaPlatformAPK : require('./services/platformApk.js');
const Notifications = (typeof window !== 'undefined' && window.AlfaNotifications) ? window.AlfaNotifications : require('./services/notifications.js');

/**
 * Selecciona automáticamente el controlador de plataforma separado (PC vs Android APK / Móvil).
 * @returns {Object} Instancia de AlfaPlatformAPK o AlfaPlatformPC.
 */
function getActivePlatformHandler() {
    const ctx = Utils.detectPlatformContext ? Utils.detectPlatformContext() : { isNativeAPK: false, isMobileViewport: false };
    if (ctx.isNativeAPK || ctx.isMobileViewport) {
        return PlatformAPK;
    }
    return PlatformPC;
}

// Wrapper functions para compatibilidad con código existente y suite de tests
function escapeHTML(inputStr) { return Utils.escapeHTML(inputStr); }
function sanitizeForSpreadsheet(val) { return Utils.sanitizeForSpreadsheet(val); }
function sanitizeColor(colorStr, fb) { return Utils.sanitizeColor(colorStr, fb); }
function safeParse(key, fallback) { return Utils.safeParse(typeof localStorage !== 'undefined' ? localStorage : {}, key, fallback); }
function formatearTurno(turnoStr) { return Utils.formatearTurno(turnoStr); }
function getLocalYMD(dateObj) { return Utils.getLocalYMD(dateObj); }
function getLocalYM(dateObj) { return Utils.getLocalYM(dateObj); }
function colorAleatorio() { return Utils.colorAleatorio(); }

const CATEGORIAS = Storage.CATEGORIAS;
const DIAS_SEMANA_LABELS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const MESES_CORTOS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
const COLORES_MESES = [
    '#2563eb', '#0ea5e9', '#10b981', '#84cc16',
    '#eab308', '#f59e0b', '#f97316', '#ef4444',
    '#ec4899', '#d946ef', '#8b5cf6', '#6366f1'
];

// Plugin Chart.js personalizado para dibujar las etiquetas de Total y Porcentaje en gráficos circulares, barras verticales y barras horizontales
const barTotalLabelsPlugin = {
    id: 'barTotalLabelsPlugin',
    afterDatasetsDraw(chart) {
        const { ctx, data, scales, config: chartConfig } = chart;
        if (!ctx || !data || !Array.isArray(data.datasets)) return;

        ctx.save();
        const isDark = typeof document !== 'undefined' && document.documentElement.getAttribute('data-theme') === 'dark';
        const chartType = chartConfig ? chartConfig.type : '';
        const isHorizontalBar = chartType === 'bar' && chartConfig.options && chartConfig.options.indexAxis === 'y';

        // 1. GRÁFICOS CIRCULARES (doughnut / pie): Dibujar Etiqueta de Total y Porcentaje sobre cada sector
        if (chartType === 'doughnut' || chartType === 'pie') {
            const ds = data.datasets[0];
            const meta = chart.getDatasetMeta(0);
            if (!ds || !meta || !Array.isArray(meta.data)) {
                ctx.restore();
                return;
            }
            const totalSum = (ds.data || []).reduce((acc, v) => acc + (Number(v) || 0), 0);
            if (totalSum <= 0) {
                ctx.restore();
                return;
            }

            meta.data.forEach((arcElem, idx) => {
                const val = Number(ds.data[idx]) || 0;
                if (val <= 0) return;
                const pct = Math.round((val / totalSum) * 100);
                const pos = arcElem.tooltipPosition ? arcElem.tooltipPosition() : { x: arcElem.x, y: arcElem.y };
                const labelTxt = `${val} (${pct}%)`;

                ctx.font = 'bold 10.5px Inter, sans-serif';
                const textWidth = ctx.measureText(labelTxt).width;
                ctx.fillStyle = 'rgba(15, 23, 42, 0.78)';
                ctx.beginPath();
                if (typeof ctx.roundRect === 'function') {
                    ctx.roundRect(pos.x - (textWidth / 2) - 4, pos.y - 8, textWidth + 8, 16, 4);
                } else {
                    ctx.rect(pos.x - (textWidth / 2) - 4, pos.y - 8, textWidth + 8, 16);
                }
                ctx.fill();

                ctx.fillStyle = '#ffffff';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(labelTxt, pos.x, pos.y);
            });
            ctx.restore();
            return;
        }

        if (!scales || !scales.x || !scales.y) {
            ctx.restore();
            return;
        }

        ctx.fillStyle = isDark ? '#f1f5f9' : '#1e293b';
        ctx.font = 'bold 11px Inter, sans-serif';

        // 2. GRÁFICO DE BARRAS HORIZONTALES (indexAxis: 'y'): Dibujar Total y Porcentaje a la derecha de cada barra
        if (isHorizontalBar) {
            const numLabels = (data.labels || []).length;
            let grandTotal = 0;
            const rowTotals = [];
            for (let i = 0; i < numLabels; i++) {
                let rowSum = 0;
                data.datasets.forEach((ds, dsIdx) => {
                    const meta = chart.getDatasetMeta(dsIdx);
                    if (!meta.hidden) {
                        rowSum += Number(ds.data[i]) || 0;
                    }
                });
                rowTotals.push(rowSum);
                grandTotal += rowSum;
            }

            ctx.textAlign = 'left';
            ctx.textBaseline = 'middle';
            for (let i = 0; i < numLabels; i++) {
                const totalRow = rowTotals[i];
                if (totalRow > 0) {
                    let rightX = scales.x.left;
                    data.datasets.forEach((ds, dsIdx) => {
                        const meta = chart.getDatasetMeta(dsIdx);
                        if (!meta.hidden && meta.data[i]) {
                            rightX = Math.max(rightX, meta.data[i].x);
                        }
                    });
                    const pct = grandTotal > 0 ? Math.round((totalRow / grandTotal) * 100) : 0;
                    const yPos = scales.y.getPixelForValue(i);
                    const xPos = Math.min(rightX + 6, scales.x.right - 46);
                    ctx.fillText(`${totalRow} (${pct}%)`, xPos, yPos);
                }
            }
            ctx.restore();
            return;
        }

        // 3. GRÁFICO DE BARRAS VERTICALES
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        const numLabels = (data.labels || []).length;
        for (let i = 0; i < numLabels; i++) {
            let totalCol = 0;
            let topY = scales.y.bottom;

            data.datasets.forEach((ds, dsIdx) => {
                const meta = chart.getDatasetMeta(dsIdx);
                if (!meta.hidden) {
                    const val = Number(ds.data[i]) || 0;
                    totalCol += val;
                    const barElem = meta.data[i];
                    if (barElem && barElem.y < topY) {
                        topY = barElem.y;
                    }
                }
            });

            if (totalCol > 0) {
                const xPos = scales.x.getPixelForValue(i);
                const yPos = Math.max(topY - 4, 12);
                ctx.fillText(String(totalCol), xPos, yPos);
            }
        }
        ctx.restore();
    }
};

// Inicialización de estado centralizado desde Storage Service
const initialState = Storage.initStorage(Utils);
let config = initialState.config;
let policias = initialState.policias;
let empresas = initialState.empresas;
let coloresPolicia = initialState.coloresPolicia;

let graficoGruposHorariosInstance = null;
let graficoMensualInstance = null;
let graficoAnualInstance = null;
let graficoAnualHorizontalInstance = null;
let calendar = null;
let _currentMobileTab = 'agenda';
let _periodoRapidoHistorial = 'todos';
let _servicioPendienteEliminar = null;
const DELETED_TOMBSTONES_KEY = 'alfa_deleted_servicios_tombstones';

function buildDeletedServiceKey(fecha, policia, empresa, turno) {
    const f = String(fecha || "").split("T")[0].trim();
    const p = String(policia || "").trim().toUpperCase();
    const e = String(empresa || "").trim().toUpperCase();
    const t = String(turno || "").trim();
    return `${f}__${p}__${e}__${t}`;
}

function getDeletedServicesTombstones() {
    const list = safeParse(DELETED_TOMBSTONES_KEY, []);
    return new Set(Array.isArray(list) ? list : []);
}

function registerDeletedServiceTombstone(fecha, policia, empresa, turno) {
    const key = buildDeletedServiceKey(fecha, policia, empresa, turno);
    const set = getDeletedServicesTombstones();
    set.add(key);
    if (typeof localStorage !== 'undefined') {
        try {
            localStorage.setItem(DELETED_TOMBSTONES_KEY, JSON.stringify(Array.from(set).slice(-300)));
        } catch (_) {}
    }
    return key;
}

function clearDeletedServiceTombstone(fecha, policia, empresa, turno) {
    const key = buildDeletedServiceKey(fecha, policia, empresa, turno);
    const set = getDeletedServicesTombstones();
    if (set.has(key)) {
        set.delete(key);
        if (typeof localStorage !== 'undefined') {
            try {
                localStorage.setItem(DELETED_TOMBSTONES_KEY, JSON.stringify(Array.from(set)));
            } catch (_) {}
        }
    }
}

/**
 * Elimina de forma sincrónica y definitiva un turno adicional de:
 *  1. El almacenamiento local `eventos` y base SQLite/IndexedDB
 *  2. La planilla mensual de Precartón (`planilla_...`) si pertenecía a ese mes/empresa
 *  3. La instancia activa de FullCalendar
 *  4. La tabla de Historial y Google Sheets
 */
function eliminarServicioDeListaYCalendario({ fecha, policia, empresa, turno }) {
    const cleanFecha = String(fecha || "").split("T")[0].trim();
    const cleanPolicia = String(policia || "").trim();
    const cleanEmpresa = String(empresa || "").trim();
    const cleanTurno = String(turno || "").trim();
    if (!cleanFecha) return { removedCount: 0 };

    registerDeletedServiceTombstone(cleanFecha, cleanPolicia, cleanEmpresa, cleanTurno);

    let removedCount = 0;

    // 1. Eliminar de FullCalendar si está instanciado
    if (calendar && typeof calendar.getEvents === 'function') {
        calendar.getEvents().forEach(ev => {
            const evFecha = ev.startStr ? String(ev.startStr).split("T")[0] : getLocalYMD(ev.start);
            const props = ev.extendedProps || {};
            const evPol = String(props.policia || "").trim();
            const evEmp = String(props.empresa || "").trim();
            const evTur = String(props.turno || "").trim();

            if (evFecha === cleanFecha &&
                (!cleanPolicia || evPol.toLowerCase() === cleanPolicia.toLowerCase()) &&
                (!cleanEmpresa || evEmp.toLowerCase() === cleanEmpresa.toLowerCase()) &&
                (!cleanTurno || evTur === cleanTurno)) {
                ev.remove();
                removedCount++;
            }
        });
    }

    // 2. Eliminar directamente del arreglo persistido en localStorage ("eventos")
    const storedEvs = safeParse("eventos", []);
    if (Array.isArray(storedEvs)) {
        const filteredEvs = storedEvs.filter(ev => {
            const evFecha = String(ev.start || ev.fecha || "").split("T")[0].trim();
            const props = ev.extendedProps || ev;
            const evPol = String(props.policia || "").trim();
            const evEmp = String(props.empresa || "").trim();
            const evTur = String(props.turno || "").trim();
            const isTarget = evFecha === cleanFecha &&
                (!cleanPolicia || evPol.toLowerCase() === cleanPolicia.toLowerCase()) &&
                (!cleanEmpresa || evEmp.toLowerCase() === cleanEmpresa.toLowerCase()) &&
                (!cleanTurno || evTur === cleanTurno);
            if (isTarget) removedCount++;
            return !isTarget;
        });
        Storage.saveEventos(filteredEvs);
    } else if (calendar) {
        guardarEventosLocal();
    }

    // 3. Limpiar también la celda en la planilla local de Precartón si existía
    if (cleanEmpresa && /^\d{4}-\d{2}-\d{2}$/.test(cleanFecha) && typeof localStorage !== 'undefined') {
        try {
            const [yStr, mStr, dStr] = cleanFecha.split("-");
            const anioNum = parseInt(yStr, 10);
            const mesIdx = parseInt(mStr, 10) - 1;
            const diaNum = parseInt(dStr, 10);
            const clavePlan = `planilla_${cleanEmpresa}_${anioNum}_${mesIdx}`;
            const planData = safeParse(clavePlan, null);
            if (planData && typeof planData === 'object') {
                let modifiedPlan = false;
                Object.keys(planData).forEach(cellKey => {
                    if (cellKey.startsWith(`${diaNum}_`) && String(planData[cellKey] || "").toLowerCase() === cleanPolicia.toLowerCase()) {
                        delete planData[cellKey];
                        modifiedPlan = true;
                    }
                });
                if (modifiedPlan) {
                    localStorage.setItem(clavePlan, JSON.stringify(planData));
                }
            }
        } catch (_) {}
    }

    // 4. Actualizar Tabla de Historial, Gráficos y KPIs inmediatamente
    actualizarTodo();

    // 5. Sincronizar eliminación con Google Sheets
    if (cleanPolicia && cleanEmpresa && cleanFecha && CloudSync && typeof CloudSync.eliminarServicioCloud === 'function') {
        CloudSync.eliminarServicioCloud(cleanPolicia, cleanEmpresa, cleanTurno, cleanFecha)
            .then(() => actualizarEstadoBaseDatosUI());
    }

    return { removedCount };
}

function solicitarConfirmacionEliminarServicio({ fecha, policia, empresa, turno, labelPolicia, labelHorario }) {
    _servicioPendienteEliminar = { fecha, policia, empresa, turno };
    const modal = document.getElementById("modalConfirmarEliminarServicio");
    const txt = document.getElementById("textoConfirmarEliminarServicio");

    const descPol = labelPolicia || policia || "Efectivo";
    const descHor = labelHorario || formatearTurno(turno);
    const msg = `¿Eliminar el turno adicional de ${descPol} en ${empresa} (${descHor}) del día ${fecha}?`;

    if (modal) {
        if (txt) txt.textContent = msg;
        abrirModal("modalConfirmarEliminarServicio");
        return;
    }

    // Fallback si no existe el modal en el DOM
    if (typeof confirm === 'function' ? confirm(msg) : true) {
        ejecutarEliminacionServicioConfirmada();
    }
}

function ejecutarEliminacionServicioConfirmada() {
    if (!_servicioPendienteEliminar) return;
    const target = _servicioPendienteEliminar;
    _servicioPendienteEliminar = null;
    cerrarModal("modalConfirmarEliminarServicio");
    eliminarServicioDeListaYCalendario(target);
    mostrarNotificacion(`🗑️ Turno de ${target.policia} en ${target.empresa} (${target.fecha}) eliminado`, "var(--danger)");
}

function nombresPolicias() {
    return policias.map(policiaItem => policiaItem.nombre);
}

function obtenerJerarquiaPolicia(nombrePol) {
    const clean = String(nombrePol || "").trim().toLowerCase();
    const found = policias.find(p => p.nombre.toLowerCase() === clean);
    return found && found.jerarquia ? found.jerarquia : "";
}

function etiquetaPolicia(policiaObj) {
    if (!policiaObj) return "";
    return policiaObj.jerarquia ? `${policiaObj.jerarquia} ${policiaObj.nombre}` : policiaObj.nombre;
}

function mostrarNotificacion(msg, color = "var(--primary)") {
    let notifElem = document.getElementById("notificacion");
    if (!notifElem) return;
    notifElem.style.background = sanitizeColor(color, "var(--primary)");
    notifElem.textContent = msg;
    notifElem.classList.add("show");
    setTimeout(() => notifElem.classList.remove("show"), 3200);
}

function abrirModal(modalId) {
    const elem = document.getElementById(modalId);
    if (elem) elem.style.display = "flex";
}

function cerrarModal(modalId) {
    const elem = document.getElementById(modalId);
    if (elem) elem.style.display = "none";
}

function abrirNuevoServicioRapido() {
    const hoyIso = getLocalYMD(new Date());
    window.fechaSeleccionada = hoyIso;
    const inputFecha = document.getElementById("inputFechaServicio");
    if (inputFecha) inputFecha.value = hoyIso;
    const tituloEl = document.getElementById("fechaTitulo");
    if (tituloEl) tituloEl.textContent = "Nuevo Servicio: " + hoyIso;
    preseleccionarPoliciaTitularEnFormulario();
    actualizarCategoriaAuto();
    abrirModal('modalServicio');
}

/**
 * Obtiene el policía titular predefinido asociado a la cuenta Gmail vinculada.
 * @returns {string}
 */
function obtenerPoliciaTitularPredefinido() {
    if (CloudSync && typeof CloudSync.getLinkedGmailAccount === 'function') {
        const acc = CloudSync.getLinkedGmailAccount();
        if (acc && acc.policiaTitular) {
            return String(acc.policiaTitular).trim();
        }
    }
    return "";
}

/**
 * Preselecciona en el formulario de Nuevo Servicio al policía titular vinculado a la cuenta Gmail.
 */
function preseleccionarPoliciaTitularEnFormulario() {
    const titular = obtenerPoliciaTitularPredefinido();
    const sPol = document.getElementById("selPolicia");
    if (sPol && titular && Array.from(sPol.options).some(o => o.value === titular)) {
        sPol.value = titular;
    }
}

/**
 * Renderiza la leyenda de colores diferenciados por Empresa (Precartón) en la parte inferior del calendario (Imagen 2).
 */
function renderizarLeyendaEmpresasCalendario() {
    const cont = document.getElementById("leyendaEmpresasCal");
    if (!cont) return;
    cont.innerHTML = "";
    Object.keys(empresas).forEach(empName => {
        const empColor = Utils.getEmpresaColor ? Utils.getEmpresaColor(empName) : '#2563eb';
        const pill = document.createElement("span");
        pill.className = "cal-emp-chip";
        pill.style.borderLeftColor = empColor;
        pill.textContent = empName;
        cont.appendChild(pill);
    });
}

/**
 * Inicializa los selectores del DOM incluyendo el doble filtro del calendario en una sola línea (Imagen 3).
 */
function inicializarSelects() {
    const sPol = document.getElementById("selPolicia");
    const fPol = document.getElementById("filtroPolicia");
    const cPol = document.getElementById("filtroCalPolicia");
    const cEmp = document.getElementById("filtroCalEmpresa");
    const sEmp = document.getElementById("selEmpresa");
    const fEmp = document.getElementById("filtroEmpresa");

    [
        { el: sPol, first: "-- Seleccione Policía --" },
        { el: fPol, first: "Todos los Policías" },
        { el: cPol, first: "Policías: Todos" }
    ].forEach(s => {
        if (!s.el) return;
        s.el.innerHTML = "";
        if (s.first) {
            let firstOp = document.createElement("option");
            firstOp.value = "";
            firstOp.textContent = s.first;
            s.el.appendChild(firstOp);
        }
        policias.forEach(p => {
            let op = document.createElement("option");
            op.value = p.nombre;
            op.textContent = etiquetaPolicia(p);
            s.el.appendChild(op);
        });
    });

    [
        { el: sEmp, data: Object.keys(empresas), first: "-- Seleccione Empresa --" },
        { el: fEmp, data: Object.keys(empresas), first: "Todas las Empresas" },
        { el: cEmp, data: Object.keys(empresas), first: "Empresas: Todas" }
    ].forEach(s => {
        if (!s.el) return;
        s.el.innerHTML = "";
        if (s.first) {
            let firstOp = document.createElement("option");
            firstOp.value = "";
            firstOp.textContent = s.first;
            s.el.appendChild(firstOp);
        }
        s.data.forEach(item => {
            let op = document.createElement("option");
            op.value = item;
            op.textContent = item;
            s.el.appendChild(op);
        });
    });

    renderizarLeyendaEmpresasCalendario();
    cambiarTurnos();

    // Si hay un policía titular predefinido al vincular el correo Gmail, preseleccionarlo en el formulario y en el filtro del calendario
    const titular = obtenerPoliciaTitularPredefinido();
    if (titular) {
        if (sPol && Array.from(sPol.options).some(o => o.value === titular)) {
            sPol.value = titular;
        }
        if (cPol && Array.from(cPol.options).some(o => o.value === titular)) {
            cPol.value = titular;
            filtrarCalendario();
        }
    }

    const statPol = document.getElementById("stat-policias");
    if (statPol) statPol.textContent = policias.length;
}

function cambiarTurnos() {
    let e = document.getElementById("selEmpresa") ? document.getElementById("selEmpresa").value : "";
    let s = document.getElementById("selTurno");
    if (!s) return;
    s.innerHTML = "";
    if (e && empresas[e]) {
        let turnos = empresas[e].turnos || empresas[e];
        turnos.forEach(t => {
            let op = document.createElement("option");
            op.value = t;
            op.textContent = formatearTurno(t);
            s.appendChild(op);
        });
    }
    actualizarCategoriaAuto();
}

function actualizarCategoriaAuto() {
    let eElem = document.getElementById("selEmpresa");
    let e = eElem ? eElem.value : "";
    if (!e || !empresas[e]) return;
    const inputFecha = document.getElementById("inputFechaServicio");
    if (inputFecha && inputFecha.value) {
        window.fechaSeleccionada = inputFecha.value;
    }
    let fecha = window.fechaSeleccionada || new Date().toISOString().slice(0, 10);
    let dia = new Date(fecha + "T00:00:00").getDay();
    let esFinde = (dia === 0 || dia === 6);
    let cat = esFinde ? empresas[e].catFinde : empresas[e].catSemana;
    let sel = document.getElementById("selCategoria");
    if (sel && cat) sel.value = cat;
}

function calcularCostoTurno(turno, fechaStr, empData) {
    return Calculator.calcularCostoTurno(turno, fechaStr, empData, config);
}

const defaultServiciosRaw = [
    { fecha: "2026-03-15", empresa: "SIGLO21 (P1)", policia: "Olivera Fernando", turno: "15-23", cat: "AP", cost: 135870, h: 8, vh: 16983.75 },
    { fecha: "2026-03-01", empresa: "PALADINI", policia: "Olivera Fernando", turno: "22-06", cat: "AP", cost: 135870, h: 8, vh: 16983.75 },
    { fecha: "2026-03-16", empresa: "PALADINI", policia: "Olivera Fernando", turno: "22-06", cat: "A", cost: 119944, h: 8, vh: 14993 },
    { fecha: "2026-03-21", empresa: "SIGLO21 (P1)", policia: "Olivera Fernando", turno: "15-23", cat: "AP", cost: 135870, h: 8, vh: 16983.75 },
    { fecha: "2026-03-22", empresa: "SIGLO21 (P1)", policia: "Olivera Fernando", turno: "15-23", cat: "AP", cost: 135870, h: 8, vh: 16983.75 },
    { fecha: "2026-03-29", empresa: "SIGLO21 (P1)", policia: "Olivera Fernando", turno: "15-23", cat: "AP", cost: 135870, h: 8, vh: 16983.75 },
    { fecha: "2026-03-08", empresa: "SIGLO21 (P1)", policia: "Olivera Fernando", turno: "07-15", cat: "AP", cost: 135870, h: 8, vh: 16983.75 },
    { fecha: "2026-03-08", empresa: "SIGLO21 (P1)", policia: "Olivera Fernando", turno: "15-23", cat: "AP", cost: 135870, h: 8, vh: 16983.75 }
];

const defaultEventos = defaultServiciosRaw.map(s => ({
    title: `${s.policia}\n${s.empresa} (${formatearTurno(s.turno)})`,
    start: s.fecha,
    backgroundColor: Utils.ensureDistinctEventColor ? Utils.ensureDistinctEventColor(coloresPolicia[s.policia], s.policia) : '#0d9488',
    borderColor: 'transparent',
    extendedProps: {
        policia: s.policia, empresa: s.empresa, turno: s.turno,
        cat: s.cat, cost: s.cost, h: s.h, vh: s.vh,
        detail: [{ cat: s.cat, h: s.h, vh: s.vh, cost: s.cost }]
    }
}));

/**
 * Extrae de forma estructurada (Empresa, Horario, Policía) los datos de un evento
 * garantizando que en la celda del calendario se vean completos a simple vista sin truncarse ("SIGL...").
 * @param {Object} eventObj - Instancia de evento de FullCalendar.
 * @returns {{empresa: string, empresaColor: string, policiaColor: string, horarioCorto: string, horarioLargo: string, policiaCorto: string, policiaLargo: string}}
 */
function extractStructuredEventInfo(eventObj) {
    const props = (eventObj && eventObj.extendedProps) ? eventObj.extendedProps : {};
    let empresa = String(props.empresa || "").trim();
    let policia = String(props.policia || "").trim();
    let turnoRaw = String(props.turno || "").trim();

    if ((!empresa || !policia) && eventObj && eventObj.title) {
        const lines = String(eventObj.title).split('\n');
        if (!policia && lines[0]) policia = lines[0].trim();
        if (!empresa && lines[1]) {
            empresa = lines[1].split('(')[0].trim();
        }
    }

    const jerarquia = obtenerJerarquiaPolicia(policia);
    const horarioCorto = Utils.formatearTurnoCorto ? Utils.formatearTurnoCorto(turnoRaw) : formatearTurno(turnoRaw);
    const horarioLargo = formatearTurno(turnoRaw);
    const polBaseCorto = Utils.abreviarNombrePolicia ? Utils.abreviarNombrePolicia(policia) : policia;
    // En la celda del calendario mostramos el Apellido + Inicial limpio (ej. "Olivera F.") para que se lea completo sin "Sgto. Ayt..."
    const policiaCorto = polBaseCorto;
    const policiaLargo = jerarquia ? `${jerarquia} ${policia}` : policia;

    const empresaColor = Utils.getEmpresaColor ? Utils.getEmpresaColor(empresa) : '#16a34a';
    // Imagen 1: Usar siempre un color contrastante distinto del azul (#2563eb) de los botones de la barra del calendario
    const rawPolColor = (eventObj && eventObj.backgroundColor) || coloresPolicia[policia];
    const policiaColor = Utils.ensureDistinctEventColor
        ? Utils.ensureDistinctEventColor(rawPolColor, policia || empresa)
        : sanitizeColor(rawPolColor, '#0d9488');

    return {
        empresa: empresa || "S/E",
        empresaColor,
        policiaColor,
        horarioCorto: horarioCorto || "-",
        horarioLargo: horarioLargo || "-",
        policiaCorto: policiaCorto || "S/P",
        policiaLargo: policiaLargo || "S/P"
    };
}

/**
 * Inicializa FullCalendar asegurando que en móvil y PC se visualicen completos Empresa, Horario y Policía.
 */
function initCalendar() {
    const calendarEl = document.getElementById("calendar");
    if (!calendarEl || typeof FullCalendar === 'undefined') return;

    let eventosGuardados = safeParse("eventos", defaultEventos);
    if (!Array.isArray(eventosGuardados) || eventosGuardados.length === 0) {
        eventosGuardados = defaultEventos;
        Storage.saveEventos(defaultEventos);
    }

    const platform = Utils.detectPlatformContext ? Utils.detectPlatformContext() : { isMobileViewport: false };

    calendar = new FullCalendar.Calendar(calendarEl, {
        locale: 'es',
        initialView: 'dayGridMonth',
        fixedWeekCount: false,
        showNonCurrentDates: true,
        expandRows: true,
        buttonText: {
            today: 'Hoy',
            month: 'Mes',
            week: 'Sem'
        },
        headerToolbar: {
            left: 'prev,next today',
            center: 'title',
            right: 'dayGridMonth,dayGridWeek'
        },
        height: '100%',
        contentHeight: '100%',
        editable: !platform.isMobileViewport,
        dayMaxEvents: false,
        events: eventosGuardados,
        eventContent: function (arg) {
            const info = extractStructuredEventInfo(arg.event);
            const isMobile = window.innerWidth <= 768;
            const wrapper = document.createElement('div');
            wrapper.className = 'alfa-cal-event-card';
            wrapper.style.backgroundColor = info.policiaColor;
            wrapper.style.borderLeft = `4px solid ${info.empresaColor}`;
            wrapper.innerHTML = `
                <div class="ev-line-emp">${escapeHTML(info.empresa)}</div>
                <div class="ev-line-time">${escapeHTML(isMobile ? info.horarioCorto : info.horarioLargo)}</div>
                <div class="ev-line-pol">${escapeHTML(isMobile ? info.policiaCorto : info.policiaLargo)}</div>
            `;
            return { domNodes: [wrapper] };
        },
        eventClassNames: function (arg) {
            if (!arg.event.start) return [];
            let eventYear = arg.event.start.getFullYear();
            let eventMonth = arg.event.start.getMonth() + 1;

            let today = new Date();
            let currentYear = today.getFullYear();
            let currentMonth = today.getMonth() + 1;

            let isPastMonth = (eventYear < currentYear) ||
                (eventYear === currentYear && eventMonth < currentMonth);

            return isPastMonth ? ['event-past-month'] : [];
        },
        dateClick: function (info) {
            window.fechaSeleccionada = info.dateStr;
            const inputFecha = document.getElementById("inputFechaServicio");
            if (inputFecha) inputFecha.value = info.dateStr;
            const tituloEl = document.getElementById("fechaTitulo");
            if (tituloEl) tituloEl.textContent = "Nuevo Servicio: " + info.dateStr;
            preseleccionarPoliciaTitularEnFormulario();
            actualizarCategoriaAuto();
            abrirModal('modalServicio');
        },
        eventClick: function (info) {
            if (info && info.jsEvent && typeof info.jsEvent.stopPropagation === 'function') {
                info.jsEvent.stopPropagation();
            }
            const evInfo = extractStructuredEventInfo(info.event);
            const props = info.event.extendedProps || {};
            const policia = props.policia || evInfo.policiaLargo;
            const empresa = props.empresa || evInfo.empresa;
            const turno = props.turno || "";
            const fecha = info.event.startStr ? String(info.event.startStr).split("T")[0] : getLocalYMD(info.event.start);

            solicitarConfirmacionEliminarServicio({
                fecha,
                policia,
                empresa,
                turno,
                labelPolicia: evInfo.policiaLargo,
                labelHorario: evInfo.horarioLargo
            });
        }
    });
    calendar.render();
}

/**
 * Imagen 4: Captura la zona completa del Calendario delegando al script separado según la plataforma:
 * - En Android APK: usa `AlfaPlatformAPK.captureAndShareCalendarAPK` (@capacitor/filesystem + @capacitor/share).
 * - En Windows PC: usa `AlfaPlatformPC.captureAndShareCalendarPC` (descarga PNG + abre WhatsApp Web).
 */
async function capturarYCompartirCalendarioWhatsApp() {
    const targetEl = document.getElementById("zonaCapturaCalendario") || document.getElementById("calendar");
    if (!targetEl || typeof html2canvas === 'undefined') {
        return mostrarNotificacion("Herramienta de captura no disponible", "var(--danger)");
    }

    try {
        const fileName = `Calendario_Alfas_${new Date().toISOString().slice(0, 10)}.png`;
        const ctx = Utils.detectPlatformContext ? Utils.detectPlatformContext() : { isNativeAPK: false, isMobileViewport: false };

        if (ctx.isNativeAPK || ctx.isMobileViewport) {
            mostrarNotificacion("📸 Generando captura en Android para WhatsApp...", "var(--primary)");
            await PlatformAPK.captureAndShareCalendarAPK(targetEl, fileName);
            mostrarNotificacion("Captura lista para enviar por WhatsApp", "var(--secondary)");
        } else {
            mostrarNotificacion("📸 Generando captura en Windows PC...", "var(--primary)");
            await PlatformPC.captureAndShareCalendarPC(targetEl, fileName);
            mostrarNotificacion("Captura guardada en Descargas (PC)", "var(--secondary)");
        }
    } catch (err) {
        if (err && (err.name === 'AbortError' || String(err.message || '').includes('canceled'))) return;
        console.error("Error al capturar calendario:", err);
        mostrarNotificacion("No se pudo completar la captura del calendario", "var(--danger)");
    }
}

function guardarEvento() {
    let p = document.getElementById("selPolicia").value;
    let t = document.getElementById("selTurno").value;
    let e = document.getElementById("selEmpresa").value;
    const inputFecha = document.getElementById("inputFechaServicio");
    if (inputFecha && inputFecha.value) {
        window.fechaSeleccionada = inputFecha.value;
    }

    if (!p || !e || !window.fechaSeleccionada) {
        return mostrarNotificacion("Complete fecha, empresa y policía", "var(--danger)");
    }

    let duplicado = calendar.getEvents().some(ev =>
        ev.startStr === window.fechaSeleccionada &&
        ev.extendedProps.policia === p &&
        ev.extendedProps.empresa === e &&
        ev.extendedProps.turno === t
    );
    if (duplicado) return mostrarNotificacion(`${p} ya tiene este turno asignado`, "var(--warning)");

    let empData = empresas[e];
    let resultado = Calculator.calcularCostoTurno(t, window.fechaSeleccionada, empData, config);

    let catSelUI = document.getElementById("selCategoria").value;
    if (catSelUI && catSelUI !== resultado.cat && !resultado.cat.includes("+")) {
        let vh = config[catSelUI] || 0;
        resultado = {
            cat: catSelUI,
            cost: vh * resultado.h,
            h: resultado.h,
            vh,
            detail: [{ cat: catSelUI, h: resultado.h, vh, cost: vh * resultado.h }],
            catLabel: catSelUI
        };
    }

    let nuevoEv = {
        title: `${p}\n${e} (${formatearTurno(t)})`,
        start: window.fechaSeleccionada,
        allDay: true,
        backgroundColor: Utils.ensureDistinctEventColor ? Utils.ensureDistinctEventColor(coloresPolicia[p], p) : '#0d9488',
        borderColor: 'transparent',
        extendedProps: {
            policia: p, empresa: e, turno: t,
            cat: resultado.cat, cost: resultado.cost, h: resultado.h, vh: resultado.vh,
            detail: resultado.detail
        }
    };

    calendar.addEvent(nuevoEv);
    clearDeletedServiceTombstone(window.fechaSeleccionada, p, e, t);
    guardarEventosLocal();
    actualizarTodo();
    cerrarModal('modalServicio');

    if (Notifications && typeof Notifications.scheduleServiceReminders === 'function') {
        const acc = CloudSync.getLinkedGmailAccount ? CloudSync.getLinkedGmailAccount() : null;
        Notifications.scheduleServiceReminders(calendar.getEvents(), {
            policiaTitular: (acc && acc.policiaTitular) ? acc.policiaTitular : "",
            onAlertBanner: mostrarBannerServicioProximo
        });
    }

    mostrarNotificacion("Guardando en Base Local SQLite y Nube...", "var(--primary)");

    const catFinal = resultado.catLabel || resultado.cat || "A";
    const payload = {
        action: "addServicio",
        fecha: window.fechaSeleccionada,
        empresa: e,
        policia: p,
        turno: t,
        categoria: catFinal,
        hora: resultado.h,
        costo: resultado.cost
    };

    CloudSync.registrarServicioCloud(payload)
        .then((synced) => {
            if (synced) {
                mostrarNotificacion("Servicio guardado en Base Local y Google Sheets", "var(--secondary)");
            } else {
                mostrarNotificacion("Guardado en Base Local SQLite (Encolado en Outbox)", "var(--warning)");
            }
            actualizarEstadoBaseDatosUI();
        });
}

function guardarEventosLocal() {
    if (!calendar) return;
    let evs = calendar.getEvents().map(e => ({
        title: e.title,
        start: e.startStr,
        backgroundColor: Utils.ensureDistinctEventColor ? Utils.ensureDistinctEventColor(e.backgroundColor, (e.extendedProps && e.extendedProps.policia) || '') : '#0d9488',
        extendedProps: e.extendedProps
    }));
    Storage.saveEventos(evs);
}

function popularFiltroMeses() {
    let selectDash = document.getElementById("filtroMesDashboard");
    let selectAnioDash = document.getElementById("filtroAnioDashboard");
    let selectHist = document.getElementById("filtroMesHistorial");

    let valDash = selectDash ? selectDash.value : "";
    let valAnio = selectAnioDash ? selectAnioDash.value : "";
    let valHist = selectHist ? selectHist.value : "";

    let mesesSet = new Set();
    let aniosSet = new Set();
    const currentYear = new Date().getFullYear();
    for (let y = currentYear; y >= currentYear - 4; y--) {
        aniosSet.add(String(y));
    }

    if (calendar) {
        calendar.getEvents().forEach(e => {
            if (e.start) {
                const ym = getLocalYM(e.start);
                if (ym) {
                    mesesSet.add(ym);
                    aniosSet.add(ym.split('-')[0]);
                }
            }
        });
    }
    let todayYyyyMm = getLocalYM(new Date());
    mesesSet.add(todayYyyyMm);

    let mesesArr = Array.from(mesesSet).filter(m => /^\d{4}-\d{2}$/.test(m)).sort().reverse();
    let optionsHTML = `<option value="">Todos los meses</option>`;
    let formatter = new Intl.DateTimeFormat('es-ES', { month: 'long', year: 'numeric' });

    mesesArr.forEach(m => {
        let [y, mo] = m.split('-');
        let text = formatter.format(new Date(Number(y), parseInt(mo, 10) - 1, 1));
        text = text.charAt(0).toUpperCase() + text.slice(1);
        optionsHTML += `<option value="${escapeHTML(m)}">${escapeHTML(text)}</option>`;
    });

    if (selectDash) {
        selectDash.innerHTML = optionsHTML;
        selectDash.value = valDash || todayYyyyMm;
    }
    if (selectHist) {
        selectHist.innerHTML = optionsHTML;
        selectHist.value = valHist;
    }

    if (selectAnioDash) {
        const aniosArr = Array.from(aniosSet).filter(a => /^\d{4}$/.test(a)).sort().reverse();
        let aniosHTML = "";
        aniosArr.forEach(a => {
            aniosHTML += `<option value="${escapeHTML(a)}">${escapeHTML(a)}</option>`;
        });
        selectAnioDash.innerHTML = aniosHTML;
        selectAnioDash.value = valAnio || String(currentYear);
    }
}

function actualizarTodo() {
    popularFiltroMeses();
    actualizarTabla();
    aplicarFiltros();
    calcularResumen();
    actualizarEstadoBaseDatosUI();
}

function actualizarTabla() {
    const tbody = document.querySelector("#tablaServicios tbody");
    if (!tbody || !calendar) return;
    tbody.innerHTML = "";

    let sorted = [...calendar.getEvents()].sort((a, b) => b.start - a.start);

    sorted.forEach(e => {
        let p = e.extendedProps || {};
        let costVal = (p.cost !== undefined) ? Number(p.cost) : (p.costo !== undefined ? Number(p.costo) : 0);
        let polNombre = String(p.policia || p.Policia || "S/D");
        let empNombre = String(p.empresa || p.Empresa || "S/D");
        let fechaIso = getLocalYMD(e.start);

        let tr = document.createElement("tr");
        tr.setAttribute("data-fecha", fechaIso);
        tr.setAttribute("data-empresa", empNombre);
        tr.setAttribute("data-policia", polNombre);

        let rawCat = String(p.cat || "A");
        let catSafeClass = rawCat.split("+")[0].replace(/[^a-zA-Z0-9]/g, "").toLowerCase() || "a";
        let catBadge = `<span class="badge badge-${escapeHTML(catSafeClass)}">${escapeHTML(rawCat)}</span>`;

        const safeFecha = escapeHTML(fechaIso);
        const safeEmp = escapeHTML(empNombre);
        const safePol = escapeHTML(polNombre);
        const safeTurnoRaw = escapeHTML(String(p.turno || ""));
        const safeTurno = escapeHTML(Utils.formatearTurnoCorto ? Utils.formatearTurnoCorto(p.turno) : formatearTurno(p.turno));
        const safeCosto = escapeHTML((Number.isFinite(costVal) ? costVal : 0).toLocaleString('es-AR'));

        tr.innerHTML = `
            <td>${safeFecha}</td>
            <td><span class="badge badge-empresa">${safeEmp}</span></td>
            <td>${safeTurno}</td>
            <td>${catBadge}</td>
            <td class="font-weight-600">$${safeCosto}</td>
            <td style="text-align:center;">
                <button type="button" class="btn-danger" style="min-height:28px !important; padding:3px 8px !important; font-size:0.72rem !important;"
                        title="Eliminar turno de ${safePol}"
                        onclick="solicitarConfirmacionEliminarServicio({ fecha: '${safeFecha}', policia: '${safePol}', empresa: '${safeEmp}', turno: '${safeTurnoRaw}' })">
                    🗑️
                </button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

function aplicarPeriodoRapidoHistorial(periodo) {
    _periodoRapidoHistorial = periodo;
    const pills = document.querySelectorAll(".quick-period-pills .pill-btn");
    pills.forEach(btn => {
        btn.classList.toggle("active", btn.getAttribute("data-period") === periodo);
    });

    const mesEl = document.getElementById("filtroMesHistorial");
    if (mesEl && periodo !== 'mensual') {
        mesEl.value = "";
    }
    aplicarFiltros();
}

function onCambioSelectMesHistorial() {
    const mesEl = document.getElementById("filtroMesHistorial");
    if (mesEl && mesEl.value) {
        _periodoRapidoHistorial = 'mensual-select';
        document.querySelectorAll(".quick-period-pills .pill-btn").forEach(btn => {
            btn.classList.toggle("active", btn.getAttribute("data-period") === 'mensual');
        });
    }
    aplicarFiltros();
}

function obtenerFechaReferenciaActiva() {
    const now = new Date();
    const ymNow = getLocalYM(now);
    if (!calendar) return now;

    const events = calendar.getEvents();
    const hasCurrentMonth = events.some(e => e.start && getLocalYM(e.start) === ymNow);
    if (hasCurrentMonth || events.length === 0) return now;

    const sorted = [...events].filter(e => e.start).sort((a, b) => b.start - a.start);
    return sorted[0] ? sorted[0].start : now;
}

function aplicarFiltros() {
    const polEl = document.getElementById("filtroPolicia");
    const empEl = document.getElementById("filtroEmpresa");
    const mesEl = document.getElementById("filtroMesHistorial");

    const pol = polEl ? polEl.value : "";
    const emp = empEl ? empEl.value : "";
    const mesSelect = mesEl ? mesEl.value : "";
    const filas = document.querySelectorAll("#tablaServicios tbody tr");

    const refDate = obtenerFechaReferenciaActiva();
    const activeYM = mesSelect || getLocalYM(refDate);
    const activeYear = String(refDate.getFullYear());

    const weekStart = new Date(refDate);
    weekStart.setHours(0, 0, 0, 0);
    weekStart.setDate(weekStart.getDate() - 6);
    const weekEnd = new Date(refDate);
    weekEnd.setHours(23, 59, 59, 999);

    let visiblesCount = 0;

    filas.forEach(f => {
        const fFecha = f.getAttribute("data-fecha") || "";
        const fEmp = f.getAttribute("data-empresa") || "";
        const fPol = f.getAttribute("data-policia") || "";
        let match = true;

        if (mesSelect) {
            if (!fFecha.startsWith(mesSelect)) match = false;
        } else if (_periodoRapidoHistorial === 'mensual') {
            if (!fFecha.startsWith(activeYM)) match = false;
        } else if (_periodoRapidoHistorial === 'anual') {
            if (!fFecha.startsWith(activeYear)) match = false;
        } else if (_periodoRapidoHistorial === 'semanal') {
            const dObj = new Date(fFecha + "T12:00:00");
            if (isNaN(dObj.getTime()) || dObj < weekStart || dObj > weekEnd) {
                match = false;
            }
        }

        if (pol && fPol !== pol) match = false;
        if (emp && fEmp !== emp) match = false;

        f.style.display = match ? "" : "none";
        if (match) visiblesCount++;
    });

    const subConteo = document.getElementById("historialSubtituloConteo");
    if (subConteo) {
        const etiquetasPeriodo = {
            'semanal': `Período Semanal (${getLocalYMD(weekStart)} a ${getLocalYMD(weekEnd)})`,
            'mensual': `Mes (${activeYM})`,
            'mensual-select': `Mes (${activeYM})`,
            'anual': `Año Vigente (${activeYear})`,
            'todos': 'Todos los períodos'
        };
        subConteo.textContent = `${etiquetasPeriodo[_periodoRapidoHistorial] || 'Historial'} — ${visiblesCount} registros`;
    }
}

function limpiarFiltros() {
    const polEl = document.getElementById("filtroPolicia");
    const empEl = document.getElementById("filtroEmpresa");
    const mesEl = document.getElementById("filtroMesHistorial");

    if (polEl) polEl.value = "";
    if (empEl) empEl.value = "";
    if (mesEl) mesEl.value = "";
    aplicarPeriodoRapidoHistorial('todos');
}

function computeWeekdayBarStats(eventsList, targetYM, targetYear, targetAnualMonth = "") {
    const mensualPorDia = [0, 0, 0, 0, 0, 0, 0];
    let totalTurnosMes = 0;
    let totalCostoMes = 0;

    const anualPorDia = [0, 0, 0, 0, 0, 0, 0];
    const anualPorMesYDia = Array.from({ length: 12 }, () => [0, 0, 0, 0, 0, 0, 0]);
    let totalTurnosAnual = 0;
    let totalCostoAnual = 0;

    const porGrupoHorarioMes = {};
    const porGrupoHorarioAnual = {};
    const porPoliciaMes = {};
    const porPoliciaAnual = {};

    const filterAnualMonthIdx = (targetAnualMonth && /^\d{2}$/.test(String(targetAnualMonth)))
        ? parseInt(String(targetAnualMonth), 10) - 1
        : -1;

    (Array.isArray(eventsList) ? eventsList : []).forEach(e => {
        const dObj = (e.start instanceof Date)
            ? e.start
            : new Date(String(e.start || "") + (String(e.start || "").includes("T") ? "" : "T00:00:00"));
        if (!dObj || isNaN(dObj.getTime())) return;

        const ym = getLocalYM(dObj);
        const yr = dObj.getFullYear();
        const monthIdx = dObj.getMonth();
        const dayOfWeek = dObj.getDay();

        const p = e.extendedProps || {};
        const rawCost = (p.cost !== undefined) ? Number(p.cost) : (p.costo !== undefined ? Number(p.costo) : 0);
        const costVal = Number.isFinite(rawCost) ? rawCost : 0;
        const polNombre = String(p.policia || p.Policia || "Desconocido");
        const turnoRaw = String(p.turno || p.Turno || "07-15").trim();
        const grupoHorarioLabel = Utils.formatearTurnoCorto ? Utils.formatearTurnoCorto(turnoRaw) : formatearTurno(turnoRaw);

        // Gráfico 2 (Anual / Comparativo con soporte de filtro por Mes y Año) y Tabla de Resumen por Policía
        if (yr === targetYear && (filterAnualMonthIdx === -1 || monthIdx === filterAnualMonthIdx)) {
            anualPorDia[dayOfWeek]++;
            anualPorMesYDia[monthIdx][dayOfWeek]++;
            totalTurnosAnual++;
            totalCostoAnual += costVal;

            porGrupoHorarioAnual[grupoHorarioLabel] = (porGrupoHorarioAnual[grupoHorarioLabel] || 0) + 1;

            if (!porPoliciaAnual[polNombre]) porPoliciaAnual[polNombre] = { turnos: 0, total: 0 };
            porPoliciaAnual[polNombre].turnos++;
            porPoliciaAnual[polNombre].total += costVal;
        }

        // Gráfico 1 (Mensual) y Gráfico N° 1 (Distribución por Grupos Horarios)
        if (!targetYM || ym === targetYM) {
            mensualPorDia[dayOfWeek]++;
            totalTurnosMes++;
            totalCostoMes += costVal;

            porGrupoHorarioMes[grupoHorarioLabel] = (porGrupoHorarioMes[grupoHorarioLabel] || 0) + 1;

            if (!porPoliciaMes[polNombre]) porPoliciaMes[polNombre] = { turnos: 0, total: 0 };
            porPoliciaMes[polNombre].turnos++;
            porPoliciaMes[polNombre].total += costVal;
        }
    });

    const porcentajesMensualPorDia = mensualPorDia.map(c => totalTurnosMes > 0 ? Math.round((c / totalTurnosMes) * 100) : 0);
    const porcentajesAnualPorDia = anualPorDia.map(c => totalTurnosAnual > 0 ? Math.round((c / totalTurnosAnual) * 100) : 0);

    return {
        mensualPorDia,
        porcentajesMensualPorDia,
        totalTurnosMes,
        totalCostoMes,
        anualPorDia,
        porcentajesAnualPorDia,
        anualPorMesYDia,
        totalTurnosAnual,
        totalCostoAnual,
        porGrupoHorarioMes,
        porGrupoHorarioAnual,
        porPoliciaMes,
        porPoliciaAnual
    };
}

function calcularResumen() {
    if (!calendar) return;
    const mesFiltroElem = document.getElementById("filtroMesDashboard");
    const mesAnualFiltroElem = document.getElementById("filtroMesAnualDashboard");
    const anioFiltroElem = document.getElementById("filtroAnioDashboard");
    const refDate = obtenerFechaReferenciaActiva();
    let mesFiltro = (mesFiltroElem && mesFiltroElem.value) ? mesFiltroElem.value : getLocalYM(refDate);

    const allEvents = calendar.getEvents();
    if (mesFiltroElem && !mesFiltroElem.dataset.userChanged) {
        const hasInMonth = allEvents.some(e => e.start && getLocalYM(e.start) === mesFiltro);
        if (!hasInMonth && allEvents.length > 0) {
            mesFiltro = getLocalYM(refDate);
            mesFiltroElem.value = mesFiltro;
        }
    }

    let activeYear = refDate.getFullYear();
    if (anioFiltroElem && anioFiltroElem.value) {
        activeYear = parseInt(anioFiltroElem.value, 10);
    } else if (mesFiltro && mesFiltro.includes("-")) {
        activeYear = parseInt(mesFiltro.split("-")[0], 10);
        if (anioFiltroElem) anioFiltroElem.value = String(activeYear);
    }

    const mesAnualVal = (mesAnualFiltroElem && mesAnualFiltroElem.value) ? mesAnualFiltroElem.value : "";

    const stats = computeWeekdayBarStats(allEvents, mesFiltro, activeYear, mesAnualVal);

    const statTurnos = document.getElementById("stat-turnos");
    const statCosto = document.getElementById("stat-costo");
    if (statTurnos) statTurnos.textContent = stats.totalTurnosMes;
    if (statCosto) statCosto.textContent = `$${stats.totalCostoMes.toLocaleString('es-AR')}`;

    // Resumen de Grupos Horarios (Gráfico N° 1 Circular)
    const mapaHorarios = Object.keys(stats.porGrupoHorarioMes).length > 0
        ? stats.porGrupoHorarioMes
        : stats.porGrupoHorarioAnual;
    const totalHorarios = Object.values(mapaHorarios).reduce((a, b) => a + b, 0);
    const subHorarios = document.getElementById("subtituloGraficoHorarios");
    if (subHorarios) subHorarios.textContent = `${Object.keys(mapaHorarios).length} grupos horarios (${mesFiltro || activeYear})`;
    const footerHorarios = document.getElementById("footerTotalHorarios");
    if (footerHorarios) {
        const desgloseHorarios = Object.entries(mapaHorarios).map(([k, v]) => {
            const pct = totalHorarios > 0 ? Math.round((v / totalHorarios) * 100) : 0;
            return `${escapeHTML(k)}: <b>${v} (${pct}%)</b>`;
        }).join(" &nbsp;|&nbsp; ");
        footerHorarios.innerHTML = desgloseHorarios
            ? `Total: <strong>${totalHorarios} turnos (100%)</strong> &nbsp;—&nbsp; ${desgloseHorarios}`
            : `Total Grupos Horarios: <strong>0 turnos (0%)</strong>`;
    }

    const subMes = document.getElementById("subtituloGraficoMes");
    if (subMes) subMes.textContent = mesFiltro || "Todos los meses";
    const footerMes = document.getElementById("footerTotalMensual");
    if (footerMes) {
        footerMes.innerHTML = `Total Gráfico 1 (${escapeHTML(mesFiltro || 'Todos')}): <strong>${escapeHTML(stats.totalTurnosMes)} turnos (100%)</strong> &nbsp;|&nbsp; Monto: <strong>$${escapeHTML(stats.totalCostoMes.toLocaleString('es-AR'))}</strong>`;
    }

    const etiquetaPeriodoAnual = mesAnualVal
        ? `${MESES_CORTOS[parseInt(mesAnualVal, 10) - 1] || mesAnualVal} ${activeYear}`
        : `Año ${activeYear} (Completo)`;

    const subAnual = document.getElementById("subtituloGraficoAnual");
    if (subAnual) subAnual.textContent = etiquetaPeriodoAnual;
    const subAnualHoriz = document.getElementById("subtituloGraficoAnualHorizontal");
    if (subAnualHoriz) subAnualHoriz.textContent = `${etiquetaPeriodoAnual} • Barras Horizontales`;

    const footerAnual = document.getElementById("footerTotalAnual");
    if (footerAnual) {
        footerAnual.innerHTML = `Total Gráfico 2 Circular (${escapeHTML(etiquetaPeriodoAnual)}): <strong>${escapeHTML(stats.totalTurnosAnual)} turnos (100%)</strong> &nbsp;|&nbsp; Monto: <strong>$${escapeHTML(stats.totalCostoAnual.toLocaleString('es-AR'))}</strong>`;
    }
    const footerAnualHoriz = document.getElementById("footerTotalAnualHorizontal");
    if (footerAnualHoriz) {
        footerAnualHoriz.innerHTML = `Total Gráfico 2 Barras Horizontales (${escapeHTML(etiquetaPeriodoAnual)}): <strong>${escapeHTML(stats.totalTurnosAnual)} turnos (100%)</strong> &nbsp;|&nbsp; Monto: <strong>$${escapeHTML(stats.totalCostoAnual.toLocaleString('es-AR'))}</strong>`;
    }

    // Tabla Resumen por Policía conectada a lo que filtra el Gráfico Anual / Comparativo (porPoliciaAnual)
    const badgeResumenPeriodo = document.getElementById("badgeResumenPoliciaPeriodo");
    if (badgeResumenPeriodo) badgeResumenPeriodo.textContent = etiquetaPeriodoAnual;

    const tBody = document.getElementById("totalesBody");
    if (tBody) {
        tBody.innerHTML = "";
        const sourceMap = stats.porPoliciaAnual || {};
        const keys = Object.keys(sourceMap);
        if (keys.length === 0) {
            let trEmpty = document.createElement("tr");
            trEmpty.innerHTML = `<td colspan="3" style="text-align:center; color:var(--text-muted);">Sin servicios registrados en ${escapeHTML(etiquetaPeriodoAnual)}</td>`;
            tBody.appendChild(trEmpty);
        } else {
            for (let name of keys) {
                let row = sourceMap[name];
                const jer = obtenerJerarquiaPolicia(name);
                const fullLabel = jer ? `${jer} ${name}` : name;
                let tr = document.createElement("tr");
                tr.innerHTML = `
                    <td>${escapeHTML(fullLabel)}</td>
                    <td>${escapeHTML(row.turnos)}</td>
                    <td class="font-weight-600">$${escapeHTML(row.total.toLocaleString('es-AR'))}</td>
                `;
                tBody.appendChild(tr);
            }
        }
    }

    if (typeof Chart === 'undefined') return;

    const PALETA_DIAS_CIRCULAR = ['#0d9488', '#2563eb', '#7c3aed', '#d97706', '#e11d48', '#16a34a', '#0891b2'];

    // A) GRÁFICO N° 1: CIRCULAR DIFERENCIANDO DISTINTOS GRUPOS HORARIOS CON TOTALES Y PORCENTAJES
    const canvasHorarios = document.getElementById('graficoGruposHorarios');
    if (canvasHorarios) {
        if (graficoGruposHorariosInstance) graficoGruposHorariosInstance.destroy();
        const rawKeys = Object.keys(mapaHorarios);
        const labelsHorarios = rawKeys.length > 0
            ? rawKeys.map(k => {
                const v = mapaHorarios[k];
                const pct = totalHorarios > 0 ? Math.round((v / totalHorarios) * 100) : 0;
                return `${k}: ${v} (${pct}%)`;
            })
            : ['Sin turnos registrados (0%)'];
        const dataHorarios = rawKeys.length > 0 ? rawKeys.map(k => mapaHorarios[k]) : [0];
        const colorsHorarios = ['#16a34a', '#0891b2', '#d97706', '#7c3aed', '#e11d48', '#2563eb', '#0d9488', '#ea580c'];

        graficoGruposHorariosInstance = new Chart(canvasHorarios.getContext('2d'), {
            type: 'doughnut',
            plugins: [barTotalLabelsPlugin],
            data: {
                labels: labelsHorarios,
                datasets: [{
                    label: 'Turnos por Grupo Horario',
                    data: dataHorarios,
                    backgroundColor: colorsHorarios.slice(0, Math.max(dataHorarios.length, 1)),
                    borderWidth: 2
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                cutout: '42%',
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: { boxWidth: 12, padding: 8, font: { size: 11 } }
                    }
                }
            }
        });
    }

    // B) GRÁFICO 1: TURNOS POR DÍA (MENSUAL) EN FORMATO CIRCULAR CON ETIQUETAS TOTALES Y PORCENTAJES
    const canvasMensual = document.getElementById('graficoMensual');
    if (canvasMensual) {
        if (graficoMensualInstance) graficoMensualInstance.destroy();
        const labelsMesConPorcentaje = DIAS_SEMANA_LABELS.map((dLabel, idx) => {
            const cnt = stats.mensualPorDia[idx];
            const pct = stats.porcentajesMensualPorDia[idx];
            return `${dLabel}: ${cnt} (${pct}%)`;
        });

        graficoMensualInstance = new Chart(canvasMensual.getContext('2d'), {
            type: 'doughnut',
            plugins: [barTotalLabelsPlugin],
            data: {
                labels: labelsMesConPorcentaje,
                datasets: [{
                    label: `Turnos (${mesFiltro || 'Mes'})`,
                    data: stats.mensualPorDia,
                    backgroundColor: PALETA_DIAS_CIRCULAR,
                    borderWidth: 2
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                cutout: '42%',
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: { boxWidth: 11, padding: 7, font: { size: 10.5 } }
                    }
                }
            }
        });
    }

    // C) GRÁFICO 2: ANUAL / COMPARATIVO EN FORMATO CIRCULAR CON ETIQUETAS TOTALES Y PORCENTAJES
    const canvasAnual = document.getElementById('graficoAnual');
    if (canvasAnual) {
        if (graficoAnualInstance) graficoAnualInstance.destroy();
        const labelsAnualConPorcentaje = DIAS_SEMANA_LABELS.map((dLabel, idx) => {
            const cnt = stats.anualPorDia[idx];
            const pct = stats.porcentajesAnualPorDia[idx];
            return `${dLabel}: ${cnt} (${pct}%)`;
        });

        graficoAnualInstance = new Chart(canvasAnual.getContext('2d'), {
            type: 'doughnut',
            plugins: [barTotalLabelsPlugin],
            data: {
                labels: labelsAnualConPorcentaje,
                datasets: [{
                    label: `Turnos (${etiquetaPeriodoAnual})`,
                    data: stats.anualPorDia,
                    backgroundColor: PALETA_DIAS_CIRCULAR,
                    borderWidth: 2
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                cutout: '42%',
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: { boxWidth: 11, padding: 7, font: { size: 10.5 } }
                    }
                }
            }
        });
    }

    // D) DUPLICADO DEL GRÁFICO 2 ANUAL / COMPARATIVO EN FORMATO DE BARRAS HORIZONTALES (indexAxis: 'y')
    const canvasAnualHoriz = document.getElementById('graficoAnualHorizontal');
    if (canvasAnualHoriz) {
        if (graficoAnualHorizontalInstance) graficoAnualHorizontalInstance.destroy();

        const activeDatasets = [];
        stats.anualPorMesYDia.forEach((countsByDay, mIdx) => {
            const sumMonth = countsByDay.reduce((a, b) => a + b, 0);
            if (sumMonth > 0) {
                activeDatasets.push({
                    label: MESES_CORTOS[mIdx],
                    data: countsByDay,
                    backgroundColor: COLORES_MESES[mIdx % COLORES_MESES.length],
                    borderRadius: 4
                });
            }
        });

        if (activeDatasets.length === 0) {
            activeDatasets.push({
                label: `Sin registros (${activeYear})`,
                data: [0, 0, 0, 0, 0, 0, 0],
                backgroundColor: '#94a3b8'
            });
        }

        graficoAnualHorizontalInstance = new Chart(canvasAnualHoriz.getContext('2d'), {
            type: 'bar',
            plugins: [barTotalLabelsPlugin],
            data: {
                labels: DIAS_SEMANA_LABELS,
                datasets: activeDatasets
            },
            options: {
                indexAxis: 'y',
                responsive: true,
                maintainAspectRatio: false,
                layout: { padding: { right: 54, top: 6 } },
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: { boxWidth: 12, padding: 8, font: { size: 10.5 } }
                    }
                },
                scales: {
                    x: {
                        stacked: true,
                        beginAtZero: true,
                        grace: '18%',
                        ticks: { stepSize: 1, precision: 0 }
                    },
                    y: { stacked: true }
                }
            }
        });
    }
}

function filtrarCalendario() {
    if (!calendar) return;
    const filtroPolEl = document.getElementById("filtroCalPolicia");
    const filtroEmpEl = document.getElementById("filtroCalEmpresa");
    const polVal = (filtroPolEl ? filtroPolEl.value : "").trim();
    const empVal = (filtroEmpEl ? filtroEmpEl.value : "").trim();

    calendar.getEvents().forEach(ev => {
        const props = ev.extendedProps || {};
        const policia = String(props.policia || "").trim();
        const empresa = String(props.empresa || "").trim();

        const matchPol = !polVal || policia === polVal;
        const matchEmp = !empVal || empresa === empVal;

        if (matchPol && matchEmp) {
            ev.setProp('display', 'auto');
        } else {
            ev.setProp('display', 'none');
        }
    });
}

function actualizarEstadoBaseDatosUI() {
    if (!Database || typeof Database.getDatabaseStatus !== 'function') return;
    const status = Database.getDatabaseStatus();
    const badgeEngine = document.getElementById("dbEngineBadge");
    const badgeOutbox = document.getElementById("dbOutboxBadge");
    const platformBadge = document.getElementById("platformModeBadge");

    if (badgeEngine) {
        const labelMap = {
            "capacitor-sqlite-native": "SQLite APK",
            "indexeddb-sql-mirror": "SQLite/IndexedDB",
            "localstorage-mirror": "Base Local",
            "memory-localstorage": "Memoria Local"
        };
        badgeEngine.textContent = labelMap[status.engine] || status.engine;
    }

    if (badgeOutbox) {
        if (status.pendingOutboxCount > 0) {
            badgeOutbox.textContent = `${status.pendingOutboxCount} en cola`;
            badgeOutbox.className = "badge badge-bp";
        } else {
            badgeOutbox.textContent = status.isOnline ? "Sincronizado" : "Offline Seguro";
            badgeOutbox.className = status.isOnline ? "badge badge-a" : "badge badge-b";
        }
    }

    if (platformBadge && Utils.detectPlatformContext) {
        const ctx = Utils.detectPlatformContext();
        const modeLabels = {
            "apk": "📱 Android APK",
            "mobile-web": "📱 Móvil",
            "desktop": "🖥️ PC"
        };
        platformBadge.textContent = modeLabels[ctx.mode] || "🖥️ PC";
    }

    const gmailBadge = document.getElementById("gmailLinkedBadge");
    if (gmailBadge && CloudSync && typeof CloudSync.getLinkedGmailAccount === 'function') {
        const acc = CloudSync.getLinkedGmailAccount();
        if (acc && acc.email) {
            const polTag = acc.policiaTitular ? ` • 👮 ${acc.policiaTitular}` : '';
            gmailBadge.textContent = `☁️ ${acc.email}${polTag}`;
            gmailBadge.classList.remove("display-none");
        } else {
            gmailBadge.classList.add("display-none");
        }
    }
}

/**
 * Muestra la Portada de Inicio (Splash Screen) SOLO UNA VEZ cuando se inicia el programa en la sesión actual.
 */
function inicializarPortadaUnicaAlInicio() {
    const overlay = document.getElementById("splashScreenOverlay");
    const img = document.getElementById("splashScreenImg");
    if (!overlay || !Utils.shouldShowSplashOnce) return;

    if (Utils.shouldShowSplashOnce(true)) {
        const coverId = Utils.getSavedSplashCover ? Utils.getSavedSplashCover() : 'portada_1';
        const coverObj = (Utils.AVAILABLE_SPLASH_COVERS && Utils.AVAILABLE_SPLASH_COVERS[coverId])
            ? Utils.AVAILABLE_SPLASH_COVERS[coverId]
            : { src: 'img/portada_1.jpg' };
        if (img) img.src = coverObj.src;
        overlay.classList.remove("display-none");

        setTimeout(() => {
            cerrarPortadaInicio();
        }, 2400);
    }
}

function cerrarPortadaInicio() {
    const overlay = document.getElementById("splashScreenOverlay");
    if (overlay && !overlay.classList.contains("display-none")) {
        overlay.classList.add("splash-fade-out");
        setTimeout(() => {
            overlay.classList.add("display-none");
            overlay.classList.remove("splash-fade-out");
        }, 320);
    }
}

/**
 * Posiciona automáticamente el calendario y la vista en la fecha del servicio próximo a cumplimentar
 * cuando se recibe o toca una alerta de notificación (24 horas antes).
 * @param {string} fechaIso - Fecha del servicio en formato YYYY-MM-DD.
 */
function posicionarCalendarioEnServicio(fechaIso) {
    if (!fechaIso) return;
    cambiarTabMovil('agenda');
    if (calendar) {
        calendar.gotoDate(fechaIso);
    }
    // Resaltar visualmente la celda del día del servicio próximo
    setTimeout(() => {
        document.querySelectorAll('.fc-daygrid-day.alfa-highlight-alert-day').forEach(el => {
            el.classList.remove('alfa-highlight-alert-day');
        });
        const dayCell = document.querySelector(`.fc-daygrid-day[data-date="${fechaIso}"]`);
        if (dayCell) {
            dayCell.classList.add('alfa-highlight-alert-day');
            dayCell.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    }, 120);
    mostrarNotificacion(`📅 Calendario posicionado en el servicio del ${fechaIso}`, "var(--primary)");
}

/**
 * Muestra el banner interactivo de servicio próximo a cumplimentar (1 día antes) y enlaza su botón al calendario.
 * @param {{tomorrowYMD: string, title: string, body: string}} alertInfo 
 */
function mostrarBannerServicioProximo(alertInfo) {
    const banner = document.getElementById("upcomingServiceAlertBanner");
    const titleEl = document.getElementById("upcomingBannerTitle");
    const bodyEl = document.getElementById("upcomingBannerBody");
    const btnEl = document.getElementById("btnPosicionarServicioAlerta");
    if (!banner || !alertInfo) return;

    if (titleEl) titleEl.textContent = alertInfo.title || `🚨 Servicio Vigente Mañana (${alertInfo.tomorrowYMD})`;
    if (bodyEl) bodyEl.textContent = alertInfo.body || "";
    if (btnEl) {
        btnEl.onclick = function () {
            posicionarCalendarioEnServicio(alertInfo.tomorrowYMD);
        };
    }
    banner.classList.remove("display-none");
}

async function cargarServiciosDesdeCloud() {
    mostrarNotificacion("Consultando Google Sheets y Base Local SQLite...", "var(--primary)");
    try {
        await CloudSync.flushOutboxCloud();
        const data = await CloudSync.obtenerServiciosCloud();
        if (data && Array.isArray(data) && data.length > 0) {
            procesarYMostrarServiciosCloud(data);
            mostrarNotificacion("Servicios sincronizados desde Google Sheets", "var(--secondary)");
            return;
        }
    } catch (err) {
        console.warn("Aviso consultando Google Sheets:", err);
    }

    try {
        let eventosLocales = safeParse("eventos", null);
        if (Array.isArray(eventosLocales) && eventosLocales.length > 0) {
            procesarYMostrarServiciosCloud(eventosLocales);
            mostrarNotificacion("Servicios cargados desde Base Local SQLite", "var(--secondary)");
            return;
        }
    } catch (e) {
        console.error("Error leyendo base local:", e);
    }

    if (typeof defaultServiciosRaw !== "undefined" && Array.isArray(defaultServiciosRaw)) {
        procesarYMostrarServiciosCloud(defaultServiciosRaw);
    }
}

function procesarYMostrarServiciosCloud(serviciosList) {
    if (!Array.isArray(serviciosList)) return;
    let eventosFinales = [];
    const deletedTombstones = getDeletedServicesTombstones();

    serviciosList.forEach(item => {
        const validation = Utils.validateServicioRecord(item);
        if (!validation.valid || !validation.record) return;
        const r = validation.record;
        const delKey = buildDeletedServiceKey(r.fecha, r.policia, r.empresa, r.turno);
        if (deletedTombstones.has(delKey)) return;

        eventosFinales.push({
            title: `${r.policia}\n${r.empresa} (${formatearTurno(r.turno)})`,
            start: r.fecha,
            allDay: true,
            backgroundColor: Utils.ensureDistinctEventColor ? Utils.ensureDistinctEventColor(coloresPolicia[r.policia], r.policia) : '#0d9488',
            borderColor: 'transparent',
            extendedProps: {
                policia: r.policia,
                empresa: r.empresa,
                turno: r.turno,
                cat: r.cat,
                cost: r.cost,
                h: r.h,
                vh: r.vh,
                detail: r.detail
            }
        });
    });

    // Preservar también los turnos locales recién agendados que aún no hayan sido devueltos por Google Sheets
    const localSaved = safeParse("eventos", []);
    if (Array.isArray(localSaved)) {
        localSaved.forEach(localEv => {
            const v = Utils.validateServicioRecord(localEv);
            if (!v.valid || !v.record) return;
            const r = v.record;
            const delKey = buildDeletedServiceKey(r.fecha, r.policia, r.empresa, r.turno);
            if (deletedTombstones.has(delKey)) return;
            eventosFinales.push({
                title: `${r.policia}\n${r.empresa} (${formatearTurno(r.turno)})`,
                start: r.fecha,
                allDay: true,
                backgroundColor: Utils.ensureDistinctEventColor ? Utils.ensureDistinctEventColor(coloresPolicia[r.policia], r.policia) : '#0d9488',
                borderColor: 'transparent',
                extendedProps: {
                    policia: r.policia,
                    empresa: r.empresa,
                    turno: r.turno,
                    cat: r.cat,
                    cost: r.cost,
                    h: r.h,
                    vh: r.vh,
                    detail: r.detail
                }
            });
        });
    }

    const vistosSet = new Set();
    const eventosUnicos = eventosFinales.filter(ev => {
        const props = ev.extendedProps || {};
        const key = `${ev.start}_${props.policia}_${props.empresa}_${props.turno}`;
        if (vistosSet.has(key)) return false;
        vistosSet.add(key);
        return true;
    });

    Storage.saveEventos(eventosUnicos);

    if (calendar) {
        calendar.removeAllEvents();
        eventosUnicos.forEach(ev => calendar.addEvent(ev));
    }
    actualizarTodo();
}

function cambiarTabMovil(tabName) {
    _currentMobileTab = tabName;
    document.body.setAttribute("data-mobile-tab", tabName);

    const navBtns = document.querySelectorAll(".mobile-nav-btn");
    navBtns.forEach(btn => {
        const isTarget = btn.getAttribute("data-tab") === tabName;
        btn.classList.toggle("active", isTarget);
        btn.setAttribute("aria-selected", isTarget ? "true" : "false");
    });

    if (tabName === "agenda" && calendar) {
        setTimeout(() => calendar.updateSize(), 60);
    } else if (tabName === "resumen") {
        calcularResumen();
    }
}

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    document.addEventListener('DOMContentLoaded', () => {
        if (Utils.applyTheme && Utils.getSavedTheme) {
            Utils.applyTheme(Utils.getSavedTheme());
        }
        if (Utils.applySplashCoverIconTheme) {
            Utils.applySplashCoverIconTheme(Utils.getSavedSplashCover ? Utils.getSavedSplashCover() : 'portada_1');
        }

        const mesFiltroElem = document.getElementById("filtroMesDashboard");
        if (mesFiltroElem) {
            mesFiltroElem.addEventListener('change', () => {
                mesFiltroElem.dataset.userChanged = "true";
            });
        }

        initCalendar();
        inicializarSelects();
        inicializarPortadaUnicaAlInicio();

        const params = new URLSearchParams(window.location.search || "");
        const requestedTab = params.get("tab");
        const requestedDate = params.get("date");
        if (requestedTab && ['agenda', 'resumen', 'historial'].includes(requestedTab)) {
            cambiarTabMovil(requestedTab);
        } else {
            cambiarTabMovil('agenda');
        }
        if (requestedDate && /^\d{4}-\d{2}-\d{2}$/.test(requestedDate)) {
            setTimeout(() => posicionarCalendarioEnServicio(requestedDate), 300);
        }

        cargarServiciosDesdeCloud().then(() => {
            // Iniciar motor de notificaciones (permisos al instalar, 3 lecturas/día y 2 alertas 24h antes)
            if (Notifications && typeof Notifications.initNotificationEngine === 'function') {
                const acc = CloudSync.getLinkedGmailAccount ? CloudSync.getLinkedGmailAccount() : null;
                window.posicionarCalendarioEnServicio = posicionarCalendarioEnServicio;
                Notifications.initNotificationEngine({
                    policiaTitular: (acc && acc.policiaTitular) ? acc.policiaTitular : "",
                    fetchCloudServices: () => CloudSync.obtenerServiciosCloud(),
                    getLocalEvents: () => calendar ? calendar.getEvents() : safeParse("eventos", []),
                    onNewChangesDetected: (cloudData) => {
                        procesarYMostrarServiciosCloud(cloudData);
                    },
                    onAlertBanner: (alertInfo) => {
                        mostrarBannerServicioProximo(alertInfo);
                    },
                    onNavigateToServiceDate: (targetDate) => {
                        posicionarCalendarioEnServicio(targetDate);
                    }
                });
            }
        });
        actualizarEstadoBaseDatosUI();

        window.addEventListener('online', () => {
            CloudSync.flushOutboxCloud().then(() => actualizarEstadoBaseDatosUI());
        });
        window.addEventListener('offline', () => {
            actualizarEstadoBaseDatosUI();
            mostrarNotificacion("Modo Offline Activo — Guardando en SQLite Local", "var(--warning)");
        });
        window.addEventListener('resize', () => {
            actualizarEstadoBaseDatosUI();
            if (calendar) calendar.render();
        });
    });
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        escapeHTML,
        sanitizeForSpreadsheet,
        sanitizeColor,
        safeParse,
        formatearTurno,
        getLocalYMD,
        getLocalYM,
        colorAleatorio,
        calcularCostoTurno,
        nombresPolicias,
        etiquetaPolicia,
        extractStructuredEventInfo,
        computeWeekdayBarStats,
        obtenerPoliciaTitularPredefinido,
        eliminarServicioDeListaYCalendario,
        solicitarConfirmacionEliminarServicio,
        ejecutarEliminacionServicioConfirmada,
        capturarYCompartirCalendarioWhatsApp,
        getActivePlatformHandler,
        defaultServiciosRaw,
        defaultEventos
    };
}
