/**
 * @file cloudSync.js
 * @description Servicio de integración y sincronización remota con Google Apps Script / Google Sheets.
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

    const GOOGLE_SHEET_URL = "https://script.google.com/macros/s/AKfycbzIc0RqibgvDtP8gK_G_B9d37DGNXJ-1_bctDGsZwAXT9AE2cjmPEnynFI54UmBJ2xy_w/exec";

    /**
     * Sincroniza la configuración de tarifas en la nube.
     * @param {Object} configMap - Mapa de tarifas por categoría.
     * @returns {Promise<boolean>} Status de sincronización.
     */
    async function sincronizarTarifasCloud(configMap) {
        try {
            const payload = encodeURIComponent(JSON.stringify({ action: "syncTarifas", config: configMap }));
            await fetch(`${GOOGLE_SHEET_URL}?data=${payload}`, { mode: "no-cors" });
            console.log("[CloudSync] Tarifas sincronizadas en la nube (no-cors).");
            return true;
        } catch (err) {
            console.warn("[CloudSyncNotice] No se pudo conectar con la nube para sincronizar tarifas (Modo Offline activo):", err.message || err);
            return false;
        }
    }

    /**
     * Sincroniza la lista de policías con jerarquía en la nube.
     * @param {Array} policiasList - Arreglo de objetos policía { nombre, jerarquia }.
     * @returns {Promise<boolean>} Status de sincronización.
     */
    async function sincronizarPoliciasCloud(policiasList) {
        try {
            const polData = policiasList.map(p => ({
                nombre: typeof p === 'object' ? (p.nombre || '') : String(p),
                jerarquia: typeof p === 'object' ? (p.jerarquia || '') : ''
            }));
            const payload = encodeURIComponent(JSON.stringify({ action: "syncPolicias", policias: polData }));
            await fetch(`${GOOGLE_SHEET_URL}?data=${payload}`, { mode: "no-cors" });
            console.log("[CloudSync] Policías sincronizados en la solapa POLICIA (no-cors).");
            return true;
        } catch (err) {
            console.warn("[CloudSyncNotice] No se pudo conectar con la nube para sincronizar policías (Modo Offline activo):", err.message || err);
            return false;
        }
    }

    /**
     * Sincroniza las empresas y sus configuraciones en la nube.
     * @param {Object} empresasMap - Objeto de empresas.
     * @returns {Promise<boolean>} Status de sincronización.
     */
    async function sincronizarEmpresasCloud(empresasMap) {
        try {
            const payload = encodeURIComponent(JSON.stringify({ action: "syncEmpresas", empresas: empresasMap }));
            await fetch(`${GOOGLE_SHEET_URL}?data=${payload}`, { mode: "no-cors" });
            console.log("[CloudSync] Empresas sincronizadas en la nube (no-cors).");
            return true;
        } catch (err) {
            console.warn("[CloudSyncNotice] No se pudo conectar con la nube para sincronizar empresas (Modo Offline activo):", err.message || err);
            return false;
        }
    }

    /**
     * Envía una solicitud de registro de servicio a la nube.
     * @param {Object} payloadData - Datos del servicio a registrar.
     * @returns {Promise<boolean>} Status de registro.
     */
    async function registrarServicioCloud(payloadData) {
        try {
            const queryParams = new URLSearchParams({
                action: "addServicio",
                fecha: payloadData.fecha || "",
                empresa: payloadData.empresa || "",
                policia: payloadData.policia || "",
                turno: payloadData.turno || "",
                categoria: payloadData.categoria || "A",
                hora: String(payloadData.hora || 8),
                costo: String(payloadData.costo || 0),
                data: JSON.stringify(payloadData)
            }).toString();

            await fetch(`${GOOGLE_SHEET_URL}?${queryParams}`, { mode: "no-cors" });
            console.log("[CloudSync] Servicio registrado en la nube.");
            return true;
        } catch (err) {
            console.warn("[CloudSyncNotice] Falló la conexión remota al registrar servicio. Guardado localmente:", err.message || err);
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
        try {
            const queryParams = new URLSearchParams({
                action: "deleteServicio",
                fecha: fecha || "",
                empresa: empresa || "",
                policia: policia || "",
                turno: turno || ""
            }).toString();

            await fetch(`${GOOGLE_SHEET_URL}?${queryParams}`, { mode: "no-cors" });
            console.log("[CloudSync] Servicio eliminado de la nube.");
            return true;
        } catch (err) {
            console.warn("[CloudSyncNotice] Falló la eliminación en la nube. Eliminado localmente:", err.message || err);
            return false;
        }
    }

    /**
     * Consulta el listado de servicios remotos en Google Sheets.
     * @returns {Promise<Array|null>} Registros o null en caso de falla.
     */
    async function obtenerServiciosCloud() {
        try {
            const url = `${GOOGLE_SHEET_URL}?action=getServicios`;
            const res = await fetch(url);
            if (res.ok) {
                const data = await res.json();
                if (Array.isArray(data) && data.length > 0) {
                    return data;
                }
            }
            return null;
        } catch (err) {
            console.warn("[CloudSyncNotice] No se pudo leer servicios desde la nube (Usando fallback local):", err.message || err);
            return null;
        }
    }

    return {
        GOOGLE_SHEET_URL,
        sincronizarTarifasCloud,
        sincronizarPoliciasCloud,
        sincronizarEmpresasCloud,
        registrarServicioCloud,
        eliminarServicioCloud,
        obtenerServiciosCloud
    };
}));
