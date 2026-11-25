/**
 * @file precarton.js
 * @description Controlador modularizado y seguro (Anti-XSS) para la Planilla Mensual de Turnos (Precartón).
 * Conectado con AlfaStorage, AlfaDatabase (SQLite/IndexedDB Local) y AlfaCloudSync.
 * Soporta vista matricial en PC y filtro rápido por día/tarjetas en Modo Móvil Exclusivo.
 */

(function (root, factory) {
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = factory();
    } else {
        root.AlfaPrecarton = factory();
    }
}(typeof self !== 'undefined' ? self : this, function () {

    const DIAS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
    const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

    const Utils = (typeof window !== 'undefined' && window.AlfaUtils) ? window.AlfaUtils : require('./utils/helpers.js');
    const Calculator = (typeof window !== 'undefined' && window.AlfaCalculator) ? window.AlfaCalculator : require('./services/calculator.js');
    const Storage = (typeof window !== 'undefined' && window.AlfaStorage) ? window.AlfaStorage : require('./services/storage.js');
    const CloudSync = (typeof window !== 'undefined' && window.AlfaCloudSync) ? window.AlfaCloudSync : require('./services/cloudSync.js');

    const escapeHTML = Utils.escapeHTML;
    const formatearTurno = Utils.formatearTurno;

    const state = Storage.initStorage(Utils);
    let policias = state.policias;
    let empresas = state.empresas;
    let config = state.config;
    let coloresPolicia = state.coloresPolicia;

    function safeParse(key, fallback) {
        return Utils.safeParse(typeof localStorage !== 'undefined' ? localStorage : {}, key, fallback);
    }

    /**
     * Construye la clave de almacenamiento de una planilla mensual.
     * @param {string} empresa 
     * @param {number} mes 
     * @param {number} anio 
     * @returns {string}
     */
    function clavePlanilla(empresa, mes, anio) {
        return `planilla_${empresa}_${anio}_${mes}`;
    }

    /**
     * Inicializa el selector de empresas en la vista de Precartón.
     */
    function initEmpresas() {
        const sel = document.getElementById("selEmpresa");
        if (!sel) return;
        sel.innerHTML = "";
        Object.keys(empresas).forEach(e => {
            let op = document.createElement("option");
            op.value = e;
            op.textContent = e;
            sel.appendChild(op);
        });
    }

    /**
     * Renderiza los metadatos de la empresa seleccionada aplicando sanitización XSS estricta.
     * @param {string} empresa 
     */
    function mostrarDatosEmpresa(empresa) {
        const emp = empresas[empresa] || {};
        const bloque = document.getElementById("infoEmpresa");
        if (!bloque) return;

        function set(id, label, val) {
            const el = document.getElementById(id);
            if (!el) return;
            el.innerHTML = val ? `<b>${escapeHTML(label)}:</b> ${escapeHTML(val)} &nbsp;` : "";
        }

        set("infoEmpNroSrv", "N° Servicio", emp.nroServicio);
        set("infoEmpDomicilio", "Domicilio", emp.domicilio);
        set("infoEmpBarrio", "Barrio", emp.barrio);
        set("infoEmpTel", "Teléfono", emp.telefono);
        set("infoEmpRef", "Referente", emp.referente);
        set("infoEmpTelRef", "Tel. Referente", emp.telReferente);
        set("infoEmpPol", "Policía Encargado", emp.policiaEnc);
        set("infoEmpTelPol", "Tel. Policía Enc.", emp.telPoliciaEnc);

        const brRef = document.getElementById("brRef");
        const brPol = document.getElementById("brPol");
        if (brRef) brRef.style.display = (emp.referente || emp.telReferente) ? "" : "none";
        if (brPol) brPol.style.display = (emp.policiaEnc || emp.telPoliciaEnc) ? "" : "none";

        const hayAlgo = emp.nroServicio || emp.domicilio || emp.barrio || emp.telefono ||
            emp.referente || emp.telReferente || emp.policiaEnc || emp.telPoliciaEnc;
        bloque.style.display = hayAlgo ? "" : "none";
    }

    /**
     * Genera el HTML sanitizado de un selector de policía para una celda de turno.
     * @param {string} cellKey 
     * @param {string} valorActual 
     * @returns {string}
     */
    function generarSelect(cellKey, valorActual) {
        const safeKey = escapeHTML(cellKey);
        let opts = `<option value="">— Sin asignar —</option>`;
        policias.forEach(p => {
            const nombre = typeof p === "object" ? p.nombre : String(p);
            const jerarquia = (typeof p === "object" && p.jerarquia) ? `[${p.jerarquia}] ` : "";
            const etiqueta = `${jerarquia}${nombre}`;
            const isSelected = nombre === valorActual ? 'selected' : '';
            opts += `<option value="${escapeHTML(nombre)}" ${isSelected}>${escapeHTML(etiqueta)}</option>`;
        });
        const isFeriado = valorActual === 'Feriado' ? 'selected' : '';
        opts += `<option value="Feriado" ${isFeriado}>Feriado</option>`;
        return `<select data-key="${safeKey}" title="Asignar efectivo al turno" onchange="onCambioSelect(this)">${opts}</select>`;
    }

    /**
     * Renderiza la tabla mensual completa con atributos `data-label` para adaptación automática a tarjetas móviles.
     */
    function generarPlanilla() {
        const selEmp = document.getElementById("selEmpresa");
        const selMes = document.getElementById("selMes");
        const selAnio = document.getElementById("selAnio");
        if (!selEmp || !selMes || !selAnio) return;

        const empresa = selEmp.value;
        const mes = parseInt(selMes.value, 10);
        const anio = parseInt(selAnio.value, 10);
        const turnos = (empresas[empresa] || {}).turnos || [];
        const clave = clavePlanilla(empresa, mes, anio);
        const guardado = safeParse(clave, {});

        const sub = document.getElementById("subtitulo");
        if (sub) sub.textContent = `${empresa} — ${MESES[mes] || ''} ${anio}`;
        mostrarDatosEmpresa(empresa);

        const thead = document.getElementById("cabeceraPlanilla");
        if (thead) {
            thead.innerHTML = `<tr>
                <th>Día</th><th>Fecha</th>
                ${turnos.map((t, i) => `<th class="turno-header-${i % 5}">${escapeHTML(formatearTurno(t))}</th>`).join("")}
            </tr>`;
        }

        const eventos = safeParse("eventos", []);
        const mesStr = (mes + 1).toString().padStart(2, '0');
        const prefijoFecha = `${anio}-${mesStr}-`;

        const tbody = document.getElementById("cuerpoPlanilla");
        if (!tbody) return;
        tbody.innerHTML = "";
        const diasEnMes = new Date(anio, mes + 1, 0).getDate();

        for (let dia = 1; dia <= diasEnMes; dia++) {
            const fecha = new Date(anio, mes, dia);
            const diaSemana = fecha.getDay();
            const esFinde = diaSemana === 0 || diaSemana === 6;
            const tr = document.createElement("tr");
            tr.setAttribute("data-dia", String(dia));
            if (esFinde) tr.className = "finde";

            tr.innerHTML = `
                <td data-label="Día">${escapeHTML(DIAS[diaSemana])}</td>
                <td data-label="Fecha">${escapeHTML(dia)}/${escapeHTML(mesStr)}</td>
            `;

            const fechaIso = `${prefijoFecha}${dia.toString().padStart(2, '0')}`;

            turnos.forEach((turno, idx) => {
                const cellKey = `${dia}_${idx}`;
                let valorGuardado = guardado[cellKey] || "";

                if (!valorGuardado) {
                    const evRel = eventos.find(e =>
                        e.start === fechaIso &&
                        e.extendedProps &&
                        e.extendedProps.empresa === empresa &&
                        e.extendedProps.turno === turno
                    );
                    if (evRel) valorGuardado = evRel.extendedProps.policia;
                }

                const td = document.createElement("td");
                td.className = `turno-col-${idx % 5}`;
                td.setAttribute("data-label", formatearTurno(turno));
                td.innerHTML = generarSelect(cellKey, valorGuardado);
                tr.appendChild(td);
            });

            tbody.appendChild(tr);
        }

        document.querySelectorAll(".planilla-table select").forEach(sel => {
            if (sel.value) sel.classList.add("asignado");
        });

        filtrarDiaPlanillaMovil();
    }

    /**
     * Filtra por día específico o muestra todo el mes (ideal para pantallas móviles).
     */
    function filtrarDiaPlanillaMovil() {
        const filtroDiaEl = document.getElementById("filtroDiaMovil");
        if (!filtroDiaEl) return;
        const val = filtroDiaEl.value.trim();
        const rows = document.querySelectorAll("#cuerpoPlanilla tr");
        rows.forEach(r => {
            if (!val) {
                r.style.display = "";
            } else {
                r.style.display = (r.getAttribute("data-dia") === val) ? "" : "none";
            }
        });
    }

    /**
     * Callback al cambiar un selector de turno.
     * @param {HTMLSelectElement} sel 
     */
    function onCambioSelect(sel) {
        if (!sel) return;
        if (sel.value) sel.classList.add("asignado");
        else sel.classList.remove("asignado");
    }

    /**
     * Descarga el archivo de respaldo `alfas.json`.
     * @param {Array} datos 
     */
    function descargarAlfasJSON(datos) {
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(datos, null, 2));
        const downloadAnchorNode = document.createElement('a');
        downloadAnchorNode.setAttribute("href", dataStr);
        downloadAnchorNode.setAttribute("download", "alfas.json");
        document.body.appendChild(downloadAnchorNode);
        downloadAnchorNode.click();
        downloadAnchorNode.remove();
    }

    /**
     * Guarda la planilla mensual, actualiza los eventos globales en SQLite/IndexedDB y sincroniza con Google Sheets.
     */
    function guardarPlanilla() {
        const empresa = document.getElementById("selEmpresa").value;
        const mes = parseInt(document.getElementById("selMes").value, 10);
        const anio = parseInt(document.getElementById("selAnio").value, 10);
        const clave = clavePlanilla(empresa, mes, anio);
        const datosPreservar = {};

        let eventos = safeParse("eventos", []);
        const mesStr = (mes + 1).toString().padStart(2, '0');
        const prefijoFecha = `${anio}-${mesStr}-`;

        // 1. Quitar eventos previos de esta empresa y mes en el calendario global
        eventos = eventos.filter(ev => {
            const enEsteMes = ev.start && String(ev.start).startsWith(prefijoFecha);
            const deEstaEmpresa = ev.extendedProps && ev.extendedProps.empresa === empresa;
            return !(enEsteMes && deEstaEmpresa);
        });

        // 2. Recorrer la tabla y agregar los nuevos eventos
        const empData = empresas[empresa] || {};
        const selects = document.querySelectorAll(".planilla-table select[data-key]");

        selects.forEach(sel => {
            const valor = sel.value;
            if (valor) {
                datosPreservar[sel.dataset.key] = valor;

                if (valor !== "Feriado") {
                    const [dia, turnoIdx] = sel.dataset.key.split("_");
                    const fechaIso = `${prefijoFecha}${dia.padStart(2, '0')}`;
                    const turnosEmpresa = empData.turnos || [];
                    const turnoStr = turnosEmpresa[parseInt(turnoIdx, 10)];

                    if (turnoStr) {
                        const infoCosto = Calculator.calcularCostoTurno(turnoStr, fechaIso, empData, config);
                        const nuevoEv = {
                            title: `${valor}\n${empresa} (${formatearTurno(turnoStr)})`,
                            start: fechaIso,
                            allDay: true,
                            backgroundColor: Utils.sanitizeColor(coloresPolicia[valor], '#2563eb'),
                            borderColor: 'transparent',
                            extendedProps: {
                                policia: valor,
                                empresa: empresa,
                                turno: turnoStr,
                                cat: infoCosto.cat,
                                cost: infoCosto.cost,
                                h: infoCosto.h,
                                vh: infoCosto.vh,
                                detail: infoCosto.detail
                            }
                        };
                        eventos.push(nuevoEv);
                    }
                }
            }
        });

        if (typeof localStorage !== 'undefined') {
            localStorage.setItem(clave, JSON.stringify(datosPreservar));
        }
        Storage.saveEventos(eventos);
        CloudSync.sincronizarPoliciasCloud(policias);

        descargarAlfasJSON(eventos);

        const btn = document.querySelector("button[onclick='guardarPlanilla()']");
        if (btn) {
            btn.textContent = "✅ Guardado en Base Local y JSON";
            setTimeout(() => btn.textContent = "💾 Guardar", 2500);
        }
    }

    /**
     * Inicializa la pantalla de Precartón.
     */
    function init() {
        if (typeof document === 'undefined') return;
        if (Utils.applyTheme && Utils.getSavedTheme) {
            Utils.applyTheme(Utils.getSavedTheme());
        }
        const hoy = new Date();
        const selMes = document.getElementById("selMes");
        const selAnio = document.getElementById("selAnio");
        if (selMes) selMes.value = hoy.getMonth();
        if (selAnio) selAnio.value = hoy.getFullYear();
        initEmpresas();
        CloudSync.sincronizarPoliciasCloud(policias);
        if (Object.keys(empresas).length > 0) {
            generarPlanilla();
        } else {
            const sub = document.getElementById("subtitulo");
            if (sub) sub.textContent = "No hay empresas registradas en el sistema.";
        }
    }

    if (typeof window !== 'undefined') {
        window.generarPlanilla = generarPlanilla;
        window.guardarPlanilla = guardarPlanilla;
        window.onCambioSelect = onCambioSelect;
        window.filtrarDiaPlanillaMovil = filtrarDiaPlanillaMovil;
        document.addEventListener('DOMContentLoaded', init);
    }

    return {
        clavePlanilla,
        generarSelect,
        generarPlanilla,
        guardarPlanilla
    };
}));
