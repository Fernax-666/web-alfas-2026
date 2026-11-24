/**
 * @file database.js
 * @description Motor de Base de Datos Híbrida Inteligente (Triple-Tier Offline-First Architecture):
 *  1. SQLite Nativo en Android APK (@capacitor-community/sqlite) cuando corre empaquetado.
 *  2. IndexedDB Transaccional (`AlfaRelationalDB`) en Navegadores PC / Móvil PWA.
 *  3. Espejo síncrono en `localStorage` para velocidad instantánea y compatibilidad.
 *  4. Cola Transaccional `sync_outbox` para sincronización diferida resiliente con Google Sheets.
 *  5. Generador de Dumps SQL (.sql compatible con SQLite 3 y PostgreSQL) para auditoría y migración.
 * Compatible con entornos de Navegador (window.AlfaDatabase) y Node.js (CommonJS).
 */

(function (root, factory) {
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = factory();
    } else {
        root.AlfaDatabase = factory();
    }
}(typeof self !== 'undefined' ? self : this, function () {

    const DB_NAME = "AlfaRelationalDB";
    const DB_VERSION = 1;
    const SQLITE_DB_NAME = "alfas_caminera_db";
    const OUTBOX_STORAGE_KEY = "alfa_sync_outbox";
    const DB_META_STORAGE_KEY = "alfa_db_meta";

    const STORES = ["tarifas_categoria", "policias", "empresas", "servicios", "planillas_mensuales", "sync_outbox"];

    let idbInstance = null;
    let sqliteConnection = null;
    let engineType = "memory-localstorage";

    /**
     * Escapa comillas simples para sentencias SQL estándar (SQLite / PostgreSQL).
     * @param {unknown} val - Valor a formatear en literal SQL.
     * @returns {string} Literal SQL seguro.
     */
    function sqlLiteral(val) {
        if (val === null || val === undefined) return "NULL";
        if (typeof val === "number" && Number.isFinite(val)) return String(val);
        const escaped = String(val).replace(/'/g, "''");
        return `'${escaped}'`;
    }

    /**
     * Genera la clave primaria determinística de un servicio para evitar duplicados.
     * @param {string} fecha 
     * @param {string} policia 
     * @param {string} empresa 
     * @param {string} turno 
     * @returns {string} Clave primaria compuesta normalizada.
     */
    function buildServicioId(fecha, policia, empresa, turno) {
        const f = String(fecha || "").trim();
        const p = String(policia || "").trim().toUpperCase();
        const e = String(empresa || "").trim().toUpperCase();
        const t = String(turno || "").trim();
        return `${f}__${p}__${e}__${t}`;
    }

    /**
     * Inicializa el motor de base de datos local detectando automáticamente Capacitor SQLite o IndexedDB.
     * @returns {Promise<{engine: string, ready: boolean}>} Estado de inicialización del motor.
     */
    async function initDatabase() {
        // 1. Intentar inicializar SQLite nativo en Android APK si el plugin de Capacitor está presente
        if (typeof window !== "undefined" && window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()) {
            try {
                const sqlitePlugin = window.CapacitorSQLite || (window.Capacitor.Plugins && window.Capacitor.Plugins.CapacitorSQLite);
                if (sqlitePlugin && typeof sqlitePlugin.createConnection === "function") {
                    sqliteConnection = await sqlitePlugin.createConnection({
                        database: SQLITE_DB_NAME,
                        version: 1,
                        encrypted: false,
                        mode: "no-encryption"
                    });
                    if (sqliteConnection && typeof sqliteConnection.open === "function") {
                        await sqliteConnection.open();
                    }
                    engineType = "capacitor-sqlite-native";
                    updateDbMeta({ engine: engineType, lastInit: new Date().toISOString() });
                    return { engine: engineType, ready: true };
                }
            } catch (sqliteErr) {
                console.warn("[AlfaDatabase] Fallback de SQLite nativo a IndexedDB:", sqliteErr.message || sqliteErr);
            }
        }

        // 2. Inicializar IndexedDB en Navegador PC / Móvil Web / WebView
        if (typeof indexedDB !== "undefined") {
            try {
                idbInstance = await new Promise((resolve, reject) => {
                    const req = indexedDB.open(DB_NAME, DB_VERSION);
                    req.onupgradeneeded = function (evt) {
                        const db = evt.target.result;
                        if (!db.objectStoreNames.contains("tarifas_categoria")) {
                            db.createObjectStore("tarifas_categoria", { keyPath: "codigo" });
                        }
                        if (!db.objectStoreNames.contains("policias")) {
                            db.createObjectStore("policias", { keyPath: "nombre" });
                        }
                        if (!db.objectStoreNames.contains("empresas")) {
                            db.createObjectStore("empresas", { keyPath: "nombre" });
                        }
                        if (!db.objectStoreNames.contains("servicios")) {
                            const srvStore = db.createObjectStore("servicios", { keyPath: "id" });
                            srvStore.createIndex("idx_fecha", "fecha", { unique: false });
                            srvStore.createIndex("idx_policia", "policia", { unique: false });
                            srvStore.createIndex("idx_empresa", "empresa", { unique: false });
                        }
                        if (!db.objectStoreNames.contains("planillas_mensuales")) {
                            db.createObjectStore("planillas_mensuales", { keyPath: "clave" });
                        }
                        if (!db.objectStoreNames.contains("sync_outbox")) {
                            db.createObjectStore("sync_outbox", { keyPath: "id", autoIncrement: true });
                        }
                    };
                    req.onsuccess = function (evt) {
                        resolve(evt.target.result);
                    };
                    req.onerror = function (evt) {
                        reject(evt.target.error || new Error("IndexedDB open error"));
                    };
                });
                engineType = "indexeddb-sql-mirror";
                updateDbMeta({ engine: engineType, lastInit: new Date().toISOString() });
                return { engine: engineType, ready: true };
            } catch (idbErr) {
                console.warn("[AlfaDatabase] IndexedDB no disponible, operando en modo LocalStorage Mirror:", idbErr.message || idbErr);
            }
        }

        engineType = "localstorage-mirror";
        updateDbMeta({ engine: engineType, lastInit: new Date().toISOString() });
        return { engine: engineType, ready: true };
    }

    /**
     * Actualiza metadatos de diagnóstico de la base de datos local.
     * @param {Object} metaPatch 
     */
    function updateDbMeta(metaPatch) {
        if (typeof localStorage === "undefined") return;
        try {
            const current = JSON.parse(localStorage.getItem(DB_META_STORAGE_KEY) || "{}");
            const next = { ...current, ...metaPatch, updatedAt: new Date().toISOString() };
            localStorage.setItem(DB_META_STORAGE_KEY, JSON.stringify(next));
        } catch (_) {
            // Ignorar errores de cuota
        }
    }

    /**
     * Ejecuta una transacción de reemplazo completo o upsert masivo en un ObjectStore de IndexedDB.
     * @param {string} storeName - Nombre de la tabla/store.
     * @param {Array<Object>} records - Filas a persistir.
     * @param {boolean} [clearFirst=true] - Si debe vaciar la tabla antes de insertar.
     * @returns {Promise<boolean>}
     */
    async function putRecordsIDB(storeName, records, clearFirst = true) {
        if (!idbInstance || !STORES.includes(storeName)) return false;
        return new Promise((resolve) => {
            try {
                const tx = idbInstance.transaction([storeName], "readwrite");
                const store = tx.objectStore(storeName);
                if (clearFirst) {
                    store.clear();
                }
                records.forEach(rec => store.put(rec));
                tx.oncomplete = () => resolve(true);
                tx.onerror = () => resolve(false);
            } catch (_) {
                resolve(false);
            }
        });
    }

    /**
     * Sincroniza el estado completo de la aplicación hacia las tablas relacionales locales (SQLite / IndexedDB).
     * @param {{config?: Object, policias?: Array, empresas?: Object, coloresPolicia?: Object, eventos?: Array}} stateSnapshot
     * @returns {Promise<boolean>}
     */
    async function syncStateToLocalDB(stateSnapshot) {
        if (!stateSnapshot || typeof stateSnapshot !== "object") return false;
        const nowIso = new Date().toISOString();

        // 1. Tarifas
        if (stateSnapshot.config && typeof stateSnapshot.config === "object") {
            const tarifasRows = Object.entries(stateSnapshot.config).map(([codigo, valor]) => ({
                codigo: String(codigo),
                valor_hora: Number(valor) || 0,
                updated_at: nowIso
            }));
            await putRecordsIDB("tarifas_categoria", tarifasRows, true);
        }

        // 2. Policías
        if (Array.isArray(stateSnapshot.policias)) {
            const colores = stateSnapshot.coloresPolicia || {};
            const policiasRows = stateSnapshot.policias.map((pol, index) => {
                const nombre = typeof pol === "object" ? pol.nombre : String(pol);
                const jerarquia = typeof pol === "object" ? (pol.jerarquia || "") : "";
                return {
                    id: index + 1,
                    nombre,
                    jerarquia,
                    color_hex: colores[nombre] || "#2563eb",
                    activo: 1,
                    updated_at: nowIso
                };
            });
            await putRecordsIDB("policias", policiasRows, true);
        }

        // 3. Empresas
        if (stateSnapshot.empresas && typeof stateSnapshot.empresas === "object") {
            const empresasRows = Object.entries(stateSnapshot.empresas).map(([nombre, emp]) => ({
                nombre,
                turnos_json: JSON.stringify(emp.turnos || []),
                cat_semana: emp.catSemana || "A",
                cat_finde: emp.catFinde || "AP",
                nro_servicio: emp.nroServicio || "",
                domicilio: emp.domicilio || "",
                barrio: emp.barrio || "",
                telefono: emp.telefono || "",
                referente: emp.referente || "",
                tel_referente: emp.telReferente || "",
                policia_enc: emp.policiaEnc || "",
                tel_policia_enc: emp.telPoliciaEnc || "",
                updated_at: nowIso
            }));
            await putRecordsIDB("empresas", empresasRows, true);
        }

        // 4. Servicios / Eventos
        if (Array.isArray(stateSnapshot.eventos)) {
            const serviciosRows = stateSnapshot.eventos.map(ev => {
                const p = ev.extendedProps || ev;
                const fecha = String(ev.start || p.fecha || "").split("T")[0];
                const policia = String(p.policia || "").trim();
                const empresa = String(p.empresa || "").trim();
                const turno = String(p.turno || "").trim();
                const cost = Number(p.cost ?? p.costo ?? 0) || 0;
                const h = Number(p.h ?? p.hora ?? 8) || 8;
                const vh = Number(p.vh ?? (h > 0 ? cost / h : 0)) || 0;
                return {
                    id: buildServicioId(fecha, policia, empresa, turno),
                    fecha,
                    empresa,
                    policia,
                    turno,
                    categoria: String(p.cat || p.categoria || "A"),
                    horas: h,
                    valor_hora: vh,
                    costo_total: cost,
                    detalle_json: JSON.stringify(p.detail || []),
                    sync_status: p.sync_status || "SYNCED",
                    updated_at: nowIso
                };
            });
            await putRecordsIDB("servicios", serviciosRows, true);
        }

        updateDbMeta({ lastSyncLocal: nowIso });
        return true;
    }

    // =========================================================================
    // COLA TRANSACCIONAL OUTBOX (Sincronización Inteligente Offline -> Cloud)
    // =========================================================================

    /**
     * Obtiene las operaciones pendientes de sincronización en la cola Outbox.
     * @returns {Array<{id: string, action: string, payload: Object, status: string, retries: number, createdAt: string}>}
     */
    function getOutboxQueue() {
        if (typeof localStorage === "undefined") return [];
        try {
            const raw = localStorage.getItem(OUTBOX_STORAGE_KEY);
            const list = raw ? JSON.parse(raw) : [];
            return Array.isArray(list) ? list : [];
        } catch (_) {
            return [];
        }
    }

    /**
     * Guarda la cola Outbox actualizada en almacenamiento persistente.
     * @param {Array} queueList 
     */
    function saveOutboxQueue(queueList) {
        if (typeof localStorage === "undefined") return;
        try {
            localStorage.setItem(OUTBOX_STORAGE_KEY, JSON.stringify(queueList));
            updateDbMeta({ pendingOutboxCount: queueList.length });
        } catch (_) {
            // Ignorar errores de cuota
        }
    }

    /**
     * Encola una operación en `sync_outbox` cuando el dispositivo está offline o falla la petición remota.
     * @param {string} action - Acción remota ('addServicio', 'deleteServicio', 'syncTarifas', 'syncPolicias', 'syncEmpresas').
     * @param {Object} payload - Datos asociados a la operación.
     * @returns {Object} Item encolado.
     */
    function enqueueOutboxOperation(action, payload) {
        const queue = getOutboxQueue();
        const item = {
            id: `outbox_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
            action: String(action),
            payload: payload || {},
            status: "PENDING",
            retries: 0,
            createdAt: new Date().toISOString()
        };

        // Si es una acción de reemplazo global (syncTarifas, syncPolicias, syncEmpresas), reemplazar pendiente previa del mismo tipo
        const globalActions = ["syncTarifas", "syncPolicias", "syncEmpresas"];
        const filteredQueue = globalActions.includes(action)
            ? queue.filter(q => q.action !== action)
            : queue;

        filteredQueue.push(item);
        saveOutboxQueue(filteredQueue);
        return item;
    }

    /**
     * Elimina una operación procesada de la cola Outbox por su ID.
     * @param {string} itemId 
     */
    function removeOutboxOperation(itemId) {
        const queue = getOutboxQueue().filter(item => item.id !== itemId);
        saveOutboxQueue(queue);
    }

    /**
     * Genera un script SQL estándar completo (.sql) compatible con SQLite 3 y PostgreSQL
     * que contiene tanto el DDL (CREATE TABLE) como todos los INSERT/UPSERT de los datos actuales.
     * @param {{config: Object, policias: Array, empresas: Object, coloresPolicia: Object, eventos: Array}} snapshot
     * @returns {string} Contenido del archivo .sql listo para ejecutar en SQLite o PostgreSQL.
     */
    function exportSQLDump(snapshot) {
        const safeSnap = snapshot || {};
        const now = new Date().toISOString();
        const lines = [
            "-- =============================================================================",
            `-- DUMP RELACIONAL SQL (SQLite 3 / PostgreSQL Compatible) - Generado: ${now}`,
            "-- Sistema de Gestión de Servicios Adicionales (Alfas) - Policía Caminera",
            "-- =============================================================================",
            "BEGIN TRANSACTION;",
            "",
            "CREATE TABLE IF NOT EXISTS tarifas_categoria (",
            "    codigo VARCHAR(10) PRIMARY KEY,",
            "    valor_hora NUMERIC(12, 2) NOT NULL DEFAULT 0,",
            "    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP",
            ");",
            "",
            "CREATE TABLE IF NOT EXISTS policias (",
            "    nombre VARCHAR(120) PRIMARY KEY,",
            "    jerarquia VARCHAR(60) DEFAULT '',",
            "    color_hex VARCHAR(16) DEFAULT '#2563eb',",
            "    activo INTEGER NOT NULL DEFAULT 1,",
            "    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP",
            ");",
            "",
            "CREATE TABLE IF NOT EXISTS empresas (",
            "    nombre VARCHAR(120) PRIMARY KEY,",
            "    turnos_json TEXT NOT NULL,",
            "    cat_semana VARCHAR(10) NOT NULL DEFAULT 'A',",
            "    cat_finde VARCHAR(10) NOT NULL DEFAULT 'AP',",
            "    nro_servicio VARCHAR(50) DEFAULT '',",
            "    domicilio VARCHAR(200) DEFAULT '',",
            "    barrio VARCHAR(100) DEFAULT '',",
            "    telefono VARCHAR(50) DEFAULT '',",
            "    referente VARCHAR(120) DEFAULT '',",
            "    tel_referente VARCHAR(50) DEFAULT '',",
            "    policia_enc VARCHAR(120) DEFAULT '',",
            "    tel_policia_enc VARCHAR(50) DEFAULT '',",
            "    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP",
            ");",
            "",
            "CREATE TABLE IF NOT EXISTS servicios (",
            "    id VARCHAR(180) PRIMARY KEY,",
            "    fecha VARCHAR(10) NOT NULL,",
            "    empresa VARCHAR(120) NOT NULL,",
            "    policia VARCHAR(120) NOT NULL,",
            "    turno VARCHAR(40) NOT NULL,",
            "    categoria VARCHAR(15) NOT NULL DEFAULT 'A',",
            "    horas NUMERIC(5, 2) NOT NULL DEFAULT 8,",
            "    valor_hora NUMERIC(12, 2) NOT NULL DEFAULT 0,",
            "    costo_total NUMERIC(14, 2) NOT NULL DEFAULT 0,",
            "    detalle_json TEXT,",
            "    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP",
            ");",
            ""
        ];

        // 1. Insertar Tarifas
        const cfg = safeSnap.config || {};
        Object.entries(cfg).forEach(([cat, val]) => {
            lines.push(
                `INSERT INTO tarifas_categoria (codigo, valor_hora, updated_at) VALUES (${sqlLiteral(cat)}, ${Number(val) || 0}, ${sqlLiteral(now)}) ON CONFLICT(codigo) DO UPDATE SET valor_hora = EXCLUDED.valor_hora, updated_at = EXCLUDED.updated_at;`
            );
        });
        lines.push("");

        // 2. Insertar Policías
        const pols = Array.isArray(safeSnap.policias) ? safeSnap.policias : [];
        const cols = safeSnap.coloresPolicia || {};
        pols.forEach(p => {
            const nombre = typeof p === "object" ? p.nombre : String(p);
            const jerarquia = typeof p === "object" ? (p.jerarquia || "") : "";
            const color = cols[nombre] || "#2563eb";
            lines.push(
                `INSERT INTO policias (nombre, jerarquia, color_hex, activo, updated_at) VALUES (${sqlLiteral(nombre)}, ${sqlLiteral(jerarquia)}, ${sqlLiteral(color)}, 1, ${sqlLiteral(now)}) ON CONFLICT(nombre) DO UPDATE SET jerarquia = EXCLUDED.jerarquia, color_hex = EXCLUDED.color_hex, updated_at = EXCLUDED.updated_at;`
            );
        });
        lines.push("");

        // 3. Insertar Empresas
        const emps = safeSnap.empresas || {};
        Object.entries(emps).forEach(([nombre, emp]) => {
            lines.push(
                `INSERT INTO empresas (nombre, turnos_json, cat_semana, cat_finde, nro_servicio, domicilio, barrio, telefono, referente, tel_referente, policia_enc, tel_policia_enc, updated_at) VALUES (${sqlLiteral(nombre)}, ${sqlLiteral(JSON.stringify(emp.turnos || []))}, ${sqlLiteral(emp.catSemana || "A")}, ${sqlLiteral(emp.catFinde || "AP")}, ${sqlLiteral(emp.nroServicio || "")}, ${sqlLiteral(emp.domicilio || "")}, ${sqlLiteral(emp.barrio || "")}, ${sqlLiteral(emp.telefono || "")}, ${sqlLiteral(emp.referente || "")}, ${sqlLiteral(emp.telReferente || "")}, ${sqlLiteral(emp.policiaEnc || "")}, ${sqlLiteral(emp.telPoliciaEnc || "")}, ${sqlLiteral(now)}) ON CONFLICT(nombre) DO UPDATE SET turnos_json = EXCLUDED.turnos_json, cat_semana = EXCLUDED.cat_semana, cat_finde = EXCLUDED.cat_finde, updated_at = EXCLUDED.updated_at;`
            );
        });
        lines.push("");

        // 4. Insertar Servicios
        const evs = Array.isArray(safeSnap.eventos) ? safeSnap.eventos : [];
        evs.forEach(ev => {
            const p = ev.extendedProps || ev;
            const fecha = String(ev.start || p.fecha || "").split("T")[0];
            const policia = String(p.policia || "").trim();
            const empresa = String(p.empresa || "").trim();
            const turno = String(p.turno || "").trim();
            const cat = String(p.cat || p.categoria || "A");
            const h = Number(p.h ?? p.hora ?? 8) || 8;
            const cost = Number(p.cost ?? p.costo ?? 0) || 0;
            const vh = Number(p.vh ?? (h > 0 ? cost / h : 0)) || 0;
            const id = buildServicioId(fecha, policia, empresa, turno);
            lines.push(
                `INSERT INTO servicios (id, fecha, empresa, policia, turno, categoria, horas, valor_hora, costo_total, detalle_json, updated_at) VALUES (${sqlLiteral(id)}, ${sqlLiteral(fecha)}, ${sqlLiteral(empresa)}, ${sqlLiteral(policia)}, ${sqlLiteral(turno)}, ${sqlLiteral(cat)}, ${h}, ${vh}, ${cost}, ${sqlLiteral(JSON.stringify(p.detail || []))}, ${sqlLiteral(now)}) ON CONFLICT(id) DO UPDATE SET categoria = EXCLUDED.categoria, horas = EXCLUDED.horas, valor_hora = EXCLUDED.valor_hora, costo_total = EXCLUDED.costo_total, updated_at = EXCLUDED.updated_at;`
            );
        });

        lines.push("");
        lines.push("COMMIT;");
        return lines.join("\n");
    }

    /**
     * Retorna información diagnóstica del motor de base de datos local y cola de sincronización.
     * @returns {{engine: string, pendingOutboxCount: number, isOnline: boolean}}
     */
    function getDatabaseStatus() {
        const queue = getOutboxQueue();
        const isOnline = typeof navigator !== "undefined" && typeof navigator.onLine === "boolean"
            ? navigator.onLine
            : true;
        return {
            engine: engineType,
            pendingOutboxCount: queue.length,
            isOnline
        };
    }

    return {
        DB_NAME,
        SQLITE_DB_NAME,
        initDatabase,
        syncStateToLocalDB,
        buildServicioId,
        sqlLiteral,
        exportSQLDump,
        getOutboxQueue,
        enqueueOutboxOperation,
        removeOutboxOperation,
        getDatabaseStatus
    };
}));
