---
name: ui-copy-proofreader
description: Auditoría ortográfica, consistencia de microcopy y gramática en español para interfaces.
triggers:
  - "revisar textos"
  - "corregir ortografia"
  - "microcopy"
  - "textos de interfaz"
file_patterns:
  - "src/locales/**/*"
  - "src/views/**/*"
  - "**/*.html"
---

# UI Copy & Proofreader Directives

1. **Signos de Apertura:** Obligatorio incluir `¿` y `¡` en cualquier texto en español dirigido al usuario.
2. **Tildes y Mayúsculas:** Conservar tildes normativas y diacríticas incluso en títulos o botones en mayúsculas sostenidas.
3. **Acciones en UI:** Botones interactivos deben usar infinitivos estandarizados (*Guardar cambios*, *Descargar archivo*).
4. **Separación de Idiomas:** Nombres de variables, rutas y base de datos en inglés; microcopy visible al usuario en español neutro.
5. **Mensajes de Error:** Explicar el fallo en lenguaje humano y proveer la acción correctiva sin exponer trazas de servidor.
