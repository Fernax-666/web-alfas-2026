/**
 * @file helpers.js
 * @description Funciones puras de utilidad para sanitización, formateo y manipulaciones comunes.
 * Compatible con entornos de Navegador (window.AlfaUtils) y Node.js (CommonJS).
 */

(function (root, factory) {
    if (typeof module !== 'undefined' && module.exports) {
        // Entorno Node.js
        module.exports = factory();
    } else {
        // Entorno Navegador
        root.AlfaUtils = factory();
    }
}(typeof self !== 'undefined' ? self : this, function () {

    /**
     * Sanitiza una cadena de texto para evitar vulnerabilidades XSS en la inserción HTML.
     * @param {any} inputStr - Valor a sanitizar.
     * @returns {string} Cadena escapada para renderizado seguro en el DOM.
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
     * Parsing seguro de JSON almacenado con fallback automático en caso de error o nulidad.
     * @template T
     * @param {Object|Storage} storageObj - Objeto de almacenamiento (ej. localStorage o mock).
     * @param {string} key - Clave del almacenamiento.
     * @param {T} fallback - Valor por defecto.
     * @returns {T} Datos parseados o fallback.
     */
    function safeParse(storageObj, key, fallback) {
        try {
            let rawData = null;
            if (storageObj && typeof storageObj.getItem === 'function') {
                rawData = storageObj.getItem(key);
            } else if (storageObj && typeof storageObj === 'object') {
                rawData = storageObj[key];
            }
            if (!rawData) return fallback;
            const parsed = JSON.parse(rawData);
            return parsed !== null && parsed !== undefined ? parsed : fallback;
        } catch (error) {
            // Se usa console.warn en lugar de console.error para indicar fallback controlado sin alarmar en DevTools
            console.warn(`[StorageNotice] Parsing no estándar para clave "${key}". Aplicando fallback por defecto.`, error.message);
            return fallback;
        }
    }

    /**
     * Formatea un rango de turno (ej. "06-14" -> "06HS A 14HS").
     * @param {string} turnoStr - Cadena de turno.
     * @returns {string} Texto formateado de turno.
     */
    function formatearTurno(turnoStr) {
        if (!turnoStr) return "";
        if (!turnoStr.includes("-")) return turnoStr;
        const parts = turnoStr.split("-");
        return `${parts[0]}HS A ${parts[1]}HS`;
    }

    /**
     * Retorna fecha en formato local YYYY-MM-DD.
     * @param {Date} dateObj - Objeto Date.
     * @returns {string} Fecha formateada.
     */
    function getLocalYMD(dateObj) {
        if (!dateObj || isNaN(dateObj.getTime())) return "";
        const y = dateObj.getFullYear();
        const m = (dateObj.getMonth() + 1).toString().padStart(2, '0');
        const d = dateObj.getDate().toString().padStart(2, '0');
        return `${y}-${m}-${d}`;
    }

    /**
     * Retorna fecha en formato local YYYY-MM.
     * @param {Date} dateObj - Objeto Date.
     * @returns {string} Año y mes formateados.
     */
    function getLocalYM(dateObj) {
        if (!dateObj || isNaN(dateObj.getTime())) return "";
        const y = dateObj.getFullYear();
        const m = (dateObj.getMonth() + 1).toString().padStart(2, '0');
        return `${y}-${m}`;
    }

    /**
     * Retorna un color hex aleatorio de una paleta prefijada.
     * @returns {string} Código de color hex.
     */
    function colorAleatorio() {
        const tones = ['#2563eb', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#f97316'];
        return tones[Math.floor(Math.random() * tones.length)];
    }

    return {
        escapeHTML,
        safeParse,
        formatearTurno,
        getLocalYMD,
        getLocalYM,
        colorAleatorio
    };
}));
