/**
 * @file cloudSync.js
 * @description Servicio de integración y sincronización remota con Google Apps Script / Google Sheets.
 * Incluye Vinculación con Cuenta de Correo Gmail y Creación Automática de Archivo Google Sheets en la nube activa,
 * sanitización contra CSV/Formula Injection (OWASP) y cola Outbox Offline-First.
 * Compatible con entornos de Navegador (window.AlfaCloudSync) y Node.js (CommonJS).
 */

(function (root, factory) {
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = factory();
    } else {
        root.AlfaCloudSync = factory();
    }
}(typeof self !== 'undefined' ? self : this, function () {

    const DEFAULT_GOOGLE_SHEET_URL = "https://script.google.com/macros/s/AKfycbzIc0RqibgvDtP8gK_G_B9d37DGNXJ-1_bctDGsZwAXT9AE2cjmPEnynFI54UmBJ2xy_w/exec";
    const CUSTOM_ENDPOINT_KEY = "alfa_cloud_endpoint_url";
    const GMAIL_ACCOUNT_KEY = "alfa_linked_gmail_account";

    function getUtilsRef() {
        if (typeof window !== 'undefined' && window.AlfaUtils) return window.AlfaUtils;
        try {
            if (typeof require === 'function') return require('../utils/helpers.js');
        } catch (_) {}
        return { sanitizeForSpreadsheet: (v) => v, isValidGmailAddress: () => true };
    }

    function getDatabaseRef() {
        if (typeof window !== 'undefined' && window.AlfaDatabase) return window.AlfaDatabase;
        try {
            if (typeof require === 'function') return require('./database.js');
        } catch (_) {}
        return null;
    }

    /**
     * Obtiene la cuenta de Gmail vinculada actualmente en la aplicación.
     * @returns {{email: string, sheetName: string, sheetUrl: string, linkedAt: string, policiaTitular: string}|null}
     */
    function getLinkedGmailAccount() {
        if (typeof localStorage === 'undefined') return null;
        try {
            const raw = localStorage.getItem(GMAIL_ACCOUNT_KEY);
            if (!raw) return null;
            const parsed = JSON.parse(raw);
            return (parsed && parsed.email) ? parsed : null;
        } catch (_) {
            return null;
        }
    }

    /**
     * Guarda la configuración de la cuenta de Gmail vinculada.
     * @param {{email: string, sheetName?: string, sheetUrl?: string, customEndpoint?: string, policiaTitular?: string}} accountData 
     */
    function saveLinkedGmailAccount(accountData) {
        if (typeof localStorage === 'undefined' || !accountData) return null;
        const cleanEmail = String(accountData.email || '').trim().toLowerCase();
        const record = {
            email: cleanEmail,
            sheetName: accountData.sheetName || `Web_Alfas_2026_${cleanEmail.split('@')[0]}`,
            sheetUrl: accountData.sheetUrl || '',
            policiaTitular: accountData.policiaTitular || '',
            linkedAt: accountData.linkedAt || new Date().toISOString()
        };
        localStorage.setItem(GMAIL_ACCOUNT_KEY, JSON.stringify(record));
        if (accountData.customEndpoint && /^https:\/\/script\.google\.com\/macros\/s\/[a-zA-Z0-9_-]+\/exec$/.test(accountData.customEndpoint.trim())) {
            localStorage.setItem(CUSTOM_ENDPOINT_KEY, accountData.customEndpoint.trim());
        }
        return record;
    }

    /**
     * Desvincula la cuenta de Gmail activa.
     */
    function unlinkGmailAccount() {
        if (typeof localStorage === 'undefined') return;
        localStorage.removeItem(GMAIL_ACCOUNT_KEY);
        localStorage.removeItem(CUSTOM_ENDPOINT_KEY);
    }

    /**
     * Obtiene la URL activa de Google Apps Script.
     * @returns {string}
     */
    function getEndpointUrl() {
        if (typeof localStorage !== 'undefined') {
            const custom = localStorage.getItem(CUSTOM_ENDPOINT_KEY);
            if (custom && /^https:\/\/script\.google\.com\/macros\/s\/[a-zA-Z0-9_-]+\/exec$/.test(custom.trim())) {
                return custom.trim();
            }
        }
        return DEFAULT_GOOGLE_SHEET_URL;
    }

    /**
     * Sanitiza un objeto recursivamente para prevenir Formula Injection en Google Sheets.
     * @param {any} data 
     * @returns {any}
     */
    function sanitizePayloadForSheets(data) {
        const utils = getUtilsRef();
        const sanitize = utils.sanitizeForSpreadsheet || ((v) => v);
        if (typeof data === 'string') return sanitize(data);
        if (typeof data === 'number' || typeof data === 'boolean' || data === null || data === undefined) return data;
        if (Array.isArray(data)) return data.map(item => sanitizePayloadForSheets(item));
        if (typeof data === 'object') {
            const cleanObj = {};
            Object.entries(data).forEach(([k, v]) => {
                cleanObj[sanitize(k)] = sanitizePayloadForSheets(v);
            });
            return cleanObj;
        }
        return data;
    }

    /**
     * Vincula un correo de Gmail, solicita la creación / aprovisionamiento del archivo de Google Sheets
     * para esa cuenta activa y sincroniza todos los datos locales (Tarifas, Policías, Empresas y Servicios) en la nube.
     * @param {Object} params
     * @param {string} params.email - Correo electrónico de Gmail a vincular.
     * @param {string} [params.policiaTitular] - Efectivo policial titular del dispositivo.
     * @param {string} [params.customEndpoint] - URL opcional de Web App propia en esa cuenta Gmail.
     * @param {string} [params.oauthAccessToken] - Token OAuth2 opcional para crear directamente vía Google Sheets REST API v4.
     * @param {Object} [params.snapshot] - Estado local completo { config, policias, empresas, eventos }.
     * @returns {Promise<{ok: boolean, account: Object, cloudCreated: boolean, message: string}>}
     */
    async function vincularGmailYCrearSheet({ email, policiaTitular, customEndpoint, oauthAccessToken, snapshot }) {
        const utils = getUtilsRef();
        const cleanEmail = String(email || '').trim().toLowerCase();
        if (!utils.isValidGmailAddress(cleanEmail)) {
            return { ok: false, account: null, cloudCreated: false, message: "Ingrese un correo electrónico válido (ej: usuario@gmail.com)" };
        }

        const sheetTitle = `Web_Alfas_2026_${cleanEmail.split('@')[0]}`;
        let sheetUrl = "";
        let cloudCreated = false;

        // Vía 1: Si se provee un OAuth2 Access Token de Google Identity, crear el archivo directamente en el Google Drive del Gmail activo vía Google Sheets REST API v4
        if (oauthAccessToken && typeof fetch !== 'undefined') {
            try {
                const resApi = await fetch("https://sheets.googleapis.com/v4/spreadsheets", {
                    method: "POST",
                    headers: {
                        "Authorization": `Bearer ${oauthAccessToken}`,
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify({
                        properties: { title: sheetTitle },
                        sheets: [
                            { properties: { title: "servicios" } },
                            { properties: { title: "POLICIA" } },
                            { properties: { title: "EMPRESAS" } },
                            { properties: { title: "TARIFAS" } }
                        ]
                    })
                });
                if (resApi.ok) {
                    const createdSheet = await resApi.json();
                    sheetUrl = createdSheet.spreadsheetUrl || "";
                    cloudCreated = true;
                }
            } catch (apiErr) {
                console.warn("[CloudSync] Fallback de Google Sheets REST API a Apps Script Provisioner:", apiErr);
            }
        }

        // Guardar cuenta vinculada localmente
        const savedAccount = saveLinkedGmailAccount({
            email: cleanEmail,
            sheetName: sheetTitle,
            sheetUrl,
            customEndpoint,
            policiaTitular
        });

        // Vía 2: Solicitar al backend de Google Apps Script que cree/aprovisione la hoja asociada a este correo Gmail y sincronice los datos iniciales
        try {
            if (typeof navigator === 'undefined' || navigator.onLine !== false) {
                const provisionPayload = sanitizePayloadForSheets({
                    action: "createOrBindGmailSheet",
                    email: cleanEmail,
                    sheetName: sheetTitle,
                    policiaTitular: policiaTitular || ""
                });
                const encoded = encodeURIComponent(JSON.stringify(provisionPayload));
                if (typeof fetch !== 'undefined') {
                    await fetch(`${getEndpointUrl()}?data=${encoded}`, { mode: "no-cors" });
                    cloudCreated = true;
                }

                // Sincronizar snapshot inicial en la nube para esa cuenta
                if (snapshot && typeof snapshot === 'object') {
                    if (snapshot.config) await sincronizarTarifasCloud(snapshot.config);
                    if (snapshot.policias) await sincronizarPoliciasCloud(snapshot.policias);
                    if (snapshot.empresas) await sincronizarEmpresasCloud(snapshot.empresas);
                }
            }
        } catch (err) {
            const db = getDatabaseRef();
            if (db) db.enqueueOutboxOperation("createOrBindGmailSheet", { email: cleanEmail, sheetName: sheetTitle });
        }

        return {
            ok: true,
            account: savedAccount,
            cloudCreated,
            message: `Cuenta ${cleanEmail} vinculada. Archivo "${sheetTitle}" configurado para guardar en la nube.`
        };
    }

    /**
     * Obtiene el correo Gmail vinculado para adjuntarlo como propietario en cada sincronización a la nube.
     * @returns {string}
     */
    function getActiveOwnerEmail() {
        const acc = getLinkedGmailAccount();
        return acc && acc.email ? acc.email : "";
    }

    async function sincronizarTarifasCloud(configMap) {
        const safeConfig = sanitizePayloadForSheets(configMap);
        const ownerEmail = getActiveOwnerEmail();
        try {
            if (typeof navigator !== 'undefined' && navigator.onLine === false) {
                throw new Error("Dispositivo sin conexión (Offline)");
            }
            const payload = encodeURIComponent(JSON.stringify({ action: "syncTarifas", ownerEmail, config: safeConfig }));
            await fetch(`${getEndpointUrl()}?data=${payload}`, { mode: "no-cors" });
            return true;
        } catch (err) {
            const db = getDatabaseRef();
            if (db) db.enqueueOutboxOperation("syncTarifas", safeConfig);
            return false;
        }
    }

    async function sincronizarPoliciasCloud(policiasList) {
        const utils = getUtilsRef();
        const sanitize = utils.sanitizeForSpreadsheet || ((v) => v);
        const ownerEmail = getActiveOwnerEmail();
        const polData = (Array.isArray(policiasList) ? policiasList : []).map(p => ({
            nombre: sanitize(typeof p === 'object' ? (p.nombre || '') : String(p)),
            jerarquia: sanitize(typeof p === 'object' ? (p.jerarquia || '') : '')
        }));

        try {
            if (typeof navigator !== 'undefined' && navigator.onLine === false) {
                throw new Error("Dispositivo sin conexión (Offline)");
            }
            const payload = encodeURIComponent(JSON.stringify({ action: "syncPolicias", ownerEmail, policias: polData }));
            await fetch(`${getEndpointUrl()}?data=${payload}`, { mode: "no-cors" });
            return true;
        } catch (err) {
            const db = getDatabaseRef();
            if (db) db.enqueueOutboxOperation("syncPolicias", polData);
            return false;
        }
    }

    async function sincronizarEmpresasCloud(empresasMap) {
        const safeEmpresas = sanitizePayloadForSheets(empresasMap);
        const ownerEmail = getActiveOwnerEmail();
        try {
            if (typeof navigator !== 'undefined' && navigator.onLine === false) {
                throw new Error("Dispositivo sin conexión (Offline)");
            }
            const payload = encodeURIComponent(JSON.stringify({ action: "syncEmpresas", ownerEmail, empresas: safeEmpresas }));
            await fetch(`${getEndpointUrl()}?data=${payload}`, { mode: "no-cors" });
            return true;
        } catch (err) {
            const db = getDatabaseRef();
            if (db) db.enqueueOutboxOperation("syncEmpresas", safeEmpresas);
            return false;
        }
    }

    async function registrarServicioCloud(payloadData) {
        const safeData = sanitizePayloadForSheets(payloadData || {});
        const ownerEmail = getActiveOwnerEmail();
        try {
            if (typeof navigator !== 'undefined' && navigator.onLine === false) {
                throw new Error("Dispositivo sin conexión (Offline)");
            }
            const queryParams = new URLSearchParams({
                action: "addServicio",
                ownerEmail,
                fecha: String(safeData.fecha || ""),
                empresa: String(safeData.empresa || ""),
                policia: String(safeData.policia || ""),
                turno: String(safeData.turno || ""),
                categoria: String(safeData.categoria || "A"),
                hora: String(safeData.hora || 8),
                costo: String(safeData.costo || 0),
                data: JSON.stringify({ ...safeData, ownerEmail })
            }).toString();

            await fetch(`${getEndpointUrl()}?${queryParams}`, { mode: "no-cors" });
            return true;
        } catch (err) {
            const db = getDatabaseRef();
            if (db) db.enqueueOutboxOperation("addServicio", safeData);
            return false;
        }
    }

    async function eliminarServicioCloud(policia, empresa, turno, fecha) {
        const safePayload = sanitizePayloadForSheets({ policia, empresa, turno, fecha });
        const ownerEmail = getActiveOwnerEmail();
        try {
            if (typeof navigator !== 'undefined' && navigator.onLine === false) {
                throw new Error("Dispositivo sin conexión (Offline)");
            }
            const queryParams = new URLSearchParams({
                action: "deleteServicio",
                ownerEmail,
                fecha: String(safePayload.fecha || ""),
                empresa: String(safePayload.empresa || ""),
                policia: String(safePayload.policia || ""),
                turno: String(safePayload.turno || "")
            }).toString();

            await fetch(`${getEndpointUrl()}?${queryParams}`, { mode: "no-cors" });
            return true;
        } catch (err) {
            const db = getDatabaseRef();
            if (db) db.enqueueOutboxOperation("deleteServicio", safePayload);
            return false;
        }
    }

    async function flushOutboxCloud() {
        const db = getDatabaseRef();
        if (!db || typeof db.getOutboxQueue !== 'function') return { processed: 0, remaining: 0 };
        if (typeof navigator !== 'undefined' && navigator.onLine === false) {
            return { processed: 0, remaining: db.getOutboxQueue().length };
        }

        const queue = db.getOutboxQueue();
        let processed = 0;

        for (const item of queue) {
            let ok = false;
            try {
                if (item.action === "syncTarifas") ok = await sincronizarTarifasCloud(item.payload);
                else if (item.action === "syncPolicias") ok = await sincronizarPoliciasCloud(item.payload);
                else if (item.action === "syncEmpresas") ok = await sincronizarEmpresasCloud(item.payload);
                else if (item.action === "addServicio") ok = await registrarServicioCloud(item.payload);
                else if (item.action === "deleteServicio") {
                    const p = item.payload || {};
                    ok = await eliminarServicioCloud(p.policia, p.empresa, p.turno, p.fecha);
                } else if (item.action === "createOrBindGmailSheet") {
                    const p = item.payload || {};
                    const res = await vincularGmailYCrearSheet({ email: p.email });
                    ok = res.ok;
                }
            } catch (_) {
                ok = false;
            }
            if (ok) {
                db.removeOutboxOperation(item.id);
                processed++;
            }
        }

        return { processed, remaining: db.getOutboxQueue().length };
    }

    async function obtenerServiciosCloud() {
        try {
            if (typeof navigator !== 'undefined' && navigator.onLine === false) {
                return null;
            }
            const ownerEmail = encodeURIComponent(getActiveOwnerEmail());
            const url = `${getEndpointUrl()}?action=getServicios&ownerEmail=${ownerEmail}`;
            const res = await fetch(url);
            if (res.ok) {
                const data = await res.json();
                if (Array.isArray(data) && data.length > 0) {
                    return data;
                }
            }
            return null;
        } catch (err) {
            console.warn("[CloudSyncNotice] No se pudo leer servicios desde la nube (Usando base de datos local):", err.message || err);
            return null;
        }
    }

    return {
        GOOGLE_SHEET_URL: DEFAULT_GOOGLE_SHEET_URL,
        getEndpointUrl,
        getLinkedGmailAccount,
        saveLinkedGmailAccount,
        unlinkGmailAccount,
        vincularGmailYCrearSheet,
        sanitizePayloadForSheets,
        sincronizarTarifasCloud,
        sincronizarPoliciasCloud,
        sincronizarEmpresasCloud,
        registrarServicioCloud,
        eliminarServicioCloud,
        flushOutboxCloud,
        obtenerServiciosCloud
    };
}));
