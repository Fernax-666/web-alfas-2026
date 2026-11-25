/**
 * @file helpers.js
 * @description Funciones puras de utilidad para sanitización XSS, prevención de CSV/Formula Injection,
 * validación de esquemas JSON, gestión de 2 Temas Visuales (Claro Original y Oscuro), detección de plataforma y formateo.
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

    const THEME_STORAGE_KEY = 'alfa_app_theme';
    const AVAILABLE_THEMES = ['light', 'dark'];

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
     * Formatea un rango de turno de forma ultracompacta para celdas de calendario móvil (ej. "07-15hs").
     * @param {string} turnoStr 
     * @returns {string}
     */
    function formatearTurnoCorto(turnoStr) {
        if (!turnoStr) return "";
        const cleanStr = String(turnoStr).trim().replace(/HS/gi, '').replace(/\s+A\s+/gi, '-').trim();
        if (!cleanStr.includes("-")) return cleanStr;
        const parts = cleanStr.split("-").map(p => p.trim());
        return `${parts[0]}-${parts[1]}hs`;
    }

    /**
     * Abrevia el nombre de un efectivo para celdas estrechas en móvil (ej. "Olivera Fernando" -> "Olivera F.").
     * @param {string} nombreStr 
     * @returns {string}
     */
    function abreviarNombrePolicia(nombreStr) {
        if (!nombreStr) return "";
        const parts = String(nombreStr).trim().split(/\s+/);
        if (parts.length <= 1) return parts[0] || "";
        return `${parts[0]} ${parts[1].charAt(0)}.`;
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
     * Retorna un color hex aleatorio de una paleta prefijada de alto contraste.
     * @returns {string} Código de color hex.
     */
    function colorAleatorio() {
        const tones = [
            '#2563eb', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6',
            '#ec4899', '#06b6d4', '#f97316', '#0284c7', '#4f46e5',
            '#0d9488', '#d97706', '#dc2626', '#7c3aed', '#db2777'
        ];
        return tones[Math.floor(Math.random() * tones.length)];
    }

    /**
     * Retorna un color distintivo para una empresa dada para diferenciar precartones en el calendario.
     * @param {string} empresaName 
     * @returns {string} Color hex para el borde/indicador de la empresa.
     */
    function getEmpresaColor(empresaName) {
        const clean = String(empresaName || "").toUpperCase().trim();
        const map = {
            "PALADINI": "#16a34a",
            "SIGLO21 (P1)": "#2563eb",
            "SIGLO21 (P2)": "#d97706",
            "SIGLO21 (P3)": "#9333ea"
        };
        if (map[clean]) return map[clean];
        let hash = 0;
        for (let i = 0; i < clean.length; i++) {
            hash = clean.charCodeAt(i) + ((hash << 5) - hash);
        }
        const palette = ['#0284c7', '#e11d48', '#059669', '#7c3aed', '#ea580c', '#4f46e5'];
        return palette[Math.abs(hash) % palette.length];
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

    /**
     * Obtiene el tema visual guardado ('light' o 'dark').
     * @returns {'light'|'dark'}
     */
    function getSavedTheme() {
        if (typeof localStorage !== 'undefined') {
            const saved = localStorage.getItem(THEME_STORAGE_KEY);
            if (saved && AVAILABLE_THEMES.includes(saved)) return saved;
        }
        return 'light';
    }

    /**
     * Aplica y persiste uno de los 2 temas permitidos ('light' original o 'dark' oscuro).
     * @param {'light'|'dark'} themeName 
     * @returns {'light'|'dark'} Tema aplicado.
     */
    function applyTheme(themeName) {
        const validTheme = AVAILABLE_THEMES.includes(themeName) ? themeName : 'light';
        if (typeof localStorage !== 'undefined') {
            localStorage.setItem(THEME_STORAGE_KEY, validTheme);
        }
        if (typeof document !== 'undefined' && document.documentElement) {
            document.documentElement.setAttribute('data-theme', validTheme);
        }
        return validTheme;
    }

    return {
        AVAILABLE_THEMES,
        escapeHTML,
        sanitizeForSpreadsheet,
        sanitizeColor,
        safeParse,
        validateServicioRecord,
        formatearTurno,
        formatearTurnoCorto,
        abreviarNombrePolicia,
        getLocalYMD,
        getLocalYM,
        colorAleatorio,
        getEmpresaColor,
        detectPlatformContext,
        getSavedTheme,
        applyTheme
    };
}));
