---
name: modern-js-practices
description: Estándares de JavaScript moderno (ES2022+), inmutabilidad y promesas robustas.
triggers:
  - "escribir funcion js"
  - "logica javascript"
  - "async await"
file_patterns:
  - "**/*.js"
  - "**/*.mjs"
---

# Modern JavaScript Directives

1. **Declaración:** Usar `const` por defecto; `let` solo si el valor se reasigna. `var` queda prohibido.
2. **Asincronía:** Utilizar `async/await` con bloques `try/catch`. No encadenar `.then()` con `await` en el mismo contexto.
3. **Transformaciones:** Usar métodos declarativos (`map`, `filter`, `reduce`, `some`) en lugar de bucles `for` con mutaciones manuales.
4. **Operadores Modernos:** Emplear Nullish Coalescing (`??`) y Optional Chaining (`?.`) para manejo seguro de propiedades opcionales.
5. **Módulos:** Exportaciones con nombre (`export const miFuncion`) para trazabilidad e imports explícitos.
