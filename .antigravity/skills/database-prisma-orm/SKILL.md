---
name: database-prisma-orm
description: Optimización de consultas Prisma, transacciones y prevención de N+1 queries.
triggers:
  - "query prisma"
  - "migracion base de datos"
  - "consulta sql"
file_patterns:
  - "prisma/schema.prisma"
  - "src/services/**/*"
  - "src/repositories/**/*"
---

# Database & Prisma ORM Directives

1. **Paginación Mandatoria:** Toda consulta de listado debe utilizar `take` y `skip` o paginación por cursor.
2. **Proyección de Campos:** Usar `select` explícito para retornar únicamente los campos necesarios y omitir credenciales/hashes.
3. **Transacciones:** Usar `prisma.$transaction([ ... ])` para operaciones de mutación dependientes entre múltiples entidades.
4. **Prevención N+1:** Utilizar `include` moderado con relaciones indexadas; evitar loops asíncronos que ejecuten queries individuales.
5. **Índices:** Declarar `@@index` en `schema.prisma` sobre llaves foráneas y columnas con filtros recurrentes.
