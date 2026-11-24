---
name: security-hardening
description: Mitigación de riesgos OWASP, sanitización de inputs y headers de seguridad.
triggers:
  - "seguridad"
  - "sanitizar"
  - "middleware auth"
  - "proteger endpoint"
file_patterns:
  - "src/middlewares/**/*"
  - "src/auth/**/*"
  - "src/app.js"
  - "src/server.js"
---

# Security Hardening Directives

1. **Headers:** Configurar `helmet()` en la instancia de Express.
2. **CORS:** Restringir orígenes permitidos explícitamente; evitar comodines `*` en entornos con credenciales/cookies.
3. **Inyección y XSS:** Sanitizar entradas y validar esquemas estrictos (Zod/Joi) descartando campos desconocidos.
4. **Secretos:** Toda credencial debe cargarse desde variables de entorno (`process.env`). Prohibido hardcodear API keys o secretos de firma.
5. **Cookies:** Enviar cookies de sesión con flags `httpOnly: true`, `secure: true` y `sameSite: 'strict'`.
