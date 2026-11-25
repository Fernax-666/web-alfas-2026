/**
 * @file notifications.js
 * @description Motor Inteligente de Notificaciones y Sincronización Programada (window.AlfaNotifications):
 *  1. Solicita permiso para enviar notificaciones cuando la aplicación ha sido instalada / iniciada
 *     (usando `@capacitor/local-notifications` en Android APK y `Notification.requestPermission()` en Windows PC).
 *  2. Lee la base de datos 3 veces al día (ventanas de las 08:00, 14:00 y 20:00 hs + al abrir/reanudar la app)
 *     para detectar cambios nuevos desde Google Sheets / SQLite local y notificar al usuario.
 *  3. Calcula automáticamente todos los servicios próximos y, 1 DÍA ANTES del servicio designado,
 *     programa y envía 2 ALERTAS AL DÍA (09:00 hs y 20:00 hs del día previo) avisando que hay un servicio
 *     vigente próximo a cumplimentar.
 *  4. Al tocar la notificación o la alerta activa, posiciona y sincroniza el Calendario exactamente en la fecha del servicio.
 * Compatible con entornos de Navegador (window.AlfaNotifications) y Node.js (CommonJS).
 */

(function (root, factory) {
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = factory();
    } else {
        root.AlfaNotifications = factory();
    }
}(typeof self !== 'undefined' ? self : this, function () {

    const NOTIF_META_KEY = "alfa_notifications_meta_v18";
    const DAILY_SYNC_HOURS = [8, 14, 20]; // 3 lecturas diarias de la base de datos: 08:00, 14:00 y 20:00 hs
    const DAY_BEFORE_ALERT_HOURS = [9, 20]; // 2 alertas diarias el día anterior al servicio: 09:00 y 20:00 hs

    let _checkIntervalId = null;

    function getUtilsRef() {
        if (typeof window !== 'undefined' && window.AlfaUtils) return window.AlfaUtils;
        try {
            if (typeof require === 'function') return require('../utils/helpers.js');
        } catch (_) {}
        return {
            getLocalYMD: (d) => d.toISOString().slice(0, 10),
            formatearTurno: (t) => t || ""
        };
    }

    function getNativeLocalNotificationsPlugin() {
        if (typeof window !== 'undefined' && window.Capacitor && window.Capacitor.Plugins) {
            return window.Capacitor.Plugins.LocalNotifications || null;
        }
        return null;
    }

    function loadNotifMeta() {
        if (typeof localStorage === 'undefined') {
            return { permissionGranted: false, lastDbSyncSlot: "", firedAlertKeys: {}, knownEventsHash: "" };
        }
        try {
            const raw = localStorage.getItem(NOTIF_META_KEY);
            const parsed = raw ? JSON.parse(raw) : {};
            return {
                permissionGranted: Boolean(parsed.permissionGranted),
                lastDbSyncSlot: parsed.lastDbSyncSlot || "",
                firedAlertKeys: parsed.firedAlertKeys || {},
                knownEventsHash: parsed.knownEventsHash || "",
                lastSyncTimestamp: parsed.lastSyncTimestamp || ""
            };
        } catch (_) {
            return { permissionGranted: false, lastDbSyncSlot: "", firedAlertKeys: {}, knownEventsHash: "" };
        }
    }

    function saveNotifMeta(metaObj) {
        if (typeof localStorage === 'undefined') return;
        try {
            localStorage.setItem(NOTIF_META_KEY, JSON.stringify(metaObj));
        } catch (_) {}
    }

    /**
     * Solicita permiso de notificaciones al usuario en Android APK (@capacitor/local-notifications)
     * o en Windows PC / Navegador (Web Notifications API).
     * @returns {Promise<{granted: boolean, platform: string}>}
     */
    async function requestNotificationPermissions() {
        const nativePlugin = getNativeLocalNotificationsPlugin();

        // 1. Android APK Nativo
        if (nativePlugin && typeof nativePlugin.requestPermissions === 'function') {
            try {
                const permStatus = await nativePlugin.requestPermissions();
                const granted = permStatus && permStatus.display === 'granted';
                const meta = loadNotifMeta();
                meta.permissionGranted = granted;
                saveNotifMeta(meta);
                return { granted, platform: 'android-apk' };
            } catch (err) {
                console.warn("[AlfaNotifications] Error solicitando permiso nativo en APK:", err);
            }
        }

        // 2. Navegador PC / PWA
        if (typeof window !== 'undefined' && 'Notification' in window) {
            try {
                if (Notification.permission === 'granted') {
                    const meta = loadNotifMeta();
                    meta.permissionGranted = true;
                    saveNotifMeta(meta);
                    return { granted: true, platform: 'web-pc' };
                }
                if (Notification.permission !== 'denied') {
                    const res = await Notification.requestPermission();
                    const granted = res === 'granted';
                    const meta = loadNotifMeta();
                    meta.permissionGranted = granted;
                    saveNotifMeta(meta);
                    return { granted, platform: 'web-pc' };
                }
            } catch (_) {}
        }

        return { granted: false, platform: 'unsupported' };
    }

    /**
     * Calcula todos los servicios cuyo turno se cumple MAÑANA (1 día después de `referenceDate`),
     * y genera las 2 alertas programadas del día anterior (09:00 hs y 20:00 hs).
     * @param {Array} eventsList - Lista de eventos de servicios guardados.
     * @param {Date} [referenceDate=new Date()] - Fecha/hora de referencia actual.
     * @param {string} [policiaFiltro=""] - Si se especificó un policía titular del dispositivo, filtra o prioriza sus servicios.
     * @returns {{
     *   tomorrowYMD: string,
     *   tomorrowServices: Array<{fecha: string, empresa: string, policia: string, turno: string, categoria: string}>,
     *   scheduledAlerts: Array<{id: number, alertKey: string, fireAt: Date, slotHour: number, serviceDate: string, title: string, body: string}>
     * }}
     */
    function computeUpcomingServiceAlerts(eventsList, referenceDate = new Date(), policiaFiltro = "") {
        const utils = getUtilsRef();
        const ref = (referenceDate instanceof Date && !isNaN(referenceDate.getTime())) ? referenceDate : new Date();

        const tomorrow = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate() + 1, 0, 0, 0);
        const tomorrowYMD = utils.getLocalYMD(tomorrow);
        const todayYMD = utils.getLocalYMD(ref);

        const safeEvents = Array.isArray(eventsList) ? eventsList : [];
        const tomorrowServices = [];
        const scheduledAlerts = [];

        // Recorrer eventos futuros (desde mañana hasta los próximos 30 días para dejar alarmas programadas en Android OS)
        safeEvents.forEach((ev, idx) => {
            const p = ev.extendedProps || ev;
            const fechaStr = String(ev.start || p.fecha || "").split("T")[0];
            if (!/^\d{4}-\d{2}-\d{2}$/.test(fechaStr)) return;

            const policia = String(p.policia || "").trim();
            const empresa = String(p.empresa || "").trim();
            const turno = String(p.turno || "").trim();
            const categoria = String(p.cat || p.categoria || "A").trim();

            if (!policia || !empresa) return;
            if (policiaFiltro && policia.toLowerCase() !== policiaFiltro.trim().toLowerCase()) return;

            if (fechaStr === tomorrowYMD) {
                tomorrowServices.push({ fecha: fechaStr, empresa, policia, turno, categoria });
            }

            // Calcular el día anterior al servicio (fechaStr - 1 día)
            const [y, m, d] = fechaStr.split("-").map(Number);
            const serviceDateObj = new Date(y, m - 1, d, 0, 0, 0);
            const dayBeforeObj = new Date(y, m - 1, d - 1, 0, 0, 0);
            const dayBeforeYMD = utils.getLocalYMD(dayBeforeObj);

            // Solo programar si el servicio es mañana o en los próximos 15 días
            const diffDays = Math.round((serviceDateObj - new Date(ref.getFullYear(), ref.getMonth(), ref.getDate())) / (1000 * 60 * 60 * 24));
            if (diffDays >= 1 && diffDays <= 15) {
                const turnoFormateado = utils.formatearTurno ? utils.formatearTurno(turno) : turno;

                DAY_BEFORE_ALERT_HOURS.forEach((hourSlot, slotIdx) => {
                    const fireAt = new Date(dayBeforeObj.getFullYear(), dayBeforeObj.getMonth(), dayBeforeObj.getDate(), hourSlot, 0, 0);
                    const alertKey = `alert_${fechaStr}_${empresa}_${policia}_${turno}_${hourSlot}h`;
                    const numericId = 10000 + (idx * 10) + slotIdx;
                    const etiquetaMomento = hourSlot < 12 ? "Alerta Matutina (24h antes)" : "Recordatorio Vespertino (Mañana)";

                    scheduledAlerts.push({
                        id: numericId,
                        alertKey,
                        fireAt,
                        dayBeforeYMD,
                        slotHour: hourSlot,
                        serviceDate: fechaStr,
                        empresa,
                        policia,
                        turno: turnoFormateado,
                        title: `🚨 Servicio Vigente Mañana (${fechaStr})`,
                        body: `${etiquetaMomento}: ${policia} en ${empresa} — Turno ${turnoFormateado}. Toque para ver en el Calendario.`
                    });
                });
            }
        });

        return {
            todayYMD,
            tomorrowYMD,
            tomorrowServices,
            scheduledAlerts
        };
    }

    /**
     * Dispara una notificación inmediata en el dispositivo (Android APK o Windows PC)
     * y opcionalmente posiciona el calendario al hacer clic.
     * @param {{title: string, body: string, targetDate?: string}} notifData 
     */
    async function dispatchImmediateNotification({ title, body, targetDate }) {
        const nativePlugin = getNativeLocalNotificationsPlugin();

        // 1. Android APK Nativo
        if (nativePlugin && typeof nativePlugin.schedule === 'function') {
            try {
                await nativePlugin.schedule({
                    notifications: [{
                        id: Math.floor(Date.now() % 2147483000),
                        title: String(title || "Web Alfas 2026"),
                        body: String(body || ""),
                        schedule: { at: new Date(Date.now() + 1000) },
                        extra: { targetDate: targetDate || "" }
                    }]
                });
                return true;
            } catch (_) {}
        }

        // 2. Navegador PC / Web Notification API
        if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
            try {
                const n = new Notification(String(title || "Web Alfas 2026"), {
                    body: String(body || ""),
                    icon: "img/portada_2.jpg",
                    tag: targetDate ? `alfa_srv_${targetDate}` : undefined
                });
                n.onclick = function () {
                    window.focus();
                    if (targetDate && typeof window.posicionarCalendarioEnServicio === 'function') {
                        window.posicionarCalendarioEnServicio(targetDate);
                    }
                };
                return true;
            } catch (_) {}
        }

        return false;
    }

    /**
     * Sincroniza y programa en el sistema operativo Android (vía `@capacitor/local-notifications`)
     * todas las alertas de 1 día antes (2 veces al día: 09:00 y 20:00 hs) y evalúa si corresponde
     * disparar la alerta de hoy para los servicios de mañana.
     * @param {Array} eventsList - Eventos actuales del calendario / base de datos local.
     * @param {Object} [options]
     * @param {string} [options.policiaTitular] - Filtro opcional por policía titular.
     * @param {Function} [options.onAlertBanner] - Callback para mostrar banner visual en la app y posicionar calendario.
     * @returns {Promise<{scheduledCount: number, tomorrowCount: number, tomorrowYMD: string}>}
     */
    async function scheduleServiceReminders(eventsList, options = {}) {
        const now = new Date();
        const plan = computeUpcomingServiceAlerts(eventsList, now, options.policiaTitular || "");
        const nativePlugin = getNativeLocalNotificationsPlugin();
        const meta = loadNotifMeta();

        // 1. Programar alarmas exactas futuras en Android APK (@capacitor/local-notifications)
        if (nativePlugin && typeof nativePlugin.schedule === 'function') {
            try {
                const futureNotifications = plan.scheduledAlerts
                    .filter(a => a.fireAt.getTime() > now.getTime() + 5000)
                    .slice(0, 60)
                    .map(a => ({
                        id: a.id,
                        title: a.title,
                        body: a.body,
                        schedule: { at: a.fireAt, allowWhileIdle: true },
                        extra: { targetDate: a.serviceDate, empresa: a.empresa, policia: a.policia }
                    }));

                if (futureNotifications.length > 0) {
                    await nativePlugin.schedule({ notifications: futureNotifications });
                }
            } catch (err) {
                console.warn("[AlfaNotifications] Aviso programando alarmas futuras en Android:", err);
            }
        }

        // 2. Verificar si HOY (1 día antes del servicio de MAÑANA) debemos disparar alguna de las 2 alertas diarias (09:00 o 20:00 hs)
        if (plan.tomorrowServices.length > 0) {
            const currentHour = now.getHours();
            // Determinar cuál de las 2 ventanas diarias de alerta (09:00 o 20:00) está activa
            const activeAlertSlot = currentHour >= 18 ? "20h" : (currentHour >= 7 ? "09h" : "init");
            const batchAlertKey = `daybefore_${plan.tomorrowYMD}_${activeAlertSlot}`;

            if (!meta.firedAlertKeys[batchAlertKey]) {
                meta.firedAlertKeys[batchAlertKey] = new Date().toISOString();
                saveNotifMeta(meta);

                const firstSrv = plan.tomorrowServices[0];
                const resumenTurnos = plan.tomorrowServices
                    .map(s => `${s.policia} en ${s.empresa} (${s.turno})`)
                    .join(" | ");

                const alertTitle = `🚨 Servicio Vigente Mañana (${plan.tomorrowYMD})`;
                const alertBody = plan.tomorrowServices.length === 1
                    ? `Mañana tiene servicio asignado: ${firstSrv.policia} en ${firstSrv.empresa} (${firstSrv.turno}).`
                    : `Mañana hay ${plan.tomorrowServices.length} servicios vigentes: ${resumenTurnos}`;

                await dispatchImmediateNotification({
                    title: alertTitle,
                    body: alertBody,
                    targetDate: plan.tomorrowYMD
                });

                if (typeof options.onAlertBanner === 'function') {
                    options.onAlertBanner({
                        tomorrowYMD: plan.tomorrowYMD,
                        services: plan.tomorrowServices,
                        title: alertTitle,
                        body: alertBody
                    });
                }
            } else if (typeof options.onAlertBanner === 'function') {
                // Aunque la notificación sonora ya haya sonado en esta ventana, mantener el banner visual interactivo en la UI
                options.onAlertBanner({
                    tomorrowYMD: plan.tomorrowYMD,
                    services: plan.tomorrowServices,
                    title: `🚨 Servicio Vigente Mañana (${plan.tomorrowYMD})`,
                    body: `Hay ${plan.tomorrowServices.length} servicio(s) programado(s) para mañana.`
                });
            }
        }

        return {
            scheduledCount: plan.scheduledAlerts.length,
            tomorrowCount: plan.tomorrowServices.length,
            tomorrowYMD: plan.tomorrowYMD
        };
    }

    /**
     * Determina la ventana de sincronización diaria actual (3 veces al día: 08:00, 14:00, 20:00).
     * @param {Date} [now=new Date()]
     * @returns {string} Clave de ventana ej. "2026-11-25_slot_14"
     */
    function getCurrentDailySyncSlot(now = new Date()) {
        const utils = getUtilsRef();
        const ymd = utils.getLocalYMD(now);
        const h = now.getHours();
        let slot = "08";
        if (h >= 20) slot = "20";
        else if (h >= 14) slot = "14";
        else if (h >= 8) slot = "08";
        else slot = "00";
        return `${ymd}_slot_${slot}`;
    }

    /**
     * Ejecuta la verificación periódica de la base de datos (3 veces al día: 08:00, 14:00 y 20:00 hs)
     * para detectar cambios nuevos en Google Sheets / SQLite y actualizar las alertas de servicios próximos.
     * @param {{
     *   fetchCloudServices: () => Promise<Array|null>,
     *   getLocalEvents: () => Array,
     *   onNewChangesDetected: (newEvents: Array, addedCount: number) => void,
     *   onAlertBanner?: (alertInfo: Object) => void,
     *   policiaTitular?: string,
     *   force?: boolean
     * }} callbacks
     * @returns {Promise<{checked: boolean, changesDetected: boolean, slot: string}>}
     */
    async function runPeriodicDatabaseCheck(callbacks) {
        const now = new Date();
        const currentSlot = getCurrentDailySyncSlot(now);
        const meta = loadNotifMeta();

        const shouldRunCloudRead = Boolean(callbacks && callbacks.force) || (meta.lastDbSyncSlot !== currentSlot);
        let changesDetected = false;

        if (shouldRunCloudRead && callbacks && typeof callbacks.fetchCloudServices === 'function') {
            try {
                const cloudData = await callbacks.fetchCloudServices();
                meta.lastDbSyncSlot = currentSlot;
                meta.lastSyncTimestamp = now.toISOString();

                if (Array.isArray(cloudData) && cloudData.length > 0) {
                    const newHash = `${cloudData.length}_${JSON.stringify(cloudData.slice(0, 25))}`;
                    if (meta.knownEventsHash && meta.knownEventsHash !== newHash) {
                        changesDetected = true;
                        await dispatchImmediateNotification({
                            title: "🔄 Base de Datos Actualizada",
                            body: `Se detectaron nuevos cambios en la programación de servicios (${cloudData.length} registros activos).`
                        });
                        if (typeof callbacks.onNewChangesDetected === 'function') {
                            callbacks.onNewChangesDetected(cloudData);
                        }
                    }
                    meta.knownEventsHash = newHash;
                }
                saveNotifMeta(meta);
            } catch (err) {
                console.warn("[AlfaNotifications] Lectura periódica en modo local (Offline):", err);
            }
        }

        const currentEvents = (callbacks && typeof callbacks.getLocalEvents === 'function')
            ? callbacks.getLocalEvents()
            : [];

        await scheduleServiceReminders(currentEvents, {
            policiaTitular: callbacks ? callbacks.policiaTitular : "",
            onAlertBanner: callbacks ? callbacks.onAlertBanner : undefined
        });

        return {
            checked: shouldRunCloudRead,
            changesDetected,
            slot: currentSlot
        };
    }

    /**
     * Inicia el demonio de monitoreo en la aplicación:
     * - Solicita permisos de notificación al instalar/iniciar.
     * - Registra el listener de toque en notificación nativa de Android para posicionar el calendario en la fecha del servicio.
     * - Verifica las 3 lecturas diarias (08:00, 14:00, 20:00) y las 2 alertas diarias (09:00 y 20:00 del día previo).
     * @param {Object} callbacks 
     */
    async function initNotificationEngine(callbacks = {}) {
        await requestNotificationPermissions();

        const nativePlugin = getNativeLocalNotificationsPlugin();
        if (nativePlugin && typeof nativePlugin.addListener === 'function') {
            try {
                nativePlugin.addListener('localNotificationActionPerformed', (notificationAction) => {
                    const extra = (notificationAction && notificationAction.notification && notificationAction.notification.extra) || {};
                    if (extra.targetDate && typeof callbacks.onNavigateToServiceDate === 'function') {
                        callbacks.onNavigateToServiceDate(extra.targetDate);
                    }
                });
            } catch (_) {}
        }

        await runPeriodicDatabaseCheck({ ...callbacks, force: false });

        if (_checkIntervalId) clearInterval(_checkIntervalId);
        // Revisar cada 15 minutos si se alcanzó una de las 3 ventanas diarias de lectura (08:00, 14:00, 20:00) o las 2 alertas (09:00, 20:00)
        if (typeof window !== 'undefined') {
            _checkIntervalId = setInterval(() => {
                runPeriodicDatabaseCheck({ ...callbacks, force: false });
            }, 15 * 60 * 1000);

            document.addEventListener('visibilitychange', () => {
                if (document.visibilityState === 'visible') {
                    runPeriodicDatabaseCheck({ ...callbacks, force: false });
                }
            });
        }
    }

    /**
     * Retorna el estado diagnóstico del motor de notificaciones.
     * @returns {{permissionGranted: boolean, lastDbSyncSlot: string, lastSyncTimestamp: string, dailySyncHours: number[], dayBeforeAlertHours: number[]}}
     */
    function getNotificationEngineStatus() {
        const meta = loadNotifMeta();
        let granted = meta.permissionGranted;
        if (typeof window !== 'undefined' && 'Notification' in window) {
            granted = granted || (Notification.permission === 'granted');
        }
        return {
            permissionGranted: granted,
            lastDbSyncSlot: meta.lastDbSyncSlot || "Pendiente",
            lastSyncTimestamp: meta.lastSyncTimestamp || "",
            dailySyncHours: DAILY_SYNC_HOURS,
            dayBeforeAlertHours: DAY_BEFORE_ALERT_HOURS
        };
    }

    return {
        DAILY_SYNC_HOURS,
        DAY_BEFORE_ALERT_HOURS,
        requestNotificationPermissions,
        computeUpcomingServiceAlerts,
        dispatchImmediateNotification,
        scheduleServiceReminders,
        getCurrentDailySyncSlot,
        runPeriodicDatabaseCheck,
        initNotificationEngine,
        getNotificationEngineStatus
    };
}));
