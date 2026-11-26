/**
 * @file precarton.js
 * @description Controlador modularizado y seguro (Anti-XSS) para la Planilla Mensual de Turnos (Precartón).
 * - Botones de precartones en grilla de 4 por línea (máximo 2 líneas).
 * - Selector múltiple de días (1..31) para filtrar qué días mostrar en pantalla y exportar al PDF.
 * - Exportación de PDF siempre en formato VERTICAL A4 ('portrait').
 * - Captura de imagen del Precartón mediante Cámara o Galería de Fotos identificada con un nombre personalizado.
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
    const FOTOS_PRECARTON_KEY = 'alfa_fotos_precarton_guardadas';

    const Utils = (typeof window !== 'undefined' && window.AlfaUtils) ? window.AlfaUtils : require('./utils/helpers.js');
    const Calculator = (typeof window !== 'undefined' && window.AlfaCalculator) ? window.AlfaCalculator : require('./services/calculator.js');
    const Storage = (typeof window !== 'undefined' && window.AlfaStorage) ? window.AlfaStorage : require('./services/storage.js');
    const CloudSync = (typeof window !== 'undefined' && window.AlfaCloudSync) ? window.AlfaCloudSync : require('./services/cloudSync.js');
    const PlatformPC = (typeof window !== 'undefined' && window.AlfaPlatformPC) ? window.AlfaPlatformPC : require('./services/platformPc.js');
    const PlatformAPK = (typeof window !== 'undefined' && window.AlfaPlatformAPK) ? window.AlfaPlatformAPK : require('./services/platformApk.js');

    const escapeHTML = Utils.escapeHTML;
    const formatearTurno = Utils.formatearTurno;

    const state = Storage.initStorage(Utils);
    let policias = state.policias;
    let empresas = state.empresas;
    let config = state.config;
    let coloresPolicia = state.coloresPolicia;
    let _ultimoPdfDoc = null;
    let _ultimoPdfFileName = "";
    let _ultimoPdfNativeUri = "";
    let _ultimoPdfBlobUrl = null;
    let _diasSeleccionadosSet = new Set(); // Conjunto de días seleccionados para filtrar y exportar a PDF (vacío = todos)
    let _fotoTemporalDataUrl = "";

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
     * IMAGEN 4: Renderiza los botones de Precartones en una grilla de 4 por línea (máximo 2 líneas).
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

        let html = `<span class="precarton-loaded-label">Precartones en ${escapeHTML(MESES[mes])} ${escapeHTML(anio)} (4 por línea):</span>`;
        html += `<div class="precarton-loaded-grid-4col">`;

        Object.keys(empresas).slice(0, 8).forEach(empName => {
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

        html += `</div>`;
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

    // =========================================================================
    // SELECTOR MÚLTIPLE DE DÍAS (PARA FILTRAR VISTA Y EXPORTAR A PDF VERTICAL A4)
    // =========================================================================

    function renderizarSelectorDiasMultiples(diasEnMes) {
        const grid = document.getElementById("grillaDiasSeleccionables");
        if (!grid) return;
        grid.innerHTML = "";
        for (let d = 1; d <= diasEnMes; d++) {
            const isSelected = _diasSeleccionadosSet.size === 0 || _diasSeleccionadosSet.has(d);
            const btn = document.createElement("button");
            btn.type = "button";
            btn.className = `day-pill-chk ${isSelected ? 'selected' : ''}`;
            btn.setAttribute("data-day-num", String(d));
            btn.textContent = String(d);
            btn.onclick = function () {
                toggleDiaSeleccionadoPrecarton(d, diasEnMes);
            };
            grid.appendChild(btn);
        }
        actualizarTextoBotonSelectorDias(diasEnMes);
    }

    function togglePanelSelectorDias() {
        const panel = document.getElementById("panelSelectorDiasMultiples");
        if (panel) panel.classList.toggle("open");
    }

    function toggleDiaSeleccionadoPrecarton(diaNum, diasEnMes) {
        // Si estaba en modo "Todos" (Set vacío), al tocar un día pasamos a seleccionar solo ese día
        if (_diasSeleccionadosSet.size === 0) {
            _diasSeleccionadosSet.add(diaNum);
        } else if (_diasSeleccionadosSet.has(diaNum)) {
            _diasSeleccionadosSet.delete(diaNum);
        } else {
            _diasSeleccionadosSet.add(diaNum);
        }
        renderizarSelectorDiasMultiples(diasEnMes);
        aplicarFiltroDiasSeleccionados();
    }

    function seleccionarTodosLosDiasPrecarton() {
        _diasSeleccionadosSet.clear();
        const rows = document.querySelectorAll("#cuerpoPlanilla tr");
        renderizarSelectorDiasMultiples(rows.length || 31);
        aplicarFiltroDiasSeleccionados();
    }

    function limpiarSeleccionDiasPrecarton() {
        _diasSeleccionadosSet.clear();
        _diasSeleccionadosSet.add(1);
        const rows = document.querySelectorAll("#cuerpoPlanilla tr");
        renderizarSelectorDiasMultiples(rows.length || 31);
        aplicarFiltroDiasSeleccionados();
    }

    function actualizarTextoBotonSelectorDias(diasEnMes) {
        const btn = document.getElementById("btnToggleSelectorDias");
        if (!btn) return;
        if (_diasSeleccionadosSet.size === 0 || _diasSeleccionadosSet.size >= diasEnMes) {
            btn.textContent = `📅 Todos los días (${diasEnMes})`;
        } else {
            const ordenados = Array.from(_diasSeleccionadosSet).sort((a, b) => a - b);
            const preview = ordenados.length <= 5 ? ordenados.join(", ") : `${ordenados.length} días elegidos`;
            btn.textContent = `📅 Días: ${preview}`;
        }
    }

    function aplicarFiltroDiasSeleccionados() {
        const rows = document.querySelectorAll("#cuerpoPlanilla tr");
        rows.forEach(r => {
            const diaNum = parseInt(r.getAttribute("data-dia"), 10);
            if (_diasSeleccionadosSet.size === 0 || _diasSeleccionadosSet.has(diaNum)) {
                r.style.display = "";
            } else {
                r.style.display = "none";
            }
        });
    }

    /**
     * verifica si un día del mes debe incluirse en la exportación a PDF según la selección activa.
     * @param {number} diaNum 
     * @returns {boolean}
     */
    function isDiaIncluidoEnExportacion(diaNum) {
        return _diasSeleccionadosSet.size === 0 || _diasSeleccionadosSet.has(Number(diaNum));
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

        renderizarSelectorDiasMultiples(diasEnMes);
        aplicarFiltroDiasSeleccionados();
        actualizarBarraPrecartonesMes();
    }

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

    // =========================================================================
    // CAPTURA DE FOTO DEL PRECARTÓN (CÁMARA O GALERÍA) CON NOMBRE PERSONALIZADO
    // =========================================================================

    function abrirModalCapturaFotoPrecarton(modo) {
        const inputId = modo === 'camera' ? 'inputCamaraPrecarton' : 'inputGaleriaPrecarton';
        const inputEl = document.getElementById(inputId);
        if (inputEl) inputEl.click();
    }

    function procesarImagenPrecartonSeleccionada(evt) {
        const file = evt && evt.target && evt.target.files ? evt.target.files[0] : null;
        if (!file) return;

        const reader = new FileReader();
        reader.onload = function (e) {
            _fotoTemporalDataUrl = e.target.result;
            const previewImg = document.getElementById("previewFotoPrecartonImg");
            if (previewImg) previewImg.src = _fotoTemporalDataUrl;

            const emp = document.getElementById("selEmpresa") ? document.getElementById("selEmpresa").value : "Precarton";
            const mesIdx = document.getElementById("selMes") ? parseInt(document.getElementById("selMes").value, 10) : 0;
            const anio = document.getElementById("selAnio") ? document.getElementById("selAnio").value : "2026";
            const inputNombre = document.getElementById("inputNombrePersonalizadoFoto");
            if (inputNombre) {
                inputNombre.value = `Precartón ${emp} - ${MESES[mesIdx] || ''} ${anio}`;
            }

            const modal = document.getElementById("modalNombreFotoPrecarton");
            if (modal) modal.style.display = "flex";
        };
        reader.readAsDataURL(file);
        evt.target.value = "";
    }

    function cerrarModalFotoPrecarton() {
        const modal = document.getElementById("modalNombreFotoPrecarton");
        if (modal) modal.style.display = "none";
        _fotoTemporalDataUrl = "";
    }

    async function guardarFotoPrecartonConNombre() {
        const inputNombre = document.getElementById("inputNombrePersonalizadoFoto");
        const nombrePersonalizado = (inputNombre ? inputNombre.value.trim() : "") || `Precartón_${Date.now()}`;
        if (!_fotoTemporalDataUrl) {
            return mostrarNotificacion("Seleccione o capture una imagen primero", "var(--danger)");
        }

        const fotosList = safeParse(FOTOS_PRECARTON_KEY, []);
        const nuevoItem = {
            id: `foto_${Date.now()}`,
            nombre: nombrePersonalizado,
            empresa: document.getElementById("selEmpresa") ? document.getElementById("selEmpresa").value : "",
            fechaCaptura: new Date().toLocaleString('es-AR'),
            dataUrl: _fotoTemporalDataUrl
        };
        fotosList.unshift(nuevoItem);
        if (typeof localStorage !== 'undefined') {
            try {
                localStorage.setItem(FOTOS_PRECARTON_KEY, JSON.stringify(fotosList.slice(0, 15)));
            } catch (_) {}
        }

        // Además guardarla en el sistema de archivos nativo de Android si corre en el APK
        const safeFileName = `${nombrePersonalizado.replace(/[^a-zA-Z0-9_-]/g, '_')}.jpg`;
        const ctx = Utils.detectPlatformContext ? Utils.detectPlatformContext() : { isNativeAPK: false };
        if (ctx.isNativeAPK && PlatformAPK && typeof PlatformAPK.writeNativeFileAndroid === 'function') {
            await PlatformAPK.writeNativeFileAndroid(safeFileName, _fotoTemporalDataUrl);
        }

        cerrarModalFotoPrecarton();
        renderizarGaleriaFotosPrecarton();
        mostrarNotificacion(`📸 Imagen "${nombrePersonalizado}" guardada con éxito`, "var(--secondary)");
    }

    function eliminarFotoPrecartonGuardada(fotoId) {
        const fotosList = safeParse(FOTOS_PRECARTON_KEY, []).filter(f => f.id !== fotoId);
        if (typeof localStorage !== 'undefined') {
            localStorage.setItem(FOTOS_PRECARTON_KEY, JSON.stringify(fotosList));
        }
        renderizarGaleriaFotosPrecarton();
    }

    function renderizarGaleriaFotosPrecarton() {
        const card = document.getElementById("cardGaleriaFotosPrecarton");
        const cont = document.getElementById("contenedorFotosPrecarton");
        if (!card || !cont) return;

        const fotosList = safeParse(FOTOS_PRECARTON_KEY, []);
        if (!Array.isArray(fotosList) || fotosList.length === 0) {
            card.classList.add("display-none");
            cont.innerHTML = "";
            return;
        }

        card.classList.remove("display-none");
        cont.innerHTML = fotosList.map(f => `
            <div class="captura-item-card">
                <img src="${escapeHTML(f.dataUrl)}" alt="${escapeHTML(f.nombre)}" onclick="window.open('${escapeHTML(f.dataUrl)}', '_blank')">
                <div class="captura-item-meta">
                    <strong>${escapeHTML(f.nombre)}</strong>
                    <span class="font-muted-sub">${escapeHTML(f.fechaCaptura)}</span>
                    <button type="button" class="btn-danger" style="min-height:28px !important; padding:2px 6px !important; font-size:0.68rem !important;" onclick="eliminarFotoPrecartonGuardada('${escapeHTML(f.id)}')">🗑️ Eliminar</button>
                </div>
            </div>
        `).join("");
    }

    function persistirPlanillaActual(silent = false) {
        const empresa = document.getElementById("selEmpresa").value;
        const mes = parseInt(document.getElementById("selMes").value, 10);
        const anio = parseInt(document.getElementById("selAnio").value, 10);
        const clave = clavePlanilla(empresa, mes, anio);
        const datosPreservar = {};

        let eventos = safeParse("eventos", []);
        const mesStr = (mes + 1).toString().padStart(2, '0');
        const prefijoFecha = `${anio}-${mesStr}-`;

        eventos = eventos.filter(ev => {
            const enEsteMes = ev.start && String(ev.start).startsWith(prefijoFecha);
            const deEstaEmpresa = ev.extendedProps && ev.extendedProps.empresa === empresa;
            return !(enEsteMes && deEstaEmpresa);
        });

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
     * Genera el PDF del Precartón SIEMPRE EN VERTICAL A4 ('portrait', 'a4')
     * exportando únicamente los días seleccionados en el filtro múltiple de días (o todos si no se filtró).
     */
    async function exportarPrecartonPDF() {
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
            // Requerimiento estricto: PDF SIEMPRE en Vertical A4 ('portrait', format: 'a4')
            const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

            doc.setFontSize(13);
            doc.setFont("helvetica", "bold");
            doc.text(`PRECARTÓN MENSUAL DE SERVICIOS ADICIONALES — ${empresa}`, 12, 14);

            doc.setFontSize(9);
            doc.setFont("helvetica", "normal");
            doc.text(`Período: ${MESES[mes]} ${anio}   |   Cat. Lun-Vie: ${emp.catSemana || 'A'}   |   Cat. Sáb-Dom: ${emp.catFinde || 'AP'}`, 12, 19.5);

            const metaLine1 = [
                emp.nroServicio ? `N° Serv: ${emp.nroServicio}` : "",
                emp.domicilio ? `Domicilio: ${emp.domicilio}` : "",
                emp.barrio ? `Barrio: ${emp.barrio}` : "",
                emp.telefono ? `Tel: ${emp.telefono}` : ""
            ].filter(Boolean).join(" | ");

            const metaLine2 = [
                emp.referente ? `Referente: ${emp.referente} (${emp.telReferente || '-'})` : "",
                emp.policiaEnc ? `Policía Encargado: ${emp.policiaEnc} (${emp.telPoliciaEnc || '-'})` : ""
            ].filter(Boolean).join(" | ");

            let startTableY = 24;
            doc.setFontSize(7.8);
            if (metaLine1) {
                doc.text(metaLine1, 12, startTableY);
                startTableY += 4.2;
            }
            if (metaLine2) {
                doc.text(metaLine2, 12, startTableY);
                startTableY += 5;
            }

            const headRow = ['Día', 'Fecha', ...turnos.map(t => formatearTurno(t))];
            const bodyRows = [];
            const diasEnMes = new Date(anio, mes + 1, 0).getDate();
            const mesStr = (mes + 1).toString().padStart(2, '0');

            for (let dia = 1; dia <= diasEnMes; dia++) {
                // Filtrar por los días seleccionados por el usuario
                if (!isDiaIncluidoEnExportacion(dia)) continue;

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
                margin: { left: 10, right: 10 },
                head: [headRow],
                body: bodyRows,
                theme: 'grid',
                styles: { fontSize: turnos.length >= 4 ? 6.5 : 7.5, cellPadding: 1.5, valign: 'middle', halign: 'center', overflow: 'linebreak' },
                headStyles: { fillColor: [37, 99, 235], textColor: 255, fontStyle: 'bold' },
                alternateRowStyles: { fillColor: [248, 250, 252] }
            });

            const safeEmpFile = empresa.replace(/[^a-zA-Z0-9_-]/g, '_');
            const fileName = `Precarton_${safeEmpFile}_${MESES[mes]}_${anio}.pdf`;
            _ultimoPdfDoc = doc;
            _ultimoPdfFileName = fileName;

            const ctx = Utils.detectPlatformContext ? Utils.detectPlatformContext() : { isNativeAPK: false, isMobileViewport: false };
            let ubicacionGuardado = "Descargas";

            if (ctx.isNativeAPK || ctx.isMobileViewport) {
                const apkRes = await PlatformAPK.savePdfFileAPK(doc, fileName);
                _ultimoPdfNativeUri = apkRes.uri || "";
                ubicacionGuardado = apkRes.directory || "Documentos / Descargas Android";
            } else {
                const pcRes = await PlatformPC.savePdfFilePC(doc, fileName);
                if (_ultimoPdfBlobUrl) URL.revokeObjectURL(_ultimoPdfBlobUrl);
                _ultimoPdfBlobUrl = pcRes.blobUrl;
                ubicacionGuardado = pcRes.path;
            }

            abrirVisorPDFAutomatico({
                fileName,
                empresa,
                periodo: `${MESES[mes]} ${anio} (${bodyRows.length} días incluidos — Formato Vertical A4)`,
                ubicacionGuardado,
                metaLine1,
                metaLine2,
                headRow,
                bodyRows,
                blobUrl: _ultimoPdfBlobUrl
            });

            mostrarNotificacion(`PDF Vertical A4 guardado en ${ubicacionGuardado}`, "var(--secondary)");
        } catch (err) {
            console.error("Error generando PDF de Precartón:", err);
            mostrarNotificacion("Error al generar el PDF del Precartón", "var(--danger)");
        }
    }

    function abrirVisorPDFAutomatico({ fileName, empresa, periodo, ubicacionGuardado, metaLine1, metaLine2, headRow, bodyRows, blobUrl }) {
        const modal = document.getElementById("modalVisorPDFPrecarton");
        const titulo = document.getElementById("tituloVisorPDF");
        const subtitulo = document.getElementById("subtituloVisorPDF");
        const cuerpo = document.getElementById("cuerpoVisorPDFPrecarton");
        if (!modal || !cuerpo) return;

        if (titulo) titulo.textContent = `📄 ${fileName}`;
        if (subtitulo) subtitulo.textContent = `✅ Guardado en: ${ubicacionGuardado || 'Descargas'} (Vertical A4)`;

        const platform = Utils.detectPlatformContext ? Utils.detectPlatformContext() : { isMobileViewport: true };

        let tableHtml = `
            <div style="background:#fff; max-width:210mm; margin:0 auto; padding:12px; border-radius:6px; box-shadow:0 2px 8px rgba(0,0,0,0.1); font-family:Inter,sans-serif;">
                <div style="border-bottom:2px solid #2563eb; padding-bottom:8px; margin-bottom:10px;">
                    <h4 style="margin:0; color:#1e293b; font-size:0.95rem;">PRECARTÓN MENSUAL DE SERVICIOS ADICIONALES — ${escapeHTML(empresa)}</h4>
                    <div style="font-size:0.76rem; color:#475569; margin-top:3px;"><b>Período:</b> ${escapeHTML(periodo)}</div>
                    ${metaLine1 ? `<div style="font-size:0.7rem; color:#64748b; margin-top:2px;">${escapeHTML(metaLine1)}</div>` : ''}
                    ${metaLine2 ? `<div style="font-size:0.7rem; color:#64748b; margin-top:2px;">${escapeHTML(metaLine2)}</div>` : ''}
                </div>
                <div style="overflow-x:auto;">
                    <table style="width:100%; border-collapse:collapse; font-size:0.7rem; text-align:center;">
                        <thead>
                            <tr>
                                ${headRow.map(h => `<th style="background:#2563eb; color:#fff; padding:6px 4px; border:1px solid #cbd5e1;">${escapeHTML(h)}</th>`).join('')}
                            </tr>
                        </thead>
                        <tbody>
                            ${bodyRows.map((r, rIdx) => `
                                <tr style="background:${rIdx % 2 === 0 ? '#ffffff' : '#f8fafc'};">
                                    ${r.map((cell, cIdx) => `<td style="padding:5px 4px; border:1px solid #cbd5e1; font-weight:${cIdx < 2 || cell !== '—' ? '600' : '400'}; color:#0f172a;">${escapeHTML(cell)}</td>`).join('')}
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
        `;

        if (!platform.isMobileViewport && blobUrl) {
            tableHtml = `
                <iframe src="${escapeHTML(blobUrl)}" style="width:100%; height:440px; border:1px solid #cbd5e1; border-radius:6px; margin-bottom:12px;" title="Visor PDF Vertical A4"></iframe>
            ` + tableHtml;
        }

        cuerpo.innerHTML = tableHtml;
        modal.style.display = "flex";
    }

    function cerrarVisorPDFPrecarton() {
        const modal = document.getElementById("modalVisorPDFPrecarton");
        if (modal) modal.style.display = "none";
    }

    async function compartirUltimoPDFPrecarton() {
        if (!_ultimoPdfDoc) {
            return mostrarNotificacion("Primero genere el PDF", "var(--warning)");
        }
        try {
            const ctx = Utils.detectPlatformContext ? Utils.detectPlatformContext() : { isNativeAPK: false, isMobileViewport: false };
            if (ctx.isNativeAPK || ctx.isMobileViewport) {
                const ok = await PlatformAPK.sharePdfFileAPK(_ultimoPdfDoc, _ultimoPdfFileName, _ultimoPdfNativeUri);
                if (ok) {
                    mostrarNotificacion("Menú nativo de Android abierto para compartir/guardar PDF", "var(--secondary)");
                } else {
                    mostrarNotificacion("PDF guardado en Documentos / Descargas del dispositivo", "var(--secondary)");
                }
            } else {
                await PlatformPC.sharePdfFilePC(_ultimoPdfDoc, _ultimoPdfFileName, _ultimoPdfBlobUrl);
                mostrarNotificacion("PDF abierto en Windows PC", "var(--secondary)");
            }
        } catch (err) {
            if (err && (err.name === 'AbortError' || String(err.message || '').includes('canceled'))) return;
            console.error("Error compartiendo PDF:", err);
            mostrarNotificacion("El PDF ya se encuentra guardado en su dispositivo", "var(--secondary)");
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
        renderizarGaleriaFotosPrecarton();
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
        window.cerrarVisorPDFPrecarton = cerrarVisorPDFPrecarton;
        window.compartirUltimoPDFPrecarton = compartirUltimoPDFPrecarton;
        window.seleccionarEmpresaRapido = seleccionarEmpresaRapido;
        window.onCambioSelect = onCambioSelect;
        window.togglePanelSelectorDias = togglePanelSelectorDias;
        window.seleccionarTodosLosDiasPrecarton = seleccionarTodosLosDiasPrecarton;
        window.limpiarSeleccionDiasPrecarton = limpiarSeleccionDiasPrecarton;
        window.abrirModalCapturaFotoPrecarton = abrirModalCapturaFotoPrecarton;
        window.procesarImagenPrecartonSeleccionada = procesarImagenPrecartonSeleccionada;
        window.cerrarModalFotoPrecarton = cerrarModalFotoPrecarton;
        window.guardarFotoPrecartonConNombre = guardarFotoPrecartonConNombre;
        window.eliminarFotoPrecartonGuardada = eliminarFotoPrecartonGuardada;
        document.addEventListener('DOMContentLoaded', init);
    }

    return {
        clavePlanilla,
        obtenerEtiquetaCompletaPolicia,
        generarSelect,
        generarPlanilla,
        guardarPlanilla,
        guardarYCargarNuevoPrecarton,
        exportarPrecartonPDF,
        cerrarVisorPDFPrecarton,
        isDiaIncluidoEnExportacion,
        toggleDiaSeleccionadoPrecarton
    };
}));
