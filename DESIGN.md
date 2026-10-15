# Sistema de diseño — "Editorial Dossier"

**Idea rectriz:** una publicación impresa de tirada corta. Papel crema, tinta casi negra, un único acento verde tinta, tipografía con contraste alto entre display serif y mono técnica. Nada de gradientes de moda, glassmorphism ni sombras difusas: las sombras son sólidas y desplazadas, como una plancha mal registrada.

Restricciones que definen el estilo tanto como los colores:

- **Un solo archivo.** CSS y JS en línea, sin build, sin dependencias. Única petición externa: Google Fonts.
- **Sin framework CSS.** Todo son primitivas: grid, flex, `clamp()`, custom properties.
- **Sin modo oscuro.** El papel es el concepto. Un tema oscuro rompe la metáfora.
- **Accesible por defecto.** Contraste AA, `:focus-visible` visible, semántica real.

---

## 1. Tokens

Copiar tal cual en `:root`. Los tokens de severidad (`--medium`, `--minor`) solo hacen falta si hay estados/categorías; una landing normalmente usa solo `--accent` y `--critical`.

```css
:root {
	/* Superficies */
	--paper:      #f6f2ea;  /* fondo de página */
	--paper-2:    #efe9dd;  /* cabeceras de tarjeta, celdas, chips */
	--card:       #fffdf8;  /* interior de tarjeta, un punto más claro que --paper */

	/* Tinta */
	--ink:        #1b1812;  /* texto principal, bordes, reglas */
	--ink-soft:   #4f483c;  /* párrafos, texto secundario */
	--ink-faint:  #847a68;  /* microetiquetas, metadatos */

	/* Líneas */
	--line:        #d8d0bf; /* divisiones internas */
	--line-strong: #b9ae97; /* divisiones estructurales, punteados */

	/* Acento */
	--accent:      #0d5c46; /* verde tinta: enlaces, kickers, CTA */
	--accent-soft: #e3ede7; /* fondo de badge de acento */

	/* Semántica (opcional) */
	--critical:    #a82e1f;  --critical-bg: #f6e3df;
	--medium:      #9a6510;  --medium-bg:   #f5ead3;
	--minor:       #3d5a80;  --minor-bg:    #e2e9f1;

	/* Tipografía */
	--display: 'Fraunces', serif;
	--sans:    'IBM Plex Sans', sans-serif;
	--mono:    'IBM Plex Mono', monospace;
}
```

### Reglas de uso del color

- El acento es **escaso**. Kicker, `<em>` del h1, enlaces, un badge, el CTA. Si aparece en más de ~5 sitios por pantalla deja de leerse como acento.
- `--critical` no es solo "error": es el color del sello y del `:focus-visible`. Es el segundo acento, usado con más parquedad todavía.
- Nunca texto `--ink-faint` sobre `--paper-2` a menos de 11px sin comprobar contraste.
- Las tintas transparentes se escriben `rgb(27 24 18 / .1)` (el `--ink` en RGB), no `rgba()` ni `#000`. Da sombras cálidas en vez de grises.

### Fuentes

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,600;9..144,800;9..144,900&family=IBM+Plex+Sans:ital,wght@0,400;0,500;0,600;1,400&family=IBM+Plex+Mono:wght@400;500;600&display=swap" rel="stylesheet">
```

Reparto de papeles, sin excepciones:

| Familia | Papel | Pesos |
|---|---|---|
| Fraunces (`--display`) | h1–h3, lede, cifras grandes | 900 titulares, 800 sección, 600 `<em>`, 400 lede |
| IBM Plex Sans (`--sans`) | body, párrafos, listas | 400, 500, 600 |
| IBM Plex Mono (`--mono`) | microetiquetas, badges, código, metadatos, nav | 400, 500, 600 |

**La mono no es para código: es la voz del sistema.** Cualquier texto que "etiquete" en lugar de "hablar" va en mono, uppercase, 10–12px, `letter-spacing` .1–.22em. Este único hábito es el que produce el 60% del carácter.

---

## 2. Base

```css
* { box-sizing: border-box; margin: 0; padding: 0; }
html { scroll-behavior: smooth; }
body {
	min-width: 320px;
	font-family: var(--sans);
	line-height: 1.62;
	color: var(--ink);
	background-color: var(--paper);
	background-image:
		repeating-linear-gradient(0deg, transparent, transparent 3px, rgb(27 24 18 / .012) 3px, rgb(27 24 18 / .012) 4px),
		radial-gradient(circle at 85% -5%, rgb(13 92 70 / .08), transparent 42%);
}
::selection { color: var(--paper); background: var(--accent); }
a { color: inherit; }
button { font: inherit; }
:focus-visible { outline: 3px solid var(--critical); outline-offset: 3px; }

.sheet { width: min(100% - 56px, 1060px); margin: 0 auto; padding-bottom: 72px; }
```

El fondo son dos capas y ambas importan: rayado horizontal cada 4px al 1.2% de opacidad (textura de papel, invisible en consciente, presente en percepción) y un halo de acento fuera del ángulo superior derecho. `1060px` es el ancho de la caja; todo vive dentro de `.sheet`.

`line-height: 1.62` en body es alto a propósito — es densidad de lectura, no de app.

---

## 3. Componentes

### 3.1 Masthead

Cabecera de portada. Orden: kicker → h1 → sostén → banda de datos.

```css
.masthead { position: relative; padding: 42px 0 48px; border-bottom: 3px solid var(--ink); }

.kicker {
	display: flex; align-items: center; gap: 12px;
	font-family: var(--mono); font-size: 12px; font-weight: 600;
	letter-spacing: .22em; color: var(--accent); text-transform: uppercase;
}
.kicker::before { width: 36px; height: 2px; content: ''; background: var(--accent); }

h1 {
	max-width: 15ch; margin-top: 20px;
	font-family: var(--display); font-size: clamp(48px, 8vw, 86px);
	font-weight: 900; line-height: .94; letter-spacing: -.025em;
}
h1 em { font-weight: 600; color: var(--accent); }  /* + font-style: italic si se quiere */
```

Claves: `max-width: 15ch` fuerza 2–3 líneas (un h1 de una línea no funciona en este sistema); `line-height` bajo del 0.94; el `<em>` marca **una** palabra o sintagma, el que carga el significado ("tienen que *entregar*", "plan de corrección: *tema*").

La regla `border-bottom: 3px solid var(--ink)` es la firma estructural. Se repite en cabeceras de sección y en el colofón. 3px, tinta plena, nunca gris.

### 3.2 Sello (stamp)

Etiqueta rotada, superpuesta arriba a la derecha. Da el aire de "sellado a mano".

```css
.stamp {
	position: absolute; top: 126px; right: 4px;
	padding: 7px 13px;
	font-family: var(--mono); font-size: 11px; font-weight: 600;
	letter-spacing: .14em; text-transform: uppercase;
	color: var(--accent); background: var(--accent-soft);
	border: 2px solid var(--accent); border-radius: 4px;
	transform: rotate(3.5deg);
}
```

Variante de urgencia: cambiar las tres referencias a `--critical` / `--critical-bg`. En móvil pasa a `position: static; display: inline-block` — no se intenta conservar la superposición.

Contenido: `Catálogo · 001`, `Pre-merge · branch`, `Edición 2026`. Dos fragmentos separados por `·`, nunca una frase.

### 3.3 Banda de datos

Metadatos en fila, separados por filetes verticales.

```css
.masthead-meta { display: flex; flex-wrap: wrap; margin-top: 34px; border-top: 1px solid var(--line-strong); }
.masthead-meta div { padding: 12px 26px 4px 0; margin-right: 26px; border-right: 1px solid var(--line); }
.masthead-meta div:last-child { border-right: none; }
.masthead-meta dt { font-family: var(--mono); font-size: 10.5px; letter-spacing: .14em; text-transform: uppercase; color: var(--ink-faint); }
.masthead-meta dd { margin-top: 2px; font-size: 14.5px; font-weight: 600; }
```

En portfolio: Rol / Ubicación / Disponibilidad / Stack. En informe: Fecha / Rama / Alcance / Esfuerzo.

### 3.4 Cabecera de sección

```css
.section { padding-top: 82px; }
.section-head {
	display: grid; grid-template-columns: 150px 1fr; gap: 28px;
	align-items: baseline; padding-bottom: 14px;
	border-bottom: 3px solid var(--ink);
}
.section-label {
	font-family: var(--mono); font-size: 11px; font-weight: 600;
	letter-spacing: .15em; color: var(--accent); text-transform: uppercase;
}
.section h2 {
	font-family: var(--display); font-size: clamp(30px, 4vw, 42px);
	font-weight: 800; line-height: 1.05; letter-spacing: -.015em;
}
```

Columna izquierda fija de 150px con la etiqueta mono; a la derecha el h2. Colapsa a una columna por debajo de 760px.

Variante del informe (`.phase-head`): flex con numeral perfilado a la izquierda y una píldora a la derecha empujada con `margin-left: auto`.

### 3.5 Numeral perfilado

Cifra grande en contorno, sin relleno. Marca de orden en tarjetas y fases.

```css
.skill-index {
	font-family: var(--display); font-size: 42px; font-weight: 900; line-height: 1;
	color: transparent; -webkit-text-stroke: 1.3px var(--ink);
}
```

A 60px usar `-webkit-text-stroke: 1.6px`. Escalar el grosor con el tamaño o se rompe. Siempre `aria-hidden="true"`: es ornamento, el orden ya lo da el DOM.

### 3.6 Tarjeta

La unidad de contenido. Borde de tinta, sombra sólida desplazada, cabecera en `--paper-2`, pie punteado.

```css
.card {
	margin-top: 34px;
	overflow: hidden;
	background: var(--card);
	border: 1.5px solid var(--ink);
	border-radius: 14px;
	box-shadow: 6px 6px 0 rgb(27 24 18 / .1);
}
.card-head {
	display: grid; grid-template-columns: 78px 1fr auto; gap: 18px; align-items: center;
	padding: 20px 24px;
	background: var(--paper-2);
	border-bottom: 1px solid var(--line);
}
.card-body { display: grid; grid-template-columns: minmax(0, 1fr) minmax(330px, 1fr); }
.card-body > * { padding: 30px; }
.card-body > *:first-child { border-right: 1px solid var(--line); }
.card-foot {
	display: flex; gap: 12px; align-items: center;
	padding: 14px 24px;
	background: linear-gradient(180deg, transparent, rgb(13 92 70 / .035));
	border-top: 1px dashed var(--line-strong);
}
```

Detalles que no son negociables:

- **Sombra sólida**, sin blur: `6px 6px 0 rgb(27 24 18 / .1)` (5px en el informe). Una sombra difusa convierte esto en Bootstrap.
- **Jerarquía de tres superficies**: `--paper` (página) → `--card` (tarjeta, más claro) → `--paper-2` (cabecera, más oscuro). La cabecera es más oscura que el cuerpo, al revés de lo habitual.
- **Gramática de bordes por peso**: 3px sólido = estructura de página; 1.5px sólido = contorno de tarjeta; 1px sólido = división interna; 1px dashed = pie; 1px dotted = filas de lista.
- El `overflow: hidden` es lo que permite que cabecera y pie lleguen al borde redondeado.
- Pie con degradado de acento al 3.5%: casi invisible, y sin él la tarjeta se cae por abajo.

Colapsar `.card-body` a `1fr` en móvil y mover el `border-right` a `border-bottom`.

### 3.7 Microetiqueta con filete

Etiqueta mono cuya línea se extiende hasta el final del contenedor.

```css
.eyebrow {
	display: flex; align-items: center; gap: 9px; margin-bottom: 12px;
	font-family: var(--mono); font-size: 10.5px; font-weight: 600;
	letter-spacing: .16em; color: var(--accent); text-transform: uppercase;
}
.eyebrow::after { height: 1px; content: ''; background: var(--line); flex: 1; }
```

Encabeza cada bloque dentro de una tarjeta. Junto con `.kicker` (filete *antes*, fijo de 36px) forma el par: kicker abre, eyebrow subdivide.

### 3.8 Badges

Píldora mono. Un solo componente, variantes por color.

```css
.badge {
	padding: 4px 11px;
	font-family: var(--mono); font-size: 10px; font-weight: 600;
	letter-spacing: .1em; text-transform: uppercase;
	border-radius: 999px; white-space: nowrap;
	color: var(--accent); background: var(--accent-soft); border: 1px solid var(--accent);
}
.badge.critical { color: var(--critical); background: var(--critical-bg); border-color: var(--critical); }
.badge.medium   { color: var(--medium);   background: var(--medium-bg);   border-color: var(--medium); }
.badge.minor    { color: var(--minor);    background: var(--minor-bg);    border-color: var(--minor); }
```

Fórmula invariable: color de texto = color de borde, fondo = la variante `-bg`. Se añaden variantes nuevas siguiendo la fórmula, no inventando.

Píldora inversa (para "cuándo", "estado"): `color: var(--paper); background: var(--ink); border-radius: 999px; padding: 6px 12px;`.

Chip neutro (hechos, tags): sin fondo, `border: 1px solid var(--line-strong)`, `color: var(--ink-faint)`, `border-radius: 5px`.

### 3.9 Lista con flecha

```css
.outcomes { margin-top: 20px; list-style: none; }
.outcomes li {
	position: relative; padding: 8px 0 8px 22px;
	font-size: 13.5px; color: var(--ink-soft);
	border-top: 1px dotted var(--line-strong);
}
.outcomes li::before { position: absolute; left: 2px; color: var(--accent); content: '→'; }
```

Punteado entre filas, flecha de acento como bullet. Para listas de features, resultados, principios.

### 3.10 Lista de pasos numerada

Versión pesada: círculos numerados unidos por una línea vertical. Para procesos ordenados.

```css
ol.steps { list-style: none; counter-reset: step; }
ol.steps li { counter-increment: step; position: relative; padding: 0 0 12px 34px; font-size: 14px; color: var(--ink-soft); }
ol.steps li::before {
	content: counter(step); position: absolute; left: 0; top: 1px;
	display: grid; place-items: center;
	width: 22px; height: 22px;
	font-family: var(--mono); font-size: 11px; font-weight: 600;
	color: var(--ink); background: var(--paper);
	border: 1.5px solid var(--ink); border-radius: 50%;
}
ol.steps li:not(:last-child)::after {
	content: ''; position: absolute; left: 10.5px; top: 25px; bottom: 1px;
	width: 1.5px; background: var(--line-strong);
}
```

El `left: 10.5px` centra la línea bajo el círculo de 22px con borde de 1.5px. Recalcular si se cambia el diámetro.

### 3.11 Bloque de comando + copiar

Inversión de color: tinta plena sobre papel. Único sitio donde el fondo es oscuro.

```css
.command {
	display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 10px; align-items: center;
	padding: 10px 10px 10px 14px;
	background: var(--ink); border: 1px solid var(--ink); border-radius: 8px;
}
.command code {
	overflow-x: auto; padding: 4px 0;
	font-family: var(--mono); font-size: 12px; line-height: 1.5;
	color: var(--paper); white-space: nowrap; scrollbar-width: thin;
}
.copy-button {
	min-width: 78px; padding: 7px 10px;
	font-family: var(--mono); font-size: 10px; font-weight: 600; letter-spacing: .08em;
	color: var(--ink); text-transform: uppercase; cursor: pointer;
	background: var(--paper); border: 1px solid var(--paper); border-radius: 5px;
}
.copy-button:hover,
.copy-button[data-state='copied'] { color: var(--paper); background: var(--accent); border-color: var(--accent); }
```

`minmax(0, 1fr)` es obligatorio o el `overflow-x` del code no funciona dentro del grid. `min-width` en el botón evita que salte de ancho al cambiar "Copiar"→"Copiado". En móvil pasa a una columna con el botón al 100%.

Código inline en cuerpo de texto (contrario, claro sobre papel):

```css
code {
	padding: 1px 5px;
	font-family: var(--mono); font-size: 12.2px; color: var(--ink);
	background: var(--paper-2); border: 1px solid var(--line); border-radius: 4px;
	word-break: break-all;
}
```

### 3.12 Botón / enlace de acento

```css
.btn {
	display: inline-flex; align-items: center; gap: 8px;
	padding: 8px 12px;
	font-family: var(--mono); font-size: 11px; font-weight: 600; letter-spacing: .04em;
	color: var(--paper); text-decoration: none;
	background: var(--accent); border: 1.5px solid var(--accent); border-radius: 6px;
	box-shadow: 2px 2px 0 rgb(27 24 18 / .14);
}
.btn:hover { background: var(--ink); border-color: var(--ink); }
.btn-icon { width: 16px; height: 16px; flex: 0 0 auto; fill: currentColor; }
```

Misma lógica de sombra sólida que la tarjeta, a menor escala (2px). Hover = a tinta, no aclarar. Iconos SVG inline con `fill: currentColor` y `viewBox="0 0 24 24"`, path único, `aria-hidden="true"` — nada de librerías de iconos.

Enlace de texto con marca:

```css
.skill-link {
	display: inline-flex; align-items: center; gap: 8px;
	font-family: var(--mono); font-size: 11px; font-weight: 600; letter-spacing: .06em;
	color: var(--accent); text-transform: uppercase;
	text-decoration-thickness: 1px; text-underline-offset: 4px;
}
.skill-link::after { content: '↗'; }
```

`↗` para externo, `→` para interno. Siempre por `::after`, nunca en el HTML.

### 3.13 Tarjetas-cifra (tally)

```css
.tally { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; align-content: start; }
.tally .cell {
	position: relative; overflow: hidden;
	padding: 14px 14px 11px;
	background: var(--paper-2); border: 1.5px solid var(--ink); border-radius: 10px;
}
.tally .cell::after { position: absolute; inset: 0 0 auto; height: 5px; content: ''; }
.tally .cell.c::after { background: var(--critical); }
.tally .num { font-family: var(--display); font-size: 42px; font-weight: 900; line-height: 1; }
.tally .lbl { margin-top: 4px; font-family: var(--mono); font-size: 10px; letter-spacing: .12em; color: var(--ink-faint); text-transform: uppercase; }
```

Banda de color de 5px sangrada arriba vía `::after` + `overflow: hidden`. Sirve igual para KPIs de landing (clientes, años, proyectos).

### 3.14 Tabla

```css
.order-table { width: 100%; margin-top: 26px; border-collapse: collapse; font-size: 14px; }
.order-table th {
	padding: 10px 14px; text-align: left;
	font-family: var(--mono); font-size: 10.5px; letter-spacing: .14em; text-transform: uppercase; color: var(--ink-faint);
	border-bottom: 2px solid var(--ink);
}
.order-table td { padding: 11px 14px; border-bottom: 1px solid var(--line); vertical-align: top; }
.order-table tr:hover td { background: rgb(13 92 70 / .04); }
.order-table .mono { font-family: var(--mono); font-size: 12.5px; }
```

Sin bordes verticales, sin zebra. Solo filetes horizontales y hover de acento al 4%.

### 3.15 Callout

```css
.decision {
	margin-top: 12px; padding: 10px 14px;
	font-size: 13.5px; color: var(--ink-soft);
	background: var(--medium-bg); border-left: 3px solid var(--medium); border-radius: 0 8px 8px 0;
}
.decision b {
	display: block; margin-bottom: 3px;
	font-family: var(--mono); font-size: 11px; letter-spacing: .1em; text-transform: uppercase; color: var(--medium);
}
```

Radio asimétrico `0 8px 8px 0`: la barra izquierda queda a escuadra. Cambiar el par de color para nota/aviso/éxito.

### 3.16 Colofón

```css
.colophon {
	display: flex; justify-content: space-between; gap: 14px; flex-wrap: wrap;
	margin-top: 90px; padding-top: 22px;
	font-family: var(--mono); font-size: 10.5px; letter-spacing: .1em; color: var(--ink-faint); text-transform: uppercase;
	border-top: 3px solid var(--ink);
}
```

Cierra con la misma regla de 3px con la que abre el masthead. Izquierda: quién/licencia. Derecha: enlace o disclaimer.

---

## 4. Movimiento

Todo el movimiento va dentro de la media query. Cero animación es un estado válido de la página.

```css
@media (prefers-reduced-motion: no-preference) {
	.masthead, .section, .colophon { animation: rise .58s cubic-bezier(.2, .7, .2, 1) both; }
	.section { animation-delay: .1s; }
	#about { animation-delay: .18s; }
	.colophon { animation-delay: .24s; }
	.copy-button { transition: color .16s ease, background-color .16s ease, border-color .16s ease, transform .16s ease; }
	.copy-button:active { transform: translateY(1px); }
	@keyframes rise { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: none; } }
}
```

`rise` de 14px, escalonado 80ms por bloque, tope ~0.25s. Transiciones de 0.16s. No hay hover animado en tarjetas: no levitan, no escalan. Solo el botón se hunde 1px al pulsar.

---

## 5. Responsive

Dos cortes. No hay más.

```css
@media (max-width: 760px) {
	.sheet { width: min(100% - 32px, 1060px); }
	h1 { font-size: clamp(45px, 14vw, 68px); }
	.hero-bottom, .card-body, .section-head, .about-grid { grid-template-columns: 1fr; }
	.stamp { position: static; display: inline-block; margin-bottom: 22px; }
	.section { padding-top: 64px; }
	.card-body > *:first-child { border-right: 0; border-bottom: 1px solid var(--line); }
}

@media (max-width: 460px) {
	.topnav { flex-direction: column; gap: 5px; align-items: flex-end; }
	.card-head, .card-body > * { padding-left: 18px; padding-right: 18px; }
	.command { grid-template-columns: 1fr; }
	.copy-button { width: 100%; }
	.colophon { flex-direction: column; }
}
```

En 760: todo grid multicolumna → `1fr`; el sello deja de flotar; el gutter baja de 56px a 32px. En 460: nav vertical, padding de tarjeta a 18px, comando apilado.

Print (útil en informes):

```css
@media print {
	body { background: white; }
	.card { box-shadow: none; break-inside: avoid; }
	.stamp { transform: none; }
}
```

---

## 6. Accesibilidad

Parte del sistema, no un repaso posterior.

```css
.skip-link {
	position: fixed; top: 12px; left: 12px; z-index: 20;
	padding: 8px 12px;
	font-family: var(--mono); font-size: 12px;
	color: var(--paper); background: var(--ink);
	transform: translateY(-150%);
}
.skip-link:focus { transform: none; }

.sr-only {
	position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px;
	overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0;
}
```

Checklist:

- `:focus-visible` con `outline: 3px solid var(--critical)` global, nunca `outline: none`.
- Skip-link como primer nodo del `<body>`.
- `<section>` con `aria-labelledby` apuntando al id del h2.
- Ornamento (numerales perfilados, iconos, filetes) con `aria-hidden="true"`.
- Estado dinámico (copiado, errores) a un `.sr-only` con `role="status" aria-live="polite"`.
- Toggles con `aria-pressed`, no clases.
- El acento verde `#0d5c46` sobre `--paper` da ~7:1. Manteniendo las parejas de tokens, el contraste sale solo.

---

## 7. Adaptar a otros formatos

El sistema es un mapeo de piezas, no una plantilla. Para un formato nuevo, reasignar:

| Pieza | Landing producto | Portfolio | Informe |
|---|---|---|---|
| kicker | categoría · estado | rol · disponibilidad | proyecto · tipo · ref |
| h1 + `<em>` | propuesta de valor | nombre o titular | "Plan de X: *tema*" |
| stamp | "Beta · 2026" | "Abierto a trabajo" | urgencia (crítico) |
| banda de datos | precio / stack / licencia | rol / lugar / stack | fecha / rama / alcance |
| tally | métricas de producto | años / proyectos / clientes | conteo por severidad |
| tarjeta | feature o plan | caso de estudio | finding |
| numeral perfilado | orden de feature | orden de proyecto | nº de fase |
| badges | estado / plan | tipo de proyecto | severidad |
| `.command` | comando de install | — | — |
| tabla | comparativa de planes | timeline | orden de ejecución |
| colofón | licencia + repo | contacto | disclaimer |

Cambiar de acento: sustituir `--accent` y `--accent-soft`, **y** los tres `rgb(13 92 70 / …)` hardcodeados (halo del body, degradado del pie de tarjeta, hover de tabla). Elegir un tono oscuro y desaturado; un acento brillante rompe la metáfora del papel.

Lo que se puede tocar sin romper el sistema: acento, contenido, número de columnas, qué componentes se usan.

Lo que no: familias tipográficas y su reparto; sombras sólidas → difusas; pesos de borde; los tres tonos de superficie; mono uppercase para etiquetas; la regla de 3px que abre y cierra.

---

## 8. Patrones de implementación

Los dos archivos fuente son estáticos y de un solo archivo. Estos patrones vienen de ahí.

**i18n sin dependencias** (`index.html`). Diccionario `translations = { en: {...}, es: {...} }` y tres atributos: `data-i18n` (textContent), `data-i18n-html` (innerHTML, para `<em>`/`<code>` incrustados), `data-i18n-aria` (aria-label). `setLanguage()` recorre los tres selectores, actualiza `<html lang>`, `document.title`, la meta description y sincroniza `?lang=es` con `history.replaceState`. `data-i18n-html` solo con literales del diccionario, nunca con input externo.

**Contenido externo con fallback** (`about.json`). `fetch` con `cache: 'no-store'`, y ante cualquier fallo se cae a un objeto `fallbackProfile` en línea. Los valores pueden ser string o `{ en, es }`; un helper `localize()` resuelve. Las URLs se validan con `new URL()` + allowlist de protocolo (`http:`, `https:`, `mailto:`) antes de renderizar. Render con `replaceChildren()` + `createElement`, nunca `innerHTML` con datos cargados.

**Imagen con fallback a iniciales.** Foto y `<span>` de iniciales en la misma celda de grid (`.about-photo > * { grid-area: 1 / 1; }`), se alterna con `hidden` según `load`/`error`, comprobando además `img.complete && naturalWidth > 0` por si carga de caché antes de registrar el listener.

**Copiar al portapapeles.** `navigator.clipboard` si `window.isSecureContext`, si no textarea oculto + `execCommand('copy')`. Feedback por `data-state` en el botón + anuncio en el live region, reset a los 2s.

**Plantilla + renderer** (`templates/*.html` + `scripts/render.mjs` en las skills). El agente escribe JSON validado por un JSON Schema y un renderer determinista lo convierte en HTML sobre una plantilla con marcadores `@@SLOT@@`; el agente nunca toca el HTML. Conteos, índices y totales se calculan, y un `finalize` comprueba la página en Chrome headless antes de publicarla. Es preferible a la plantilla con comentarios `<!-- SLOT -->` que el agente rellena a mano: el diseño no se degrada entre documentos.
