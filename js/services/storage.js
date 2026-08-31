/**
 * @file storage.js
 * @description Servicio de almacenamiento local y migraciones de esquemas para la aplicación.
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
        let policias = policiasRaw.map(item => typeof item === "string" ? { nombre: item, jerarquia: "" } : item);

        let empresas = safeParse(storageObj, "empresas", defaultEmpresas);
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

        return {
            CATEGORIAS,
            config,
            policias,
            empresas,
            coloresPolicia
        };
    }

    /**
     * Guarda el listado de policías en localStorage.
     * @param {Array} policiasList 
     */
    function savePolicias(policiasList) {
        if (typeof localStorage !== 'undefined') {
            localStorage.setItem("policias", JSON.stringify(policiasList));
        }
    }

    /**
     * Guarda el mapa de empresas en localStorage.
     * @param {Object} empresasMap 
     */
    function saveEmpresas(empresasMap) {
        if (typeof localStorage !== 'undefined') {
            localStorage.setItem("empresas", JSON.stringify(empresasMap));
        }
    }

    /**
     * Guarda la configuración de tarifas en localStorage.
     * @param {Object} configMap 
     */
    function saveConfig(configMap) {
        if (typeof localStorage !== 'undefined') {
            localStorage.setItem("config_alfas", JSON.stringify(configMap));
        }
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

    return {
        CATEGORIAS,
        defaultConfig,
        defaultPolicias,
        defaultEmpresas,
        initStorage,
        savePolicias,
        saveEmpresas,
        saveConfig,
        saveColores
    };
}));
