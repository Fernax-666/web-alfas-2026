// --- CONFIGURACIÓN Y ESTADO ---
const GOOGLE_SHEET_URL = "https://script.google.com/macros/s/AKfycbzIc0RqibgvDtP8gK_G_B9d37DGNXJ-1_bctDGsZwAXT9AE2cjmPEnynFI54UmBJ2xy_w/exec";

/**
 * Función de sanitización XSS para cadenas de texto insertadas en HTML.
 * @param {any} inputStr - Cadena o valor a sanitizar.
 * @returns {string} Cadena escapada para renderizado seguro en DOM.
 */
function escapeHTML(inputStr) {
    if (inputStr === null || inputStr === undefined) return '';
    return String(inputStr)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

/**
 * Parsing seguro de JSON almacenado en localStorage con manejo de errores y fallback.
 * @template T
 * @param {string} key - Clave del almacenamiento local.
 * @param {T} fallback - Valor por defecto si ocurre error o la clave no existe.
 * @returns {T} Datos parseados o fallback.
 */
function safeParse(key, fallback) {
    try {
        const rawData = localStorage.getItem(key);
        if (!rawData) return fallback;
        const parsed = JSON.parse(rawData);
        return parsed !== null && parsed !== undefined ? parsed : fallback;
    } catch (error) {
        console.error(`[StorageError] Falló el parsing de "${key}":`, error);
        return fallback;
    }
}

const CATEGORIAS = ["A", "AP", "B", "BP", "E", "HE", "HO"];

let config = safeParse("config_alfas", {
    A: 14993, AP: 16983.75, B: 16983.75, BP: 18736.5, E: 10638.75, HE: 5956.53, HO: 8121.36
});

const defaultPolicias = [
    { nombre: "Orellano Roberto", jerarquia: "" },
    { nombre: "Orellano Andres", jerarquia: "" },
    { nombre: "Guzman Yael", jerarquia: "" },
    { nombre: "Casalegno Gabriela", jerarquia: "" },
    { nombre: "Castro Roque", jerarquia: "" },
    { nombre: "Vivas Lucas", jerarquia: "" },
    { nombre: "Silva Cesar", jerarquia: "" },
    { nombre: "Durbano Martin", jerarquia: "" },
    { nombre: "Olivera Fernando", jerarquia: "" },
    { nombre: "Maldonado Mercedes", jerarquia: "" }
];

const defaultEmpresas = {
    "PALADINI": { turnos: ["06-14", "14-22", "22-06", "07:30-15:30"], catSemana: "A", catFinde: "AP" },
    "SIGLO21 (P1)": { turnos: ["07-15", "15-23"], catSemana: "A", catFinde: "AP" },
    "SIGLO21 (P2)": { turnos: ["07-15", "15-23"], catSemana: "A", catFinde: "AP" },
    "SIGLO21 (P3)": { turnos: ["07-15", "15-23", "23-07"], catSemana: "A", catFinde: "AP" }
};

let policias = safeParse("policias", defaultPolicias);
// Migrar formato antiguo: string[] -> {nombre, jerarquia}[]
policias = policias.map(policiaItem => typeof policiaItem === "string" ? { nombre: policiaItem, jerarquia: "" } : policiaItem);
let empresas = safeParse("empresas", defaultEmpresas);

// Migrar formato antiguo de empresas (array -> objeto)
Object.keys(empresas).forEach(nombreEmpresa => {
    if (Array.isArray(empresas[nombreEmpresa])) {
        empresas[nombreEmpresa] = { turnos: empresas[nombreEmpresa], catSemana: "A", catFinde: "AP" };
    }
});

if (!localStorage.getItem("policias")) localStorage.setItem("policias", JSON.stringify(policias));
if (!localStorage.getItem("empresas")) localStorage.setItem("empresas", JSON.stringify(empresas));

let coloresPolicia = safeParse("colores_policia", {});
let miGrafico = null;
let calendar = null;

// Inicializar colores si no existen (usar policia.nombre como clave)
policias.forEach(policiaItem => { 
    if (!coloresPolicia[policiaItem.nombre]) {
        coloresPolicia[policiaItem.nombre] = colorAleatorio();
    }
});

/**
 * Obtiene la lista simplificada de nombres de policías.
 * @returns {string[]} Lista de nombres.
 */
function nombresPolicias() { 
    return policias.map(policiaItem => policiaItem.nombre); 
}

/**
 * Genera la etiqueta formateada del policía con su jerarquía.
 * @param {{nombre: string, jerarquia?: string}} policiaObj - Objeto policía.
 * @returns {string} Etiqueta visible.
 */
function etiquetaPolicia(policiaObj) { 
    if (!policiaObj) return "";
    return policiaObj.jerarquia ? `[${policiaObj.jerarquia}] ${policiaObj.nombre}` : policiaObj.nombre; 
}

/**
 * Inicializa los inputs de configuración de tarifario.
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
 * Guarda la configuración de tarifas y recalcula eventos locales y sincroniza en la nube.
 */
function guardarConfig() {
    CATEGORIAS.forEach(categoriaKey => {
        const inputElem = document.getElementById(`costo_${categoriaKey}`);
        if (inputElem) {
            const val = inputElem.value;
            config[categoriaKey] = parseFloat(val) || 0;
        }
    });
    localStorage.setItem("config_alfas", JSON.stringify(config));
    mostrarNotificacion("Tarifas actualizadas. Recalculando montos del sistema...", "var(--secondary)");
    recalcularMontosServicios();
    sincronizarTarifasCloud();
}

/**
 * Recalcula el costo acumulado de los eventos cargados en el calendario según la nueva tarifa.
 */
function recalcularMontosServicios() {
    if (!calendar) return;
    calendar.getEvents().forEach(eventoItem => {
        let props = eventoItem.extendedProps || {};
        if (props.turno && props.empresa && eventoItem.startStr) {
            let empData = empresas[props.empresa];
            if (empData) {
                let nuevoCosto = calcularCostoTurno(props.turno, eventoItem.startStr, empData);
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

// FORMATOS LOCALES
/**
 * Retorna fecha en formato YYYY-MM-DD local.
 * @param {Date} dateObj
 * @returns {string}
 */
function getLocalYMD(dateObj) {
    if (!dateObj) return "";
    let y = dateObj.getFullYear();
    let m = (dateObj.getMonth() + 1).toString().padStart(2, '0');
    let d = dateObj.getDate().toString().padStart(2, '0');
    return `${y}-${m}-${d}`;
}

/**
 * Retorna mes en formato YYYY-MM local.
 * @param {Date} dateObj
 * @returns {string}
 */
function getLocalYM(dateObj) {
    if (!dateObj) return "";
    let y = dateObj.getFullYear();
    let m = (dateObj.getMonth() + 1).toString().padStart(2, '0');
    return `${y}-${m}`;
}

// --- UTILS ---
/**
 * Muestra notificación flotante en la interfaz.
 * @param {string} msg - Mensaje.
 * @param {string} color - Color de fondo CSS.
 */
function mostrarNotificacion(msg, color = "var(--primary)") {
    let notifElem = document.getElementById("notificacion");
    if (!notifElem) return;
    notifElem.style.background = color;
    notifElem.textContent = msg;
    notifElem.classList.add("show");
    setTimeout(() => notifElem.classList.remove("show"), 3000);
}

function abrirModal(modalId) { 
    const elem = document.getElementById(modalId);
    if (elem) elem.style.display = "flex"; 
}
function cerrarModal(modalId) { 
    const elem = document.getElementById(modalId);
    if (elem) elem.style.display = "none"; 
}

function colorAleatorio() {
    const tones = ['#2563eb', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#f97316'];
    return tones[Math.floor(Math.random() * tones.length)];
}

/**
 * Formatea cadena de turno (ej. "06-14" -> "06HS A 14HS")
 * @param {string} turnoStr
 * @returns {string}
 */
function formatearTurno(turnoStr) {
    if (!turnoStr) return "";
    if (!turnoStr.includes("-")) return turnoStr;
    let parts = turnoStr.split("-");
    return `${parts[0]}HS A ${parts[1]}HS`;
}

// --- GESTIÓN DE DATOS ---
function inicializarSelects() {
    const sPol = document.getElementById("selPolicia");
    const fPol = document.getElementById("filtroPolicia");
    const cPol = document.getElementById("filtroCalPolicia"); // Nuevo filtro calendario
    const lPol = document.getElementById("listaPolicias");
    const sEmp = document.getElementById("selEmpresa");
    const fEmp = document.getElementById("filtroEmpresa");
    const lEmp = document.getElementById("listaEmpresas");

    // Selects simples de nombre para calendario y filtros
    [
        { el: sPol, data: nombresPolicias(), first: "-- Seleccione Policía --" },
        { el: fPol, data: nombresPolicias(), first: "Todos los Policías" },
        { el: cPol, data: nombresPolicias(), first: "Todos los Policías" }, // Populate new filter
        { el: sEmp, data: Object.keys(empresas), first: "-- Seleccione Empresa --" },
        { el: fEmp, data: Object.keys(empresas), first: "Todas las Empresas" },
        { el: lEmp, data: Object.keys(empresas) }
    ].forEach(s => {
        if (!s.el) return;
        s.el.innerHTML = s.first ? `<option value="">${s.first}</option>` : "";
        s.data.forEach(item => {
            let op = document.createElement("option");
            op.value = item; op.text = item;
            s.el.appendChild(op);
        });
    });

    // Lista de policías con jerarquía (value = nombre, text = etiqueta)
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
    document.getElementById("stat-policias").textContent = policias.length;
}

let _editandoPolicia = null; // nombre del policía que se está editando

function agregarPolicia() {
    let n = document.getElementById("nuevoPolicia").value.trim();
    let j = document.getElementById("jerarquiaPolicia").value;
    if (!n) return mostrarNotificacion("Ingrese un nombre", "var(--danger)");

    if (_editandoPolicia) {
        // Modo edición: actualizar el existente
        let idx = policias.findIndex(p => p.nombre === _editandoPolicia);
        if (idx !== -1) {
            // Si cambió el nombre, actualizar clave de color
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
        // Modo alta
        if (nombresPolicias().includes(n)) return mostrarNotificacion("Ya existe", "var(--warning)");
        coloresPolicia[n] = colorAleatorio();
        policias.push({ nombre: n, jerarquia: j });
        mostrarNotificacion("Policía añadido");
    }

    localStorage.setItem("policias", JSON.stringify(policias));
    localStorage.setItem("colores_policia", JSON.stringify(coloresPolicia));
    document.getElementById("nuevoPolicia").value = "";
    document.getElementById("jerarquiaPolicia").value = "";
    inicializarSelects();
    sincronizarPoliciasCloud();
}

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

function eliminarPolicia() {
    let n = document.getElementById("listaPolicias").value;
    if (!n) return;
    if (!confirm(`¿Eliminar al policía "${n}"?`)) return;
    policias = policias.filter(p => p.nombre !== n);
    localStorage.setItem("policias", JSON.stringify(policias));
    inicializarSelects();
    mostrarNotificacion("Policía eliminado", "var(--danger)");
    sincronizarPoliciasCloud();
}

function agregarEmpresa() {
    let n = document.getElementById("nuevoEmpresa").value.trim().toUpperCase();
    let t = document.getElementById("rangoTurnos").value.split(",").map(x => x.trim()).filter(x => x);
    let catS = document.getElementById("catSemana").value;
    let catF = document.getElementById("catFinde").value;
    if (!n || t.length === 0) return mostrarNotificacion("Complete los campos", "var(--danger)");
    // Campos opcionales
    let nroServicio = document.getElementById("empNroServicio").value.trim();
    let domicilio = document.getElementById("empDomicilio").value.trim();
    let barrio = document.getElementById("empBarrio").value.trim();
    let telefono = document.getElementById("empTelefono").value.trim();
    let referente = document.getElementById("empReferente").value.trim();
    let telReferente = document.getElementById("empTelReferente").value.trim();
    let policiaEnc = document.getElementById("empPoliciaEncargado").value.trim();
    let telPoliciaEnc = document.getElementById("empTelPoliciaEncargado").value.trim();
    const esActualizacion = !!empresas[n]; // true si ya existía
    empresas[n] = {
        turnos: t, catSemana: catS, catFinde: catF,
        nroServicio, domicilio, barrio, telefono,
        referente, telReferente, policiaEnc, telPoliciaEnc
    };
    localStorage.setItem("empresas", JSON.stringify(empresas));
    // Limpiar campos y restaurar modo "Agregar"
    ["nuevoEmpresa", "rangoTurnos", "empNroServicio", "empDomicilio", "empBarrio",
        "empTelefono", "empReferente", "empTelReferente", "empPoliciaEncargado", "empTelPoliciaEncargado"
    ].forEach(id => document.getElementById(id).value = "");
    document.getElementById("editandoBanner").style.display = "none";
    const btnAgregar = document.querySelector("button[onclick='agregarEmpresa()']");
    if (btnAgregar) btnAgregar.textContent = "Agregar Empresa";
    inicializarSelects();
    mostrarNotificacion(esActualizacion ? "Empresa actualizada" : "Empresa añadida", "var(--secondary)");
    sincronizarEmpresasCloud();
}

/**
 * Visualiza la información detallada de la empresa seleccionada sanitizando entradas.
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

function modificarEmpresa() {
    let nombre = document.getElementById("listaEmpresas").value;
    if (!nombre || !empresas[nombre]) return mostrarNotificacion("Seleccione una empresa", "var(--warning)");
    let emp = empresas[nombre];
    // Cargar todos los campos en el formulario
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
    // Mostrar banner de edición y cambiar texto del botón
    document.getElementById("editandoNombre").textContent = nombre;
    document.getElementById("editandoBanner").style.display = "";
    const btnAgregar = document.querySelector("button[onclick='agregarEmpresa()']");
    if (btnAgregar) btnAgregar.textContent = "✔ Actualizar Empresa";
    // Scroll al inicio del modal para que el usuario vea el formulario
    document.querySelector("#modalEmpresas .modal").scrollTo({ top: 0, behavior: "smooth" });
    mostrarNotificacion("Datos cargados — editá y guardá", "var(--primary)");
}

function eliminarEmpresa() {
    let e = document.getElementById("listaEmpresas").value;
    if (!e) return;
    delete empresas[e];
    localStorage.setItem("empresas", JSON.stringify(empresas));
    inicializarSelects();
    mostrarNotificacion("Empresa eliminada", "var(--danger)");
    sincronizarEmpresasCloud();
}

function cambiarTurnos() {
    let e = document.getElementById("selEmpresa").value;
    let s = document.getElementById("selTurno");
    s.innerHTML = "";
    if (e && empresas[e]) {
        let turnos = empresas[e].turnos || empresas[e]; // compat
        turnos.forEach(t => {
            let op = document.createElement("option");
            op.value = t; op.text = formatearTurno(t);
            s.appendChild(op);
        });
    }
    // Auto-asignar categoría según el día actual y la empresa
    actualizarCategoriaAuto();
}

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

// --- CÁLCULO DE COSTO CON SPLIT HORARIO ---
// Calcula el costo real de un turno, dividiendo las horas entre categorías
// si el turno cruza medianoche y el día siguiente tiene categoría diferente.
function calcularCostoTurno(turno, fechaStr, empData) {
    const fallback = { cat: "A", cost: 0, h: 8, vh: 0, detail: [], catLabel: "A" };
    if (!turno || !turno.includes("-") || !empData) return fallback;

    const parts = turno.split("-");
    const startH = parseInt(parts[0]);
    const endH = parseInt(parts[1]);

    // Calcular horas totales del turno
    const totalH = endH > startH ? (endH - startH) : (24 - startH + endH);
    const isOvernight = endH < startH || (endH === 0 && startH > 0);

    // Categoría del día de inicio
    const startDate = new Date(fechaStr + "T00:00:00");
    const startDay = startDate.getDay();
    const isStartFinde = (startDay === 0 || startDay === 6);
    const catStart = isStartFinde ? empData.catFinde : empData.catSemana;

    if (!isOvernight) {
        // Turno sin cruce de medianoche: una sola categoría
        const vh = config[catStart] || 0;
        const cost = vh * totalH;
        return { cat: catStart, cost, h: totalH, vh, detail: [{ cat: catStart, h: totalH, vh, cost }], catLabel: catStart };
    }

    // Turno nocturno: calcular categoría del día siguiente
    const nextDate = new Date(startDate);
    nextDate.setDate(nextDate.getDate() + 1);
    const nextDay = nextDate.getDay();
    const isNextFinde = (nextDay === 0 || nextDay === 6);
    const catNext = isNextFinde ? empData.catFinde : empData.catSemana;

    if (catStart === catNext) {
        // Mismo categoría en ambos días: sin split necesario
        const vh = config[catStart] || 0;
        const cost = vh * totalH;
        return { cat: catStart, cost, h: totalH, vh, detail: [{ cat: catStart, h: totalH, vh, cost }], catLabel: catStart };
    }

    // Categories difieren: split a medianoche
    const hStartPart = 24 - startH;   // horas antes de medianoche (ej. 24-22 = 2h)
    const hNextPart = endH;             // horas después de medianoche (ej. 0h a 6h = 6h)

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

// --- CALENDARIO ---
function initCalendar() {
    const calendarEl = document.getElementById("calendar");
    if (!calendarEl) return;

    let eventosGuardados = safeParse("eventos", defaultEventos);
    if (!Array.isArray(eventosGuardados) || eventosGuardados.length === 0) {
        eventosGuardados = defaultEventos;
        localStorage.setItem("eventos", JSON.stringify(defaultEventos));
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
            document.getElementById("fechaTitulo").textContent = "Nuevo Servicio: " + info.dateStr;
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
                    eliminarServicioCloud(policia, empresa, turno, fecha);
                }
            }
        }
    });
    calendar.render();
}

/**
 * Solicita la eliminación de una fila de servicio en la solapa 'servicios' de Google Sheets.
 * @param {string} policia - Nombre del policía.
 * @param {string} empresa - Nombre de la empresa.
 * @param {string} turno - Horario de turno.
 * @param {string} fecha - Fecha en formato YYYY-MM-DD.
 */
function eliminarServicioCloud(policia, empresa, turno, fecha) {
    mostrarNotificacion("Eliminando servicio en la nube...", "var(--warning)");
    const queryParams = new URLSearchParams({
        action: "deleteServicio",
        fecha: fecha || "",
        empresa: empresa || "",
        policia: policia || "",
        turno: turno || ""
    }).toString();

    fetch(`${GOOGLE_SHEET_URL}?${queryParams}`, { mode: "no-cors" })
        .then(() => {
            mostrarNotificacion("Servicio eliminado de la nube", "var(--secondary)");
        })
        .catch(err => {
            console.error("Error eliminando servicio en la nube:", err);
            mostrarNotificacion("Eliminado localmente, pero falló la actualización en la nube", "var(--danger)");
        });
}

function guardarEvento() {
    let p = document.getElementById("selPolicia").value;
    let t = document.getElementById("selTurno").value;
    let e = document.getElementById("selEmpresa").value;

    if (!p || !e) return mostrarNotificacion("Complete todos los campos", "var(--danger)");

    // Validar duplicado exacto (Policía, Empresa y Turno coinciden)
    let duplicado = calendar.getEvents().some(ev =>
        ev.startStr === window.fechaSeleccionada &&
        ev.extendedProps.policia === p &&
        ev.extendedProps.empresa === e &&
        ev.extendedProps.turno === t
    );
    if (duplicado) return mostrarNotificacion(`${p} ya tiene este turno asignado`, "var(--warning)");

    let dia = new Date(window.fechaSeleccionada + "T00:00:00").getDay();

    // Calcular costo con lógica de split por cambio de categoría en turno nocturno
    let empData = empresas[e];
    let resultado = calcularCostoTurno(t, window.fechaSeleccionada, empData);

    // Permitir override manual de categoría (si es distinta de la auto-calculada)
    let catSelUI = document.getElementById("selCategoria").value;
    if (catSelUI && catSelUI !== resultado.cat && !resultado.cat.includes("+")) {
        // El usuario cambió manualmente: recalcular simple con esa cat
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
    
    // Mostrar estado de carga
    mostrarNotificacion("Guardando en la nube...", "var(--warning)");
    
    // Enviar a Google Sheets asíncronamente
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

    const queryParams = new URLSearchParams({
        action: "addServicio",
        fecha: window.fechaSeleccionada || "",
        empresa: e || "",
        policia: p || "",
        turno: t || "",
        categoria: catFinal,
        hora: String(resultado.h || 8),
        costo: String(resultado.cost || 0),
        data: JSON.stringify(payload)
    }).toString();

    fetch(`${GOOGLE_SHEET_URL}?${queryParams}`, { mode: "no-cors" })
    .then(() => {
        mostrarNotificacion("Servicio registrado y guardado en la nube", "var(--secondary)");
    })
    .catch(err => {
        console.error("Error Fetch enviando servicio:", err);
        mostrarNotificacion("Guardado localmente, pero falló la conexión con la nube", "var(--danger)");
    });
}

function guardarEventosLocal() {
    let evs = calendar.getEvents().map(e => ({
        title: e.title, start: e.startStr, backgroundColor: e.backgroundColor,
        extendedProps: e.extendedProps
    }));
    localStorage.setItem("eventos", JSON.stringify(evs));
}

// --- SINCRONIZACIÓN CLOUD ---

function sincronizarTarifasCloud() {
    const payload = encodeURIComponent(JSON.stringify({ action: "syncTarifas", config: config }));
    fetch(`${GOOGLE_SHEET_URL}?data=${payload}`, { mode: "no-cors" })
        .then(() => console.log("Tarifas sincronizadas en la nube (GET no-cors)"))
        .catch(err => console.error("Fallo al sincronizar tarifas:", err));
}

function sincronizarPoliciasCloud() {
    const polData = policias.map(p => ({
        nombre: typeof p === 'object' ? (p.nombre || '') : String(p),
        jerarquia: typeof p === 'object' ? (p.jerarquia || '') : ''
    }));
    const payload = encodeURIComponent(JSON.stringify({ action: "syncPolicias", policias: polData }));
    fetch(`${GOOGLE_SHEET_URL}?data=${payload}`, { mode: "no-cors" })
        .then(() => console.log("Policías con Jerarquía sincronizados en la solapa POLICIA (GET no-cors)"))
        .catch(err => console.error("Fallo al sincronizar policías:", err));
}

function sincronizarEmpresasCloud() {
    const payload = encodeURIComponent(JSON.stringify({ action: "syncEmpresas", empresas: empresas }));
    fetch(`${GOOGLE_SHEET_URL}?data=${payload}`, { mode: "no-cors" })
        .then(() => console.log("Empresas sincronizadas en la nube (GET no-cors)"))
        .catch(err => console.error("Fallo al sincronizar empresas:", err));
}

// --- ACTUALIZACIÓN DE UI ---
function popularFiltroMeses() {
    let selectDash = document.getElementById("filtroMesDashboard");
    let selectHist = document.getElementById("filtroMesHistorial");
    if (!selectDash && !selectHist) return;

    let valDash = selectDash ? selectDash.value : "";
    let valHist = selectHist ? selectHist.value : "";

    let mesesSet = new Set();
    calendar.getEvents().forEach(e => {
        if (e.start) {
            mesesSet.add(getLocalYM(e.start));
        }
    });
    let todayYyyyMm = getLocalYM(new Date());
    mesesSet.add(todayYyyyMm);

    let mesesArr = Array.from(mesesSet).sort().reverse();

    let optionsHTML = `<option value="">Todos los meses</option>`;
    let formatter = new Intl.DateTimeFormat('es-ES', { month: 'long', year: 'numeric' });

    mesesArr.forEach(m => {
        let [y, mo] = m.split('-');
        let text = formatter.format(new Date(y, parseInt(mo) - 1, 1));
        text = text.charAt(0).toUpperCase() + text.slice(1);
        optionsHTML += `<option value="${m}">${text}</option>`;
    });

    if (selectDash) { selectDash.innerHTML = optionsHTML; selectDash.value = valDash; }
    if (selectHist) { selectHist.innerHTML = optionsHTML; selectHist.value = valHist; }
}

function actualizarTodo() {
    popularFiltroMeses();
    actualizarTabla();
    aplicarFiltros();
    calcularResumen();
}

function actualizarTabla() {
    const tbody = document.querySelector("#tablaServicios tbody");
    tbody.innerHTML = "";

    // Ordenar eventos por fecha desc
    let sorted = [...calendar.getEvents()].sort((a, b) => b.start - a.start);

    sorted.forEach(e => {
        let p = e.extendedProps || {};
        let costVal = (p.cost !== undefined) ? Number(p.cost) : (p.costo !== undefined ? Number(p.costo) : 0);
        let polNombre = p.policia || p.Policia || "S/D";
        let empNombre = p.empresa || p.Empresa || "S/D";
        let tr = document.createElement("tr");

        // Construir badge de categoría (puede ser simple o mixta)
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
            <td><span class="badge" style="background:#eef2ff; color:#4338ca">${empNombre}</span></td>
            <td><div style="display:flex; align-items:center; gap:8px">
                <div style="width:10px; height:10px; border-radius:50%; background:${e.backgroundColor || '#2563eb'}"></div>
                ${polNombre}
            </div></td>
            <td>${formatearTurno(p.turno)}</td>
            <td style="white-space:nowrap">${catBadge}</td>
            <td style="font-weight:600">$${costVal.toLocaleString('es-AR')}</td>
        `;
        tbody.appendChild(tr);
    });
}

function calcularResumen() {
    let stats = { turnos: 0, costo: 0, porPol: {} };
    let mesFiltro = document.getElementById("filtroMesDashboard") ? document.getElementById("filtroMesDashboard").value : "";

    calendar.getEvents().forEach(e => {
        let ym = getLocalYM(e.start);
        if (mesFiltro && ym !== mesFiltro) return;

        let p = e.extendedProps || {};
        let costVal = (p.cost !== undefined) ? Number(p.cost) : (p.costo !== undefined ? Number(p.costo) : 0);
        let polNombre = p.policia || p.Policia || "Desconocido";

        // Stats totales
        stats.turnos++;
        stats.costo += costVal;

        if (!stats.porPol[polNombre]) stats.porPol[polNombre] = { turnos: 0, total: 0 };
        stats.porPol[polNombre].turnos++;
        stats.porPol[polNombre].total += costVal;
    });

    // Update Dashboard Cards
    document.getElementById("stat-turnos").textContent = stats.turnos;
    document.getElementById("stat-costo").textContent = `$${stats.costo.toLocaleString('es-AR')}`;

    // Update Totales Table
    const tBody = document.getElementById("totalesBody");
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
    document.getElementById("resumenLista").innerHTML = resumenHtml;

    // Update Chart
    if (miGrafico) miGrafico.destroy();
    const ctx = document.getElementById('grafico').getContext('2d');
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

// --- FILTROS ---
function aplicarFiltros() {
    let pol = document.getElementById("filtroPolicia").value;
    let emp = document.getElementById("filtroEmpresa").value;
    let mes = document.getElementById("filtroMesHistorial") ? document.getElementById("filtroMesHistorial").value : "";
    let filas = document.querySelectorAll("#tablaServicios tbody tr");

    filas.forEach(f => {
        let fFecha = f.children[0].textContent.trim(); // "YYYY-MM-DD"
        let fEmp = f.children[1].textContent.trim();
        let fPol = f.children[2].textContent.trim();
        let match = true;

        if (mes && !fFecha.startsWith(mes)) match = false;
        if (pol && fPol !== pol) match = false;
        if (emp && fEmp !== emp) match = false;
        f.style.display = match ? "" : "none";
    });
}

function filtrarCalendario() {
    if (!calendar) return;
    const filtroVal = (document.getElementById("filtroCalPolicia").value || "").trim();

    calendar.getEvents().forEach(ev => {
        const policia = (ev.extendedProps.policia || "").trim();
        if (!filtroVal || policia === filtroVal) {
            ev.setProp('display', 'auto');
        } else {
            ev.setProp('display', 'none');
        }
    });
}

function limpiarFiltros() {
    document.getElementById("filtroPolicia").value = "";
    document.getElementById("filtroEmpresa").value = "";
    if (document.getElementById("filtroMesHistorial")) document.getElementById("filtroMesHistorial").value = "";
    aplicarFiltros();
}

// --- EXPORTACIÓN ---
function abrirModalExportar() {
    let selMes = document.getElementById("exportMes");
    let selPol = document.getElementById("exportPolicia");
    let contEmp = document.getElementById("containerExportEmpresa");

    // Poblar meses y policías de las listas maestras
    if (document.getElementById("filtroMesHistorial")) {
        selMes.innerHTML = document.getElementById("filtroMesHistorial").innerHTML;
    }
    if (document.getElementById("filtroPolicia")) {
        selPol.innerHTML = document.getElementById("filtroPolicia").innerHTML;
    }

    // Poblar empresas como lista de Checkboxes
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

function exportExcel() {
    const mesFiltroValue = document.getElementById("exportMes") ? document.getElementById("exportMes").value : "";
    const polFiltroValue = document.getElementById("exportPolicia") ? document.getElementById("exportPolicia").value : "";

    // Obtener los valores de las checkboxes marcadas
    const chks = document.querySelectorAll(".chk-export-emp:checked");
    const empFiltros = Array.from(chks).map(c => c.value);

    let data = [["Fecha", "Empresa", "Policía", "Turno", "Categoría", "Horas", "Valor Hora", "Costo Total"]];
    let rawEvents = safeParse("eventos", []);

    // Ordenar cronológicamente
    let eventosData = rawEvents.map(e => ({
        ...e,
        startDate: new Date(e.start + (e.start.includes("T") ? "" : "T00:00:00"))
    }));
    eventosData.sort((a, b) => a.startDate - b.startDate);

    eventosData.forEach(e => {
        if (!e.startDate) return;
        let ym = getLocalYM(e.startDate);
        if (mesFiltroValue && ym !== mesFiltroValue) return;

        let p = e.extendedProps || {};
        let polNombre = (p.policia || "").trim();
        let empNombre = (p.empresa || "").trim();

        if (polFiltroValue && polNombre !== polFiltroValue) return;

        if (empFiltros.length > 0) {
            if (!empFiltros.includes(empNombre)) return;
        }

        data.push([getLocalYMD(e.startDate), empNombre, polNombre, formatearTurno(p.turno), p.cat, p.h, p.vh, p.cost]);
    });

    if (data.length === 1) {
        mostrarNotificacion("No hay registros para exportar con estos filtros", "var(--warning)");
        return;
    }

    let wb = XLSX.utils.book_new();
    let ws = XLSX.utils.aoa_to_sheet(data);
    XLSX.utils.book_append_sheet(wb, ws, "Servicios");
    XLSX.writeFile(wb, `Reporte_Servicios_${new Date().toISOString().slice(0, 10)}.xlsx`);
    cerrarModal("modalExportar");
    mostrarNotificacion("Excel generado con éxito", "var(--secondary)");
}

async function exportPDF() {
    try {
        const mesFiltro = document.getElementById("exportMes") ? document.getElementById("exportMes").value : "";
        const polFiltro = document.getElementById("exportPolicia") ? document.getElementById("exportPolicia").value : "";

        // Obtener valores de checkboxes marcadas
        const chks = document.querySelectorAll(".chk-export-emp:checked");
        const empFiltros = Array.from(chks).map(c => c.value);

        let rows = [];
        // OBTENCIÓN DIRECTA DE DATOS (Bypasseando el estado del calendario para asegurar 100% integridad)
        let rawEvents = safeParse("eventos", []);

        // Convertir y ordenar cronológicamente
        let eventosData = rawEvents.map(e => ({
            ...e,
            startDate: new Date(e.start + (e.start.includes("T") ? "" : "T00:00:00"))
        }));
        eventosData.sort((a, b) => a.startDate - b.startDate);

        let totalCosto = 0;
        // Pre-normalizar filtros para mayor rendimiento
        const polFilterNorm = (polFiltro || "").toLowerCase().replace(/[^a-z0-9]/g, '');
        const empFiltersNorm = empFiltros.map(f => (f || "").trim().toLowerCase().replace(/[^a-z0-9]/g, ''));

        let startOfMonth = null;
        let endOfMonth = null;
        if (mesFiltro && mesFiltro.includes("-")) {
            let [filAnio, filMes] = mesFiltro.split('-').map(Number);
            startOfMonth = new Date(filAnio, filMes - 1, 1, 0, 0, 0);
            endOfMonth = new Date(filAnio, filMes, 0, 23, 59, 59);
        }

        eventosData.forEach(e => {
            if (!e.startDate || isNaN(e.startDate.getTime())) return;

            let props = e.extendedProps || {};

            // EXTRAER POLICÍA (Manejar string u objeto)
            let pRaw = props.policia || e.policia || e.title || "";
            let polStr = (typeof pRaw === 'object' ? pRaw.nombre : pRaw).toString().split(/[\n-]/)[0].trim();

            // EXTRAER EMPRESA (Manejar string u objeto)
            let eRaw = props.empresa || e.empresa || "";
            let empStr = (typeof eRaw === 'object' ? eRaw.nombre : eRaw).toString().trim();

            // BÚSQUEDA MAESTRA EN EL TÍTULO (Si falta empresa estructurada)
            if (!empStr && e.title) {
                const masterEmpresas = Object.keys(empresas);
                let titleTerm = e.title.toLowerCase().replace(/[^a-z0-9]/g, '');
                for (let n of masterEmpresas) {
                    let nTerm = n.toLowerCase().replace(/[^a-z0-9]/g, '');
                    if (titleTerm.includes(nTerm)) {
                        empStr = n; break;
                    }
                }
            }

            let polNorm = polStr.toLowerCase().replace(/[^a-z0-9]/g, '');
            let empNorm = empStr.toLowerCase().replace(/[^a-z0-9]/g, '');

            // FILTRO DE MES
            if (startOfMonth && endOfMonth) {
                if (e.startDate < startOfMonth || e.startDate > endOfMonth) return;
            }

            // FILTRO DE POLICÍA (Búsqueda por inclusión bidireccional)
            if (polFilterNorm) {
                if (!polNorm.includes(polFilterNorm) && !polFilterNorm.includes(polNorm)) return;
            }

            // FILTRO DE EMPRESA (Búsqueda en lista de seleccionadas)
            if (empFiltersNorm.length > 0 && !empFiltersNorm.includes(empNorm)) return;


            rows.push([
                getLocalYMD(e.startDate),
                empStr || "S/D",
                polStr || "S/D",
                formatearTurno(props.turno || e.turno || ""),
                props.cat || e.cat || "-",
                `$${(props.cost || e.cost || 0).toLocaleString('es-AR')}`
            ]);
            totalCosto += (props.cost || e.cost || 0);
        });

        console.log(`Reporte generado: ${rows.length} registros encontrados.`);


        if (rows.length === 0) {
            mostrarNotificacion("No hay registros para exportar con estos filtros", "var(--warning)");
            return;
        }

        // Cerramos el modal momentáneamente y avisamos
        cerrarModal("modalExportar");
        mostrarNotificacion("Preparando visualización del calendario...", "var(--primary)");

        // Activar modo PDF para estilos específicos (quitar transparencias y días de otros meses)
        document.body.classList.add('pdf-mode');

        let prevDate = calendar.getDate();
        let prevFiltroCal = document.getElementById("filtroCalPolicia").value;

        if (mesFiltro) calendar.gotoDate(mesFiltro + "-01");
        if (polFiltro) document.getElementById("filtroCalPolicia").value = polFiltro;
        else document.getElementById("filtroCalPolicia").value = "";
        filtrarCalendario();

        // Esperamos a que el calendario se pinte y acomode
        await new Promise(r => setTimeout(r, 800));

        let imgData = null;
        let canvasWidth = 0;
        let canvasHeight = 0;
        try {
            const calEl = document.getElementById("calendar");
            if (calEl) {
                const canvas = await html2canvas(calEl, {
                    scale: 2,
                    useCORS: true,
                    logging: false
                });
                imgData = canvas.toDataURL('image/jpeg', 0.9);
                canvasWidth = canvas.width;
                canvasHeight = canvas.height;
            }
        } catch (err) {
            console.error("Error html2canvas:", err);
        }

        // Restaurar el calendario a como estaba
        calendar.gotoDate(prevDate);
        document.getElementById("filtroCalPolicia").value = prevFiltroCal;
        filtrarCalendario();

        // Desactivar modo PDF
        document.body.classList.remove('pdf-mode');

        const { jsPDF } = window.jspdf;
        let doc = new jsPDF();

        doc.setFontSize(20);
        doc.text("Reporte de Servicios Adicionales", 15, 20);

        let lineasHeader = [`Generado el: ${new Date().toLocaleString()}`];
        if (mesFiltro || polFiltro || empFiltros.length > 0) {
            lineasHeader.push("Filtros Aplicados:");
            if (mesFiltro) lineasHeader.push(`  • Mes: ${mesFiltro}`);
            if (polFiltro) lineasHeader.push(`  • Policía: ${polFiltro}`);
            if (empFiltros.length > 0) {
                lineasHeader.push(`  • Empresas: ${empFiltros.join(", ")}`);
            }
        }

        doc.setFontSize(9);

        const pdfWidth = doc.internal.pageSize.getWidth();
        // Dividir líneas muy largas si existen montones de empresas
        let splitLines = doc.splitTextToSize(lineasHeader, pdfWidth - 30);
        doc.text(splitLines, 15, 28);

        // Bajar finalYHeader dinámicamente según la cantidad de líneas creadas
        // (Aprox 4.5 pt por línea + peque margen)
        let finalYHeader = 28 + (splitLines.length * 4.5) + 3;
        if (imgData && canvasWidth > 0) {
            const margin = 15;
            let pdfImgWidth = pdfWidth - margin * 2;
            let pdfImgHeight = (canvasHeight * pdfImgWidth) / canvasWidth;

            if (pdfImgHeight > 130) {
                pdfImgWidth = pdfImgWidth * (130 / pdfImgHeight);
                pdfImgHeight = 130;
                let leftMargin = (pdfWidth - pdfImgWidth) / 2;
                doc.addImage(imgData, 'JPEG', leftMargin, finalYHeader, pdfImgWidth, pdfImgHeight);
            } else {
                doc.addImage(imgData, 'JPEG', margin, finalYHeader, pdfImgWidth, pdfImgHeight);
            }
            finalYHeader = finalYHeader + pdfImgHeight + 8;
        }

        doc.autoTable({
            startY: finalYHeader,
            head: [['Fecha', 'Empresa', 'Policía', 'Turno', 'Cat', 'Total']],
            body: rows,
            theme: 'striped',
            headStyles: { fillColor: [37, 99, 235] }
        });

        let finalY = doc.lastAutoTable.finalY || finalYHeader;
        if (finalY > doc.internal.pageSize.getHeight() - 25) {
            doc.addPage();
            finalY = 20;
        }

        doc.setFontSize(11);
        doc.setFont("helvetica", "bold");
        doc.text(`Cantidad de Turnos: ${rows.length}`, 15, finalY + 10);
        doc.text(`Monto Acumulado: $${totalCosto.toLocaleString('es-AR')}`, 15, finalY + 16);


        doc.save(`Reporte_Servicios_${new Date().toISOString().slice(0, 10)}.pdf`);
        mostrarNotificacion("PDF generado con éxito", "var(--secondary)");
    } catch (globalError) {
        console.error("Error en exportPDF:", globalError);
        mostrarNotificacion("Error al generar el PDF. Revisa la consola.", "var(--danger)");
    }
}

function cargarAlfasJSON(evt) {
    let file = evt.target.files[0];
    if (!file) return;
    let reader = new FileReader();
    reader.onload = function (e) {
        try {
            let parsed = JSON.parse(e.target.result);
            if (Array.isArray(parsed)) {
                let eventosFinales = parsed.map(item => {
                    // Si ya es un evento FullCalendar estructurado
                    if (item.start && item.extendedProps) return item;
                    // Si proviene del formato de filas de la solapa 'servicios' de Google Sheets
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
                localStorage.setItem("eventos", JSON.stringify(eventosFinales));
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
        // Resetear input para permitir cargar el mismo archivo varias veces si se modifica
        document.getElementById('importarJson').value = "";
    };
    reader.readAsText(file);
}

// --- LECTURA DIRECTA DE SOLAPA SERVICIOS (SIN DEPENDER DE LOCALSTORAGE) ---
async function cargarServiciosDesdeCloud() {
    mostrarNotificacion("Leyendo registros de la solapa 'servicios' de Google Sheets...", "var(--primary)");
    try {
        const url = `${GOOGLE_SHEET_URL}?action=getServicios`;
        const res = await fetch(url);
        if (res.ok) {
            const data = await res.json();
            if (Array.isArray(data) && data.length > 0) {
                procesarYMostrarServiciosCloud(data);
                mostrarNotificacion("Servicios cargados desde Google Sheets", "var(--secondary)");
                return;
            }
        }
    } catch (err) {
        console.log("Error consultando dataset activo de la solapa 'servicios':", err);
    }

    // FALLBACK 1: Leer de localStorage (ya que Apps Script no tiene getServicios implementado aún)
    try {
        let eventosLocales = localStorage.getItem("eventos");
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

    // FALLBACK 2: Procesar dataset por defecto si no hay nada en Google Sheets ni localStorage
    if (typeof defaultServiciosRaw !== "undefined" && Array.isArray(defaultServiciosRaw)) {
        procesarYMostrarServiciosCloud(defaultServiciosRaw);
        mostrarNotificacion("Datos de la solapa 'servicios' reflejados por defecto", "var(--secondary)");
    }
}

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
        
        // Extraer solo la parte YYYY-MM-DD si viene con hora (ej. de Google Sheets T03:00:00.000Z)
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

    // Deduplicar eventos idénticos (misma fecha, policía, empresa y turno)
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

// --- INICIO ---
document.addEventListener('DOMContentLoaded', () => {
    initInputs();
    initCalendar();
    inicializarSelects();
    cargarServiciosDesdeCloud();
    sincronizarPoliciasCloud();
});
