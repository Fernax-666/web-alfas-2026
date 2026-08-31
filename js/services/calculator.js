/**
 * @file calculator.js
 * @description Lógica del cálculo de costos para turnos adicionales con división de midnight (split shift).
 * Compatible con entornos de Navegador (window.AlfaCalculator) y Node.js (CommonJS).
 */

(function (root, factory) {
    if (typeof module !== 'undefined' && module.exports) {
        // Entorno Node.js
        module.exports = factory();
    } else {
        // Entorno Navegador
        root.AlfaCalculator = factory();
    }
}(typeof self !== 'undefined' ? self : this, function () {

    /**
     * @typedef {Object} ShiftDetail
     * @property {string} cat - Categoría tarifaria aplicada.
     * @property {number} h - Horas asignadas a la categoría.
     * @property {number} vh - Valor por hora.
     * @property {number} cost - Costo calculado para el tramo.
     */

    /**
     * @typedef {Object} CalculationResult
     * @property {string} cat - Etiqueta de la categoría o combinación (ej: "A" o "A+AP").
     * @property {number} cost - Costo total del turno.
     * @property {number} h - Horas totales del turno.
     * @property {number} vh - Valor hora promedio o unitario.
     * @property {ShiftDetail[]} detail - Desglose de tramos de costo.
     * @property {string} catLabel - Etiqueta legible para reportes.
     */

    /**
     * Calcula el costo real de un turno, dividiendo horas si cruza medianoche y los días difieren en categoría.
     * @param {string} turno - Rango horario del turno (ej: "22-06", "07-15").
     * @param {string} fechaStr - Fecha de inicio en formato YYYY-MM-DD.
     * @param {Object} empData - Datos de la empresa con catSemana y catFinde.
     * @param {Object} [configMap] - Mapa de tarifas por categoría { A: number, AP: number, ... }.
     * @returns {CalculationResult} Objeto con resultado detallado del cálculo.
     */
    function calcularCostoTurno(turno, fechaStr, empData, configMap) {
        const fallback = { cat: "A", cost: 0, h: 8, vh: 0, detail: [], catLabel: "A" };
        if (!turno || !turno.includes("-") || !empData) return fallback;

        // Si no se provee mapa de tarifas explícito, intentar obtener del contexto global
        const tariffConfig = configMap || (typeof window !== 'undefined' && window.config) || {};

        const parts = turno.split("-");
        const startH = parseInt(parts[0], 10);
        const endH = parseInt(parts[1], 10);

        if (isNaN(startH) || isNaN(endH)) return fallback;

        const totalH = endH > startH ? (endH - startH) : (24 - startH + endH);
        const isOvernight = endH < startH || (endH === 0 && startH > 0);

        // Categoría del día de inicio
        const startDate = new Date(fechaStr + "T00:00:00");
        if (isNaN(startDate.getTime())) return fallback;

        const startDay = startDate.getDay();
        const isStartFinde = (startDay === 0 || startDay === 6);
        const catStart = isStartFinde ? empData.catFinde : empData.catSemana;

        if (!isOvernight) {
            const vh = tariffConfig[catStart] || 0;
            const cost = vh * totalH;
            return {
                cat: catStart,
                cost: cost,
                h: totalH,
                vh: vh,
                detail: [{ cat: catStart, h: totalH, vh: vh, cost: cost }],
                catLabel: catStart
            };
        }

        // Turno nocturno: calcular categoría del día siguiente
        const nextDate = new Date(startDate);
        nextDate.setDate(nextDate.getDate() + 1);
        const nextDay = nextDate.getDay();
        const isNextFinde = (nextDay === 0 || nextDay === 6);
        const catNext = isNextFinde ? empData.catFinde : empData.catSemana;

        if (catStart === catNext) {
            const vh = tariffConfig[catStart] || 0;
            const cost = vh * totalH;
            return {
                cat: catStart,
                cost: cost,
                h: totalH,
                vh: vh,
                detail: [{ cat: catStart, h: totalH, vh: vh, cost: cost }],
                catLabel: catStart
            };
        }

        // Categorías distintas: split a medianoche
        const hStartPart = 24 - startH;
        const hNextPart = endH;

        const vh1 = tariffConfig[catStart] || 0;
        const vh2 = tariffConfig[catNext] || 0;
        const cost1 = vh1 * hStartPart;
        const cost2 = vh2 * hNextPart;
        const totalCost = cost1 + cost2;
        const vhProm = totalH > 0 ? totalCost / totalH : 0;

        return {
            cat: `${catStart}+${catNext}`,
            cost: totalCost,
            h: totalH,
            vh: vhProm,
            detail: [
                { cat: catStart, h: hStartPart, vh: vh1, cost: cost1 },
                { cat: catNext, h: hNextPart, vh: vh2, cost: cost2 }
            ],
            catLabel: `${catStart}+${catNext}`
        };
    }

    return {
        calcularCostoTurno
    };
}));
