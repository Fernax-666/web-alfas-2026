/**
 * @file exporter.js
 * @description Servicio desacoplado para la generación y descarga de reportes en Excel (SheetJS) y PDF (jsPDF + html2canvas).
 * Compatible con entornos de Navegador (window.AlfaExporter) y Node.js (CommonJS).
 */

(function (root, factory) {
    if (typeof module !== 'undefined' && module.exports) {
        // Entorno Node.js
        module.exports = factory();
    } else {
        // Entorno Navegador
        root.AlfaExporter = factory();
    }
}(typeof self !== 'undefined' ? self : this, function () {

    /**
     * Exporta los servicios filtrados a una planilla de cálculo Excel (.xlsx).
     * @param {Object} options - Parámetros de exportación.
     * @param {string} options.mesFiltroValue 
     * @param {string} options.polFiltroValue 
     * @param {string[]} options.empFiltros 
     * @param {Array} options.rawEvents 
     * @param {Object} options.utils - Referencia a AlfaUtils (formatearTurno, getLocalYM, getLocalYMD).
     * @param {Function} options.onNotification - Callback para notificaciones flotantes.
     * @param {Function} options.onCloseModal - Callback para cerrar modal de exportación.
     */
    function exportExcel({ mesFiltroValue, polFiltroValue, empFiltros, rawEvents, utils, onNotification, onCloseModal }) {
        if (typeof XLSX === 'undefined') {
            if (onNotification) onNotification("La librería SheetJS (XLSX) no está cargada", "var(--danger)");
            return;
        }

        const data = [["Fecha", "Empresa", "Policía", "Turno", "Categoría", "Horas", "Valor Hora", "Costo Total"]];
        const safeEvents = Array.isArray(rawEvents) ? rawEvents : [];

        // Ordenar cronológicamente
        const eventosData = safeEvents.map(e => ({
            ...e,
            startDate: new Date(e.start + (e.start.includes("T") ? "" : "T00:00:00"))
        }));
        eventosData.sort((a, b) => a.startDate - b.startDate);

        eventosData.forEach(e => {
            if (!e.startDate || isNaN(e.startDate.getTime())) return;
            const ym = utils.getLocalYM(e.startDate);
            if (mesFiltroValue && ym !== mesFiltroValue) return;

            const p = e.extendedProps || {};
            const polNombre = (p.policia || "").trim();
            const empNombre = (p.empresa || "").trim();

            if (polFiltroValue && polNombre !== polFiltroValue) return;
            if (empFiltros && empFiltros.length > 0 && !empFiltros.includes(empNombre)) return;

            data.push([
                utils.getLocalYMD(e.startDate),
                empNombre,
                polNombre,
                utils.formatearTurno(p.turno),
                p.cat,
                p.h,
                p.vh,
                p.cost
            ]);
        });

        if (data.length === 1) {
            if (onNotification) onNotification("No hay registros para exportar con estos filtros", "var(--warning)");
            return;
        }

        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.aoa_to_sheet(data);
        XLSX.utils.book_append_sheet(wb, ws, "Servicios");
        XLSX.writeFile(wb, `Reporte_Servicios_${new Date().toISOString().slice(0, 10)}.xlsx`);

        if (onCloseModal) onCloseModal();
        if (onNotification) onNotification("Excel generado con éxito", "var(--secondary)");
    }

    /**
     * Genera y descarga el reporte en formato PDF incluyendo captura del calendario si está disponible.
     * @param {Object} options 
     */
    async function exportPDF({ mesFiltro, polFiltro, empFiltros, rawEvents, empresasMap, calendarInstance, utils, onNotification, onCloseModal }) {
        try {
            if (typeof window.jspdf === 'undefined') {
                if (onNotification) onNotification("La librería jsPDF no está cargada", "var(--danger)");
                return;
            }

            const rows = [];
            const safeEvents = Array.isArray(rawEvents) ? rawEvents : [];

            // Convertir y ordenar cronológicamente
            const eventosData = safeEvents.map(e => ({
                ...e,
                startDate: new Date(e.start + (e.start.includes("T") ? "" : "T00:00:00"))
            }));
            eventosData.sort((a, b) => a.startDate - b.startDate);

            let totalCosto = 0;
            const polFilterNorm = (polFiltro || "").toLowerCase().replace(/[^a-z0-9]/g, '');
            const empFiltersNorm = (empFiltros || []).map(f => (f || "").trim().toLowerCase().replace(/[^a-z0-9]/g, ''));

            let startOfMonth = null;
            let endOfMonth = null;
            if (mesFiltro && mesFiltro.includes("-")) {
                const [filAnio, filMes] = mesFiltro.split('-').map(Number);
                startOfMonth = new Date(filAnio, filMes - 1, 1, 0, 0, 0);
                endOfMonth = new Date(filAnio, filMes, 0, 23, 59, 59);
            }

            eventosData.forEach(e => {
                if (!e.startDate || isNaN(e.startDate.getTime())) return;
                const props = e.extendedProps || {};

                // EXTRAER POLICÍA
                const pRaw = props.policia || e.policia || e.title || "";
                const polStr = (typeof pRaw === 'object' ? pRaw.nombre : pRaw).toString().split(/[\n-]/)[0].trim();

                // EXTRAER EMPRESA
                let eRaw = props.empresa || e.empresa || "";
                let empStr = (typeof eRaw === 'object' ? eRaw.nombre : eRaw).toString().trim();

                // BÚSQUEDA MAESTRA EN EL TÍTULO SI FALTA EMPRESA ESTRUCTURADA
                if (!empStr && e.title && empresasMap) {
                    const masterEmpresas = Object.keys(empresasMap);
                    const titleTerm = e.title.toLowerCase().replace(/[^a-z0-9]/g, '');
                    for (let n of masterEmpresas) {
                        let nTerm = n.toLowerCase().replace(/[^a-z0-9]/g, '');
                        if (titleTerm.includes(nTerm)) {
                            empStr = n;
                            break;
                        }
                    }
                }

                const polNorm = polStr.toLowerCase().replace(/[^a-z0-9]/g, '');
                const empNorm = empStr.toLowerCase().replace(/[^a-z0-9]/g, '');

                if (startOfMonth && endOfMonth) {
                    if (e.startDate < startOfMonth || e.startDate > endOfMonth) return;
                }

                if (polFilterNorm) {
                    if (!polNorm.includes(polFilterNorm) && !polFilterNorm.includes(polNorm)) return;
                }

                if (empFiltersNorm.length > 0 && !empFiltersNorm.includes(empNorm)) return;

                const costVal = (props.cost || e.cost || 0);
                rows.push([
                    utils.getLocalYMD(e.startDate),
                    empStr || "S/D",
                    polStr || "S/D",
                    utils.formatearTurno(props.turno || e.turno || ""),
                    props.cat || e.cat || "-",
                    `$${costVal.toLocaleString('es-AR')}`
                ]);
                totalCosto += costVal;
            });

            if (rows.length === 0) {
                if (onNotification) onNotification("No hay registros para exportar con estos filtros", "var(--warning)");
                return;
            }

            if (onCloseModal) onCloseModal();
            if (onNotification) onNotification("Preparando visualización del calendario...", "var(--primary)");

            document.body.classList.add('pdf-mode');

            let prevDate = calendarInstance ? calendarInstance.getDate() : new Date();
            let prevFiltroCalElem = document.getElementById("filtroCalPolicia");
            let prevFiltroCal = prevFiltroCalElem ? prevFiltroCalElem.value : "";

            if (calendarInstance && mesFiltro) calendarInstance.gotoDate(mesFiltro + "-01");
            if (prevFiltroCalElem) prevFiltroCalElem.value = polFiltro || "";

            if (typeof window.filtrarCalendario === 'function') {
                window.filtrarCalendario();
            }

            await new Promise(r => setTimeout(r, 800));

            let imgData = null;
            let canvasWidth = 0;
            let canvasHeight = 0;
            try {
                const calEl = document.getElementById("calendar");
                if (calEl && typeof html2canvas !== 'undefined') {
                    const canvas = await html2canvas(calEl, {
                        scale: 2,
                        useCORS: true,
                        logging: false
                    });
                    imgData = canvas.toDataURL('image/jpeg', 0.9);
                    canvasWidth = canvas.width;
                    canvasHeight = canvas.height;
                }
            } catch (err) {
                console.error("Error html2canvas:", err);
            }

            if (calendarInstance) calendarInstance.gotoDate(prevDate);
            if (prevFiltroCalElem) prevFiltroCalElem.value = prevFiltroCal;

            if (typeof window.filtrarCalendario === 'function') {
                window.filtrarCalendario();
            }

            document.body.classList.remove('pdf-mode');

            const { jsPDF } = window.jspdf;
            const doc = new jsPDF();

            doc.setFontSize(20);
            doc.text("Reporte de Servicios Adicionales", 15, 20);

            let lineasHeader = [`Generado el: ${new Date().toLocaleString()}`];
            if (mesFiltro || polFiltro || (empFiltros && empFiltros.length > 0)) {
                lineasHeader.push("Filtros Aplicados:");
                if (mesFiltro) lineasHeader.push(`  • Mes: ${mesFiltro}`);
                if (polFiltro) lineasHeader.push(`  • Policía: ${polFiltro}`);
                if (empFiltros && empFiltros.length > 0) {
                    lineasHeader.push(`  • Empresas: ${empFiltros.join(", ")}`);
                }
            }

            doc.setFontSize(9);
            const pdfWidth = doc.internal.pageSize.getWidth();
            let splitLines = doc.splitTextToSize(lineasHeader, pdfWidth - 30);
            doc.text(splitLines, 15, 28);

            let finalYHeader = 28 + (splitLines.length * 4.5) + 3;
            if (imgData && canvasWidth > 0) {
                const margin = 15;
                let pdfImgWidth = pdfWidth - margin * 2;
                let pdfImgHeight = (canvasHeight * pdfImgWidth) / canvasWidth;

                if (pdfImgHeight > 130) {
                    pdfImgWidth = pdfImgWidth * (130 / pdfImgHeight);
                    pdfImgHeight = 130;
                    let leftMargin = (pdfWidth - pdfImgWidth) / 2;
                    doc.addImage(imgData, 'JPEG', leftMargin, finalYHeader, pdfImgWidth, pdfImgHeight);
                } else {
                    doc.addImage(imgData, 'JPEG', margin, finalYHeader, pdfImgWidth, pdfImgHeight);
                }
                finalYHeader = finalYHeader + pdfImgHeight + 8;
            }

            doc.autoTable({
                startY: finalYHeader,
                head: [['Fecha', 'Empresa', 'Policía', 'Turno', 'Cat', 'Total']],
                body: rows,
                theme: 'striped',
                headStyles: { fillColor: [37, 99, 235] }
            });

            let finalY = doc.lastAutoTable ? doc.lastAutoTable.finalY : finalYHeader;
            if (finalY > doc.internal.pageSize.getHeight() - 25) {
                doc.addPage();
                finalY = 20;
            }

            doc.setFontSize(11);
            doc.setFont("helvetica", "bold");
            doc.text(`Cantidad de Turnos: ${rows.length}`, 15, finalY + 10);
            doc.text(`Monto Acumulado: $${totalCosto.toLocaleString('es-AR')}`, 15, finalY + 16);

            doc.save(`Reporte_Servicios_${new Date().toISOString().slice(0, 10)}.pdf`);
            if (onNotification) onNotification("PDF generado con éxito", "var(--secondary)");

        } catch (globalError) {
            console.error("Error en exportPDF:", globalError);
            if (onNotification) onNotification("Error al generar el PDF. Revisa la consola.", "var(--danger)");
        }
    }

    return {
        exportExcel,
        exportPDF
    };
}));
