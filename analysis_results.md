# Informe de Análisis Técnico - Gestión de Servicios Adicionales

## 1. Arquitectura y Tecnologías
La aplicación es una Single-Page Application (SPA) modular, estructurada para ejecutarse localmente y persistir datos sin necesidad de un backend tradicional.
- **Frontend**: HTML5 Semántico, CSS3 moderno (Custom Properties, Flexbox, Grid).
- **Lógica**: JavaScript Vanilla (ES6+), gestión de estado en memoria sincronizada con almacenamiento local.
- **Librerías Externas**:
  - `FullCalendar (v6.1.8)`: Motor de visualización de eventos y gestión de agenda.
  - `Chart.js`: Renderizado de estadísticas dinámicas y distribución de carga.
  - `jsPDF` & `jsPDF-AutoTable`: Generación de reportes PDF estructurados.
  - `SheetJS (XLSX)`: Exportación de datos crudos a formatos de hoja de cálculo.
  - `html2canvas`: Captura de componentes DOM para integración en reportes.
- **Persistencia**: `localStorage` nativo del navegador para persistencia persistente de eventos, configuración y entidades.

## 2. Funcionalidades del Sistema

### Administración y Gestión de Entidades
- **Gestión de Policías**: Soporte para perfiles con **Jerarquía** (dropdown predefinido) y capacidad de edición/modificación de registros existentes.
- **Gestión de Empresas**: Base de datos de entidades con campos extendidos:
  - Configuración de turnos múltiples por empresa.
  - Asignación diferenciada de categorías por día de la semana (Lun-Vie vs. Sáb-Dom).
  - Metadatos de contacto: Domicilio, barrio, teléfono, referente de entidad y policía encargado.
- **Interoperabilidad**: Importación de datos maestros mediante archivos `alfas.json`.

### Interfaz y Visualización
- **Calendario Dinámico**: Registro rápido de servicios, identificación visual por colores de policía y diferenciador estético para eventos de meses anteriores.
- **Dashboard de Estadísticas**: 
  - KPIs en tiempo real: Total de turnos, costo acumulado y policías activos.
  - Gráfico de distribución de carga de trabajo por policía.
  - Filtro global por mes que sincroniza todos los widgets y tablas del dashboard.

### Reportes Avanzados
- **Sistema de Exportación Filtrada**: Modal dedicado para exportación selectiva por mes, policía y múltiples empresas simultáneamente (multiselect).
- **Integridad de Datos**: Generación de reportes PDF mediante acceso directo a la fuente de datos (`localStorage`), garantizando que el 100% de los registros se capturen independientemente del estado visual del calendario.

## 3. Lógica de Negocio y Algoritmos

### Configuración Flexible de Costos
El sistema soporta múltiples categorías tarifarias (`A, AP, B, BP, E, HE, HO`), configurables dinámicamente desde la interfaz administrativa.

### Algoritmo de Split Horario (Cruce de Medianoche)
Implementación de lógica avanzada para turnos nocturnos:
- Si un turno cruza la medianoche y las categorías tarifarias del día de inicio y el día siguiente son diferentes (ej. Domingo a Lunes), el sistema calcula automáticamente:
  - `Horas Día 1 * Tarifa Día 1`
  - `Horas Día 2 * Tarifa Día 2`
  - El resultado es un costo consolidado con detalle de partición en la tabla de servicios.

### Seguridad y Validación
- **Prevención de Solapamiento**: Validación automática para evitar la asignación de múltiples turnos idénticos al mismo policía en el mismo día.
- **Normalización**: Implementación de normalización alfanumérica para asegurar que los filtros de búsqueda sean robustos ante variaciones en el ingreso de texto.

## 4. Observaciones y Recomendaciones
- **Escalabilidad**: El uso de `localStorage` es ideal para uso individual, pero se recomienda considerar una API/DB centralizada si se requiere multiusuario o backups automáticos en la nube.
- **Optimización**: Se ha implementado un sistema de "bypass" en los reportes para evitar limitaciones de renderizado del componente de calendario, asegurando reportes precisos incluso con grandes volúmenes de datos.
- **UX**: La interfaz ha evolucionado hacia un diseño de "Dashboard Administrativo" con micro-animaciones y banners informativos de estado (notificaciones).

---
*Análisis técnico actualizado por Antigravity - Abril 2026*
