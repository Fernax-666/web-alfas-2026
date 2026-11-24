---
name: semantic-html-layout
description: Maquetado semántico, arquitectura CSS moderna y accesibilidad (WCAG AA).
triggers:
  - "maquetar"
  - "diseno html"
  - "estilos css"
  - "hacer responsive"
file_patterns:
  - "public/**/*.html"
  - "src/**/*.html"
  - "src/**/*.css"
---

# Semantic HTML & Layout Directives

1. **Semántica HTML5:** Utilizar `<main>`, `<nav>`, `<header>`, `<section>`, `<article>`, `<footer>`. Evitar el "div soup".
2. **Sistemas de Layout:** CSS Grid para estructuras bidimensionales; Flexbox para componentes y alineación unidimensional.
3. **No Flotantes:** Prohibido el uso de `float` o `position: absolute` para posicionamiento estructural de página.
4. **Tokens CSS:** Utilizar variables CSS (`:root`) para espaciados, colores primarios/secundarios y escala tipográfica.
5. **Accesibilidad (a11y):** Asegurar contraste mínimo WCAG AA, soporte `:focus-visible` y atributos `aria-*` en interactivos personalizados.
