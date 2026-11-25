/**
 * @file precarton.js
 * @description Controlador modularizado y seguro (Anti-XSS) para la Planilla Mensual de Turnos (Precartón).
 * - Posiciona automáticamente los grupos horarios de la empresa seleccionada.
 * - Visualiza claramente Jerarquía, Apellido y Nombre del policía seleccionado tanto en PC como en el APK móvil.
 * - Genera y descarga el PDF del Precartón en la carpeta de Descargas (Android y Windows).
 * - Permite guardar y cargar un nuevo Precartón (otra empresa) manteniendo múltiples precartones activos y diferenciados en el Calendario.
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

    function mostrarNotificacion(msg, color = "var(--primary)") {
        const notifElem = document.getElementById("notificacion");
        if (!notifElem) return;
        notifElem.style.background = Utils.sanitizeColor(color, "var(--primary)");
        notifElem.textContent = msg;
        notifElem.classList.add("show");
        setTimeout(() => notifElem.classList.remove("show"), 3200);
    }

    function clavePlanilla(empresa, mes, anio) {
        return `planilla_${empresa}_${anio}_${mes}`;
    }

    /**
     * Retorna la etiqueta completa "Jerarquía Apellido Nombre" para un efectivo policial.
     * @param {string} nombrePol 
     * @returns {string}
     */
    function obtenerEtiquetaCompletaPolicia(nombrePol) {
        if (!nombrePol) return "";
        if (nombrePol === "Feriado") return "FERIADO";
        const found = policias.find(p => p.nombre.toLowerCase() === String(nombrePol).toLowerCase());
        if (!found) return String(nombrePol);
        return found.jerarquia ? `${found.jerarquia} ${found.nombre}` : found.nombre;
    }

    function initEmpresas() {
        const sel = document.getElementById("selEmpresa");
        if (!sel) return;
        sel.innerHTML = "";
        Object.keys(empresas).forEach(e => {
            let op = document.createElement("option");
            op.value = e;
            const turnosCount = ((empresas[e] || {}).turnos || []).length;
            op.textContent = `${e} (${turnosCount} turnos)`;
            sel.appendChild(op);
        });
    }

    /**
     * Renderiza la barra de estado de Precartones del mes actual, indicando qué empresas ya tienen
     * turnos cargados y permitiendo saltar a otra empresa con un toque.
     */
    function actualizarBarraPrecartonesMes() {
        const cont = document.getElementById("barraPrecartonesMes");
        const selEmp = document.getElementById("selEmpresa");
        const selMes = document.getElementById("selMes");
        const selAnio = document.getElementById("selAnio");
        if (!cont || !selEmp || !selMes || !selAnio) return;

        const empActual = selEmp.value;
        const mes = parseInt(selMes.value, 10);
        const anio = parseInt(selAnio.value, 10);
        const mesStr = (mes + 1).toString().padStart(2, '0');
        const prefijoFecha = `${anio}-${mesStr}-`;
        const eventos = safeParse("eventos", []);

        let html = `<span style="font-size:0.76rem; font-weight:700; color:var(--text-muted);">Precartones en ${escapeHTML(MESES[mes])} ${escapeHTML(anio)}:</span>`;

        Object.keys(empresas).forEach(empName => {
            const clave = clavePlanilla(empName, mes, anio);
            const planillaLocal = safeParse(clave, {});
            const countLocal = Object.values(planillaLocal).filter(Boolean).length;
            const countCal = eventos.filter(ev =>
                ev.start && String(ev.start).startsWith(prefijoFecha) &&
                ev.extendedProps && ev.extendedProps.empresa === empName
            ).length;
            const totalTurnosCargados = Math.max(countLocal, countCal);
            const isLoaded = totalTurnosCargados > 0;
            const isCurrent = empName === empActual;
            const empColor = Utils.getEmpresaColor ? Utils.getEmpresaColor(empName) : '#2563eb';

            html += `
                <button type="button" class="precarton-chip ${isLoaded ? 'loaded' : ''} ${isCurrent ? 'current' : ''}"
                        style="border-left: 4px solid ${empColor}"
                        onclick="seleccionarEmpresaRapido('${escapeHTML(empName)}')">
                    <span>${isLoaded ? '✅' : '➕'} ${escapeHTML(empName)}</span>
                    <span>(${totalTurnosCargados})</span>
                </button>
            `;
        });

        cont.innerHTML = html;
    }

    function seleccionarEmpresaRapido(empName) {
        const selEmp = document.getElementById("selEmpresa");
        if (!selEmp) return;
        selEmp.value = empName;
        generarPlanilla();
    }

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
     * Genera el selector de policía para una celda del Precartón junto con la etiqueta visible
     * que muestra completo: Jerarquía + Apellido y Nombre en el APK y en PC.
     * @param {string} cellKey 
     * @param {string} valorActual 
     * @returns {string}
     */
    function generarSelect(cellKey, valorActual) {
        const safeKey = escapeHTML(cellKey);
        let opts = `<option value="">— Sin asignar —</option>`;
        policias.forEach(p => {
            const nombre = typeof p === "object" ? p.nombre : String(p);
            const jerarquia = (typeof p === "object" && p.jerarquia) ? `${p.jerarquia} ` : "";
            const etiqueta = `${jerarquia}${nombre}`;
            const isSelected = nombre === valorActual ? 'selected' : '';
            opts += `<option value="${escapeHTML(nombre)}" ${isSelected}>${escapeHTML(etiqueta)}</option>`;
        });
        const isFeriado = valorActual === 'Feriado' ? 'selected' : '';
        opts += `<option value="Feriado" ${isFeriado}>Feriado</option>`;

        const labelCompleta = obtenerEtiquetaCompletaPolicia(valorActual);
        const tagVisibleClass = valorActual ? 'policia-selected-tag visible' : 'policia-selected-tag';

        return `
            <div class="turno-cell-wrap">
                <select data-key="${safeKey}" title="Asignar efectivo al turno" onchange="onCambioSelect(this)">${opts}</select>
                <div class="${tagVisibleClass}" id="tag_${safeKey}">${escapeHTML(labelCompleta)}</div>
            </div>
        `;
    }

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
        if (sub) sub.textContent = `${empresa} — ${MESES[mes] || ''} ${anio} (${turnos.length} grupos horarios)`;
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
                <td>${escapeHTML(DIAS[diaSemana])}</td>
                <td>${escapeHTML(dia)}/${escapeHTML(mesStr)}</td>
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
                td.innerHTML = generarSelect(cellKey, valorGuardado);
                tr.appendChild(td);
            });

            tbody.appendChild(tr);
        }

        document.querySelectorAll(".planilla-table select").forEach(sel => {
            if (sel.value) sel.classList.add("asignado");
        });

        filtrarDiaPlanillaMovil();
        actualizarBarraPrecartonesMes();
    }

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
     * Actualiza en vivo la etiqueta completa de Jerarquía + Apellido y Nombre debajo del selector al cambiar un policía.
     * @param {HTMLSelectElement} sel 
     */
    function onCambioSelect(sel) {
        if (!sel) return;
        if (sel.value) sel.classList.add("asignado");
        else sel.classList.remove("asignado");

        const key = sel.getAttribute("data-key");
        const tagEl = document.getElementById(`tag_${key}`);
        if (tagEl) {
            if (sel.value) {
                tagEl.textContent = obtenerEtiquetaCompletaPolicia(sel.value);
                tagEl.classList.add("visible");
            } else {
                tagEl.textContent = "";
                tagEl.classList.remove("visible");
            }
        }
    }

    /**
     * Persiste el Precartón actual en la base de datos local y en el Calendario global
     * conservando intactos los precartones de las demás empresas.
     * @param {boolean} [silent=false]
     * @returns {{empresa: string, mes: number, anio: number, count: number}}
     */
    function persistirPlanillaActual(silent = false) {
        const empresa = document.getElementById("selEmpresa").value;
        const mes = parseInt(document.getElementById("selMes").value, 10);
        const anio = parseInt(document.getElementById("selAnio").value, 10);
        const clave = clavePlanilla(empresa, mes, anio);
        const datosPreservar = {};

        let eventos = safeParse("eventos", []);
        const mesStr = (mes + 1).toString().padStart(2, '0');
        const prefijoFecha = `${anio}-${mesStr}-`;

        // 1. Quitar únicamente los eventos previos de ESTA empresa en ESTE mes (mantiene todas las demás empresas en el calendario)
        eventos = eventos.filter(ev => {
            const enEsteMes = ev.start && String(ev.start).startsWith(prefijoFecha);
            const deEstaEmpresa = ev.extendedProps && ev.extendedProps.empresa === empresa;
            return !(enEsteMes && deEstaEmpresa);
        });

        // 2. Recorrer la tabla y agregar los nuevos eventos asignados de esta empresa
        const empData = empresas[empresa] || {};
        const selects = document.querySelectorAll(".planilla-table select[data-key]");
        let assignedCount = 0;

        selects.forEach(sel => {
            const valor = sel.value;
            if (valor) {
                datosPreservar[sel.dataset.key] = valor;
                assignedCount++;

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
                            borderColor: Utils.getEmpresaColor ? Utils.getEmpresaColor(empresa) : 'transparent',
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
        actualizarBarraPrecartonesMes();

        if (!silent) {
            mostrarNotificacion(`Precartón de ${empresa} guardado (${assignedCount} turnos sincronizados al Calendario)`, "var(--secondary)");
        }
        return { empresa, mes, anio, count: assignedCount };
    }

    function guardarPlanilla() {
        persistirPlanillaActual(false);
    }

    /**
     * Guarda el Precartón de la empresa actual y posiciona automáticamente la siguiente empresa
     * para poder cargar un nuevo Precartón sin sobrescribir el anterior.
     */
    function guardarYCargarNuevoPrecarton() {
        const res = persistirPlanillaActual(true);
        const listaEmpresas = Object.keys(empresas);
        if (listaEmpresas.length <= 1) {
            mostrarNotificacion(`Precartón de ${res.empresa} guardado`, "var(--secondary)");
            return;
        }

        const idxActual = listaEmpresas.indexOf(res.empresa);
        const idxSiguiente = (idxActual + 1) % listaEmpresas.length;
        const siguienteEmpresa = listaEmpresas[idxSiguiente];

        const selEmp = document.getElementById("selEmpresa");
        if (selEmp) {
            selEmp.value = siguienteEmpresa;
            generarPlanilla();
            mostrarNotificacion(`✅ ${res.empresa} guardado. Listo para cargar nuevo Precartón: ${siguienteEmpresa}`, "var(--primary)");
        }
    }

    /**
     * Genera y descarga el archivo PDF del Precartón actual en la carpeta de Descargas (compatible con Android y Windows).
     */
    function exportarPrecartonPDF() {
        try {
            persistirPlanillaActual(true);
            if (typeof window.jspdf === 'undefined') {
                mostrarNotificacion("La librería jsPDF no está disponible", "var(--danger)");
                return;
            }

            const empresa = document.getElementById("selEmpresa").value;
            const mes = parseInt(document.getElementById("selMes").value, 10);
            const anio = parseInt(document.getElementById("selAnio").value, 10);
            const emp = empresas[empresa] || {};
            const turnos = emp.turnos || [];
            const clave = clavePlanilla(empresa, mes, anio);
            const guardado = safeParse(clave, {});

            const { jsPDF } = window.jspdf;
            const orientacion = turnos.length > 2 ? 'landscape' : 'portrait';
            const doc = new jsPDF({ orientation: orientacion, unit: 'mm', format: 'a4' });

            // Encabezado Institucional del Precartón
            doc.setFontSize(15);
            doc.setFont("helvetica", "bold");
            doc.text(`PRECARTÓN MENSUAL DE SERVICIOS ADICIONALES — ${empresa}`, 14, 15);

            doc.setFontSize(10);
            doc.setFont("helvetica", "normal");
            doc.text(`Período: ${MESES[mes]} ${anio}   |   Cat. Lun-Vie: ${emp.catSemana || 'A'}   |   Cat. Sáb-Dom: ${emp.catFinde || 'AP'}`, 14, 21);

            const metaLine1 = [
                emp.nroServicio ? `N° Serv: ${emp.nroServicio}` : "",
                emp.domicilio ? `Domicilio: ${emp.domicilio}` : "",
                emp.barrio ? `Barrio: ${emp.barrio}` : "",
                emp.telefono ? `Tel: ${emp.telefono}` : ""
            ].filter(Boolean).join("   |   ");

            const metaLine2 = [
                emp.referente ? `Referente: ${emp.referente} (${emp.telReferente || '-'})` : "",
                emp.policiaEnc ? `Policía Encargado: ${emp.policiaEnc} (${emp.telPoliciaEnc || '-'})` : ""
            ].filter(Boolean).join("   |   ");

            let startTableY = 26;
            doc.setFontSize(8.5);
            if (metaLine1) {
                doc.text(metaLine1, 14, startTableY);
                startTableY += 5;
            }
            if (metaLine2) {
                doc.text(metaLine2, 14, startTableY);
                startTableY += 6;
            }

            // Construir cabecera y filas de la tabla mensual con Jerarquía + Apellido y Nombre
            const headRow = ['Día', 'Fecha', ...turnos.map(t => formatearTurno(t))];
            const bodyRows = [];
            const diasEnMes = new Date(anio, mes + 1, 0).getDate();
            const mesStr = (mes + 1).toString().padStart(2, '0');

            for (let dia = 1; dia <= diasEnMes; dia++) {
                const fecha = new Date(anio, mes, dia);
                const diaSemana = fecha.getDay();
                const rowCells = [DIAS[diaSemana], `${dia.toString().padStart(2, '0')}/${mesStr}/${anio}`];

                turnos.forEach((_, idx) => {
                    const cellKey = `${dia}_${idx}`;
                    const selEl = document.querySelector(`.planilla-table select[data-key="${cellKey}"]`);
                    const val = selEl ? selEl.value : (guardado[cellKey] || "");
                    rowCells.push(val ? obtenerEtiquetaCompletaPolicia(val) : "—");
                });
                bodyRows.push(rowCells);
            }

            doc.autoTable({
                startY: startTableY,
                head: [headRow],
                body: bodyRows,
                theme: 'grid',
                styles: { fontSize: 7.5, cellPadding: 1.8, valign: 'middle', halign: 'center' },
                headStyles: { fillColor: [37, 99, 235], textColor: 255, fontStyle: 'bold' },
                alternateRowStyles: { fillColor: [248, 250, 252] }
            });

            const safeEmpFile = empresa.replace(/[^a-zA-Z0-9_-]/g, '_');
            const fileName = `Precarton_${safeEmpFile}_${MESES[mes]}_${anio}.pdf`;
            doc.save(fileName);
            mostrarNotificacion(`PDF guardado en Descargas: ${fileName}`, "var(--secondary)");
        } catch (err) {
            console.error("Error generando PDF de Precartón:", err);
            mostrarNotificacion("Error al generar el PDF del Precartón", "var(--danger)");
        }
    }

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
        window.guardarYCargarNuevoPrecarton = guardarYCargarNuevoPrecarton;
        window.exportarPrecartonPDF = exportarPrecartonPDF;
        window.seleccionarEmpresaRapido = seleccionarEmpresaRapido;
        window.onCambioSelect = onCambioSelect;
        window.filtrarDiaPlanillaMovil = filtrarDiaPlanillaMovil;
        document.addEventListener('DOMContentLoaded', init);
    }

    return {
        clavePlanilla,
        obtenerEtiquetaCompletaPolicia,
        generarSelect,
        generarPlanilla,
        guardarPlanilla,
        guardarYCargarNuevoPrecarton,
        exportarPrecartonPDF
    };
}));
