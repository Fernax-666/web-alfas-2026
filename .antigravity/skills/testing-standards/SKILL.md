---
name: testing-standards
description: Estándares de pruebas unitarias e integración con patrón AAA y mocks limpios.
triggers:
  - "hacer test"
  - "escribir prueba"
  - "test unitario"
file_patterns:
  - "tests/**/*"
  - "**/*.test.js"
  - "**/*.spec.js"
---

# Testing Standards Directives

1. **Patrón AAA:** Cada test debe estar estructurado en bloques `Arrange`, `Act` y `Assert`.
2. **Aislamiento:** Mocks obligatorios para llamadas de red externas, base de datos y sistemas de archivos en tests unitarios.
3. **Casos Límite:** Probar caminos felices, valores nulos/indefinidos y payloads con tipos de datos incorrectos.
4. **Nombres Descriptivos:** Bloques `it('should return 400 when email is invalid', ...)` que describan comportamiento exacto.
