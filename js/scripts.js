/**
 * @file scripts.js
 * @description Orquestador principal de UI, navegación adaptativa PC/Móvil Exclusivo, manipulación segura del DOM (Anti-XSS)
 * y coordinación de servicios (Storage, SQLite/IndexedDB Local Database, CloudSync Outbox y Exporter).
 * Refactorizado aplicando arquitectura modular SOLID, directivas @sitio-mobile-adapter y JSDoc estricto.
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

// Inicialización de estado centralizado desde Storage Service
const initialState = Storage.initStorage(Utils);
let config = initialState.config;
let policias = initialState.policias;
let empresas = initialState.empresas;
let coloresPolicia = initialState.coloresPolicia;

let miGrafico = null;
let calendar = null;
let _editandoPolicia = null;
let _currentMobileTab = 'agenda';

/**
 * Obtiene la lista simplificada de nombres de policías.
 * @returns {string[]} Lista de nombres de policías.
 */
function nombresPolicias() {
    return policias.map(policiaItem => policiaItem.nombre);
}

/**
 * Genera la etiqueta formateada del policía con su jerarquía.
 * @param {{nombre: string, jerarquia?: string}} policiaObj - Objeto policía.
 * @returns {string} Etiqueta visible en select/interfaz.
 */
function etiquetaPolicia(policiaObj) {
    if (!policiaObj) return "";
    return policiaObj.jerarquia ? `[${policiaObj.jerarquia}] ${policiaObj.nombre}` : policiaObj.nombre;
}

/**
 * Inicializa los inputs de configuración del panel de tarifas en el DOM.
 */
function initInputs() {
    const container = document.getElementById("panelCostos");
    if (!container) return;
    container.innerHTML = "";
    CATEGORIAS.forEach(categoriaKey => {
        const safeKey = escapeHTML(categoriaKey);
        const safeVal = Number(config[categoriaKey]) || 0;
        const group = document.createElement("div");
        group.className = "form-group";
        group.innerHTML = `
            <label for="costo_${safeKey}">Cat. ${safeKey}</label>
            <input type="number" id="costo_${safeKey}" value="${safeVal}" step="0.01" inputmode="decimal">
        `;
        container.appendChild(group);
    });
}

/**
 * Guarda la configuración de tarifas, recalcula los montos locales y sincroniza con SQLite/IndexedDB y la nube.
 */
function guardarConfig() {
    CATEGORIAS.forEach(categoriaKey => {
        const inputElem = document.getElementById(`costo_${categoriaKey}`);
        if (inputElem) {
            const val = parseFloat(inputElem.value);
            config[categoriaKey] = (Number.isFinite(val) && val >= 0) ? val : 0;
        }
    });
    Storage.saveConfig(config);
    mostrarNotificacion("Tarifas actualizadas en Base Local y Nube...", "var(--secondary)");
    recalcularMontosServicios();
    CloudSync.sincronizarTarifasCloud(config).then(() => actualizarEstadoBaseDatosUI());
}

/**
 * Recalcula el costo acumulado de los eventos cargados en el calendario según las nuevas tarifas.
 */
function recalcularMontosServicios() {
    if (!calendar) return;
    calendar.getEvents().forEach(eventoItem => {
        let props = eventoItem.extendedProps || {};
        if (props.turno && props.empresa && eventoItem.startStr) {
            let empData = empresas[props.empresa];
            if (empData) {
                let nuevoCosto = Calculator.calcularCostoTurno(props.turno, eventoItem.startStr, empData, config);
                if (!props.cat || props.cat === nuevoCosto.cat) {
                    props.cost = nuevoCosto.cost;
                    props.vh = nuevoCosto.vh;
                    props.detail = nuevoCosto.detail;
                } else if (config[props.cat]) {
                    let valorHora = config[props.cat];
                    props.vh = valorHora;
                    props.cost = valorHora * (props.h || 8);
                }
            }
        }
    });
    guardarEventosLocal();
    actualizarTodo();
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

/**
 * Abre un modal por ID.
 * @param {string} modalId 
 */
function abrirModal(modalId) {
    const elem = document.getElementById(modalId);
    if (elem) elem.style.display = "flex";
}

/**
 * Cierra un modal por ID.
 * @param {string} modalId 
 */
function cerrarModal(modalId) {
    const elem = document.getElementById(modalId);
    if (elem) elem.style.display = "none";
}

/**
 * Abre el modal de Nuevo Servicio preconfigurado con la fecha actual (usado por el botón FAB móvil).
 */
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
 * Inicializa los selectores y listas desplegables del DOM con los datos actuales de policías y empresas.
 */
function inicializarSelects() {
    const sPol = document.getElementById("selPolicia");
    const fPol = document.getElementById("filtroPolicia");
    const cPol = document.getElementById("filtroCalPolicia");
    const lPol = document.getElementById("listaPolicias");
    const sEmp = document.getElementById("selEmpresa");
    const fEmp = document.getElementById("filtroEmpresa");
    const lEmp = document.getElementById("listaEmpresas");

    [
        { el: sPol, data: nombresPolicias(), first: "-- Seleccione Policía --" },
        { el: fPol, data: nombresPolicias(), first: "Todos los Policías" },
        { el: cPol, data: nombresPolicias(), first: "Todos los Policías" },
        { el: sEmp, data: Object.keys(empresas), first: "-- Seleccione Empresa --" },
        { el: fEmp, data: Object.keys(empresas), first: "Todas las Empresas" },
        { el: lEmp, data: Object.keys(empresas) }
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

    if (lPol) {
        lPol.innerHTML = "";
        policias.forEach(p => {
            let op = document.createElement("option");
            op.value = p.nombre;
            op.textContent = etiquetaPolicia(p);
            lPol.appendChild(op);
        });
    }

    cambiarTurnos();
    const statPol = document.getElementById("stat-policias");
    if (statPol) statPol.textContent = policias.length;
}

/**
 * Añade o actualiza un policía en la lista de gestión.
 */
function agregarPolicia() {
    let n = document.getElementById("nuevoPolicia").value.trim();
    let j = document.getElementById("jerarquiaPolicia").value;
    if (!n) return mostrarNotificacion("Ingrese un nombre válido", "var(--danger)");

    if (_editandoPolicia) {
        let idx = policias.findIndex(p => p.nombre === _editandoPolicia);
        if (idx !== -1) {
            if (_editandoPolicia !== n) {
                coloresPolicia[n] = coloresPolicia[_editandoPolicia] || colorAleatorio();
                delete coloresPolicia[_editandoPolicia];
            }
            policias[idx] = { nombre: n, jerarquia: j };
        }
        _editandoPolicia = null;
        document.getElementById("editandoBannerPol").style.display = "none";
        document.getElementById("btnAgregarPolicia").textContent = "+ Agregar Policía";
        mostrarNotificacion("Policía actualizado", "var(--secondary)");
    } else {
        if (nombresPolicias().includes(n)) return mostrarNotificacion("Ya existe este efectivo", "var(--warning)");
        coloresPolicia[n] = colorAleatorio();
        policias.push({ nombre: n, jerarquia: j });
        mostrarNotificacion("Policía añadido");
    }

    Storage.saveColores(coloresPolicia);
    Storage.savePolicias(policias, coloresPolicia);
    document.getElementById("nuevoPolicia").value = "";
    document.getElementById("jerarquiaPolicia").value = "";
    inicializarSelects();
    CloudSync.sincronizarPoliciasCloud(policias).then(() => actualizarEstadoBaseDatosUI());
}

/**
 * Carga los datos de un policía seleccionado en el formulario para su edición.
 */
function modificarPolicia() {
    let nombre = document.getElementById("listaPolicias").value;
    if (!nombre) return mostrarNotificacion("Seleccione un policía", "var(--warning)");
    let pol = policias.find(p => p.nombre === nombre);
    if (!pol) return;
    document.getElementById("nuevoPolicia").value = pol.nombre;
    document.getElementById("jerarquiaPolicia").value = pol.jerarquia || "";
    _editandoPolicia = pol.nombre;
    document.getElementById("editandoNombrePol").textContent = pol.nombre;
    document.getElementById("editandoBannerPol").style.display = "";
    document.getElementById("btnAgregarPolicia").textContent = "✔ Actualizar Policía";
    mostrarNotificacion("Datos cargados — editá y guardá", "var(--primary)");
}

/**
 * Elimina el policía seleccionado de la lista de gestión.
 */
function eliminarPolicia() {
    let n = document.getElementById("listaPolicias").value;
    if (!n) return;
    if (!confirm(`¿Eliminar al policía "${n}"?`)) return;
    policias = policias.filter(p => p.nombre !== n);
    Storage.savePolicias(policias, coloresPolicia);
    inicializarSelects();
    mostrarNotificacion("Policía eliminado", "var(--danger)");
    CloudSync.sincronizarPoliciasCloud(policias).then(() => actualizarEstadoBaseDatosUI());
}

/**
 * Añade o actualiza una empresa en la lista de gestión.
 */
function agregarEmpresa() {
    let n = document.getElementById("nuevoEmpresa").value.trim().toUpperCase();
    let t = document.getElementById("rangoTurnos").value.split(",").map(x => x.trim()).filter(x => x);
    let catS = document.getElementById("catSemana").value;
    let catF = document.getElementById("catFinde").value;
    if (!n || t.length === 0) return mostrarNotificacion("Complete nombre y turnos", "var(--danger)");

    let nroServicio = document.getElementById("empNroServicio").value.trim();
    let domicilio = document.getElementById("empDomicilio").value.trim();
    let barrio = document.getElementById("empBarrio").value.trim();
    let telefono = document.getElementById("empTelefono").value.trim();
    let referente = document.getElementById("empReferente").value.trim();
    let telReferente = document.getElementById("empTelReferente").value.trim();
    let policiaEnc = document.getElementById("empPoliciaEncargado").value.trim();
    let telPoliciaEnc = document.getElementById("empTelPoliciaEncargado").value.trim();
    const esActualizacion = !!empresas[n];

    empresas[n] = {
        turnos: t, catSemana: catS, catFinde: catF,
        nroServicio, domicilio, barrio, telefono,
        referente, telReferente, policiaEnc, telPoliciaEnc
    };
    Storage.saveEmpresas(empresas);

    ["nuevoEmpresa", "rangoTurnos", "empNroServicio", "empDomicilio", "empBarrio",
        "empTelefono", "empReferente", "empTelReferente", "empPoliciaEncargado", "empTelPoliciaEncargado"
    ].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = "";
    });
    const editBanner = document.getElementById("editandoBanner");
    if (editBanner) editBanner.style.display = "none";
    const btnAgregar = document.querySelector("button[onclick='agregarEmpresa()']");
    if (btnAgregar) btnAgregar.textContent = "Agregar Empresa";

    inicializarSelects();
    mostrarNotificacion(esActualizacion ? "Empresa actualizada" : "Empresa añadida", "var(--secondary)");
    CloudSync.sincronizarEmpresasCloud(empresas).then(() => actualizarEstadoBaseDatosUI());
}

/**
 * Muestra el detalle de la empresa seleccionada en el contenedor de información (100% sanitizado contra XSS).
 */
function verTurnosEmpresa() {
    let empresaKey = document.getElementById("listaEmpresas").value;
    const infoContainer = document.getElementById("infoTurnos");
    if (!infoContainer) return;
    if (!empresaKey || !empresas[empresaKey]) {
        infoContainer.textContent = "";
        return;
    }
    let emp = empresas[empresaKey];
    let turnosTexto = (emp.turnos || []).map(t => escapeHTML(t)).join(", ");
    let html = `<b>Turnos:</b> ${turnosTexto} &nbsp;|&nbsp; <b>Cat. Sem:</b> ${escapeHTML(emp.catSemana)} &nbsp;|&nbsp; <b>Cat. Fin:</b> ${escapeHTML(emp.catFinde)}`;
    if (emp.nroServicio) html += `<br><b>N° Servicio:</b> ${escapeHTML(emp.nroServicio)}`;
    if (emp.domicilio) html += ` &nbsp;|&nbsp; <b>Domicilio:</b> ${escapeHTML(emp.domicilio)}`;
    if (emp.barrio) html += ` &nbsp;|&nbsp; <b>Barrio:</b> ${escapeHTML(emp.barrio)}`;
    if (emp.telefono) html += ` &nbsp;|&nbsp; <b>Teléfono:</b> ${escapeHTML(emp.telefono)}`;
    if (emp.referente) html += `<br><b>Referente:</b> ${escapeHTML(emp.referente)}`;
    if (emp.telReferente) html += ` &nbsp;|&nbsp; <b>Tel. Referente:</b> ${escapeHTML(emp.telReferente)}`;
    if (emp.policiaEnc) html += `<br><b>Policía Encargado:</b> ${escapeHTML(emp.policiaEnc)}`;
    if (emp.telPoliciaEnc) html += ` &nbsp;|&nbsp; <b>Tel. Policía Enc.:</b> ${escapeHTML(emp.telPoliciaEnc)}`;
    infoContainer.innerHTML = html;
}

/**
 * Carga los datos de una empresa seleccionada en el formulario para su edición.
 */
function modificarEmpresa() {
    let nombre = document.getElementById("listaEmpresas").value;
    if (!nombre || !empresas[nombre]) return mostrarNotificacion("Seleccione una empresa", "var(--warning)");
    let emp = empresas[nombre];
    document.getElementById("nuevoEmpresa").value = nombre;
    document.getElementById("rangoTurnos").value = (emp.turnos || []).join(", ");
    document.getElementById("catSemana").value = emp.catSemana || "A";
    document.getElementById("catFinde").value = emp.catFinde || "AP";
    document.getElementById("empNroServicio").value = emp.nroServicio || "";
    document.getElementById("empTelefono").value = emp.telefono || "";
    document.getElementById("empDomicilio").value = emp.domicilio || "";
    document.getElementById("empBarrio").value = emp.barrio || "";
    document.getElementById("empReferente").value = emp.referente || "";
    document.getElementById("empTelReferente").value = emp.telReferente || "";
    document.getElementById("empPoliciaEncargado").value = emp.policiaEnc || "";
    document.getElementById("empTelPoliciaEncargado").value = emp.telPoliciaEnc || "";

    document.getElementById("editandoNombre").textContent = nombre;
    document.getElementById("editandoBanner").style.display = "";
    const btnAgregar = document.querySelector("button[onclick='agregarEmpresa()']");
    if (btnAgregar) btnAgregar.textContent = "✔ Actualizar Empresa";
    const modalEmp = document.querySelector("#modalEmpresas .modal");
    if (modalEmp) modalEmp.scrollTo({ top: 0, behavior: "smooth" });
    mostrarNotificacion("Datos cargados — editá y guardá", "var(--primary)");
}

/**
 * Elimina la empresa seleccionada de la lista de gestión.
 */
function eliminarEmpresa() {
    let e = document.getElementById("listaEmpresas").value;
    if (!e) return;
    if (!confirm(`¿Eliminar la empresa "${e}"?`)) return;
    delete empresas[e];
    Storage.saveEmpresas(empresas);
    inicializarSelects();
    mostrarNotificacion("Empresa eliminada", "var(--danger)");
    CloudSync.sincronizarEmpresasCloud(empresas).then(() => actualizarEstadoBaseDatosUI());
}

/**
 * Actualiza los turnos disponibles en el selector según la empresa elegida.
 */
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

/**
 * Asigna automáticamente la categoría según el día seleccionado y la empresa.
 */
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

/**
 * Función delegada de cálculo de costo de turno.
 * @param {string} turno 
 * @param {string} fechaStr 
 * @param {Object} empData 
 * @returns {Object}
 */
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
 * Inicializa el componente de FullCalendar en el DOM con adaptación inteligente para Móvil Exclusivo vs PC.
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
        buttonText: {
            today: 'Hoy',
            month: 'Mes',
            week: 'Semana'
        },
        headerToolbar: platform.isMobileViewport
            ? { left: 'prev,next', center: 'title', right: 'today,dayGridMonth,dayGridWeek' }
            : { left: 'prev,next today', center: 'title', right: 'dayGridMonth,dayGridWeek' },
        height: 'auto',
        contentHeight: 'auto',
        editable: !platform.isMobileViewport,
        dayMaxEvents: platform.isMobileViewport ? 2 : false,
        events: eventosGuardados,
        eventClassNames: function (arg) {
            if (!arg.event.start) return [];
            let eventYear = arg.event.start.getFullYear();
            let eventMonth = arg.event.start.getMonth() + 1;

            let today = new Date();
            let currentYear = today.getFullYear();
            let currentMonth = today.getMonth() + 1;

            let isPastMonth = (eventYear < currentYear) ||
                (eventYear === currentYear && eventMonth < currentMonth);

            if (isPastMonth) {
                return ['event-past-month'];
            }
            return [];
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
            if (confirm(`¿Desea eliminar el servicio de ${info.event.title}?`)) {
                let props = info.event.extendedProps || {};
                let policia = props.policia || "";
                let empresa = props.empresa || "";
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

/**
 * Elimina una fila de servicio en Google Sheets.
 */
function eliminarServicioCloud(policia, empresa, turno, fecha) {
    mostrarNotificacion("Eliminando servicio en la nube...", "var(--warning)");
    CloudSync.eliminarServicioCloud(policia, empresa, turno, fecha)
        .then(() => {
            mostrarNotificacion("Servicio eliminado de la nube", "var(--secondary)");
            actualizarEstadoBaseDatosUI();
        })
        .catch(() => mostrarNotificacion("Eliminado en base local (Encolado para sincronización)", "var(--warning)"));
}

/**
 * Guarda un evento de servicio desde el formulario modal.
 */
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
                mostrarNotificacion("Guardado en Base Local SQLite (Pendiente en cola Outbox)", "var(--warning)");
            }
            actualizarEstadoBaseDatosUI();
        });
}

/**
 * Guarda los eventos actuales del calendario en localStorage y en las tablas relacionales de AlfaDatabase.
 */
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

// --- SINCRONIZACIÓN Y UI ---

function sincronizarTarifasCloud() { CloudSync.sincronizarTarifasCloud(config); }
function sincronizarPoliciasCloud() { CloudSync.sincronizarPoliciasCloud(policias); }
function sincronizarEmpresasCloud() { CloudSync.sincronizarEmpresasCloud(empresas); }

/**
 * Puebla dinámicamente los selectores de meses en los filtros del Dashboard e Historial.
 */
function popularFiltroMeses() {
    let selectDash = document.getElementById("filtroMesDashboard");
    let selectHist = document.getElementById("filtroMesHistorial");
    if (!selectDash && !selectHist) return;

    let valDash = selectDash ? selectDash.value : "";
    let valHist = selectHist ? selectHist.value : "";

    let mesesSet = new Set();
    if (calendar) {
        calendar.getEvents().forEach(e => {
            if (e.start) {
                mesesSet.add(getLocalYM(e.start));
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

    if (selectDash) { selectDash.innerHTML = optionsHTML; selectDash.value = valDash; }
    if (selectHist) { selectHist.innerHTML = optionsHTML; selectHist.value = valHist; }
}

/**
 * Actualiza todos los componentes dependientes del estado (Filtros, Tabla, Gráfico, Totales, Estado BD).
 */
function actualizarTodo() {
    popularFiltroMeses();
    actualizarTabla();
    aplicarFiltros();
    calcularResumen();
    actualizarEstadoBaseDatosUI();
}

/**
 * Renderiza las filas de la tabla de historial de servicios con sanitización XSS y atributos `data-label` para tarjetas móviles.
 */
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
        let tr = document.createElement("tr");

        let catBadge = "";
        if (p.detail && Array.isArray(p.detail) && p.detail.length > 1) {
            catBadge = p.detail.map(d => {
                const dCat = String(d.cat || "A").replace(/[^a-zA-Z0-9]/g, "");
                const dHours = Number(d.h) || 0;
                const dVh = Number(d.vh) || 0;
                return `<span class="badge badge-${escapeHTML(dCat.toLowerCase())}" title="${escapeHTML(dHours)}h × $${escapeHTML(dVh.toLocaleString('es-AR'))}">${escapeHTML(dCat)} (${escapeHTML(dHours)}h)</span>`;
            }).join(" ");
        } else {
            let rawCat = String(p.cat || "A");
            let catSafeClass = rawCat.split("+")[0].replace(/[^a-zA-Z0-9]/g, "").toLowerCase() || "a";
            catBadge = `<span class="badge badge-${escapeHTML(catSafeClass)}">${escapeHTML(rawCat)}</span>`;
        }

        const safeColor = sanitizeColor(e.backgroundColor, '#2563eb');
        const safeFecha = escapeHTML(getLocalYMD(e.start));
        const safeEmp = escapeHTML(empNombre);
        const safePol = escapeHTML(polNombre);
        const safeTurno = escapeHTML(formatearTurno(p.turno));
        const safeCosto = escapeHTML((Number.isFinite(costVal) ? costVal : 0).toLocaleString('es-AR'));

        tr.innerHTML = `
            <td data-label="Fecha">${safeFecha}</td>
            <td data-label="Empresa"><span class="badge badge-empresa">${safeEmp}</span></td>
            <td data-label="Policía"><div class="policia-cell">
                <div class="policia-dot" style="background:${safeColor}"></div>
                <span>${safePol}</span>
            </div></td>
            <td data-label="Turno">${safeTurno}</td>
            <td data-label="Categoría" class="nowrap-cell">${catBadge}</td>
            <td data-label="Costo Total" class="font-weight-600">$${safeCosto}</td>
        `;
        tbody.appendChild(tr);
    });
}

/**
 * Calcula los totales acumulados del Dashboard y actualiza el gráfico circular con sanitización XSS.
 */
function calcularResumen() {
    if (!calendar) return;
    let stats = { turnos: 0, costo: 0, porPol: {} };
    let mesFiltroElem = document.getElementById("filtroMesDashboard");
    let mesFiltro = mesFiltroElem ? mesFiltroElem.value : "";

    calendar.getEvents().forEach(e => {
        let ym = getLocalYM(e.start);
        if (mesFiltro && ym !== mesFiltro) return;

        let p = e.extendedProps || {};
        let costVal = (p.cost !== undefined) ? Number(p.cost) : (p.costo !== undefined ? Number(p.costo) : 0);
        let polNombre = String(p.policia || p.Policia || "Desconocido");

        stats.turnos++;
        stats.costo += (Number.isFinite(costVal) ? costVal : 0);

        if (!stats.porPol[polNombre]) stats.porPol[polNombre] = { turnos: 0, total: 0 };
        stats.porPol[polNombre].turnos++;
        stats.porPol[polNombre].total += (Number.isFinite(costVal) ? costVal : 0);
    });

    const statTurnos = document.getElementById("stat-turnos");
    const statCosto = document.getElementById("stat-costo");
    if (statTurnos) statTurnos.textContent = stats.turnos;
    if (statCosto) statCosto.textContent = `$${stats.costo.toLocaleString('es-AR')}`;

    const tBody = document.getElementById("totalesBody");
    if (!tBody) return;
    tBody.innerHTML = "";
    let labels = [], data = [], colors = [];
    let resumenHtml = "";

    for (let name in stats.porPol) {
        let row = stats.porPol[name];
        let safeName = escapeHTML(name);
        let safeTurnos = escapeHTML(row.turnos);
        let safeTotal = escapeHTML(row.total.toLocaleString('es-AR'));

        let tr = document.createElement("tr");
        tr.innerHTML = `
            <td data-label="Policía">${safeName}</td>
            <td data-label="Turnos">${safeTurnos}</td>
            <td data-label="Monto" class="font-weight-600">$${safeTotal}</td>
        `;
        tBody.appendChild(tr);

        labels.push(name);
        data.push(row.turnos);
        colors.push(sanitizeColor(coloresPolicia[name], '#2563eb'));
        resumenHtml += `<div><strong>${safeName}</strong>: ${safeTurnos} turnos ($${safeTotal})</div>`;
    }
    const resLista = document.getElementById("resumenLista");
    if (resLista) resLista.innerHTML = resumenHtml;

    const graficoCanvas = document.getElementById('grafico');
    if (!graficoCanvas || typeof Chart === 'undefined') return;

    if (miGrafico) miGrafico.destroy();
    const ctx = graficoCanvas.getContext('2d');
    miGrafico = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: labels,
            datasets: [{
                data: data,
                backgroundColor: colors,
                borderWidth: 0,
                hoverOffset: 10
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { position: 'bottom', labels: { usePointStyle: true, padding: 16 } }
            },
            cutout: '70%'
        }
    });
}

/**
 * Aplica los filtros seleccionados a las filas de la tabla de servicios.
 */
function aplicarFiltros() {
    const polEl = document.getElementById("filtroPolicia");
    const empEl = document.getElementById("filtroEmpresa");
    const mesEl = document.getElementById("filtroMesHistorial");

    let pol = polEl ? polEl.value : "";
    let emp = empEl ? empEl.value : "";
    let mes = mesEl ? mesEl.value : "";
    let filas = document.querySelectorAll("#tablaServicios tbody tr");

    filas.forEach(f => {
        let fFecha = f.children[0].textContent.trim();
        let fEmp = f.children[1].textContent.trim();
        let fPol = f.children[2].textContent.trim();
        let match = true;

        if (mes && !fFecha.startsWith(mes)) match = false;
        if (pol && fPol !== pol) match = false;
        if (emp && fEmp !== emp) match = false;
        f.style.display = match ? "" : "none";
    });
}

/**
 * Filtra la visibilidad de eventos en el FullCalendar según el policía seleccionado.
 */
function filtrarCalendario() {
    if (!calendar) return;
    const filtroCal = document.getElementById("filtroCalPolicia");
    const filtroVal = (filtroCal ? filtroCal.value : "").trim();

    calendar.getEvents().forEach(ev => {
        const policia = (ev.extendedProps.policia || "").trim();
        if (!filtroVal || policia === filtroVal) {
            ev.setProp('display', 'auto');
        } else {
            ev.setProp('display', 'none');
        }
    });
}

/**
 * Limpia todos los filtros activos y resetea las vistas.
 */
function limpiarFiltros() {
    const polEl = document.getElementById("filtroPolicia");
    const empEl = document.getElementById("filtroEmpresa");
    const mesEl = document.getElementById("filtroMesHistorial");

    if (polEl) polEl.value = "";
    if (empEl) empEl.value = "";
    if (mesEl) mesEl.value = "";
    aplicarFiltros();
}

// --- EXPORTACIÓN Y BASE DE DATOS LOCAL INTELIGENTE ---

/**
 * Prepara y abre el modal de opciones de exportación (100% sanitizado contra XSS).
 */
function abrirModalExportar() {
    let selMes = document.getElementById("exportMes");
    let selPol = document.getElementById("exportPolicia");
    let contEmp = document.getElementById("containerExportEmpresa");

    if (document.getElementById("filtroMesHistorial") && selMes) {
        selMes.innerHTML = document.getElementById("filtroMesHistorial").innerHTML;
    }
    if (document.getElementById("filtroPolicia") && selPol) {
        selPol.innerHTML = document.getElementById("filtroPolicia").innerHTML;
    }

    if (contEmp) {
        contEmp.innerHTML = "";
        Object.keys(empresas).forEach(item => {
            const safeItem = escapeHTML(item);
            let div = document.createElement("div");
            div.className = "chk-export-row";
            div.innerHTML = `
                <label class="chk-export-label">
                    <input type="checkbox" class="chk-export-emp" value="${safeItem}">
                    <span>${safeItem}</span>
                </label>
            `;
            contEmp.appendChild(div);
        });
    }
    abrirModal("modalExportar");
}

/**
 * Genera el reporte Excel invocando a Exporter.exportExcel.
 */
function exportExcel() {
    const mesFiltroValue = document.getElementById("exportMes") ? document.getElementById("exportMes").value : "";
    const polFiltroValue = document.getElementById("exportPolicia") ? document.getElementById("exportPolicia").value : "";
    const chks = document.querySelectorAll(".chk-export-emp:checked");
    const empFiltros = Array.from(chks).map(c => c.value);
    const rawEvents = safeParse("eventos", []);

    Exporter.exportExcel({
        mesFiltroValue,
        polFiltroValue,
        empFiltros,
        rawEvents,
        utils: Utils,
        onNotification: mostrarNotificacion,
        onCloseModal: () => cerrarModal("modalExportar")
    });
}

/**
 * Genera el reporte PDF invocando a Exporter.exportPDF.
 */
async function exportPDF() {
    const mesFiltro = document.getElementById("exportMes") ? document.getElementById("exportMes").value : "";
    const polFiltro = document.getElementById("exportPolicia") ? document.getElementById("exportPolicia").value : "";
    const chks = document.querySelectorAll(".chk-export-emp:checked");
    const empFiltros = Array.from(chks).map(c => c.value);
    const rawEvents = safeParse("eventos", []);

    await Exporter.exportPDF({
        mesFiltro,
        polFiltro,
        empFiltros,
        rawEvents,
        empresasMap: empresas,
        calendarInstance: calendar,
        utils: Utils,
        onNotification: mostrarNotificacion,
        onCloseModal: () => cerrarModal("modalExportar")
    });
}

/**
 * Exporta un Dump SQL completo (.sql compatible con SQLite 3 y PostgreSQL) desde la base de datos local.
 */
function exportarBaseDatosSQL() {
    if (!Database || typeof Database.exportSQLDump !== 'function') {
        return mostrarNotificacion("Motor AlfaDatabase no disponible", "var(--danger)");
    }
    const evs = safeParse("eventos", []);
    const sqlContent = Database.exportSQLDump({
        config,
        policias,
        empresas,
        coloresPolicia,
        eventos: evs
    });
    const blob = new Blob([sqlContent], { type: "application/sql;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `alfas_database_${new Date().toISOString().slice(0, 10)}.sql`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    mostrarNotificacion("Dump SQL (SQLite / PostgreSQL) descargado con éxito", "var(--secondary)");
}

/**
 * Sincroniza manualmente la cola Outbox pendiente hacia Google Sheets.
 */
async function sincronizarColaOutbox() {
    mostrarNotificacion("Sincronizando base local con Google Sheets...", "var(--primary)");
    const result = await CloudSync.flushOutboxCloud();
    actualizarEstadoBaseDatosUI();
    if (result.remaining === 0) {
        mostrarNotificacion(`Base local 100% sincronizada (${result.processed} envíos completados)`, "var(--secondary)");
    } else {
        mostrarNotificacion(`Quedan ${result.remaining} registros en cola Outbox (Modo Offline)`, "var(--warning)");
    }
}

/**
 * Actualiza los indicadores visuales del estado de la Base de Datos Local (SQLite/IndexedDB) y Cola Outbox.
 */
function actualizarEstadoBaseDatosUI() {
    if (!Database || typeof Database.getDatabaseStatus !== 'function') return;
    const status = Database.getDatabaseStatus();
    const badgeEngine = document.getElementById("dbEngineBadge");
    const badgeOutbox = document.getElementById("dbOutboxBadge");
    const platformBadge = document.getElementById("platformModeBadge");

    if (badgeEngine) {
        const labelMap = {
            "capacitor-sqlite-native": "SQLite Nativo (Android APK)",
            "indexeddb-sql-mirror": "SQLite/IndexedDB Local Activo",
            "localstorage-mirror": "LocalStorage Mirror",
            "memory-localstorage": "Memoria Local"
        };
        badgeEngine.textContent = labelMap[status.engine] || status.engine;
    }

    if (badgeOutbox) {
        if (status.pendingOutboxCount > 0) {
            badgeOutbox.textContent = `${status.pendingOutboxCount} pendientes de nube`;
            badgeOutbox.className = "badge badge-bp";
        } else {
            badgeOutbox.textContent = status.isOnline ? "Sincronizado con Sheets" : "Modo Offline Seguro";
            badgeOutbox.className = status.isOnline ? "badge badge-a" : "badge badge-b";
        }
    }

    if (platformBadge && Utils.detectPlatformContext) {
        const ctx = Utils.detectPlatformContext();
        const modeLabels = {
            "apk": "📱 Android APK",
            "mobile-web": "📱 Modo Móvil Exclusivo",
            "desktop": "🖥️ Modo Escritorio PC"
        };
        platformBadge.textContent = modeLabels[ctx.mode] || "🖥️ PC / Móvil";
    }
}

/**
 * Importa archivo JSON local de eventos/servicios validando estrictamente su esquema para prevenir ataques.
 * @param {Event} evt 
 */
function cargarAlfasJSON(evt) {
    let file = evt && evt.target && evt.target.files ? evt.target.files[0] : null;
    if (!file) return;
    let reader = new FileReader();
    reader.onload = function (e) {
        try {
            let parsed = JSON.parse(e.target.result);
            if (Array.isArray(parsed)) {
                let eventosFinales = [];
                parsed.forEach(item => {
                    const validation = Utils.validateServicioRecord(item);
                    if (validation.valid && validation.record) {
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
                    }
                });

                if (eventosFinales.length === 0 && parsed.length > 0) {
                    mostrarNotificacion("Ningún registro del archivo cumplió el esquema de seguridad", "var(--danger)");
                    return;
                }

                Storage.saveEventos(eventosFinales);
                mostrarNotificacion(`${eventosFinales.length} servicios importados a la Base Local`, "var(--secondary)");
                if (calendar) {
                    calendar.removeAllEvents();
                    eventosFinales.forEach(ev => calendar.addEvent(ev));
                    actualizarTodo();
                }
            } else {
                mostrarNotificacion("El archivo no tiene el formato de lista esperado", "var(--danger)");
            }
        } catch (err) {
            mostrarNotificacion("Error al leer archivo de servicios/alfas.json", "var(--danger)");
        }
        const impJson = document.getElementById('importarJson');
        if (impJson) impJson.value = "";
    };
    reader.readAsText(file);
}

/**
 * Consulta y sincroniza los servicios desde la nube o cae a fallbacks de la base de datos local.
 */
async function cargarServiciosDesdeCloud() {
    mostrarNotificacion("Consultando Google Sheets y Base Local SQLite...", "var(--primary)");
    try {
        await CloudSync.flushOutboxCloud();
        const data = await CloudSync.obtenerServiciosCloud();
        if (data && Array.isArray(data) && data.length > 0) {
            procesarYMostrarServiciosCloud(data);
            mostrarNotificacion("Servicios sincronizados desde Google Sheets a Base Local", "var(--secondary)");
            return;
        }
    } catch (err) {
        console.warn("Aviso consultando Google Sheets:", err);
    }

    try {
        let eventosLocales = safeParse("eventos", null);
        if (Array.isArray(eventosLocales) && eventosLocales.length > 0) {
            procesarYMostrarServiciosCloud(eventosLocales);
            mostrarNotificacion("Servicios cargados desde Base de Datos Local (Offline-First)", "var(--secondary)");
            return;
        }
    } catch (e) {
        console.error("Error leyendo base local:", e);
    }

    if (typeof defaultServiciosRaw !== "undefined" && Array.isArray(defaultServiciosRaw)) {
        procesarYMostrarServiciosCloud(defaultServiciosRaw);
        mostrarNotificacion("Datos iniciales cargados en Base Local", "var(--secondary)");
    }
}

/**
 * Procesa la lista de servicios recibida, valida su esquema y la persiste en FullCalendar y AlfaDatabase deduplicando.
 * @param {Array} serviciosList 
 */
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

// =============================================================================
// NAVEGACIÓN EXCLUSIVA MÓVIL (APP SHELL TÁCTIL <= 768px & APK)
// =============================================================================

/**
 * Cambia la pestaña activa en el Modo Móvil Exclusivo sin afectar la vista multipanel de escritorio (PC).
 * @param {'agenda'|'resumen'|'historial'|'gestion'} tabName
 */
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

// INICIALIZACIÓN AUTOMÁTICA EN NAVEGADOR / CAPACITOR WEBVIEW
if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    document.addEventListener('DOMContentLoaded', () => {
        initInputs();
        initCalendar();
        inicializarSelects();
        cambiarTabMovil('agenda');
        cargarServiciosDesdeCloud();
        sincronizarPoliciasCloud();
        actualizarEstadoBaseDatosUI();

        window.addEventListener('online', () => {
            sincronizarColaOutbox();
        });
        window.addEventListener('offline', () => {
            actualizarEstadoBaseDatosUI();
            mostrarNotificacion("Modo Offline Activo — Guardando en SQLite/IndexedDB Local", "var(--warning)");
        });
        window.addEventListener('resize', () => {
            actualizarEstadoBaseDatosUI();
        });
    });
}

// EXPORTACIÓN PARA NODE.JS / SUITE DE PRUEBAS
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
        defaultServiciosRaw,
        defaultEventos
    };
}
