/**
 * @file scripts.js
 * @description Orquestador principal de UI, navegación, manipulación del DOM y coordinación de servicios.
 * Refactorizado aplicando arquitectura modular SOLID y JSDoc.
 */

// --- SERVICIOS MODULARES E INICIALIZACIÓN ---
const Utils = (typeof window !== 'undefined' && window.AlfaUtils) ? window.AlfaUtils : require('./utils/helpers.js');
const Calculator = (typeof window !== 'undefined' && window.AlfaCalculator) ? window.AlfaCalculator : require('./services/calculator.js');
const Storage = (typeof window !== 'undefined' && window.AlfaStorage) ? window.AlfaStorage : require('./services/storage.js');
const CloudSync = (typeof window !== 'undefined' && window.AlfaCloudSync) ? window.AlfaCloudSync : require('./services/cloudSync.js');
const Exporter = (typeof window !== 'undefined' && window.AlfaExporter) ? window.AlfaExporter : require('./services/exporter.js');

// Wrapper functions para compatibilidad con código existente y tests
function escapeHTML(inputStr) { return Utils.escapeHTML(inputStr); }
function safeParse(key, fallback) { return Utils.safeParse(localStorage, key, fallback); }
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
        const group = document.createElement("div");
        group.className = "form-group";
        group.innerHTML = `
            <label>Cat. ${escapeHTML(categoriaKey)}</label>
            <input type="number" id="costo_${escapeHTML(categoriaKey)}" value="${config[categoriaKey] || 0}" step="0.01">
        `;
        container.appendChild(group);
    });
}

/**
 * Guarda la configuración de tarifas, recalcula los montos locales y sincroniza en la nube.
 */
function guardarConfig() {
    CATEGORIAS.forEach(categoriaKey => {
        const inputElem = document.getElementById(`costo_${categoriaKey}`);
        if (inputElem) {
            const val = inputElem.value;
            config[categoriaKey] = parseFloat(val) || 0;
        }
    });
    Storage.saveConfig(config);
    mostrarNotificacion("Tarifas actualizadas. Recalculando montos del sistema...", "var(--secondary)");
    recalcularMontosServicios();
    CloudSync.sincronizarTarifasCloud(config);
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
    notifElem.style.background = color;
    notifElem.textContent = msg;
    notifElem.classList.add("show");
    setTimeout(() => notifElem.classList.remove("show"), 3000);
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
        s.el.innerHTML = s.first ? `<option value="">${s.first}</option>` : "";
        s.data.forEach(item => {
            let op = document.createElement("option");
            op.value = item;
            op.text = item;
            s.el.appendChild(op);
        });
    });

    if (lPol) {
        lPol.innerHTML = "";
        policias.forEach(p => {
            let op = document.createElement("option");
            op.value = p.nombre;
            op.text = etiquetaPolicia(p);
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
    if (!n) return mostrarNotificacion("Ingrese un nombre", "var(--danger)");

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
        if (nombresPolicias().includes(n)) return mostrarNotificacion("Ya existe", "var(--warning)");
        coloresPolicia[n] = colorAleatorio();
        policias.push({ nombre: n, jerarquia: j });
        mostrarNotificacion("Policía añadido");
    }

    Storage.savePolicias(policias);
    Storage.saveColores(coloresPolicia);
    document.getElementById("nuevoPolicia").value = "";
    document.getElementById("jerarquiaPolicia").value = "";
    inicializarSelects();
    CloudSync.sincronizarPoliciasCloud(policias);
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
    Storage.savePolicias(policias);
    inicializarSelects();
    mostrarNotificacion("Policía eliminado", "var(--danger)");
    CloudSync.sincronizarPoliciasCloud(policias);
}

/**
 * Añade o actualiza una empresa en la lista de gestión.
 */
function agregarEmpresa() {
    let n = document.getElementById("nuevoEmpresa").value.trim().toUpperCase();
    let t = document.getElementById("rangoTurnos").value.split(",").map(x => x.trim()).filter(x => x);
    let catS = document.getElementById("catSemana").value;
    let catF = document.getElementById("catFinde").value;
    if (!n || t.length === 0) return mostrarNotificacion("Complete los campos", "var(--danger)");

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
    CloudSync.sincronizarEmpresasCloud(empresas);
}

/**
 * Muestra el detalle de la empresa seleccionada en el contenedor de información.
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
    delete empresas[e];
    Storage.saveEmpresas(empresas);
    inicializarSelects();
    mostrarNotificacion("Empresa eliminada", "var(--danger)");
    CloudSync.sincronizarEmpresasCloud(empresas);
}

/**
 * Actualiza los turnos disponibles en el selector según la empresa elegida.
 */
function cambiarTurnos() {
    let e = document.getElementById("selEmpresa").value;
    let s = document.getElementById("selTurno");
    if (!s) return;
    s.innerHTML = "";
    if (e && empresas[e]) {
        let turnos = empresas[e].turnos || empresas[e];
        turnos.forEach(t => {
            let op = document.createElement("option");
            op.value = t; op.text = formatearTurno(t);
            s.appendChild(op);
        });
    }
    actualizarCategoriaAuto();
}

/**
 * Asigna automáticamente la categoría según el día seleccionado y la empresa.
 */
function actualizarCategoriaAuto() {
    let e = document.getElementById("selEmpresa").value;
    if (!e || !empresas[e]) return;
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
 * @returns {CalculationResult}
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
 * Inicializa el componente de FullCalendar en el DOM.
 */
function initCalendar() {
    const calendarEl = document.getElementById("calendar");
    if (!calendarEl || typeof FullCalendar === 'undefined') return;

    let eventosGuardados = safeParse("eventos", defaultEventos);
    if (!Array.isArray(eventosGuardados) || eventosGuardados.length === 0) {
        eventosGuardados = defaultEventos;
        if (typeof localStorage !== 'undefined') localStorage.setItem("eventos", JSON.stringify(defaultEventos));
    }

    calendar = new FullCalendar.Calendar(calendarEl, {
        locale: 'es',
        initialView: 'dayGridMonth',
        buttonText: {
            today: 'Hoy',
            month: 'Mes',
            week: 'Semana'
        },
        headerToolbar: { left: 'prev,next today', center: 'title', right: 'dayGridMonth,dayGridWeek' },
        height: 'auto',
        contentHeight: 'auto',
        editable: true,
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
            const tituloEl = document.getElementById("fechaTitulo");
            if (tituloEl) tituloEl.textContent = "Nuevo Servicio: " + info.dateStr;
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
                    CloudSync.eliminarServicioCloud(policia, empresa, turno, fecha);
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
        .then(() => mostrarNotificacion("Servicio eliminado de la nube", "var(--secondary)"))
        .catch(() => mostrarNotificacion("Eliminado localmente, pero falló la actualización en la nube", "var(--danger)"));
}

/**
 * Guarda un evento de servicio desde el formulario modal.
 */
function guardarEvento() {
    let p = document.getElementById("selPolicia").value;
    let t = document.getElementById("selTurno").value;
    let e = document.getElementById("selEmpresa").value;

    if (!p || !e) return mostrarNotificacion("Complete todos los campos", "var(--danger)");

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
        resultado = { cat: catSelUI, cost: vh * resultado.h, h: resultado.h, vh, detail: [{ cat: catSelUI, h: resultado.h, vh, cost: vh * resultado.h }], catLabel: catSelUI };
    }

    let nuevoEv = {
        title: `${p}\n${e} (${formatearTurno(t)})`,
        start: window.fechaSeleccionada,
        allDay: true,
        backgroundColor: coloresPolicia[p] || '#2563eb',
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

    mostrarNotificacion("Guardando en la nube...", "var(--warning)");

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
        .then(() => mostrarNotificacion("Servicio registrado y guardado en la nube", "var(--secondary)"))
        .catch(() => mostrarNotificacion("Guardado localmente, pero falló la conexión con la nube", "var(--danger)"));
}

/**
 * Guarda los eventos actuales del calendario en el almacenamiento local.
 */
function guardarEventosLocal() {
    if (!calendar) return;
    let evs = calendar.getEvents().map(e => ({
        title: e.title, start: e.startStr, backgroundColor: e.backgroundColor,
        extendedProps: e.extendedProps
    }));
    if (typeof localStorage !== 'undefined') localStorage.setItem("eventos", JSON.stringify(evs));
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

    let mesesArr = Array.from(mesesSet).sort().reverse();
    let optionsHTML = `<option value="">Todos los meses</option>`;
    let formatter = new Intl.DateTimeFormat('es-ES', { month: 'long', year: 'numeric' });

    mesesArr.forEach(m => {
        let [y, mo] = m.split('-');
        let text = formatter.format(new Date(y, parseInt(mo, 10) - 1, 1));
        text = text.charAt(0).toUpperCase() + text.slice(1);
        optionsHTML += `<option value="${m}">${text}</option>`;
    });

    if (selectDash) { selectDash.innerHTML = optionsHTML; selectDash.value = valDash; }
    if (selectHist) { selectHist.innerHTML = optionsHTML; selectHist.value = valHist; }
}

/**
 * Actualiza todos los componentes dependientes del estado (Filtros, Tabla, Gráfico, Totales).
 */
function actualizarTodo() {
    popularFiltroMeses();
    actualizarTabla();
    aplicarFiltros();
    calcularResumen();
}

/**
 * Renderiza las filas de la tabla de historial de servicios.
 */
function actualizarTabla() {
    const tbody = document.querySelector("#tablaServicios tbody");
    if (!tbody || !calendar) return;
    tbody.innerHTML = "";

    let sorted = [...calendar.getEvents()].sort((a, b) => b.start - a.start);

    sorted.forEach(e => {
        let p = e.extendedProps || {};
        let costVal = (p.cost !== undefined) ? Number(p.cost) : (p.costo !== undefined ? Number(p.costo) : 0);
        let polNombre = p.policia || p.Policia || "S/D";
        let empNombre = p.empresa || p.Empresa || "S/D";
        let tr = document.createElement("tr");

        let catBadge = "";
        if (p.detail && p.detail.length > 1) {
            catBadge = p.detail.map(d =>
                `<span class="badge badge-${d.cat.toLowerCase()}" title="${d.h}h × $${d.vh.toLocaleString('es-AR')}">${d.cat} (${d.h}h)</span>`
            ).join(" ");
        } else {
            let catSafe = (p.cat || "A").split("+")[0].toLowerCase();
            catBadge = `<span class="badge badge-${catSafe}">${p.cat || "A"}</span>`;
        }

        tr.innerHTML = `
            <td>${getLocalYMD(e.start)}</td>
            <td><span class="badge badge-empresa">${empNombre}</span></td>
            <td><div class="policia-cell">
                <div class="policia-dot" style="background:${e.backgroundColor || '#2563eb'}"></div>
                ${polNombre}
            </div></td>
            <td>${formatearTurno(p.turno)}</td>
            <td class="nowrap-cell">${catBadge}</td>
            <td class="font-weight-600">$${costVal.toLocaleString('es-AR')}</td>
        `;
        tbody.appendChild(tr);
    });
}

/**
 * Calcula los totales acumulados del Dashboard y actualiza el gráfico circular.
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
        let polNombre = p.policia || p.Policia || "Desconocido";

        stats.turnos++;
        stats.costo += costVal;

        if (!stats.porPol[polNombre]) stats.porPol[polNombre] = { turnos: 0, total: 0 };
        stats.porPol[polNombre].turnos++;
        stats.porPol[polNombre].total += costVal;
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
        let tr = document.createElement("tr");
        tr.innerHTML = `<td>${name}</td><td>${row.turnos}</td><td style="font-weight:600">$${row.total.toLocaleString('es-AR')}</td>`;
        tBody.appendChild(tr);

        labels.push(name);
        data.push(row.turnos);
        colors.push(coloresPolicia[name]);
        resumenHtml += `<div><strong>${name}</strong>: ${row.turnos} turnos ($${row.total.toLocaleString('es-AR')})</div>`;
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
                legend: { position: 'bottom', labels: { usePointStyle: true, padding: 20 } }
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

// --- EXPORTACIÓN ---

/**
 * Prepara y abre el modal de opciones de exportación.
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
            let div = document.createElement("div");
            div.style.marginBottom = "5px";
            div.innerHTML = `
                <label style="display: flex; align-items: center; gap: 8px; font-weight: normal; cursor: pointer;">
                    <input type="checkbox" class="chk-export-emp" value="${item}">
                    ${item}
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
 * Importa archivo JSON local de eventos/servicios.
 * @param {Event} evt 
 */
function cargarAlfasJSON(evt) {
    let file = evt.target.files[0];
    if (!file) return;
    let reader = new FileReader();
    reader.onload = function (e) {
        try {
            let parsed = JSON.parse(e.target.result);
            if (Array.isArray(parsed)) {
                let eventosFinales = parsed.map(item => {
                    if (item.start && item.extendedProps) return item;
                    let p = item.policia || item.Policia || item.policiaNombre || "";
                    let emp = item.empresa || item.Empresa || "";
                    let t = item.turno || item.Turno || "";
                    let f = item.fecha || item.Fecha || "";
                    let c = item.categoria || item.Categoria || "A";
                    let cost = parseFloat(item.costo || item.Costo || 0);
                    let h = parseFloat(item.hora || item.Hora || 8);
                    return {
                        title: `${p}\n${emp} (${formatearTurno(t)})`,
                        start: f,
                        backgroundColor: coloresPolicia[p] || '#2563eb',
                        borderColor: 'transparent',
                        extendedProps: {
                            policia: p, empresa: emp, turno: t,
                            cat: c, cost: cost, h: h, vh: h > 0 ? cost / h : 0,
                            detail: [{ cat: c, h: h, vh: h > 0 ? cost / h : 0, cost: cost }]
                        }
                    };
                });
                if (typeof localStorage !== 'undefined') localStorage.setItem("eventos", JSON.stringify(eventosFinales));
                mostrarNotificacion("Datos de servicios cargados exitosamente", "var(--secondary)");
                if (calendar) {
                    calendar.removeAllEvents();
                    eventosFinales.forEach(ev => calendar.addEvent(ev));
                    actualizarTodo();
                }
            } else {
                mostrarNotificacion("El archivo no tiene el formato esperado", "var(--danger)");
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
 * Consulta y sincroniza los servicios desde la nube o cae a fallbacks de localStorage.
 */
async function cargarServiciosDesdeCloud() {
    mostrarNotificacion("Leyendo registros de la solapa 'servicios' de Google Sheets...", "var(--primary)");
    try {
        const data = await CloudSync.obtenerServiciosCloud();
        if (data && Array.isArray(data) && data.length > 0) {
            procesarYMostrarServiciosCloud(data);
            mostrarNotificacion("Servicios cargados desde Google Sheets", "var(--secondary)");
            return;
        }
    } catch (err) {
        console.log("Error consultando dataset activo de la solapa 'servicios':", err);
    }

    try {
        let eventosLocales = (typeof localStorage !== 'undefined') ? localStorage.getItem("eventos") : null;
        if (eventosLocales) {
            let parsed = JSON.parse(eventosLocales);
            if (Array.isArray(parsed) && parsed.length > 0) {
                procesarYMostrarServiciosCloud(parsed);
                mostrarNotificacion("Datos de servicios cargados localmente (Modo Offline/Fallback)", "var(--secondary)");
                return;
            }
        }
    } catch (e) {
        console.error("Error leyendo localStorage:", e);
    }

    if (typeof defaultServiciosRaw !== "undefined" && Array.isArray(defaultServiciosRaw)) {
        procesarYMostrarServiciosCloud(defaultServiciosRaw);
        mostrarNotificacion("Datos de la solapa 'servicios' reflejados por defecto", "var(--secondary)");
    }
}

/**
 * Procesa la lista de servicios recibida y la muestra en FullCalendar deduplicando duplicados.
 * @param {Array} serviciosList 
 */
function procesarYMostrarServiciosCloud(serviciosList) {
    if (!Array.isArray(serviciosList)) return;
    let eventosFinales = serviciosList.map(item => {
        if (item.start && item.extendedProps) {
            item.allDay = true;
            return item;
        }
        let p = item.policia || item.Policia || item.policiaNombre || "";
        let emp = item.empresa || item.Empresa || "";
        let t = item.turno || item.Turno || "";
        let f = item.fecha || item.Fecha || "";

        if (typeof f === 'string' && f.includes('T')) {
            f = f.split('T')[0];
        }

        let c = item.categoria || item.Categoria || "A";
        let cost = parseFloat(item.costo || item.Costo || item.cost || 0);
        let h = parseFloat(item.hora || item.Hora || item.h || 8);
        return {
            title: `${p}\n${emp} (${formatearTurno(t)})`,
            start: f,
            allDay: true,
            backgroundColor: coloresPolicia[p] || '#2563eb',
            borderColor: 'transparent',
            extendedProps: {
                policia: p, empresa: emp, turno: t,
                cat: c, cost: cost, h: h, vh: h > 0 ? cost / h : 0,
                detail: [{ cat: c, h: h, vh: h > 0 ? cost / h : 0, cost: cost }]
            }
        };
    });

    const vistosSet = new Set();
    const eventosUnicos = eventosFinales.filter(ev => {
        const props = ev.extendedProps || {};
        const key = `${ev.start}_${props.policia}_${props.empresa}_${props.turno}`;
        if (vistosSet.has(key)) return false;
        vistosSet.add(key);
        return true;
    });

    if (calendar) {
        calendar.removeAllEvents();
        eventosUnicos.forEach(ev => calendar.addEvent(ev));
    }
    actualizarTodo();
}

// INICIALIZACIÓN AUTOMÁTICA EN NAVEGADOR
if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    document.addEventListener('DOMContentLoaded', () => {
        initInputs();
        initCalendar();
        inicializarSelects();
        cargarServiciosDesdeCloud();
        sincronizarPoliciasCloud();
    });
}

// EXPORTACIÓN PARA NODE.JS / SUITE DE PRUEBAS
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        escapeHTML,
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
