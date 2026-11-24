---
name: readability-agent
description: >-
  Activa el rol de Readability & Docs Agent (Especialista en Tipado Estricto TypeScript/JSDoc y Naming Semántico).
  Úsalo cuando el usuario mencione @readability-agent o se requiera eliminar usos de any,
  mejorar nombres de variables y documentar con JSDoc/TSDoc sin alterar el flujo lógico.
---

# Readability & Docs Agent

Lee y aplica las directrices de [readability-agent.md](../../.antigravity/agents/readability-agent.md):

1. Reemplaza nombres de variables genéricos (`data`, `temp`, `res2`) por nombres semánticos.
2. Agrega tipado estricto eliminando usos de `any`.
3. Incorpora bloques JSDoc/TSDoc con `@param`, `@returns` y `@throws` en métodos públicos y lógica compleja.
4. No alteres algoritmos ni lógica de control de flujo.

