/**
 * @file configuraciones.js
 * @description Controlador modular de la página dedicada `Configuraciones.html`.
 * Gestiona:
 *  1. Temas Visuales (Tema Claro Original y Tema Oscuro) + Selector de Portada de Inicio (Portada 1 y Portada 2).
 *  2. Actualización de Montos (Tarifas en grilla de 2 por línea) con recálculo automático.
 *  3. Base de Datos Local, Vinculación con Correo Gmail (creación de archivo Google Sheets en la cuenta activa)
 *     y activación de Notificaciones (lectura 3 veces al día + 2 alertas 1 día antes del servicio).
 *  4. Gestión de Policías y Empresas.
 */

(function (root, factory) {
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = factory();
    } else {
        root.AlfaConfiguraciones = factory();
    }
}(typeof self !== 'undefined' ? self : this, function () {

    const Utils = (typeof window !== 'undefined' && window.AlfaUtils) ? window.AlfaUtils : require('./utils/helpers.js');
    const Calculator = (typeof window !== 'undefined' && window.AlfaCalculator) ? window.AlfaCalculator : require('./services/calculator.js');
    const Database = (typeof window !== 'undefined' && window.AlfaDatabase) ? window.AlfaDatabase : require('./services/database.js');
    const Storage = (typeof window !== 'undefined' && window.AlfaStorage) ? window.AlfaStorage : require('./services/storage.js');
    const CloudSync = (typeof window !== 'undefined' && window.AlfaCloudSync) ? window.AlfaCloudSync : require('./services/cloudSync.js');
    const Notifications = (typeof window !== 'undefined' && window.AlfaNotifications) ? window.AlfaNotifications : require('./services/notifications.js');

    const escapeHTML = Utils.escapeHTML;
    const sanitizeColor = Utils.sanitizeColor;
    const CATEGORIAS = Storage.CATEGORIAS;

    const initialState = Storage.initStorage(Utils);
    let config = initialState.config;
    let policias = initialState.policias;
    let empresas = initialState.empresas;
    let coloresPolicia = initialState.coloresPolicia;
    let _editandoPolicia = null;

    function safeParse(key, fallback) {
        return Utils.safeParse(typeof localStorage !== 'undefined' ? localStorage : {}, key, fallback);
    }

    function mostrarNotificacion(msg, color = "var(--primary)") {
        const notifElem = document.getElementById("notificacion");
        if (!notifElem) return;
        notifElem.style.background = sanitizeColor(color, "var(--primary)");
        notifElem.textContent = msg;
        notifElem.classList.add("show");
        setTimeout(() => notifElem.classList.remove("show"), 3500);
    }

    // =========================================================================
    // 1. GESTIÓN DE TEMAS VISUALES Y PORTADAS DE INICIO
    // =========================================================================

    function seleccionarTemaApp(themeName) {
        const applied = Utils.applyTheme(themeName);
        actualizarBotonesTemaUI(applied);
        const nombresTema = {
            light: "Tema Claro Original",
            dark: "Tema Oscuro"
        };
        mostrarNotificacion(`Tema aplicado: ${nombresTema[applied] || applied}`, "var(--primary)");
    }

    function actualizarBotonesTemaUI(activeTheme) {
        const btns = document.querySelectorAll(".theme-option-btn");
        btns.forEach(btn => {
            const isMatch = btn.getAttribute("data-theme-val") === activeTheme;
            btn.classList.toggle("active", isMatch);
        });
    }

    function seleccionarPortadaApp(coverId) {
        const chosen = Utils.setSplashCover(coverId);
        actualizarTarjetasPortadaUI(chosen.id);
        mostrarNotificacion(`Portada de inicio seleccionada: ${chosen.nombre}`, "var(--secondary)");
    }

    function actualizarTarjetasPortadaUI(activeCoverId) {
        const cards = document.querySelectorAll(".splash-option-card");
        cards.forEach(card => {
            const isMatch = card.getAttribute("data-splash-id") === activeCoverId;
            card.classList.toggle("active", isMatch);
        });
    }

    function previsualizarPortadaActiva() {
        const activeId = Utils.getSavedSplashCover();
        const coverObj = Utils.AVAILABLE_SPLASH_COVERS[activeId] || Utils.AVAILABLE_SPLASH_COVERS.portada_1;
        const overlay = document.getElementById("splashPreviewOverlay");
        const img = document.getElementById("splashPreviewImg");
        if (img) img.src = coverObj.src;
        if (overlay) overlay.classList.remove("display-none");
    }

    function cerrarPreviewPortada() {
        const overlay = document.getElementById("splashPreviewOverlay");
        if (overlay) overlay.classList.add("display-none");
    }

    /**
     * Abre la sección numerada seleccionada (1 a 5) y contrae automáticamente las demás secciones.
     * @param {number|string} sectionNumber - Número de la sección a expandir.
     */
    function toggleSeccionConfig(sectionNumber) {
        const targetStr = String(sectionNumber);
        const cards = document.querySelectorAll(".accordion-card[data-acc-section]");
        cards.forEach(card => {
            const sec = card.getAttribute("data-acc-section");
            const btn = card.querySelector(".accordion-trigger-btn");
            const chev = card.querySelector(".accordion-chevron");
            if (sec === targetStr) {
                const isAlreadyActive = card.classList.contains("active");
                card.classList.toggle("active", !isAlreadyActive);
                if (btn) btn.setAttribute("aria-expanded", !isAlreadyActive ? "true" : "false");
                if (chev) chev.textContent = !isAlreadyActive ? "▼" : "▶";
            } else {
                card.classList.remove("active");
                if (btn) btn.setAttribute("aria-expanded", "false");
                if (chev) chev.textContent = "▶";
            }
        });
    }

    // =========================================================================
    // 2. ACTUALIZACIÓN DE MONTOS (TARIFAS) Y RECÁLCULO DE EVENTOS
    // =========================================================================

    function initInputsTarifas() {
        const container = document.getElementById("panelCostos");
        if (!container) return;
        container.innerHTML = "";
        CATEGORIAS.forEach(categoriaKey => {
            const safeKey = escapeHTML(categoriaKey);
            const safeVal = Number(config[categoriaKey]) || 0;
            const group = document.createElement("div");
            group.className = "form-group margin-0";
            group.innerHTML = `
                <label for="costo_${safeKey}">Cat. ${safeKey}</label>
                <input type="number" id="costo_${safeKey}" value="${safeVal}" step="0.01" inputmode="decimal">
            `;
            container.appendChild(group);
        });
    }

    function guardarConfiguracionTarifas() {
        CATEGORIAS.forEach(categoriaKey => {
            const inputElem = document.getElementById(`costo_${categoriaKey}`);
            if (inputElem) {
                const val = parseFloat(inputElem.value);
                config[categoriaKey] = (Number.isFinite(val) && val >= 0) ? val : 0;
            }
        });
        Storage.saveConfig(config);
        recalcularEventosGuardados();
        mostrarNotificacion("Montos actualizados y servicios recalculados", "var(--secondary)");
        CloudSync.sincronizarTarifasCloud(config).then(() => actualizarEstadoBaseDatosUI());
    }

    function recalcularEventosGuardados() {
        const evs = safeParse("eventos", []);
        if (!Array.isArray(evs) || evs.length === 0) return;

        evs.forEach(ev => {
            const props = ev.extendedProps || {};
            const fechaStr = String(ev.start || "").split("T")[0];
            if (props.turno && props.empresa && fechaStr && empresas[props.empresa]) {
                const nuevoCosto = Calculator.calcularCostoTurno(props.turno, fechaStr, empresas[props.empresa], config);
                if (!props.cat || props.cat === nuevoCosto.cat) {
                    props.cost = nuevoCosto.cost;
                    props.vh = nuevoCosto.vh;
                    props.detail = nuevoCosto.detail;
                } else if (config[props.cat]) {
                    const vh = config[props.cat];
                    props.vh = vh;
                    props.cost = vh * (Number(props.h) || 8);
                }
            }
        });
        Storage.saveEventos(evs);
    }

    // =========================================================================
    // 3. VINCULACIÓN CON CORREO GMAIL Y NOTIFICACIONES AUTOMÁTICAS
    // =========================================================================

    function cargarEstadoCuentaGmailUI() {
        const acc = CloudSync.getLinkedGmailAccount ? CloudSync.getLinkedGmailAccount() : null;
        const inputEmail = document.getElementById("inputGmailCuenta");
        const selTitular = document.getElementById("selPoliciaTitular");
        const banner = document.getElementById("gmailCuentaActivaBanner");
        const verifyBox = document.getElementById("gmailSheetVerifyBox");
        const lblEstructura = document.getElementById("lblEstadoEstructuraSheet");
        const lblEmail = document.getElementById("lblGmailVinculado");
        const lblSheet = document.getElementById("lblSheetVinculada");
        const btnDesvincular = document.getElementById("btnDesvincularGmail");

        if (selTitular) {
            selTitular.innerHTML = `<option value="">— Todos los efectivos —</option>`;
            policias.forEach(p => {
                const op = document.createElement("option");
                op.value = p.nombre;
                op.textContent = p.jerarquia ? `${p.jerarquia} ${p.nombre}` : p.nombre;
                selTitular.appendChild(op);
            });
        }

        if (acc && acc.email) {
            const sheetTitle = acc.sheetName || `Web_Alfas_2026_${acc.email.split('@')[0]}`;
            if (inputEmail) inputEmail.value = acc.email;
            if (selTitular && acc.policiaTitular) selTitular.value = acc.policiaTitular;
            if (lblEmail) lblEmail.textContent = acc.email;
            if (lblSheet) lblSheet.textContent = sheetTitle;
            if (banner) banner.style.display = "block";
            if (btnDesvincular) btnDesvincular.classList.remove("display-none");
            if (verifyBox) {
                verifyBox.style.display = "block";
                const tabsStr = (acc.tabsCreated && acc.tabsCreated.length > 0)
                    ? acc.tabsCreated.join(", ")
                    : "servicios, POLICIA, EMPRESAS, TARIFAS";
                if (lblEstructura) {
                    lblEstructura.textContent = `🟢 Estado del Archivo "${sheetTitle}": ACTIVO — Estructura creada y verificada (${tabsStr})`;
                }
            }
        } else {
            if (banner) banner.style.display = "none";
            if (verifyBox) verifyBox.style.display = "none";
            if (btnDesvincular) btnDesvincular.classList.add("display-none");
        }
    }

    async function verificarYCrearEstructuraSheetGmail() {
        const inputEmail = document.getElementById("inputGmailCuenta");
        const selTitular = document.getElementById("selPoliciaTitular");
        const email = inputEmail ? inputEmail.value.trim() : "";
        const policiaTitular = selTitular ? selTitular.value : "";

        if (!Utils.isValidGmailAddress(email)) {
            return mostrarNotificacion("Ingrese un correo de Gmail válido para chequear y crear la estructura del archivo", "var(--danger)");
        }

        mostrarNotificacion(`Verificando estado activo y creando estructura de Google Sheets para ${email}...`, "var(--primary)");
        const res = await CloudSync.verificarYCrearEstructuraSheetCloud({
            email,
            policiaTitular
        });

        if (res.ok) {
            cargarEstadoCuentaGmailUI();
            actualizarEstadoBaseDatosUI();
            mostrarNotificacion(res.message, "var(--secondary)");
        } else {
            mostrarNotificacion(res.message || "No se pudo verificar la estructura", "var(--danger)");
        }
    }

    async function vincularCuentaGmailYCrearSheet() {
        const inputEmail = document.getElementById("inputGmailCuenta");
        const selTitular = document.getElementById("selPoliciaTitular");
        const email = inputEmail ? inputEmail.value.trim() : "";
        const policiaTitular = selTitular ? selTitular.value : "";

        if (!Utils.isValidGmailAddress(email)) {
            return mostrarNotificacion("Ingrese un correo electrónico válido (ej: usuario@gmail.com)", "var(--danger)");
        }

        mostrarNotificacion(`Vinculando ${email} y creando archivo Google Sheets en la nube...`, "var(--primary)");

        const evs = safeParse("eventos", []);
        const res = await CloudSync.vincularGmailYCrearSheet({
            email,
            policiaTitular,
            snapshot: { config, policias, empresas, eventos: evs }
        });

        if (res.ok) {
            cargarEstadoCuentaGmailUI();
            actualizarEstadoBaseDatosUI();
            // Re-programar alertas de notificaciones filtradas por el policía titular seleccionado
            if (Notifications && typeof Notifications.scheduleServiceReminders === 'function') {
                await Notifications.scheduleServiceReminders(evs, { policiaTitular });
            }
            mostrarNotificacion(res.message, "var(--secondary)");
        } else {
            mostrarNotificacion(res.message || "Error al vincular cuenta Gmail", "var(--danger)");
        }
    }

    function desvincularCuentaGmail() {
        if (!confirm("¿Desea desvincular la cuenta de Gmail activa en este dispositivo?")) return;
        CloudSync.unlinkGmailAccount();
        const inputEmail = document.getElementById("inputGmailCuenta");
        if (inputEmail) inputEmail.value = "";
        cargarEstadoCuentaGmailUI();
        mostrarNotificacion("Cuenta de Gmail desvinculada", "var(--warning)");
    }

    async function activarYProbarNotificaciones() {
        if (!Notifications) return;
        const perm = await Notifications.requestNotificationPermissions();
        const evs = safeParse("eventos", []);
        const acc = CloudSync.getLinkedGmailAccount ? CloudSync.getLinkedGmailAccount() : null;
        const policiaTitular = (acc && acc.policiaTitular) ? acc.policiaTitular : "";

        const res = await Notifications.scheduleServiceReminders(evs, { policiaTitular });
        await Notifications.dispatchImmediateNotification({
            title: "🔔 Alertas Web Alfas 2026 Activadas",
            body: `Monitoreo activo (3 lecturas/día y 2 alertas 24h antes). Turnos programados mañana (${res.tomorrowYMD}): ${res.tomorrowCount}.`
        });

        actualizarEstadoBaseDatosUI();
        mostrarNotificacion(
            perm.granted
                ? `Notificaciones activas (${res.scheduledCount} alertas programadas, ${res.tomorrowCount} turnos mañana)`
                : "Alertas internas activadas (habilite permisos de notificación en su dispositivo)",
            perm.granted ? "var(--secondary)" : "var(--warning)"
        );
    }

    // =========================================================================
    // 4. GESTIÓN DE POLICÍAS Y EMPRESAS
    // =========================================================================

    function etiquetaPolicia(policiaObj) {
        if (!policiaObj) return "";
        return policiaObj.jerarquia ? `[${policiaObj.jerarquia}] ${policiaObj.nombre}` : policiaObj.nombre;
    }

    function nombresPolicias() {
        return policias.map(p => p.nombre);
    }

    function inicializarListasEntidades() {
        const lPol = document.getElementById("listaPolicias");
        const lEmp = document.getElementById("listaEmpresas");
        const countPol = document.getElementById("countPolicias");

        if (lPol) {
            lPol.innerHTML = "";
            policias.forEach(p => {
                const op = document.createElement("option");
                op.value = p.nombre;
                op.textContent = etiquetaPolicia(p);
                lPol.appendChild(op);
            });
        }
        if (countPol) countPol.textContent = String(policias.length);

        if (lEmp) {
            lEmp.innerHTML = "";
            Object.keys(empresas).forEach(empName => {
                const op = document.createElement("option");
                op.value = empName;
                op.textContent = empName;
                lEmp.appendChild(op);
            });
            verTurnosEmpresa();
        }
    }

    function agregarPolicia() {
        const n = document.getElementById("nuevoPolicia").value.trim();
        const j = document.getElementById("jerarquiaPolicia").value;
        if (!n) return mostrarNotificacion("Ingrese el nombre del efectivo", "var(--danger)");

        if (_editandoPolicia) {
            const idx = policias.findIndex(p => p.nombre === _editandoPolicia);
            if (idx !== -1) {
                if (_editandoPolicia !== n) {
                    coloresPolicia[n] = coloresPolicia[_editandoPolicia] || Utils.colorAleatorio();
                    delete coloresPolicia[_editandoPolicia];
                }
                policias[idx] = { nombre: n, jerarquia: j };
            }
            _editandoPolicia = null;
            document.getElementById("editandoBannerPol").style.display = "none";
            document.getElementById("btnAgregarPolicia").textContent = "+ Agregar Policía";
            mostrarNotificacion("Policía actualizado con éxito", "var(--secondary)");
        } else {
            if (nombresPolicias().includes(n)) return mostrarNotificacion("El policía ya se encuentra registrado", "var(--warning)");
            coloresPolicia[n] = Utils.colorAleatorio();
            policias.push({ nombre: n, jerarquia: j });
            mostrarNotificacion("Policía registrado", "var(--secondary)");
        }

        Storage.saveColores(coloresPolicia);
        Storage.savePolicias(policias, coloresPolicia);
        document.getElementById("nuevoPolicia").value = "";
        document.getElementById("jerarquiaPolicia").value = "";
        inicializarListasEntidades();
        cargarEstadoCuentaGmailUI();
        CloudSync.sincronizarPoliciasCloud(policias).then(() => actualizarEstadoBaseDatosUI());
    }

    function modificarPolicia() {
        const nombre = document.getElementById("listaPolicias").value;
        if (!nombre) return mostrarNotificacion("Seleccione un policía de la lista", "var(--warning)");
        const pol = policias.find(p => p.nombre === nombre);
        if (!pol) return;
        document.getElementById("nuevoPolicia").value = pol.nombre;
        document.getElementById("jerarquiaPolicia").value = pol.jerarquia || "";
        _editandoPolicia = pol.nombre;
        document.getElementById("editandoNombrePol").textContent = pol.nombre;
        document.getElementById("editandoBannerPol").style.display = "block";
        document.getElementById("btnAgregarPolicia").textContent = "✔ Actualizar Policía";
        mostrarNotificacion("Modifique los datos y presione Actualizar", "var(--primary)");
    }

    function eliminarPolicia() {
        const n = document.getElementById("listaPolicias").value;
        if (!n) return mostrarNotificacion("Seleccione un policía a eliminar", "var(--warning)");
        if (!confirm(`¿Confirma eliminar al efectivo "${n}"?`)) return;
        policias = policias.filter(p => p.nombre !== n);
        Storage.savePolicias(policias, coloresPolicia);
        inicializarListasEntidades();
        cargarEstadoCuentaGmailUI();
        mostrarNotificacion("Policía eliminado", "var(--danger)");
        CloudSync.sincronizarPoliciasCloud(policias).then(() => actualizarEstadoBaseDatosUI());
    }

    function agregarEmpresa() {
        const n = document.getElementById("nuevoEmpresa").value.trim().toUpperCase();
        const t = document.getElementById("rangoTurnos").value.split(",").map(x => x.trim()).filter(Boolean);
        const catS = document.getElementById("catSemana").value;
        const catF = document.getElementById("catFinde").value;
        if (!n || t.length === 0) return mostrarNotificacion("Complete nombre de empresa y turnos", "var(--danger)");

        const nroServicio = document.getElementById("empNroServicio").value.trim();
        const domicilio = document.getElementById("empDomicilio").value.trim();
        const barrio = document.getElementById("empBarrio").value.trim();
        const telefono = document.getElementById("empTelefono").value.trim();
        const referente = document.getElementById("empReferente").value.trim();
        const telReferente = document.getElementById("empTelReferente").value.trim();
        const policiaEnc = document.getElementById("empPoliciaEncargado").value.trim();
        const telPoliciaEnc = document.getElementById("empTelPoliciaEncargado").value.trim();
        const esActualizacion = Boolean(empresas[n]);

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
        const btnEmp = document.getElementById("btnAgregarEmpresa");
        if (btnEmp) btnEmp.textContent = "+ Guardar Empresa";

        inicializarListasEntidades();
        mostrarNotificacion(esActualizacion ? "Empresa actualizada" : "Empresa registrada", "var(--secondary)");
        CloudSync.sincronizarEmpresasCloud(empresas).then(() => actualizarEstadoBaseDatosUI());
    }

    function verTurnosEmpresa() {
        const empresaKey = document.getElementById("listaEmpresas") ? document.getElementById("listaEmpresas").value : "";
        const infoContainer = document.getElementById("infoTurnos");
        if (!infoContainer) return;
        if (!empresaKey || !empresas[empresaKey]) {
            infoContainer.textContent = "";
            return;
        }
        const emp = empresas[empresaKey];
        const turnosTexto = (emp.turnos || []).map(t => escapeHTML(t)).join(", ");
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
        const nombre = document.getElementById("listaEmpresas").value;
        if (!nombre || !empresas[nombre]) return mostrarNotificacion("Seleccione una empresa", "var(--warning)");
        const emp = empresas[nombre];
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
        document.getElementById("editandoBanner").style.display = "block";
        const btnEmp = document.getElementById("btnAgregarEmpresa");
        if (btnEmp) btnEmp.textContent = "✔ Actualizar Empresa";
        mostrarNotificacion("Datos cargados en el formulario", "var(--primary)");
    }

    function eliminarEmpresa() {
        const e = document.getElementById("listaEmpresas").value;
        if (!e) return mostrarNotificacion("Seleccione una empresa", "var(--warning)");
        if (!confirm(`¿Confirma eliminar la empresa "${e}"?`)) return;
        delete empresas[e];
        Storage.saveEmpresas(empresas);
        inicializarListasEntidades();
        mostrarNotificacion("Empresa eliminada", "var(--danger)");
        CloudSync.sincronizarEmpresasCloud(empresas).then(() => actualizarEstadoBaseDatosUI());
    }

    function descargarRespaldoJSON() {
        const evs = safeParse("eventos", []);
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(evs, null, 2));
        const a = document.createElement("a");
        a.setAttribute("href", dataStr);
        a.setAttribute("download", "alfas.json");
        document.body.appendChild(a);
        a.click();
        a.remove();
        mostrarNotificacion("Archivo alfas.json exportado", "var(--secondary)");
    }

    function cargarAlfasJSONConfig(evt) {
        const file = evt && evt.target && evt.target.files ? evt.target.files[0] : null;
        if (!file) return;
        const reader = new FileReader();
        reader.onload = function (e) {
            try {
                const parsed = JSON.parse(e.target.result);
                if (Array.isArray(parsed)) {
                    const validos = [];
                    parsed.forEach(item => {
                        const v = Utils.validateServicioRecord(item);
                        if (v.valid && v.record) {
                            const r = v.record;
                            validos.push({
                                title: `${r.policia}\n${r.empresa} (${Utils.formatearTurno(r.turno)})`,
                                start: r.fecha,
                                allDay: true,
                                backgroundColor: Utils.ensureDistinctEventColor ? Utils.ensureDistinctEventColor(coloresPolicia[r.policia], r.policia) : '#0d9488',
                                borderColor: 'transparent',
                                extendedProps: {
                                    policia: r.policia, empresa: r.empresa, turno: r.turno,
                                    cat: r.cat, cost: r.cost, h: r.h, vh: r.vh, detail: r.detail
                                }
                            });
                        }
                    });
                    Storage.saveEventos(validos);
                    mostrarNotificacion(`${validos.length} servicios importados a la Base Local`, "var(--secondary)");
                }
            } catch (_) {
                mostrarNotificacion("Error al importar archivo JSON", "var(--danger)");
            }
        };
        reader.readAsText(file);
    }

    async function sincronizarDesdeSheets() {
        mostrarNotificacion("Leyendo servicios desde Google Sheets...", "var(--primary)");
        const data = await CloudSync.obtenerServiciosCloud();
        if (Array.isArray(data) && data.length > 0) {
            const validos = [];
            data.forEach(item => {
                const v = Utils.validateServicioRecord(item);
                if (v.valid && v.record) {
                    const r = v.record;
                    validos.push({
                        title: `${r.policia}\n${r.empresa} (${Utils.formatearTurno(r.turno)})`,
                        start: r.fecha,
                        allDay: true,
                        backgroundColor: Utils.ensureDistinctEventColor ? Utils.ensureDistinctEventColor(coloresPolicia[r.policia], r.policia) : '#0d9488',
                        borderColor: 'transparent',
                        extendedProps: {
                            policia: r.policia, empresa: r.empresa, turno: r.turno,
                            cat: r.cat, cost: r.cost, h: r.h, vh: r.vh, detail: r.detail
                        }
                    });
                }
            });
            Storage.saveEventos(validos);
            mostrarNotificacion(`${validos.length} registros sincronizados desde Google Sheets`, "var(--secondary)");
        } else {
            mostrarNotificacion("Usando datos almacenados en Base Local", "var(--warning)");
        }
        actualizarEstadoBaseDatosUI();
    }

    function actualizarEstadoBaseDatosUI() {
        if (Database && typeof Database.getDatabaseStatus === 'function') {
            const status = Database.getDatabaseStatus();
            const badgeEngine = document.getElementById("dbEngineBadge");
            const badgeOutbox = document.getElementById("dbOutboxBadge");
            if (badgeEngine) {
                const labelMap = {
                    "capacitor-sqlite-native": "SQLite Nativo (Android APK)",
                    "indexeddb-sql-mirror": "SQLite/IndexedDB Local Activo",
                    "localstorage-mirror": "LocalStorage Mirror"
                };
                badgeEngine.textContent = labelMap[status.engine] || status.engine;
            }
            if (badgeOutbox) {
                badgeOutbox.textContent = status.pendingOutboxCount > 0
                    ? `${status.pendingOutboxCount} pendientes en cola`
                    : "Sincronizado con Sheets";
            }
        }

        const notifBadge = document.getElementById("notifStatusBadge");
        if (notifBadge && Notifications && typeof Notifications.getNotificationEngineStatus === 'function') {
            const nStatus = Notifications.getNotificationEngineStatus();
            notifBadge.textContent = nStatus.permissionGranted
                ? "🔔 Notificaciones: Activas (3x/día + 24h antes)"
                : "🔕 Notificaciones: Pendiente de permiso";
            notifBadge.className = nStatus.permissionGranted ? "badge badge-a" : "badge badge-bp";
        }
    }

    function init() {
        if (typeof document === 'undefined') return;
        const activeTheme = Utils.applyTheme(Utils.getSavedTheme());
        actualizarBotonesTemaUI(activeTheme);
        actualizarTarjetasPortadaUI(Utils.getSavedSplashCover());
        initInputsTarifas();
        inicializarListasEntidades();
        cargarEstadoCuentaGmailUI();
        actualizarEstadoBaseDatosUI();
    }

    if (typeof window !== 'undefined') {
        window.toggleSeccionConfig = toggleSeccionConfig;
        window.seleccionarTemaApp = seleccionarTemaApp;
        window.seleccionarPortadaApp = seleccionarPortadaApp;
        window.previsualizarPortadaActiva = previsualizarPortadaActiva;
        window.cerrarPreviewPortada = cerrarPreviewPortada;
        window.guardarConfiguracionTarifas = guardarConfiguracionTarifas;
        window.vincularCuentaGmailYCrearSheet = vincularCuentaGmailYCrearSheet;
        window.verificarYCrearEstructuraSheetGmail = verificarYCrearEstructuraSheetGmail;
        window.desvincularCuentaGmail = desvincularCuentaGmail;
        window.activarYProbarNotificaciones = activarYProbarNotificaciones;
        window.agregarPolicia = agregarPolicia;
        window.modificarPolicia = modificarPolicia;
        window.eliminarPolicia = eliminarPolicia;
        window.agregarEmpresa = agregarEmpresa;
        window.verTurnosEmpresa = verTurnosEmpresa;
        window.modificarEmpresa = modificarEmpresa;
        window.eliminarEmpresa = eliminarEmpresa;
        window.descargarRespaldoJSON = descargarRespaldoJSON;
        window.cargarAlfasJSONConfig = cargarAlfasJSONConfig;
        window.sincronizarDesdeSheets = sincronizarDesdeSheets;
        document.addEventListener('DOMContentLoaded', init);
    }

    return {
        toggleSeccionConfig,
        seleccionarTemaApp,
        seleccionarPortadaApp,
        vincularCuentaGmailYCrearSheet,
        verificarYCrearEstructuraSheetGmail,
        guardarConfiguracionTarifas,
        recalcularEventosGuardados
    };
}));
