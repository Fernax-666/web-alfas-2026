/**
 * @file cloudSync.js
 * @description Servicio de integración y sincronización remota con Google Apps Script / Google Sheets.
 * Incorpora sanitización contra CSV/Formula Injection (OWASP), cola Outbox Offline-First y configuración de endpoint.
 * Compatible con entornos de Navegador (window.AlfaCloudSync) y Node.js (CommonJS).
 */

(function (root, factory) {
    if (typeof module !== 'undefined' && module.exports) {
        // Entorno Node.js
        module.exports = factory();
    } else {
        // Entorno Navegador
        root.AlfaCloudSync = factory();
    }
}(typeof self !== 'undefined' ? self : this, function () {

    const DEFAULT_GOOGLE_SHEET_URL = "https://script.google.com/macros/s/AKfycbzIc0RqibgvDtP8gK_G_B9d37DGNXJ-1_bctDGsZwAXT9AE2cjmPEnynFI54UmBJ2xy_w/exec";
    const CUSTOM_ENDPOINT_KEY = "alfa_cloud_endpoint_url";

    function getUtilsRef() {
        if (typeof window !== 'undefined' && window.AlfaUtils) return window.AlfaUtils;
        try {
            if (typeof require === 'function') return require('../utils/helpers.js');
        } catch (_) {}
        return { sanitizeForSpreadsheet: (v) => v };
    }

    function getDatabaseRef() {
        if (typeof window !== 'undefined' && window.AlfaDatabase) return window.AlfaDatabase;
        try {
            if (typeof require === 'function') return require('./database.js');
        } catch (_) {}
        return null;
    }

    /**
     * Obtiene la URL activa de Google Apps Script (configurable o por defecto).
     * @returns {string} URL válida de sincronización.
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
     * Sincroniza la configuración de tarifas en la nube.
     * @param {Object} configMap - Mapa de tarifas por categoría.
     * @returns {Promise<boolean>} Status de sincronización.
     */
    async function sincronizarTarifasCloud(configMap) {
        const safeConfig = sanitizePayloadForSheets(configMap);
        try {
            if (typeof navigator !== 'undefined' && navigator.onLine === false) {
                throw new Error("Dispositivo sin conexión (Offline)");
            }
            const payload = encodeURIComponent(JSON.stringify({ action: "syncTarifas", config: safeConfig }));
            await fetch(`${getEndpointUrl()}?data=${payload}`, { mode: "no-cors" });
            return true;
        } catch (err) {
            const db = getDatabaseRef();
            if (db) db.enqueueOutboxOperation("syncTarifas", safeConfig);
            console.warn("[CloudSyncNotice] Tarifas encoladas en Outbox Local (Modo Offline):", err.message || err);
            return false;
        }
    }

    /**
     * Sincroniza la lista de policías con jerarquía en la nube.
     * @param {Array} policiasList - Arreglo de objetos policía { nombre, jerarquia }.
     * @returns {Promise<boolean>} Status de sincronización.
     */
    async function sincronizarPoliciasCloud(policiasList) {
        const utils = getUtilsRef();
        const sanitize = utils.sanitizeForSpreadsheet || ((v) => v);
        const polData = (Array.isArray(policiasList) ? policiasList : []).map(p => ({
            nombre: sanitize(typeof p === 'object' ? (p.nombre || '') : String(p)),
            jerarquia: sanitize(typeof p === 'object' ? (p.jerarquia || '') : '')
        }));

        try {
            if (typeof navigator !== 'undefined' && navigator.onLine === false) {
                throw new Error("Dispositivo sin conexión (Offline)");
            }
            const payload = encodeURIComponent(JSON.stringify({ action: "syncPolicias", policias: polData }));
            await fetch(`${getEndpointUrl()}?data=${payload}`, { mode: "no-cors" });
            return true;
        } catch (err) {
            const db = getDatabaseRef();
            if (db) db.enqueueOutboxOperation("syncPolicias", polData);
            console.warn("[CloudSyncNotice] Policías encolados en Outbox Local (Modo Offline):", err.message || err);
            return false;
        }
    }

    /**
     * Sincroniza las empresas y sus configuraciones en la nube.
     * @param {Object} empresasMap - Objeto de empresas.
     * @returns {Promise<boolean>} Status de sincronización.
     */
    async function sincronizarEmpresasCloud(empresasMap) {
        const safeEmpresas = sanitizePayloadForSheets(empresasMap);
        try {
            if (typeof navigator !== 'undefined' && navigator.onLine === false) {
                throw new Error("Dispositivo sin conexión (Offline)");
            }
            const payload = encodeURIComponent(JSON.stringify({ action: "syncEmpresas", empresas: safeEmpresas }));
            await fetch(`${getEndpointUrl()}?data=${payload}`, { mode: "no-cors" });
            return true;
        } catch (err) {
            const db = getDatabaseRef();
            if (db) db.enqueueOutboxOperation("syncEmpresas", safeEmpresas);
            console.warn("[CloudSyncNotice] Empresas encoladas en Outbox Local (Modo Offline):", err.message || err);
            return false;
        }
    }

    /**
     * Envía una solicitud de registro de servicio a la nube con sanitización anti-inyección.
     * @param {Object} payloadData - Datos del servicio a registrar.
     * @returns {Promise<boolean>} Status de registro.
     */
    async function registrarServicioCloud(payloadData) {
        const safeData = sanitizePayloadForSheets(payloadData || {});
        try {
            if (typeof navigator !== 'undefined' && navigator.onLine === false) {
                throw new Error("Dispositivo sin conexión (Offline)");
            }
            const queryParams = new URLSearchParams({
                action: "addServicio",
                fecha: String(safeData.fecha || ""),
                empresa: String(safeData.empresa || ""),
                policia: String(safeData.policia || ""),
                turno: String(safeData.turno || ""),
                categoria: String(safeData.categoria || "A"),
                hora: String(safeData.hora || 8),
                costo: String(safeData.costo || 0),
                data: JSON.stringify(safeData)
            }).toString();

            await fetch(`${getEndpointUrl()}?${queryParams}`, { mode: "no-cors" });
            return true;
        } catch (err) {
            const db = getDatabaseRef();
            if (db) db.enqueueOutboxOperation("addServicio", safeData);
            console.warn("[CloudSyncNotice] Servicio encolado en Outbox Local para sincronización diferida:", err.message || err);
            return false;
        }
    }

    /**
     * Solicita la eliminación de una fila de servicio en la nube.
     * @param {string} policia 
     * @param {string} empresa 
     * @param {string} turno 
     * @param {string} fecha 
     * @returns {Promise<boolean>} Status de eliminación.
     */
    async function eliminarServicioCloud(policia, empresa, turno, fecha) {
        const safePayload = sanitizePayloadForSheets({ policia, empresa, turno, fecha });
        try {
            if (typeof navigator !== 'undefined' && navigator.onLine === false) {
                throw new Error("Dispositivo sin conexión (Offline)");
            }
            const queryParams = new URLSearchParams({
                action: "deleteServicio",
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
            console.warn("[CloudSyncNotice] Eliminación encolada en Outbox Local:", err.message || err);
            return false;
        }
    }

    /**
     * Procesa todas las operaciones pendientes en la cola Outbox hacia Google Sheets.
     * @returns {Promise<{processed: number, remaining: number}>}
     */
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

    /**
     * Consulta el listado de servicios remotos en Google Sheets.
     * @returns {Promise<Array|null>} Registros o null en caso de falla.
     */
    async function obtenerServiciosCloud() {
        try {
            if (typeof navigator !== 'undefined' && navigator.onLine === false) {
                return null;
            }
            const url = `${getEndpointUrl()}?action=getServicios`;
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
