/**
 * @file platformApk.js
 * @description Script exclusivo para Plataforma Android APK / Móvil (window.AlfaPlatformAPK).
 * Resuelve las limitaciones del Android WebView donde `<a download>` y `navigator.share({files})` fallan:
 *  - Utiliza los plugins nativos `@capacitor/filesystem` y `@capacitor/share` inyectados por el puente Capacitor
 *    (`window.Capacitor.Plugins.Filesystem` y `window.Capacitor.Plugins.Share`).
 *  - Escribe los archivos PDF y capturas PNG en Base64 directamente en el almacenamiento nativo de Android
 *    (Documents / ExternalStorage / Cache) y lanza el Intent nativo de Android para abrir WhatsApp o guardar en el dispositivo.
 */

(function (root, factory) {
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = factory();
    } else {
        root.AlfaPlatformAPK = factory();
    }
}(typeof self !== 'undefined' ? self : this, function () {

    /**
     * Obtiene las referencias a los plugins nativos de Capacitor Android si están disponibles.
     * @returns {{Filesystem: Object|null, Share: Object|null, isNative: boolean}}
     */
    function getCapacitorPlugins() {
        const hasCap = typeof window !== 'undefined' && window.Capacitor;
        const isNative = Boolean(hasCap && typeof window.Capacitor.isNativePlatform === 'function' && window.Capacitor.isNativePlatform());
        const plugins = (hasCap && window.Capacitor.Plugins) ? window.Capacitor.Plugins : {};
        return {
            Filesystem: plugins.Filesystem || null,
            Share: plugins.Share || null,
            isNative
        };
    }

    /**
     * Extrae la cadena Base64 pura (sin prefijo data:...;base64,) desde un DataURI.
     * @param {string} dataUri 
     * @returns {string}
     */
    function stripBase64Prefix(dataUri) {
        const str = String(dataUri || '');
        const commaIdx = str.indexOf(',');
        return commaIdx !== -1 ? str.slice(commaIdx + 1) : str;
    }

    /**
     * Escribe un archivo Base64 en el sistema de archivos nativo de Android probando primero Documents
     * (carpeta pública accesible por el usuario en Android 10+) y luego Cache (para compartir con FileProvider).
     * @param {string} fileName - Nombre del archivo (ej. Precarton_SIGLO21.pdf).
     * @param {string} base64Data - Contenido codificado en Base64 puro.
     * @returns {Promise<{saved: boolean, uri: string, directory: string}>}
     */
    async function writeNativeFileAndroid(fileName, base64Data) {
        const { Filesystem } = getCapacitorPlugins();
        const cleanBase64 = stripBase64Prefix(base64Data);

        if (Filesystem && typeof Filesystem.writeFile === 'function') {
            // 1. Intentar guardar en carpeta pública DOCUMENTS de Android (accesible en Gestor de Archivos / Descargas)
            try {
                const docRes = await Filesystem.writeFile({
                    path: fileName,
                    data: cleanBase64,
                    directory: 'DOCUMENTS',
                    recursive: true
                });
                // También escribir copia en CACHE para garantizar URI compartible por FileProvider hacia WhatsApp
                let shareUri = docRes.uri;
                try {
                    const cacheRes = await Filesystem.writeFile({
                        path: fileName,
                        data: cleanBase64,
                        directory: 'CACHE'
                    });
                    if (cacheRes && cacheRes.uri) shareUri = cacheRes.uri;
                } catch (_) {}

                return {
                    saved: true,
                    uri: shareUri,
                    publicUri: docRes.uri,
                    directory: 'Documentos / Descargas Android'
                };
            } catch (docErr) {
                // 2. Fallback a CACHE del APK (no requiere permisos de almacenamiento en ninguna versión de Android)
                try {
                    const cacheRes = await Filesystem.writeFile({
                        path: fileName,
                        data: cleanBase64,
                        directory: 'CACHE'
                    });
                    return {
                        saved: true,
                        uri: cacheRes.uri,
                        publicUri: cacheRes.uri,
                        directory: 'Almacenamiento Interno APK'
                    };
                } catch (cacheErr) {
                    console.warn("[PlatformAPK] Error escribiendo en Filesystem nativo:", cacheErr);
                }
            }
        }

        return { saved: false, uri: '', directory: '' };
    }

    /**
     * Guarda un archivo PDF en Android APK utilizando el sistema de archivos nativo de Capacitor.
     * @param {Object} jsPdfDoc - Instancia de jsPDF.
     * @param {string} fileName - Nombre del archivo (.pdf).
     * @returns {Promise<{saved: boolean, uri: string, directory: string}>}
     */
    async function savePdfFileAPK(jsPdfDoc, fileName) {
        const dataUri = jsPdfDoc.output('datauristring');
        const res = await writeNativeFileAndroid(fileName, dataUri);
        if (res.saved) {
            return res;
        }

        // Fallback en caso de ejecutarse en navegador móvil Chrome fuera del APK
        try {
            jsPdfDoc.save(fileName);
        } catch (_) {}
        return { saved: true, uri: '', directory: 'Descargas del Navegador Móvil' };
    }

    /**
     * Abre el selector nativo de Android (Intent.ACTION_SEND) para compartir o guardar el PDF en WhatsApp, Drive o Visor PDF.
     * @param {Object} jsPdfDoc - Instancia de jsPDF.
     * @param {string} fileName - Nombre del archivo (.pdf).
     * @param {string} [existingUri] - URI nativa de Android si ya fue escrito.
     * @returns {Promise<boolean>}
     */
    async function sharePdfFileAPK(jsPdfDoc, fileName, existingUri) {
        const { Share } = getCapacitorPlugins();
        let targetUri = existingUri;

        if (!targetUri && jsPdfDoc) {
            const savedRes = await savePdfFileAPK(jsPdfDoc, fileName);
            targetUri = savedRes.uri;
        }

        // 1. Vía Nativa Android APK (@capacitor/share con URI de FileProvider)
        if (Share && typeof Share.share === 'function' && targetUri) {
            await Share.share({
                title: fileName,
                text: `📄 Planilla Mensual (Precartón) — ${fileName}`,
                url: targetUri,
                 files: [targetUri],
                dialogTitle: 'Compartir o Abrir PDF del Precartón'
            });
            return true;
        }

        // 2. Fallback Web Share API en navegadores móviles (Chrome Android)
        if (jsPdfDoc && typeof navigator !== 'undefined' && navigator.share && typeof File !== 'undefined') {
            const blob = jsPdfDoc.output('blob');
            const file = new File([blob], fileName, { type: 'application/pdf' });
            if (!navigator.canShare || navigator.canShare({ files: [file] })) {
                await navigator.share({
                    title: fileName,
                    text: `📄 Planilla Mensual (Precartón) — ${fileName}`,
                    files: [file]
                });
                return true;
            }
        }

        return false;
    }

    /**
     * Captura la zona del calendario en Android APK, escribe el PNG en el almacenamiento nativo de Android
     * y abre directamente el Intent nativo de Android para enviarlo por WhatsApp.
     * @param {HTMLElement} targetEl - Contenedor del calendario.
     * @param {string} fileName - Nombre del archivo PNG.
     * @returns {Promise<{ok: boolean, mode: string, uri?: string}>}
     */
    async function captureAndShareCalendarAPK(targetEl, fileName) {
        if (!targetEl || typeof html2canvas === 'undefined') {
            throw new Error("html2canvas no disponible en APK");
        }

        const isDark = typeof document !== 'undefined' && document.documentElement.getAttribute('data-theme') === 'dark';
        const canvas = await html2canvas(targetEl, {
            scale: 2,
            useCORS: true,
            logging: false,
            backgroundColor: isDark ? '#1e293b' : '#ffffff'
        });

        const dataUrl = canvas.toDataURL('image/png', 0.95);
        const { Share } = getCapacitorPlugins();

        // 1. Escribir PNG en el almacenamiento nativo del teléfono Android
        const fileRes = await writeNativeFileAndroid(fileName, dataUrl);

        // 2. Si estamos en el APK nativo con Capacitor Share, abrir menú nativo de Android con la imagen adjunta para WhatsApp
        if (Share && typeof Share.share === 'function' && fileRes.uri) {
            await Share.share({
                title: 'Calendario de Servicios Adicionales',
                text: '📅 Calendario de Servicios Adicionales (Web Alfas 2026)',
                url: fileRes.uri,
                files: [fileRes.uri],
                dialogTitle: 'Enviar Captura de Calendario por WhatsApp'
            });
            return { ok: true, mode: 'apk-native-share', uri: fileRes.uri };
        }

        // 3. Fallback navegador móvil (Chrome Android) con Web Share API
        if (typeof navigator !== 'undefined' && navigator.share && typeof File !== 'undefined') {
            const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png', 0.95));
            if (blob) {
                const file = new File([blob], fileName, { type: 'image/png' });
                if (!navigator.canShare || navigator.canShare({ files: [file] })) {
                    await navigator.share({
                        title: 'Calendario de Servicios Adicionales',
                        text: '📅 Calendario de Servicios Adicionales (Web Alfas 2026)',
                        files: [file]
                    });
                    return { ok: true, mode: 'mobile-web-share' };
                }
            }
        }

        // 4. Último fallback: descargar dataUrl
        const a = document.createElement('a');
        a.href = dataUrl;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        a.remove();
        return { ok: true, mode: 'mobile-fallback-download' };
    }

    /**
     * Codifica una cadena de texto UTF-8 (como un archivo JSON) a Base64 puro compatible con Capacitor Filesystem.
     * @param {string} textStr 
     * @returns {string}
     */
    function encodeTextToBase64(textStr) {
        const cleanStr = String(textStr || '');
        if (typeof Buffer !== 'undefined' && typeof Buffer.from === 'function') {
            return Buffer.from(cleanStr, 'utf8').toString('base64');
        }
        if (typeof TextEncoder !== 'undefined' && typeof btoa === 'function') {
            const bytes = new TextEncoder().encode(cleanStr);
            let binary = '';
            for (let i = 0; i < bytes.length; i++) {
                binary += String.fromCharCode(bytes[i]);
            }
            return btoa(binary);
        }
        if (typeof btoa === 'function') {
            return btoa(unescape(encodeURIComponent(cleanStr)));
        }
        return '';
    }

    /**
     * Exporta y guarda el archivo `alfas.json` en Android APK usando `@capacitor/filesystem` (DOCUMENTS / CACHE)
     * y abre el menú nativo `@capacitor/share` o descarga por Blob si se ejecuta en navegador móvil.
     * @param {string} jsonString - Contenido JSON serializado.
     * @param {string} [fileName="alfas.json"] - Nombre del archivo.
     * @param {boolean} [autoShare=true] - Si debe abrir el diálogo nativo para enviar/guardar el archivo.
     * @returns {Promise<{saved: boolean, shared: boolean, uri: string, directory: string, mode: string}>}
     */
    async function exportJsonFileAPK(jsonString, fileName = 'alfas.json', autoShare = true) {
        const cleanJson = String(jsonString || '[]');
        const base64Json = encodeTextToBase64(cleanJson);
        const { Share } = getCapacitorPlugins();

        // 1. Escribir nativamente en DOCUMENTS y CACHE del teléfono Android
        const fileRes = await writeNativeFileAndroid(fileName, base64Json);
        if (fileRes.saved) {
            let shared = false;
            if (autoShare && Share && typeof Share.share === 'function' && fileRes.uri) {
                try {
                    await Share.share({
                        title: fileName,
                        text: `📦 Respaldo de Base de Datos (${fileName}) — Web Alfas 2026`,
                        url: fileRes.uri,
                        files: [fileRes.uri],
                        dialogTitle: 'Guardar o Compartir Respaldo alfas.json'
                    });
                    shared = true;
                } catch (shareErr) {
                    // Si el usuario cierra el menú de compartir, el archivo igualmente ya quedó guardado en Documentos/Descargas
                }
            }
            return {
                saved: true,
                shared,
                uri: fileRes.uri,
                directory: fileRes.directory || 'Documentos / Descargas Android',
                mode: 'apk-native-filesystem'
            };
        }

        // 2. Fallback para navegador móvil Chrome Android (Web Share API con File o descarga Blob)
        if (typeof Blob !== 'undefined') {
            const blob = new Blob([cleanJson], { type: 'application/json;charset=utf-8' });
            if (autoShare && typeof navigator !== 'undefined' && navigator.share && typeof File !== 'undefined') {
                try {
                    const file = new File([blob], fileName, { type: 'application/json' });
                    if (!navigator.canShare || navigator.canShare({ files: [file] })) {
                        await navigator.share({
                            title: fileName,
                            text: `📦 Respaldo ${fileName}`,
                            files: [file]
                        });
                        return { saved: true, shared: true, uri: '', directory: 'Compartido en Android', mode: 'mobile-web-share' };
                    }
                } catch (_) {}
            }

            if (typeof URL !== 'undefined' && URL.createObjectURL && typeof document !== 'undefined') {
                const blobUrl = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = blobUrl;
                a.download = fileName;
                document.body.appendChild(a);
                a.click();
                a.remove();
                setTimeout(() => URL.revokeObjectURL(blobUrl), 4000);
                return { saved: true, shared: false, uri: blobUrl, directory: 'Descargas del Navegador Móvil', mode: 'mobile-blob-download' };
            }
        }

        return { saved: false, shared: false, uri: '', directory: '', mode: 'failed' };
    }

    return {
        PLATFORM_ID: 'android-apk',
        getCapacitorPlugins,
        stripBase64Prefix,
        encodeTextToBase64,
        writeNativeFileAndroid,
        savePdfFileAPK,
        sharePdfFileAPK,
        captureAndShareCalendarAPK,
        exportJsonFileAPK
    };
}));
