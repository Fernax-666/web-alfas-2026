---
name: architecture-boundaries
description: Separación estricta de capas entre controladores, servicios y persistencia.
triggers:
  - "arquitectura"
  - "nueva ruta"
  - "separar capas"
  - "servicio"
file_patterns:
  - "src/routes/**/*"
  - "src/controllers/**/*"
  - "src/services/**/*"
---

# Architecture Boundaries Directives

1. **Controllers Ligeros:** Solo extraen parámetros de `req`, llaman al servicio y devuelven `res.status().json()`.
2. **Prohibición en Controllers:** Queda prohibido escribir consultas de base de datos u ORM directamente dentro de controladores.
3. **Lógica en Servicios:** El 100% de las validaciones de negocio e interacción con datos reside en la capa `services/`.
4. **Manejo Centralizado de Errores:** Lanzar errores tipados de dominio que capture un middleware global de Express.
