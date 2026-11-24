---
name: sitio-mobile-adapter
description: Reglas y directivas de adaptación móvil, ergonomía táctil, empaquetado Capacitor/APK y diseño responsive para Sitio Centro de Datos (Policía Caminera).
---

# Sitio Mobile Adapter — Directivas de Adaptación Móvil y Empaquetado APK

Esta skill establece las directivas obligatorias para garantizar que la plataforma **Sitio Centro de Datos (Policía Caminera)** opere con rendimiento nativo, alta ergonomía y consistencia visual en entornos móviles y empaquetados híbridos (Capacitor / Android APK).

---

## 1. Principio de Base de Código Unificada (Single Codebase)

1. **Sin Duplicación de Lógica**:
   - Mantener una única base de código TypeScript/JavaScript modular sin bifurcar ni clonar archivos para móvil.
   - Toda la lógica de datos (consumo de APIs de Google Sheets / Google Apps Script, sincronización con PostgreSQL, validaciones con Zod y parsers de siniestros) debe residir centralizada en la capa de servicios (`src/servicios/` y `JS/`).
   - Las particularidades de plataforma se resuelven mediante detección contextual de entorno (`Capacitor.isNativePlatform()`, comprobación de capacidades táctiles `@media (hover: none) and (pointer: coarse)`) y nunca mediante duplicación de scripts.

---

## 2. Auditoría de Viewport y Meta Tags Nativos

En cada archivo HTML del proyecto (`index.html`, `informes_personalizados.html`, `Comparativa_Siniestros_CVF.html`, etc.) se debe auditar y exigir la etiqueta de viewport optimizada para WebViews y pantallas móviles completas:

```html
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover">
```

### Reglas de Layout y Safe Area (Notches y Barras de Navegación):
- Incorporar en las hojas CSS principales (`CSS/menu_global.css`, `CSS/estilos_informes_personalizados.css`, etc.) el soporte de áreas seguras para dispositivos modernos:
  ```css
  :root {
      --sat: env(safe-area-inset-top, 0px);
      --sab: env(safe-area-inset-bottom, 0px);
      --sal: env(safe-area-inset-left, 0px);
      --sar: env(safe-area-inset-right, 0px);
  }
  body {
      padding-top: var(--sat);
      padding-bottom: var(--sab);
      padding-left: var(--sal);
      padding-right: var(--sar);
  }
  ```

---

## 3. Ergonomía Táctil y Prevención de Zoom Disruptivo

1. **Áreas Táctiles Mínimas de 48px**:
   - Todos los elementos interactivos (botones `.btn-action`, `.btn-filter`, `.btn-toggle-filters`, pestañas `.cvf-tab-btn`, checkboxes y disparadores dropdown) deben tener un tamaño táctil mínimo de **48px x 48px** (`min-height: 48px; min-width: 48px;` o padding envolvente equivalente).
   - Separación mínima de **8px** entre botones contiguos para evitar toques accidentales.

2. **Tipografía Mínima en Inputs para Evitar Auto-Zoom**:
   - Para prevenir que navegadores móviles (iOS Safari / Android Chrome / WebView) realicen zoom automático forzado al enfocar campos de texto, exigir:
   ```css
   input[type="text"],
   input[type="number"],
   input[type="date"],
   input[type="search"],
   select,
   textarea {
       font-size: 16px !important; /* Mínimo requerido para evitar auto-zoom móvil */
   }
   ```

---

## 4. Transformación de Tablas a Tarjetas Apiladas (`@media (max-width: 768px)`)

En pantallas menores o iguales a 768px, las tablas de datos densas no deben desbordar la pantalla ni forzar scrolls horizontales incontrolados:

1. **Patrón de Tarjetas Apiladas (Stacked Card Layout)**:
   - Convertir filas de tablas de datos (`table`, `tbody`, `tr`, `td`) en bloques apilados:
   ```css
   @media (max-width: 768px) {
       .table-responsive table.custom-table {
           display: block;
           width: 100%;
       }
       .table-responsive thead {
           display: none; /* Ocultar cabeceras en columnas */
       }
       .table-responsive tr {
           display: block;
           margin-bottom: 12px;
           background: rgba(22, 27, 34, 0.85);
           border: 1px solid rgba(255, 255, 255, 0.1);
           border-radius: 8px;
           padding: 8px;
       }
       .table-responsive td {
           display: flex;
           justify-content: space-between;
           align-items: center;
           padding: 8px 12px;
           border: none;
           border-bottom: 1px solid rgba(255, 255, 255, 0.05);
           text-align: right;
       }
       .table-responsive td::before {
           content: attr(data-label);
           font-weight: 700;
           text-transform: uppercase;
           font-size: 0.75rem;
           color: #94a3b8;
           text-align: left;
           margin-right: 12px;
       }
   }
   ```
2. **Tableros de Gráficos y Cuadrantes**:
   - Las grillas ejecutivas 2x2 (`.cvf-numerica-grid-2x2`, `.cvf-grid-2x2`) deben reconfigurarse a **1 sola columna fluida** (`grid-template-columns: 1fr;`) con scroll vertical natural.

---

## 5. Directivas de Empaquetado Capacitor / APK

- Apoyarse en las skills complementarias instaladas en el repositorio:
  - `webapp-to-capacitor`: Auditoría de migración web a contenedor Capacitor, eliminación de dependencias no soportadas en WebView, configuración de `capacitor.config.ts`.
  - `capacitor-app-development` & `capacitor-app-creation`: Estructura del proyecto Android (`android/`), Gradle, permisos en `AndroidManifest.xml` (acceso a internet, geolocalización, almacenamiento seguro).
  - `capacitor-plugins` & `capawesome-cli`: Plugins oficiales verificados para notificaciones, feedback háptico y biometría.

