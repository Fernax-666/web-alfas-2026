# CONVENCIONES DEL PROYECTO
- **Stack:** HTML5 / CSS3 / Vanilla JavaScript / TypeScript / Google Apps Script (clasp) + Google Sheets API.
- **Estilo:** Funciones puras, inmutabilidad con `const`, early returns.
- **Tipado:** Estricto, prohibido el uso de tipo `any`.
- **Manejo de Errores:** No suprimir excepciones con `try/catch` vacíos; usar middleware centralizado.
- **Seguridad:** Todas las consultas SQL o NoSQL deben usar bindings parametrizados.

# CONVENCIONES DE BASE DE DATOS (GOOGLE SHEETS + APPS SCRIPT)

### Buenas Prácticas de Rendimiento (Apps Script):
- **Prohibido el acceso celda por celda en bucles:** Siempre usar `getRange().getValues()` y `setValues()` en bloque para evitar agotar la cuota de tiempo de ejecución (máx. 6 minutos).
- **Manejo de CORS y Respuestas:** Toda respuesta web debe construirse con `ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON)`.
- **Estructura de Endpoints:** Usar funciones `doGet(e)` y `doPost(e)` con un parámetro `action` para enrutar operaciones (simulando controladores REST).

### Buenas Prácticas de Robustez y Validación:
- **Validación de Payloads:** Validar y parsear siempre `e.postData.contents` con control de excepciones `try/catch`.
- **Mapeo de Tipos:** El frontend debe mapear explícitamente los arrays de Sheets (donde todo suele venir como string/número genérico) a tipos TypeScript estrictos.
- **Bloqueo Concurrente:** Usar `LockService.getScriptLock()` en escrituras críticas para prevenir colisiones cuando varios usuarios escriben en la hoja al mismo tiempo.