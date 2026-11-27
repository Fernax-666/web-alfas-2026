/**
 * @file platformPc.js
 * @description Script exclusivo para Plataforma PC / Windows Desktop (window.AlfaPlatformPC).
 * Maneja descargas directas al navegador de Windows (<a download>), apertura de PDF en visor y envío a WhatsApp Web.
 */

(function (root, factory) {
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = factory();
    } else {
        root.AlfaPlatformPC = factory();
    }
}(typeof self !== 'undefined' ? self : this, function () {

    /**
     * Guarda un archivo PDF en la carpeta Descargas de Windows usando el método nativo del navegador de PC.
     * @param {Object} jsPdfDoc - Instancia de jsPDF.
     * @param {string} fileName - Nombre del archivo (.pdf).
     * @returns {Promise<{saved: boolean, path: string, blobUrl: string}>}
     */
    async function savePdfFilePC(jsPdfDoc, fileName) {
        jsPdfDoc.save(fileName);
        const pdfBlob = jsPdfDoc.output('blob');
        const blobUrl = (typeof URL !== 'undefined' && URL.createObjectURL)
            ? URL.createObjectURL(pdfBlob)
            : '';
        return {
            saved: true,
            path: `Descargas/${fileName}`,
            blobUrl
        };
    }

    /**
     * Comparte o abre el archivo PDF en Windows PC.
     * @param {Object} jsPdfDoc - Instancia de jsPDF.
     * @param {string} fileName - Nombre del archivo (.pdf).
     * @param {string} [blobUrl] - URL del blob pre-generada.
     * @returns {Promise<boolean>}
     */
    async function sharePdfFilePC(jsPdfDoc, fileName, blobUrl) {
        try {
            if (jsPdfDoc && typeof navigator !== 'undefined' && navigator.share && typeof File !== 'undefined') {
                const blob = jsPdfDoc.output('blob');
                const file = new File([blob], fileName, { type: 'application/pdf' });
                if (!navigator.canShare || navigator.canShare({ files: [file] })) {
                    await navigator.share({
                        title: fileName,
                        text: `📄 ${fileName}`,
                        files: [file]
                    });
                    return true;
                }
            }
        } catch (err) {
            if (err && err.name === 'AbortError') return true;
        }

        if (blobUrl && typeof window !== 'undefined') {
            window.open(blobUrl, '_blank');
            return true;
        }
        if (jsPdfDoc) {
            jsPdfDoc.save(fileName);
            return true;
        }
        return false;
    }

    /**
     * Captura un elemento DOM con html2canvas en Windows PC, descarga la imagen PNG y abre WhatsApp Web.
     * @param {HTMLElement} targetEl - Contenedor del calendario.
     * @param {string} fileName - Nombre del archivo PNG.
     * @returns {Promise<{ok: boolean, mode: string}>}
     */
    async function captureAndShareCalendarPC(targetEl, fileName) {
        if (!targetEl || typeof html2canvas === 'undefined') {
            throw new Error("html2canvas no disponible en PC");
        }
        const isDark = typeof document !== 'undefined' && document.documentElement.getAttribute('data-theme') === 'dark';
        const canvas = await html2canvas(targetEl, {
            scale: 2,
            useCORS: true,
            logging: false,
            backgroundColor: isDark ? '#1e293b' : '#ffffff'
        });

        const dataUrl = canvas.toDataURL('image/png');
        const link = document.createElement('a');
        link.href = dataUrl;
        link.download = fileName;
        document.body.appendChild(link);
        link.click();
        link.remove();

        const textoWa = encodeURIComponent("📅 Adjunto captura del Calendario de Servicios Adicionales (Web Alfas 2026).");
        if (typeof window !== 'undefined') {
            window.open(`https://api.whatsapp.com/send?text=${textoWa}`, '_blank');
        }
        return { ok: true, mode: 'pc-download-whatsapp-web' };
    }

    /**
     * Exporta y descarga el archivo `alfas.json` en Windows PC utilizando un objeto Blob URL estándar.
     * @param {string} jsonString - Contenido JSON serializado.
     * @param {string} [fileName="alfas.json"] - Nombre del archivo.
     * @returns {Promise<{saved: boolean, path: string, mode: string}>}
     */
    async function exportJsonFilePC(jsonString, fileName = 'alfas.json') {
        const cleanJson = String(jsonString || '[]');
        if (typeof Blob !== 'undefined' && typeof URL !== 'undefined' && URL.createObjectURL && typeof document !== 'undefined') {
            const blob = new Blob([cleanJson], { type: 'application/json;charset=utf-8' });
            const blobUrl = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = blobUrl;
            a.download = fileName;
            document.body.appendChild(a);
            a.click();
            a.remove();
            setTimeout(() => URL.revokeObjectURL(blobUrl), 4000);
            return {
                saved: true,
                path: `Descargas/${fileName}`,
                mode: 'pc-blob-download'
            };
        }
        return {
            saved: true,
            path: `Descargas/${fileName}`,
            mode: 'headless-node'
        };
    }

    return {
        PLATFORM_ID: 'pc-windows',
        savePdfFilePC,
        sharePdfFilePC,
        captureAndShareCalendarPC,
        exportJsonFilePC
    };
}));
