/**
 * @file storage.js
 * @description Servicio de almacenamiento local, migraciones automáticas de padron oficial de 29 Policías
 * y 4 Empresas con metadatos completos, y puente con AlfaDatabase (SQLite/IndexedDB).
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
    const MASTER_DATA_VERSION_KEY = "alfa_master_seed_v15";

    const defaultConfig = {
        A: 14993, AP: 16983.75, B: 16983.75, BP: 18736.5, E: 10638.75, HE: 5956.53, HO: 8121.36
    };

    // Padrón Oficial de 29 Efectivos Policiales con su Jerarquía (según planilla oficial adjunta)
    const defaultPolicias = [
        { nombre: "Olivera Fernando", jerarquia: "Sgto. Ayte." },
        { nombre: "Bracamonte Jonathan", jerarquia: "Cabo 1°" },
        { nombre: "Felix Noelia", jerarquia: "Cabo 1°" },
        { nombre: "Granado Diaz Emanuel", jerarquia: "Cabo 1°" },
        { nombre: "Pelliza Jorge", jerarquia: "Cabo 1°" },
        { nombre: "Perez Jesica Belen", jerarquia: "Cabo 1°" },
        { nombre: "Casabona Flavio", jerarquia: "Cabo" },
        { nombre: "Razzi Victoria", jerarquia: "Cabo" },
        { nombre: "Corzo Carlos", jerarquia: "Sgto 1°" },
        { nombre: "Lazcano Alejandro", jerarquia: "Sgto 1°" },
        { nombre: "Arroyo Pablo", jerarquia: "Sgto. Ayte." },
        { nombre: "Ortiz Juan", jerarquia: "Sgto 1°" },
        { nombre: "Rey Ruben", jerarquia: "Sgto. Ayte." },
        { nombre: "Bracamonte Sebastian", jerarquia: "Sgto." },
        { nombre: "Castro Francisco", jerarquia: "Sgto." },
        { nombre: "Godoy Damian", jerarquia: "Sgto." },
        { nombre: "Lescano Diego", jerarquia: "Sgto." },
        { nombre: "Atampi Martin", jerarquia: "Subof. Ppal" },
        { nombre: "Flores Oriana", jerarquia: "Of. Sub. Insp." },
        { nombre: "Di Piazza Javier", jerarquia: "Of. Sub. Insp." },
        { nombre: "Personal Eventual", jerarquia: "Agente" },
        { nombre: "Orellano Roberto", jerarquia: "Subof. My" },
        { nombre: "Orellano Andres", jerarquia: "Cabo 1°" },
        { nombre: "Guzman Yael", jerarquia: "Cabo 1°" },
        { nombre: "Casalegno Gabriela", jerarquia: "Sgto 1°" },
        { nombre: "Castro Roque", jerarquia: "Sgto 1°" },
        { nombre: "Vivas Lucas", jerarquia: "Cabo" },
        { nombre: "Silva Cesar", jerarquia: "Sgto. Ayte." },
        { nombre: "Durbano Martin", jerarquia: "Subof. My" },
        { nombre: "Beiros Nicole", jerarquia: "Of. Insp." },
        { nombre: "Beiros Karen", jerarquia: "Of. Insp." }
    ];

    // Padrón Oficial de Empresas con sus Turnos y Metadatos Completos (según planilla oficial adjunta)
    const defaultEmpresas = {
        "PALADINI": {
            turnos: ["06-14", "14-22", "22-06", "07:30-15:30"],
            catSemana: "A",
            catFinde: "AP",
            nroServicio: "165",
            telefono: "4568585",
            domicilio: "CARLOS TEJEDOR",
            barrio: "SARMIENTO",
            referente: "TEMPERINI GUILLERMO",
            telReferente: "4568585",
            policiaEnc: "SUBOF. MY (R) ORELLANO ROBERTO",
            telPoliciaEnc: "3513557333"
        },
        "SIGLO21 (P1)": {
            turnos: ["07-15", "15-23"],
            catSemana: "A",
            catFinde: "AP",
            nroServicio: "1134",
            telefono: "0351-4757583",
            domicilio: "AV. MONSEÑOR PABLO CABRERA KM 8.5",
            barrio: "LOS BOULEVARES",
            referente: "RODRIGUEZ GONZALO",
            telReferente: "0351-4757583",
            policiaEnc: "SUBOF. MY. ORELLANO ROBERTO",
            telPoliciaEnc: "3513557333"
        },
        "SIGLO21 (P2)": {
            turnos: ["07-15", "15-23"],
            catSemana: "A",
            catFinde: "AP",
            nroServicio: "1134",
            telefono: "0351-4757583",
            domicilio: "AV. MONSEÑOR PABLO CABRERA KM 8.5",
            barrio: "LOS BOULEVARES",
            referente: "RODRIGUEZ GONZALO",
            telReferente: "0351-4757583",
            policiaEnc: "SUBOF. MY. ORELLANO ROBERTO",
            telPoliciaEnc: "3513557333"
        },
        "SIGLO21 (P3)": {
            turnos: ["07-15", "15-23", "23-07"],
            catSemana: "A",
            catFinde: "AP",
            nroServicio: "1137",
            telefono: "0351-4757583",
            domicilio: "AV. MONSEÑOR PABLO CABRERA KM 8.5",
            barrio: "LOS BOULEVARES",
            referente: "RODRIGUEZ GONZALO",
            telReferente: "0351-4757583",
            policiaEnc: "SUBOF. MY. ORELLANO ROBERTO",
            telPoliciaEnc: "3513557333"
        }
    };

    /**
     * Obtiene la instancia de AlfaDatabase si está disponible en el entorno.
     * @returns {Object|null}
     */
    function getDatabaseRef() {
        if (typeof window !== 'undefined' && window.AlfaDatabase) return window.AlfaDatabase;
        try {
            if (typeof require === 'function') return require('./database.js');
        } catch (_) {}
        return null;
    }

    /**
     * Carga y realiza migraciones del estado inicial del sistema fusionando el nuevo padrón de policías y empresas.
     * @param {Object} helpers - Instancia del módulo AlfaUtils.
     * @returns {Object} Estado inicial parseado y migrado.
     */
    function initStorage(helpers) {
        const safeParse = (helpers && helpers.safeParse) ? helpers.safeParse : (storage, key, fb) => fb;
        const storageObj = (typeof localStorage !== 'undefined') ? localStorage : {};

        let config = safeParse(storageObj, "config_alfas", defaultConfig);
        let policiasRaw = safeParse(storageObj, "policias", defaultPolicias);

        // Normalizar policías almacenados
        let policias = (Array.isArray(policiasRaw) ? policiasRaw : defaultPolicias).map(item =>
            typeof item === "string"
                ? { nombre: item.trim(), jerarquia: "" }
                : { nombre: String(item.nombre || "").trim(), jerarquia: String(item.jerarquia || "").trim() }
        ).filter(p => p.nombre);

        // Fusionar con el nuevo padrón oficial (actualiza jerarquías vacías y añade los nuevos efectivos)
        const polMap = new Map();
        defaultPolicias.forEach(dp => {
            polMap.set(dp.nombre.toLowerCase(), { nombre: dp.nombre, jerarquia: dp.jerarquia });
        });
        policias.forEach(sp => {
            const key = sp.nombre.toLowerCase();
            if (polMap.has(key)) {
                const master = polMap.get(key);
                polMap.set(key, {
                    nombre: master.nombre,
                    jerarquia: sp.jerarquia || master.jerarquia
                });
            } else if (key !== "maldonado mercedes") {
                polMap.set(key, sp);
            }
        });
        policias = Array.from(polMap.values());

        // Fusionar empresas con los datos completos oficiales
        let empresas = safeParse(storageObj, "empresas", defaultEmpresas);
        if (!empresas || typeof empresas !== 'object' || Array.isArray(empresas)) {
            empresas = { ...defaultEmpresas };
        }
        Object.keys(empresas).forEach(nombre => {
            if (Array.isArray(empresas[nombre])) {
                empresas[nombre] = { turnos: empresas[nombre], catSemana: "A", catFinde: "AP" };
            }
        });
        Object.keys(defaultEmpresas).forEach(defKey => {
            const defEmp = defaultEmpresas[defKey];
            const curEmp = empresas[defKey] || {};
            empresas[defKey] = {
                turnos: Array.isArray(curEmp.turnos) && curEmp.turnos.length > 0 ? curEmp.turnos : defEmp.turnos,
                catSemana: curEmp.catSemana || defEmp.catSemana,
                catFinde: curEmp.catFinde || defEmp.catFinde,
                nroServicio: curEmp.nroServicio || defEmp.nroServicio,
                telefono: curEmp.telefono || defEmp.telefono,
                domicilio: curEmp.domicilio || defEmp.domicilio,
                barrio: curEmp.barrio || defEmp.barrio,
                referente: curEmp.referente || defEmp.referente,
                telReferente: curEmp.telReferente || defEmp.telReferente,
                policiaEnc: curEmp.policiaEnc || defEmp.policiaEnc,
                telPoliciaEnc: curEmp.telPoliciaEnc || defEmp.telPoliciaEnc
            };
        });

        let coloresPolicia = safeParse(storageObj, "colores_policia", {});
        // Paleta contrastante para turnos en el calendario: excluye el azul #2563eb de los botones (Imagen 1)
        const fixedTones = [
            '#0d9488', '#7c3aed', '#d97706', '#db2777', '#059669',
            '#dc2626', '#9333ea', '#ea580c', '#0891b2', '#4f46e5',
            '#be123c', '#15803d', '#b45309', '#6d28d9', '#0f766e'
        ];
        const forbiddenButtonBlues = ['#2563eb', '#1e40af', '#3b82f6', '#1d4ed8'];
        policias.forEach((p, idx) => {
            const currentCol = String(coloresPolicia[p.nombre] || "").toLowerCase();
            if (!currentCol || forbiddenButtonBlues.includes(currentCol)) {
                coloresPolicia[p.nombre] = fixedTones[idx % fixedTones.length];
            }
        });

        if (typeof localStorage !== 'undefined') {
            localStorage.setItem("policias", JSON.stringify(policias));
            localStorage.setItem("empresas", JSON.stringify(empresas));
            localStorage.setItem("colores_policia", JSON.stringify(coloresPolicia));
            localStorage.setItem(MASTER_DATA_VERSION_KEY, "true");
        }

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

    function savePolicias(policiasList, coloresMap) {
        if (typeof localStorage !== 'undefined') {
            localStorage.setItem("policias", JSON.stringify(policiasList));
        }
        const db = getDatabaseRef();
        if (db) db.syncStateToLocalDB({ policias: policiasList, coloresPolicia: coloresMap });
    }

    function saveEmpresas(empresasMap) {
        if (typeof localStorage !== 'undefined') {
            localStorage.setItem("empresas", JSON.stringify(empresasMap));
        }
        const db = getDatabaseRef();
        if (db) db.syncStateToLocalDB({ empresas: empresasMap });
    }

    function saveConfig(configMap) {
        if (typeof localStorage !== 'undefined') {
            localStorage.setItem("config_alfas", JSON.stringify(configMap));
        }
        const db = getDatabaseRef();
        if (db) db.syncStateToLocalDB({ config: configMap });
    }

    function saveColores(coloresMap) {
        if (typeof localStorage !== 'undefined') {
            localStorage.setItem("colores_policia", JSON.stringify(coloresMap));
        }
    }

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
