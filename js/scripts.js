/**
 * @file scripts.js
 * @description Orquestador principal de UI para Dashboard, Calendario Adaptativo con diferenciación
 * por Empresa (Precartón) y Policía, 2 Gráficos de Barras con etiquetas de Total visibles y filtro de Año,
 * y Tabla de Historial de 5 Columnas con Filtros Rápidos.
 */

// --- SERVICIOS MODULARES E INICIALIZACIÓN ---
const Utils = (typeof window !== 'undefined' && window.AlfaUtils) ? window.AlfaUtils : require('./utils/helpers.js');
const Calculator = (typeof window !== 'undefined' && window.AlfaCalculator) ? window.AlfaCalculator : require('./services/calculator.js');
const Database = (typeof window !== 'undefined' && window.AlfaDatabase) ? window.AlfaDatabase : require('./services/database.js');
const Storage = (typeof window !== 'undefined' && window.AlfaStorage) ? window.AlfaStorage : require('./services/storage.js');
const CloudSync = (typeof window !== 'undefined' && window.AlfaCloudSync) ? window.AlfaCloudSync : require('./services/cloudSync.js');
const Exporter = (typeof window !== 'undefined' && window.AlfaExporter) ? window.AlfaExporter : require('./services/exporter.js');

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

// Plugin Chart.js personalizado para dibujar las etiquetas de Total encima de cada barra (en ambos gráficos)
const barTotalLabelsPlugin = {
    id: 'barTotalLabelsPlugin',
    afterDatasetsDraw(chart) {
        const { ctx, data, scales } = chart;
        if (!scales || !scales.x || !scales.y) return;

        ctx.save();
        const isDark = typeof document !== 'undefined' && document.documentElement.getAttribute('data-theme') === 'dark';
        ctx.fillStyle = isDark ? '#f1f5f9' : '#1e293b';
        ctx.font = 'bold 11px Inter, sans-serif';
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

let graficoMensualInstance = null;
let graficoAnualInstance = null;
let calendar = null;
let _currentMobileTab = 'agenda';
let _periodoRapidoHistorial = 'todos';

/**
 * Obtiene la lista simplificada de nombres de policías.
 * @returns {string[]} Lista de nombres de policías.
 */
function nombresPolicias() {
    return policias.map(policiaItem => policiaItem.nombre);
}

/**
 * Busca la jerarquía registrada para un nombre de policía.
 * @param {string} nombrePol 
 * @returns {string}
 */
function obtenerJerarquiaPolicia(nombrePol) {
    const clean = String(nombrePol || "").trim().toLowerCase();
    const found = policias.find(p => p.nombre.toLowerCase() === clean);
    return found && found.jerarquia ? found.jerarquia : "";
}

/**
 * Genera la etiqueta formateada del policía con su jerarquía.
 * @param {{nombre: string, jerarquia?: string}} policiaObj - Objeto policía.
 * @returns {string} Etiqueta visible en select/interfaz.
 */
function etiquetaPolicia(policiaObj) {
    if (!policiaObj) return "";
    return policiaObj.jerarquia ? `${policiaObj.jerarquia} ${policiaObj.nombre}` : policiaObj.nombre;
}

/**
 * Muestra una notificación flotante en la interfaz de usuario.
 * @param {string} msg - Texto a mostrar.
 * @param {string} [color="var(--primary)"] - Estilo CSS para el color de fondo.
 */
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
    actualizarCategoriaAuto();
    abrirModal('modalServicio');
}

/**
 * Renderiza la leyenda de colores diferenciados por Empresa (Precartón) sobre el calendario.
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
 * Inicializa los selectores del DOM incluyendo el doble filtro del calendario (por Empresa/Precartón y por Policía).
 */
function inicializarSelects() {
    const sPol = document.getElementById("selPolicia");
    const fPol = document.getElementById("filtroPolicia");
    const cPol = document.getElementById("filtroCalPolicia");
    const cEmp = document.getElementById("filtroCalEmpresa");
    const sEmp = document.getElementById("selEmpresa");
    const fEmp = document.getElementById("filtroEmpresa");

    // Selectores de Policía mostrando Jerarquía + Apellido y Nombre
    [
        { el: sPol, first: "-- Seleccione Policía --" },
        { el: fPol, first: "Todos los Policías" },
        { el: cPol, first: "Todos los Policías" }
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

    // Selectores de Empresa
    [
        { el: sEmp, data: Object.keys(empresas), first: "-- Seleccione Empresa --" },
        { el: fEmp, data: Object.keys(empresas), first: "Todas las Empresas" },
        { el: cEmp, data: Object.keys(empresas), first: "Todas las Empresas (Precartones)" }
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
    backgroundColor: coloresPolicia[s.policia] || '#2563eb',
    borderColor: 'transparent',
    extendedProps: {
        policia: s.policia, empresa: s.empresa, turno: s.turno,
        cat: s.cat, cost: s.cost, h: s.h, vh: s.vh,
        detail: [{ cat: s.cat, h: s.h, vh: s.vh, cost: s.cost }]
    }
}));

/**
 * Extrae de forma estructurada (Empresa, Horario, Policía con Jerarquía y Colores diferenciados) los datos de un evento.
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
    const policiaCorto = jerarquia ? `${jerarquia} ${polBaseCorto}` : polBaseCorto;
    const policiaLargo = jerarquia ? `${jerarquia} ${policia}` : policia;

    const empresaColor = Utils.getEmpresaColor ? Utils.getEmpresaColor(empresa) : '#16a34a';
    const policiaColor = sanitizeColor((eventObj && eventObj.backgroundColor) || coloresPolicia[policia], '#2563eb');

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
 * Inicializa FullCalendar diferenciando visualmente tanto la Empresa (Precartón) como el Policía asignado.
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
        height: 'auto',
        contentHeight: 'auto',
        editable: !platform.isMobileViewport,
        dayMaxEvents: false,
        events: eventosGuardados,
        eventContent: function (arg) {
            const info = extractStructuredEventInfo(arg.event);
            const isMobile = window.innerWidth <= 768;
            const wrapper = document.createElement('div');
            wrapper.className = 'alfa-cal-event-card';
            // Franja lateral izquierda con el color de la Empresa (Precartón) y fondo con el color del Policía
            wrapper.style.borderLeft = `4px solid ${info.empresaColor}`;
            wrapper.innerHTML = `
                <div class="ev-line-emp"><span class="ev-emp-dot" style="background:${info.empresaColor}"></span>${escapeHTML(info.empresa)}</div>
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
            actualizarCategoriaAuto();
            abrirModal('modalServicio');
        },
        eventClick: function (info) {
            const evInfo = extractStructuredEventInfo(info.event);
            if (confirm(`¿Eliminar turno de ${evInfo.policiaLargo} en ${evInfo.empresa} (${evInfo.horarioLargo})?`)) {
                let props = info.event.extendedProps || {};
                let policia = props.policia || "";
                let empresa = props.empresa || evInfo.empresa;
                let turno = props.turno || "";
                let fecha = info.event.startStr || "";

                info.event.remove();
                guardarEventosLocal();
                actualizarTodo();

                if (policia && empresa && fecha) {
                    CloudSync.eliminarServicioCloud(policia, empresa, turno, fecha)
                        .then(() => actualizarEstadoBaseDatosUI());
                }
            }
        }
    });
    calendar.render();
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
        backgroundColor: sanitizeColor(coloresPolicia[p], '#2563eb'),
        borderColor: 'transparent',
        extendedProps: {
            policia: p, empresa: e, turno: t,
            cat: resultado.cat, cost: resultado.cost, h: resultado.h, vh: resultado.vh,
            detail: resultado.detail
        }
    };

    calendar.addEvent(nuevoEv);
    guardarEventosLocal();
    actualizarTodo();
    cerrarModal('modalServicio');

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
        backgroundColor: sanitizeColor(e.backgroundColor, '#2563eb'),
        extendedProps: e.extendedProps
    }));
    Storage.saveEventos(evs);
}

/**
 * Puebla dinámicamente los selectores de Meses y de Años (incluyendo años anteriores para el gráfico anual).
 */
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
    // Incluir siempre el año actual y los 4 años anteriores para consulta histórica
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

// =============================================================================
// TABLA DE HISTORIAL DE 5 COLUMNAS (FECHA, EMPRESA, TURNO, CATEGORÍA, COSTO)
// =============================================================================

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
        const safeTurno = escapeHTML(Utils.formatearTurnoCorto ? Utils.formatearTurnoCorto(p.turno) : formatearTurno(p.turno));
        const safeCosto = escapeHTML((Number.isFinite(costVal) ? costVal : 0).toLocaleString('es-AR'));

        tr.innerHTML = `
            <td>${safeFecha}</td>
            <td><span class="badge badge-empresa">${safeEmp}</span></td>
            <td>${safeTurno}</td>
            <td>${catBadge}</td>
            <td class="font-weight-600">$${safeCosto}</td>
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

// =============================================================================
// SOLAPA GRÁFICOS: 2 GRÁFICOS DE BARRAS CON ETIQUETAS DE TOTAL Y FILTRO DE AÑO
// =============================================================================

function computeWeekdayBarStats(eventsList, targetYM, targetYear) {
    const mensualPorDia = [0, 0, 0, 0, 0, 0, 0];
    let totalTurnosMes = 0;
    let totalCostoMes = 0;

    const anualPorMesYDia = Array.from({ length: 12 }, () => [0, 0, 0, 0, 0, 0, 0]);
    let totalTurnosAnual = 0;
    let totalCostoAnual = 0;

    const porPoliciaMes = {};

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

        if (yr === targetYear) {
            anualPorMesYDia[monthIdx][dayOfWeek]++;
            totalTurnosAnual++;
            totalCostoAnual += costVal;
        }

        if (!targetYM || ym === targetYM) {
            mensualPorDia[dayOfWeek]++;
            totalTurnosMes++;
            totalCostoMes += costVal;

            if (!porPoliciaMes[polNombre]) porPoliciaMes[polNombre] = { turnos: 0, total: 0 };
            porPoliciaMes[polNombre].turnos++;
            porPoliciaMes[polNombre].total += costVal;
        }
    });

    return {
        mensualPorDia,
        totalTurnosMes,
        totalCostoMes,
        anualPorMesYDia,
        totalTurnosAnual,
        totalCostoAnual,
        porPoliciaMes
    };
}

function calcularResumen() {
    if (!calendar) return;
    const mesFiltroElem = document.getElementById("filtroMesDashboard");
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

    // Si el usuario seleccionó un año específico en el filtro de Año del gráfico anual, respetarlo
    let activeYear = refDate.getFullYear();
    if (anioFiltroElem && anioFiltroElem.value) {
        activeYear = parseInt(anioFiltroElem.value, 10);
    } else if (mesFiltro && mesFiltro.includes("-")) {
        activeYear = parseInt(mesFiltro.split("-")[0], 10);
        if (anioFiltroElem) anioFiltroElem.value = String(activeYear);
    }

    const stats = computeWeekdayBarStats(allEvents, mesFiltro, activeYear);

    const statTurnos = document.getElementById("stat-turnos");
    const statCosto = document.getElementById("stat-costo");
    if (statTurnos) statTurnos.textContent = stats.totalTurnosMes;
    if (statCosto) statCosto.textContent = `$${stats.totalCostoMes.toLocaleString('es-AR')}`;

    const subMes = document.getElementById("subtituloGraficoMes");
    if (subMes) subMes.textContent = mesFiltro || "Todos los meses";
    const footerMes = document.getElementById("footerTotalMensual");
    if (footerMes) {
        footerMes.innerHTML = `Total Mensual: <strong>${escapeHTML(stats.totalTurnosMes)} turnos</strong> &nbsp;|&nbsp; Monto: <strong>$${escapeHTML(stats.totalCostoMes.toLocaleString('es-AR'))}</strong>`;
    }

    const subAnual = document.getElementById("subtituloGraficoAnual");
    if (subAnual) subAnual.textContent = `Año ${activeYear}`;
    const footerAnual = document.getElementById("footerTotalAnual");
    if (footerAnual) {
        footerAnual.innerHTML = `Total Anual (${escapeHTML(activeYear)}): <strong>${escapeHTML(stats.totalTurnosAnual)} turnos</strong> &nbsp;|&nbsp; Monto: <strong>$${escapeHTML(stats.totalCostoAnual.toLocaleString('es-AR'))}</strong>`;
    }

    const tBody = document.getElementById("totalesBody");
    if (tBody) {
        tBody.innerHTML = "";
        for (let name in stats.porPoliciaMes) {
            let row = stats.porPoliciaMes[name];
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

    if (typeof Chart === 'undefined') return;

    // 1. Gráfico de Barras Mensual con etiquetas de total visibles encima de cada barra
    const canvasMensual = document.getElementById('graficoMensual');
    if (canvasMensual) {
        if (graficoMensualInstance) graficoMensualInstance.destroy();
        graficoMensualInstance = new Chart(canvasMensual.getContext('2d'), {
            type: 'bar',
            plugins: [barTotalLabelsPlugin],
            data: {
                labels: DIAS_SEMANA_LABELS,
                datasets: [{
                    label: `Turnos (${mesFiltro || 'Mes'})`,
                    data: stats.mensualPorDia,
                    backgroundColor: ['#3b82f6', '#2563eb', '#1d4ed8', '#1e40af', '#0ea5e9', '#10b981', '#f59e0b'],
                    borderRadius: 6,
                    borderSkipped: false
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                layout: { padding: { top: 20 } },
                plugins: {
                    legend: { display: false }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        grace: '15%',
                        ticks: { stepSize: 1, precision: 0 }
                    }
                }
            }
        });
    }

    // 2. Gráfico de Barras Anual Apilado con etiquetas de total visibles encima de cada barra apilada
    const canvasAnual = document.getElementById('graficoAnual');
    if (canvasAnual) {
        if (graficoAnualInstance) graficoAnualInstance.destroy();

        const activeDatasets = [];
        stats.anualPorMesYDia.forEach((countsByDay, mIdx) => {
            const sumMonth = countsByDay.reduce((a, b) => a + b, 0);
            if (sumMonth > 0) {
                activeDatasets.push({
                    label: MESES_CORTOS[mIdx],
                    data: countsByDay,
                    backgroundColor: COLORES_MESES[mIdx % COLORES_MESES.length],
                    borderRadius: 3
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

        graficoAnualInstance = new Chart(canvasAnual.getContext('2d'), {
            type: 'bar',
            plugins: [barTotalLabelsPlugin],
            data: {
                labels: DIAS_SEMANA_LABELS,
                datasets: activeDatasets
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                layout: { padding: { top: 20 } },
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: { boxWidth: 12, padding: 10, font: { size: 11 } }
                    }
                },
                scales: {
                    x: { stacked: true },
                    y: {
                        stacked: true,
                        beginAtZero: true,
                        grace: '15%',
                        ticks: { stepSize: 1, precision: 0 }
                    }
                }
            }
        });
    }
}

/**
 * Filtra la visibilidad de eventos en FullCalendar tanto por Empresa (Precartón) como por Policía (ambos).
 */
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

    serviciosList.forEach(item => {
        const validation = Utils.validateServicioRecord(item);
        if (!validation.valid || !validation.record) return;
        const r = validation.record;
        eventosFinales.push({
            title: `${r.policia}\n${r.empresa} (${formatearTurno(r.turno)})`,
            start: r.fecha,
            allDay: true,
            backgroundColor: sanitizeColor(coloresPolicia[r.policia], '#2563eb'),
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

        const mesFiltroElem = document.getElementById("filtroMesDashboard");
        if (mesFiltroElem) {
            mesFiltroElem.addEventListener('change', () => {
                mesFiltroElem.dataset.userChanged = "true";
            });
        }

        initCalendar();
        inicializarSelects();

        const params = new URLSearchParams(window.location.search || "");
        const requestedTab = params.get("tab");
        if (requestedTab && ['agenda', 'resumen', 'historial'].includes(requestedTab)) {
            cambiarTabMovil(requestedTab);
        } else {
            cambiarTabMovil('agenda');
        }

        cargarServiciosDesdeCloud();
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
        defaultServiciosRaw,
        defaultEventos
    };
}
