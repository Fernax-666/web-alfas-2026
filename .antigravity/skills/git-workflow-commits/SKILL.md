---
name: git-workflow-commits
description: Estandarización de Conventional Commits y cambios atómicos en Git.
triggers:
  - "hacer commit"
  - "mensaje de git"
  - "preparar pr"
file_patterns:
  - "**/*"
---

# Git Workflow Directives

1. **Formato Conventional Commits:** `<tipo>(<alcance opcional>): <descripción breve>`
   - `feat`: Nueva funcionalidad.
   - `fix`: Corrección de un error.
   - `refactor`: Cambio de código sin alterar comportamiento.
   - `perf`: Mejora de rendimiento.
   - `docs`: Documentación.
   - `test`: Añadir o corregir pruebas.
   - `chore`: Mantenimiento de dependencias o builds.
2. **Redacción:** Descripción en minúsculas, modo imperativo presente y sin punto final (ej. `feat(auth): add refresh token handler`).
3. **Atomicidad:** Un commit por cambio lógico; no agrupar refactorizaciones con nuevas características en el mismo commit.
