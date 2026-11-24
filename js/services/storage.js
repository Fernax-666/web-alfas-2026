/**
 * @file storage.js
 * @description Servicio de almacenamiento local, migraciones de esquemas y puente con AlfaDatabase (SQLite/IndexedDB).
 * Compatible con entornos de Navegador (window.AlfaStorage) y Node.js (CommonJS).
 */

(function (root, factory) {
    if (typeof module !== 'undefined' && module.exports) {
        // Entorno Node.js
        module.exports = factory();
    } else {
        // Entorno Navegador
        root.AlfaStorage = factory();
    }
}(typeof self !== 'undefined' ? self : this, function () {

    const CATEGORIAS = ["A", "AP", "B", "BP", "E", "HE", "HO"];

    const defaultConfig = {
        A: 14993, AP: 16983.75, B: 16983.75, BP: 18736.5, E: 10638.75, HE: 5956.53, HO: 8121.36
    };

    const defaultPolicias = [
        { nombre: "Orellano Roberto", jerarquia: "" },
        { nombre: "Orellano Andres", jerarquia: "" },
        { nombre: "Guzman Yael", jerarquia: "" },
        { nombre: "Casalegno Gabriela", jerarquia: "" },
        { nombre: "Castro Roque", jerarquia: "" },
        { nombre: "Vivas Lucas", jerarquia: "" },
        { nombre: "Silva Cesar", jerarquia: "" },
        { nombre: "Durbano Martin", jerarquia: "" },
        { nombre: "Olivera Fernando", jerarquia: "" },
        { nombre: "Maldonado Mercedes", jerarquia: "" }
    ];

    const defaultEmpresas = {
        "PALADINI": { turnos: ["06-14", "14-22", "22-06", "07:30-15:30"], catSemana: "A", catFinde: "AP" },
        "SIGLO21 (P1)": { turnos: ["07-15", "15-23"], catSemana: "A", catFinde: "AP" },
        "SIGLO21 (P2)": { turnos: ["07-15", "15-23"], catSemana: "A", catFinde: "AP" },
        "SIGLO21 (P3)": { turnos: ["07-15", "15-23", "23-07"], catSemana: "A", catFinde: "AP" }
    };

    /**
     * Obtiene la instancia de AlfaDatabase si está disponible en el entorno.
     * @returns {Object|null}
     */
    function getDatabaseRef() {
        if (typeof window !== 'undefined' && window.AlfaDatabase) return window.AlfaDatabase;
        try {
            if (typeof require === 'function') return require('./database.js');
        } catch (_) {
            // No disponible
        }
        return null;
    }

    /**
     * Carga y realiza migraciones del estado inicial del sistema.
     * @param {Object} helpers - Instancia del módulo AlfaUtils.
     * @returns {Object} Estado inicial parseado y migrado.
     */
    function initStorage(helpers) {
        const safeParse = (helpers && helpers.safeParse) ? helpers.safeParse : (storage, key, fb) => fb;
        const storageObj = (typeof localStorage !== 'undefined') ? localStorage : {};

        let config = safeParse(storageObj, "config_alfas", defaultConfig);
        let policiasRaw = safeParse(storageObj, "policias", defaultPolicias);

        // Migración de policías (string[] -> {nombre, jerarquia}[])
        let policias = (Array.isArray(policiasRaw) ? policiasRaw : defaultPolicias).map(item =>
            typeof item === "string" ? { nombre: item, jerarquia: "" } : { nombre: String(item.nombre || ""), jerarquia: String(item.jerarquia || "") }
        ).filter(p => p.nombre);

        let empresas = safeParse(storageObj, "empresas", defaultEmpresas);
        if (!empresas || typeof empresas !== 'object' || Array.isArray(empresas)) {
            empresas = { ...defaultEmpresas };
        }
        // Migración de empresas (array de turnos -> objeto estructurado)
        Object.keys(empresas).forEach(nombre => {
            if (Array.isArray(empresas[nombre])) {
                empresas[nombre] = { turnos: empresas[nombre], catSemana: "A", catFinde: "AP" };
            }
        });

        let coloresPolicia = safeParse(storageObj, "colores_policia", {});
        if (helpers && helpers.colorAleatorio) {
            policias.forEach(p => {
                if (!coloresPolicia[p.nombre]) {
                    coloresPolicia[p.nombre] = helpers.colorAleatorio();
                }
            });
        }

        if (typeof localStorage !== 'undefined') {
            if (!localStorage.getItem("policias")) localStorage.setItem("policias", JSON.stringify(policias));
            if (!localStorage.getItem("empresas")) localStorage.setItem("empresas", JSON.stringify(empresas));
            if (!localStorage.getItem("colores_policia")) localStorage.setItem("colores_policia", JSON.stringify(coloresPolicia));
        }

        // Inicializar y sincronizar en segundo plano con AlfaDatabase (SQLite / IndexedDB)
        const db = getDatabaseRef();
        if (db && typeof db.initDatabase === 'function') {
            db.initDatabase().then(() => {
                const evs = safeParse(storageObj, "eventos", []);
                db.syncStateToLocalDB({ config, policias, empresas, coloresPolicia, eventos: evs });
            }).catch(() => {});
        }

        return {
            CATEGORIAS,
            config,
            policias,
            empresas,
            coloresPolicia
        };
    }

    /**
     * Guarda el listado de policías en localStorage y en la base de datos local SQLite/IndexedDB.
     * @param {Array} policiasList 
     * @param {Object} [coloresMap]
     */
    function savePolicias(policiasList, coloresMap) {
        if (typeof localStorage !== 'undefined') {
            localStorage.setItem("policias", JSON.stringify(policiasList));
        }
        const db = getDatabaseRef();
        if (db) db.syncStateToLocalDB({ policias: policiasList, coloresPolicia: coloresMap });
    }

    /**
     * Guarda el mapa de empresas en localStorage y en la base de datos local SQLite/IndexedDB.
     * @param {Object} empresasMap 
     */
    function saveEmpresas(empresasMap) {
        if (typeof localStorage !== 'undefined') {
            localStorage.setItem("empresas", JSON.stringify(empresasMap));
        }
        const db = getDatabaseRef();
        if (db) db.syncStateToLocalDB({ empresas: empresasMap });
    }

    /**
     * Guarda la configuración de tarifas en localStorage y en la base de datos local SQLite/IndexedDB.
     * @param {Object} configMap 
     */
    function saveConfig(configMap) {
        if (typeof localStorage !== 'undefined') {
            localStorage.setItem("config_alfas", JSON.stringify(configMap));
        }
        const db = getDatabaseRef();
        if (db) db.syncStateToLocalDB({ config: configMap });
    }

    /**
     * Guarda el mapa de colores por policía en localStorage.
     * @param {Object} coloresMap 
     */
    function saveColores(coloresMap) {
        if (typeof localStorage !== 'undefined') {
            localStorage.setItem("colores_policia", JSON.stringify(coloresMap));
        }
    }

    /**
     * Guarda la lista de eventos/servicios en localStorage y sincroniza la tabla `servicios` en SQLite/IndexedDB.
     * @param {Array} eventosList 
     */
    function saveEventos(eventosList) {
        if (typeof localStorage !== 'undefined') {
            localStorage.setItem("eventos", JSON.stringify(eventosList));
        }
        const db = getDatabaseRef();
        if (db) db.syncStateToLocalDB({ eventos: eventosList });
    }

    return {
        CATEGORIAS,
        defaultConfig,
        defaultPolicias,
        defaultEmpresas,
        initStorage,
        savePolicias,
        saveEmpresas,
        saveConfig,
        saveColores,
        saveEventos
    };
}));
