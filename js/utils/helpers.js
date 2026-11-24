/**
 * @file helpers.js
 * @description Funciones puras de utilidad para sanitización XSS, prevención de CSV/Formula Injection,
 * validación de esquemas JSON, detección de plataforma (PC/Móvil/Capacitor) y formateo.
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
     * @param {unknown} inputStr - Valor a sanitizar.
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
     * Sanitiza un valor antes de enviarlo a Google Sheets o exportarlo a Excel/CSV
     * para prevenir vulnerabilidades de CSV / Formula Injection (=CMD(), +..., -..., @...).
     * @param {unknown} value - Valor a sanitizar para celda de hoja de cálculo.
     * @returns {string|number} Valor seguro para hojas de cálculo.
     */
    function sanitizeForSpreadsheet(value) {
        if (value === null || value === undefined) return '';
        if (typeof value === 'number' && Number.isFinite(value)) return value;
        const strVal = String(value).trim();
        if (/^[=+\-@\t\r]/.test(strVal)) {
            return `'${strVal}`;
        }
        return strVal;
    }

    /**
     * Valida y sanitiza un color CSS hexadecimal o variable CSS permitida para prevenir style injection.
     * @param {unknown} colorStr - Cadena de color a validar.
     * @param {string} [fallback='#2563eb'] - Color por defecto si es inválido.
     * @returns {string} Color hexadecimal seguro.
     */
    function sanitizeColor(colorStr, fallback = '#2563eb') {
        if (!colorStr || typeof colorStr !== 'string') return fallback;
        const clean = colorStr.trim();
        if (/^#[0-9a-fA-F]{3,8}$/.test(clean)) return clean;
        if (/^var\(--[a-zA-Z0-9\-]+\)$/.test(clean)) return clean;
        return fallback;
    }

    /**
     * Parsing seguro de JSON almacenado con protección contra Prototype Pollution y fallback automático.
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
            const parsed = JSON.parse(rawData, (propKey, propValue) => {
                if (propKey === '__proto__' || propKey === 'constructor' || propKey === 'prototype') {
                    return undefined;
                }
                return propValue;
            });
            return parsed !== null && parsed !== undefined ? parsed : fallback;
        } catch (error) {
            console.warn(`[StorageNotice] Parsing no estándar para clave "${key}". Aplicando fallback por defecto.`, error.message);
            return fallback;
        }
    }

    /**
     * Valida y normaliza un registro de servicio entrante desde JSON externo o nube.
     * @param {Record<string, unknown>} rawItem - Objeto sin validar.
     * @returns {{valid: boolean, record: Object|null}} Resultado de validación y registro limpio.
     */
    function validateServicioRecord(rawItem) {
        if (!rawItem || typeof rawItem !== 'object' || Array.isArray(rawItem)) {
            return { valid: false, record: null };
        }
        const props = (rawItem.extendedProps && typeof rawItem.extendedProps === 'object')
            ? rawItem.extendedProps
            : rawItem;

        const rawFecha = String(rawItem.start || rawItem.fecha || rawItem.Fecha || '').trim();
        const fechaClean = rawFecha.includes('T') ? rawFecha.split('T')[0] : rawFecha;
        if (!/^\d{4}-\d{2}-\d{2}$/.test(fechaClean)) {
            return { valid: false, record: null };
        }

        const policia = String(props.policia || props.Policia || props.policiaNombre || '').trim().slice(0, 120);
        const empresa = String(props.empresa || props.Empresa || '').trim().slice(0, 120);
        const turno = String(props.turno || props.Turno || '').trim().slice(0, 40);
        const cat = String(props.cat || props.categoria || props.Categoria || 'A').trim().toUpperCase().slice(0, 10);

        if (!policia || !empresa) {
            return { valid: false, record: null };
        }

        const rawCost = Number(props.cost ?? props.costo ?? props.Costo ?? 0);
        const rawHours = Number(props.h ?? props.hora ?? props.Hora ?? 8);
        const cost = Number.isFinite(rawCost) && rawCost >= 0 ? rawCost : 0;
        const h = Number.isFinite(rawHours) && rawHours > 0 && rawHours <= 24 ? rawHours : 8;
        const vh = h > 0 ? cost / h : 0;

        return {
            valid: true,
            record: {
                fecha: fechaClean,
                policia,
                empresa,
                turno: turno || '07-15',
                cat: /^[A-Z+]+$/.test(cat) ? cat : 'A',
                cost,
                h,
                vh,
                detail: Array.isArray(props.detail) ? props.detail : [{ cat, h, vh, cost }]
            }
        };
    }

    /**
     * Formatea un rango de turno (ej. "06-14" -> "06HS A 14HS").
     * @param {string} turnoStr - Cadena de turno.
     * @returns {string} Texto formateado de turno.
     */
    function formatearTurno(turnoStr) {
        if (!turnoStr) return "";
        const cleanStr = String(turnoStr).trim();
        if (!cleanStr.includes("-")) return cleanStr;
        const parts = cleanStr.split("-");
        return `${parts[0]}HS A ${parts[1]}HS`;
    }

    /**
     * Retorna fecha en formato local YYYY-MM-DD.
     * @param {Date} dateObj - Objeto Date.
     * @returns {string} Fecha formateada.
     */
    function getLocalYMD(dateObj) {
        if (!dateObj || !(dateObj instanceof Date) || isNaN(dateObj.getTime())) return "";
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
        if (!dateObj || !(dateObj instanceof Date) || isNaN(dateObj.getTime())) return "";
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

    /**
     * Detecta el contexto de ejecución actual (PC, Móvil Web o Capacitor Android APK).
     * @returns {{isNativeAPK: boolean, isMobileViewport: boolean, isTouchDevice: boolean, mode: 'apk'|'mobile-web'|'desktop'}}
     */
    function detectPlatformContext() {
        const hasWindow = typeof window !== 'undefined';
        const isNativeAPK = Boolean(
            hasWindow &&
            window.Capacitor &&
            typeof window.Capacitor.isNativePlatform === 'function' &&
            window.Capacitor.isNativePlatform()
        );
        const isMobileViewport = Boolean(
            hasWindow &&
            ((window.innerWidth && window.innerWidth <= 768) ||
                (window.matchMedia && window.matchMedia('(max-width: 768px)').matches))
        );
        const isTouchDevice = Boolean(
            hasWindow &&
            (('ontouchstart' in window) ||
                (navigator && navigator.maxTouchPoints > 0) ||
                (window.matchMedia && window.matchMedia('(hover: none) and (pointer: coarse)').matches))
        );
        const mode = isNativeAPK ? 'apk' : (isMobileViewport ? 'mobile-web' : 'desktop');
        return { isNativeAPK, isMobileViewport: isMobileViewport || isNativeAPK, isTouchDevice, mode };
    }

    return {
        escapeHTML,
        sanitizeForSpreadsheet,
        sanitizeColor,
        safeParse,
        validateServicioRecord,
        formatearTurno,
        getLocalYMD,
        getLocalYM,
        colorAleatorio,
        detectPlatformContext
    };
}));
