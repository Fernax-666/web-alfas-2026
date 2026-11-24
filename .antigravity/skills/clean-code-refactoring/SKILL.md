---
name: clean-code-refactoring
description: Directivas de refactorización, reducción de deuda técnica y simplificación de lógica.
triggers:
  - "refactorizar"
  - "limpiar codigo"
  - "simplificar funcion"
  - "reducir complejidad"
file_patterns:
  - "src/**/*.js"
  - "src/**/*.ts"
---

# Clean Code & Refactoring Directives

1. **Guard Clauses:** Usar retornos tempranos para mantener un máximo de 2 niveles de anidamiento condicional.
2. **Límite de Longitud:** Funciones con más de 25 líneas deben extraerse en funciones auxiliares puras y descriptivas.
3. **Constantes Semánticas:** Reemplazar valores numéricos o cadenas mágicas por enums o constantes `UPPER_SNAKE_CASE`.
4. **Inmutabilidad:** No mutar objetos o arrays recibidos como argumento; retornar nuevas estructuras.
5. **Código Muerto:** Eliminar funciones sin uso, imports no referenciados y bloques de código comentado.
