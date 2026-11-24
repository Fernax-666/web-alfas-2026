---
name: rest-api-design
description: Convenciones de endpoints, códigos HTTP y contratos JSON unificados.
triggers:
  - "crear api"
  - "endpoint rest"
  - "disenar ruta"
file_patterns:
  - "src/routes/**/*"
  - "src/controllers/**/*"
---

# REST API Design Directives

1. **Nomenclatura:** Rutas en plural con sustantivos en minúsculas (ej. `/api/v1/projects/:id/tasks`).
2. **Códigos de Estado:**
   - `200 OK`: Operación exitosa con retorno de datos.
   - `201 Created`: Recurso creado exitosamente.
   - `204 No Content`: Operación completada sin cuerpo de retorno (ej. DELETE).
   - `400 Bad Request`: Parámetros inválidos o incompletos.
   - `404 Not Found`: Recurso inexistente.
   - `422 Unprocessable Entity`: Fallo en validación de reglas de negocio.
3. **Formato JSON Estándar:**
   - Éxito: `{ "success": true, "data": { ... } }`
   - Error: `{ "success": false, "error": { "code": "USER_NOT_FOUND", "message": "..." } }`
