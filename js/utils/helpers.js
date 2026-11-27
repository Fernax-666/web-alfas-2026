/**
 * @file helpers.js
 * @description Funciones puras de utilidad para sanitización XSS, prevención de CSV/Formula Injection,
 * validación de esquemas JSON, gestión de 2 Temas Visuales (Claro Original y Oscuro),
 * gestión de 4 Portadas de Inicio (portada_1, portada_2, portada_03, portada_04),
 * paleta de eventos que evita el azul de los botones (#2563eb) para destacar en el calendario,
 * detección de plataforma y formateo.
 * Compatible con entornos de Navegador (window.AlfaUtils) y Node.js (CommonJS).
 */

(function (root, factory) {
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = factory();
    } else {
        root.AlfaUtils = factory();
    }
}(typeof self !== 'undefined' ? self : this, function () {

    const THEME_STORAGE_KEY = 'alfa_app_theme';
    const AVAILABLE_THEMES = ['light', 'dark'];

    const SPLASH_STORAGE_KEY = 'alfa_app_splash_cover';
    const SPLASH_SESSION_SHOWN_KEY = 'alfa_splash_shown_in_session';
    const AVAILABLE_SPLASH_COVERS = {
        'portada_1': {
            id: 'portada_1',
            nombre: 'Portada 1 (Realista Institucional)',
            src: 'img/portada_1.jpg',
            iconPrefix: 'p1',
            appIcon: 'img/icons/p1_icon_3.png',
            icons: {
                agenda: 'img/icons/p1_icon_1.png',
                precarton: 'img/icons/p1_icon_2.png',
                app: 'img/icons/p1_icon_3.png',
                resumen: 'img/icons/p1_icon_4.png',
                historial: 'img/icons/p1_icon_5.png',
                config: 'img/icons/p1_icon_5.png'
            },
            iconsList: [
                'img/icons/p1_icon_1.png',
                'img/icons/p1_icon_2.png',
                'img/icons/p1_icon_3.png',
                'img/icons/p1_icon_4.png',
                'img/icons/p1_icon_5.png'
            ]
        },
        'portada_2': {
            id: 'portada_2',
            nombre: 'Portada 2 (Ilustrada Diurna)',
            src: 'img/portada_2.jpg',
            iconPrefix: 'p2',
            appIcon: 'img/icons/p2_icon_3.png',
            icons: {
                agenda: 'img/icons/p2_icon_1.png',
                precarton: 'img/icons/p2_icon_2.png',
                app: 'img/icons/p2_icon_3.png',
                resumen: 'img/icons/p2_icon_4.png',
                historial: 'img/icons/p2_icon_5.png',
                config: 'img/icons/p2_icon_5.png'
            },
            iconsList: [
                'img/icons/p2_icon_1.png',
                'img/icons/p2_icon_2.png',
                'img/icons/p2_icon_3.png',
                'img/icons/p2_icon_4.png',
                'img/icons/p2_icon_5.png'
            ]
        },
        'portada_03': {
            id: 'portada_03',
            nombre: 'Portada 03 (Digital Cyber Azul)',
            src: 'img/portada_03.jpg',
            iconPrefix: 'p3',
            appIcon: 'img/icons/p3_icon_3.png',
            icons: {
                agenda: 'img/icons/p3_icon_1.png',
                precarton: 'img/icons/p3_icon_2.png',
                app: 'img/icons/p3_icon_3.png',
                resumen: 'img/icons/p3_icon_4.png',
                historial: 'img/icons/p3_icon_5.png',
                config: 'img/icons/p3_icon_5.png'
            },
            iconsList: [
                'img/icons/p3_icon_1.png',
                'img/icons/p3_icon_2.png',
                'img/icons/p3_icon_3.png',
                'img/icons/p3_icon_4.png',
                'img/icons/p3_icon_5.png'
            ]
        },
        'portada_04': {
            id: 'portada_04',
            nombre: 'Portada 04 (Táctica Carbono Dorado)',
            src: 'img/portada_04.jpg',
            iconPrefix: 'p4',
            appIcon: 'img/icons/p4_icon_3.png',
            icons: {
                agenda: 'img/icons/p4_icon_1.png',
                precarton: 'img/icons/p4_icon_2.png',
                app: 'img/icons/p4_icon_3.png',
                resumen: 'img/icons/p4_icon_4.png',
                historial: 'img/icons/p4_icon_5.png',
                config: 'img/icons/p4_icon_5.png'
            },
            iconsList: [
                'img/icons/p4_icon_1.png',
                'img/icons/p4_icon_2.png',
                'img/icons/p4_icon_3.png',
                'img/icons/p4_icon_4.png',
                'img/icons/p4_icon_5.png'
            ]
        }
    };

    // Paleta de colores para turnos agendados en el calendario: EXCLUYE el azul de los botones (#2563eb / #1e40af / #3b82f6)
    // para que las etiquetas agendadas siempre destaquen visualmente respecto a los controles de la interfaz (Imagen 1).
    const EVENT_DISTINCT_PALETTE = [
        '#0d9488', // Teal intenso
        '#7c3aed', // Violeta profundo
        '#d97706', // Ámbar dorado
        '#db2777', // Magenta policial
        '#059669', // Esmeralda oscuro
        '#dc2626', // Rojo carmesí
        '#9333ea', // Púrpura brillante
        '#ea580c', // Naranja táctico
        '#0891b2', // Cian oscuro
        '#4f46e5', // Índigo violeta
        '#be123c', // Rubí
        '#15803d', // Verde bosque
        '#b45309', // Bronce
        '#6d28d9', // Amatista
        '#0f766e'  // Verde mar
    ];

    const FORBIDDEN_BUTTON_BLUES = ['#2563eb', '#1e40af', '#3b82f6', '#1d4ed8'];

    function escapeHTML(inputStr) {
        if (inputStr === null || inputStr === undefined) return '';
        return String(inputStr)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

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
     * Valida y sanitiza un color CSS hexadecimal o variable CSS permitida.
     * @param {unknown} colorStr - Cadena de color a validar.
     * @param {string} [fallback='#0d9488'] - Color por defecto si es inválido.
     * @returns {string} Color hexadecimal seguro.
     */
    function sanitizeColor(colorStr, fallback = '#0d9488') {
        if (!colorStr || typeof colorStr !== 'string') return fallback;
        const clean = colorStr.trim();
        if (/^#[0-9a-fA-F]{3,8}$/.test(clean)) return clean;
        if (/^var\(--[a-zA-Z0-9\-]+\)$/.test(clean)) return clean;
        return fallback;
    }

    /**
     * Garantiza que el color de un evento agendado en el calendario NUNCA sea el color azul de los botones
     * de la interfaz (#2563eb), asignando un color contrastante que destaque a simple vista (Imagen 1).
     * @param {string} colorStr - Color actual del policía o evento.
     * @param {string} [seedName=""] - Nombre del policía o empresa para elegir color determinístico de la paleta.
     * @returns {string} Color hex contrastante distinto del azul de los botones.
     */
    function ensureDistinctEventColor(colorStr, seedName = "") {
        const clean = String(colorStr || "").trim().toLowerCase();
        if (clean && /^#[0-9a-f]{6}$/.test(clean) && !FORBIDDEN_BUTTON_BLUES.includes(clean)) {
            return clean;
        }
        let hash = 0;
        const seed = String(seedName || "alfa");
        for (let i = 0; i < seed.length; i++) {
            hash = seed.charCodeAt(i) + ((hash << 5) - hash);
        }
        return EVENT_DISTINCT_PALETTE[Math.abs(hash) % EVENT_DISTINCT_PALETTE.length];
    }

    function isValidGmailAddress(emailStr) {
        if (!emailStr || typeof emailStr !== 'string') return false;
        const clean = emailStr.trim().toLowerCase();
        return /^[a-z0-9._%+\-]+@(gmail\.com|googlemail\.com|[a-z0-9.\-]+\.[a-z]{2,})$/.test(clean);
    }

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

    function formatearTurno(turnoStr) {
        if (!turnoStr) return "";
        const cleanStr = String(turnoStr).trim();
        if (!cleanStr.includes("-")) return cleanStr;
        const parts = cleanStr.split("-");
        return `${parts[0]}HS A ${parts[1]}HS`;
    }

    function formatearTurnoCorto(turnoStr) {
        if (!turnoStr) return "";
        const cleanStr = String(turnoStr).trim().replace(/HS/gi, '').replace(/\s+A\s+/gi, '-').trim();
        if (!cleanStr.includes("-")) return cleanStr;
        const parts = cleanStr.split("-").map(p => p.trim());
        return `${parts[0]}-${parts[1]}hs`;
    }

    function abreviarNombrePolicia(nombreStr) {
        if (!nombreStr) return "";
        const parts = String(nombreStr).trim().split(/\s+/);
        if (parts.length <= 1) return parts[0] || "";
        return `${parts[0]} ${parts[1].charAt(0)}.`;
    }

    function getLocalYMD(dateObj) {
        if (!dateObj || !(dateObj instanceof Date) || isNaN(dateObj.getTime())) return "";
        const y = dateObj.getFullYear();
        const m = (dateObj.getMonth() + 1).toString().padStart(2, '0');
        const d = dateObj.getDate().toString().padStart(2, '0');
        return `${y}-${m}-${d}`;
    }

    function getLocalYM(dateObj) {
        if (!dateObj || !(dateObj instanceof Date) || isNaN(dateObj.getTime())) return "";
        const y = dateObj.getFullYear();
        const m = (dateObj.getMonth() + 1).toString().padStart(2, '0');
        return `${y}-${m}`;
    }

    function colorAleatorio() {
        return EVENT_DISTINCT_PALETTE[Math.floor(Math.random() * EVENT_DISTINCT_PALETTE.length)];
    }

    function getEmpresaColor(empresaName) {
        const clean = String(empresaName || "").toUpperCase().trim();
        const map = {
            "PALADINI": "#16a34a",
            "SIGLO21 (P1)": "#0891b2",
            "SIGLO21 (P2)": "#d97706",
            "SIGLO21 (P3)": "#9333ea"
        };
        if (map[clean]) return map[clean];
        let hash = 0;
        for (let i = 0; i < clean.length; i++) {
            hash = clean.charCodeAt(i) + ((hash << 5) - hash);
        }
        const palette = ['#0d9488', '#e11d48', '#059669', '#7c3aed', '#ea580c', '#4f46e5'];
        return palette[Math.abs(hash) % palette.length];
    }

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

    function getSavedTheme() {
        if (typeof localStorage !== 'undefined') {
            const saved = localStorage.getItem(THEME_STORAGE_KEY);
            if (saved && AVAILABLE_THEMES.includes(saved)) return saved;
        }
        return 'light';
    }

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

    /**
     * Obtiene la portada de inicio seleccionada ('portada_1', 'portada_2', 'portada_03', 'portada_04').
     * @returns {string}
     */
    function getSavedSplashCover() {
        if (typeof localStorage !== 'undefined') {
            const saved = localStorage.getItem(SPLASH_STORAGE_KEY);
            if (saved && AVAILABLE_SPLASH_COVERS[saved]) return saved;
        }
        return 'portada_1';
    }

    /**
     * Guarda la portada de inicio elegida por el usuario y aplica el tema de íconos correspondiente.
     * @param {string} coverId 
     * @returns {{id: string, nombre: string, src: string, appIcon: string, icons: Object, iconsList: string[]}}
     */
    function setSplashCover(coverId) {
        const validId = AVAILABLE_SPLASH_COVERS[coverId] ? coverId : 'portada_1';
        if (typeof localStorage !== 'undefined') {
            localStorage.setItem(SPLASH_STORAGE_KEY, validId);
        }
        applySplashCoverIconTheme(validId);
        return AVAILABLE_SPLASH_COVERS[validId];
    }

    /**
     * Obtiene el paquete de íconos personalizados asociado a una portada (o a la portada activa guardada).
     * @param {string} [coverId]
     * @returns {{id: string, nombre: string, src: string, appIcon: string, icons: Object, iconsList: string[]}}
     */
    function getCoverIconSet(coverId) {
        const targetId = (coverId && AVAILABLE_SPLASH_COVERS[coverId]) ? coverId : getSavedSplashCover();
        return AVAILABLE_SPLASH_COVERS[targetId] || AVAILABLE_SPLASH_COVERS.portada_1;
    }

    /**
     * Aplica dinámicamente el tema de íconos personalizados según la portada seleccionada:
     * actualiza el favicon/apple-touch-icon, el ícono institucional del encabezado (`[data-cover-app-icon]`)
     * y los 5 íconos de la barra de navegación (`[data-cover-nav-icon]`).
     * @param {string} [coverId]
     * @returns {Object} Objeto de la portada aplicada con sus íconos.
     */
    function applySplashCoverIconTheme(coverId) {
        const coverObj = getCoverIconSet(coverId);
        if (typeof document === 'undefined') return coverObj;

        if (document.documentElement) {
            document.documentElement.setAttribute('data-cover-theme', coverObj.id);
        }

        // 1. Actualizar Favicon y Apple Touch Icon dinámicamente al ícono central del patrullero (icon_3.png)
        ['icon', 'apple-touch-icon'].forEach(relType => {
            let linkEl = document.querySelector(`link[rel="${relType}"]`);
            if (!linkEl && document.head) {
                linkEl = document.createElement('link');
                linkEl.setAttribute('rel', relType);
                document.head.appendChild(linkEl);
            }
            if (linkEl) {
                linkEl.setAttribute('href', coverObj.appIcon);
            }
        });

        // 2. Actualizar ícono principal de la aplicación en encabezados
        document.querySelectorAll('[data-cover-app-icon]').forEach(imgEl => {
            imgEl.setAttribute('src', coverObj.appIcon);
            imgEl.setAttribute('alt', `Ícono ${coverObj.nombre}`);
        });

        // 3. Actualizar íconos de navegación personalizados según la fila de la portada activa
        document.querySelectorAll('[data-cover-nav-icon]').forEach(imgEl => {
            const slot = imgEl.getAttribute('data-cover-nav-icon');
            const iconSrc = (coverObj.icons && coverObj.icons[slot]) ? coverObj.icons[slot] : coverObj.appIcon;
            imgEl.setAttribute('src', iconSrc);
        });

        return coverObj;
    }

    function shouldShowSplashOnce(markAsShown = true) {
        if (typeof sessionStorage === 'undefined') return false;
        const alreadyShown = sessionStorage.getItem(SPLASH_SESSION_SHOWN_KEY) === 'true';
        if (!alreadyShown && markAsShown) {
            sessionStorage.setItem(SPLASH_SESSION_SHOWN_KEY, 'true');
        }
        return !alreadyShown;
    }

    return {
        AVAILABLE_THEMES,
        AVAILABLE_SPLASH_COVERS,
        EVENT_DISTINCT_PALETTE,
        FORBIDDEN_BUTTON_BLUES,
        escapeHTML,
        sanitizeForSpreadsheet,
        sanitizeColor,
        ensureDistinctEventColor,
        isValidGmailAddress,
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
        applyTheme,
        getSavedSplashCover,
        setSplashCover,
        getCoverIconSet,
        applySplashCoverIconTheme,
        shouldShowSplashOnce
    };
}));
