# LoL Coach — decisiones de diseño de la interfaz

Objetivo: una app **sencilla de leer**, con el aspecto plano y oscuro de Blitz y la identidad de
LoL (oro y turquesa hextech, Cinzel en los títulos grandes). Sin frameworks ni dependencias.

- **Tema oscuro tipo Blitz por defecto** (`config.theme: 'dark'`): gris pizarra azulado, plano,
  tarjetas que se distinguen por el tono del fondo, radio de 6-8 px y borde de 1 px muy sutil.
- **Tema claro opcional** (Ajustes > General > Tema: Oscuro / Claro / Sistema). `Sistema` sigue el
  modo de Windows (`prefers-color-scheme`, y `nativeTheme` en el proceso principal para el fondo
  inicial de la ventana).
- El tema se aplica con `<html data-theme="dark|light">` (`Theme.set()` en `ui.js`). Los tokens
  del oscuro están en `:root`; el claro los redefine bajo `:root[data-theme="light"]`.

## Reglas de legibilidad (obligatorias para todas las vistas)

1. **Texto de cuerpo de 14-15 px** (`body` = 14,5 px). Nada por debajo de 12 px, salvo los ejes de
   las gráficas.
2. **Contraste AA**: el texto va en `--text`, `--text-hi` o `--text-muted` sobre `--surface*`.
   `--text-muted` solo para textos cortos (unidades, fechas, etiquetas); nunca para párrafos.
   Nada de texto gris tenue sobre gris.
3. **Como mucho 3 tamaños por pantalla**: 13 px (secundario), 14,5-16 px (cuerpo y título de
   tarjeta) y 20-24 px (el dato importante o el título grande).
4. **Jerarquía**: el dato importante grande y en `--text-hi`; lo secundario pequeño y en
   `--text-muted` debajo o al lado.
5. **Menos información a la vez**: agrupa y pliega lo secundario (`.xp` desplegable, tooltips con
   `data-tip`). Si una fila necesita más de dos líneas de detalle, que se despliegue.
6. **Etiquetas y cifras cortas y en lenguaje llano** («Participación», no «KP%»); números con
   `fmt` (`es-ES`) y `.num` (cifras tabulares) para que se alineen; columnas numéricas a la derecha.
7. **Nada de MAYÚSCULAS con espaciado en textos**: Cinzel solo en `.title` (títulos de vista y el
   resultado de una partida). Títulos de tarjeta, pestañas, botones, segmentados y etiquetas van
   en Source Sans 3, en minúsculas normales.
8. **Espaciado generoso y constante**: 16 px entre tarjetas, 16-18 px de relleno en la tarjeta,
   12-14 px entre bloques dentro de una tarjeta.
9. **Color con significado**: turquesa = activo/selección/victoria, rojo = derrota/malo, ámbar =
   aviso, oro = detalle de marca (subrayado de la pestaña activa, LP). Nunca solo el color: va
   acompañado de texto o signo (+/−).
10. **Sin colores fijos** en las vistas: siempre tokens. Excepciones admitidas: iconos con color
    propio (objetivos, fragmentos de runa) y marcas sobre imágenes (mapa de muertes).

## Interacción

- **Transiciones** de 120-180 ms (`--dur-fast`, `--dur`, curva `--ease`) en hover, foco y cambios
  de estado. Al pulsar, los botones se encogen un poco (`scale(.97)`).
- **Foco visible solo con teclado** (`:focus-visible`, anillo de 2 px en `--focus`). Las pestañas
  siguen el patrón *tablist* (flechas, Inicio/Fin) y `Ctrl+1..6`.
- **Pestañas** con subrayado dorado que se desliza (`.tab-ind`, lo mueve `App.moveTabInd`).
- **Segmentados** (`.seg`) con la opción activa rellena; el relleno se desliza (`.seg-ind`). Lo
  hace `Seg` en `ui.js` solo, con un `MutationObserver`, incluso si la vista repinta el control.
- **Desplegables** (`.xp`): clic en la cabecera y la altura se anima; el estado se recuerda por
  clave entre repintados (`xpOpen(k)`).
- **Tooltips** con 220 ms de retraso (inmediatos si ya hay uno abierto o con el teclado).
- **Esqueletos** de carga (`.skel`, `skeletonRows()`), spinner para esperas largas.
- **Movimiento reducido**: con `prefers-reduced-motion` se anulan animaciones y transiciones.
- Cambio de tema con fundido de color de 220 ms (`.theme-anim`).

## Tokens (`src/renderer/theme.css`)

Usa siempre los **semánticos**. Los heredados se mantienen para no romper código antiguo y ya
tienen valores correctos en los dos temas.

### Semánticos

| Token | Oscuro | Uso |
|---|---|---|
| `--bg` | `#15181E` | Fondo de la ventana (`--bg-image` = capa opcional, `none`) |
| `--surface` | `#1E222A` | Tarjetas |
| `--surface-2` | `#252A33` | Bloques y filas dentro de una tarjeta, fondo de segmentados |
| `--surface-3` | `#2D333D` | Hover de filas y botones |
| `--surface-sunken` | `#171A20` | Campos de texto |
| `--topbar` | `#111419` | Barra superior |
| `--seg-on` | `#3A414D` | Opción activa de un segmentado |
| `--border` / `--border-strong` | `#2B3039` / `#3B424E` | Borde sutil / borde de controles |
| `--text` | `#D5D9E0` | Texto de cuerpo |
| `--text-hi` | `#F2F3F5` | Datos importantes y títulos |
| `--text-muted` | `#A0A7B3` | Secundario corto (unidades, fechas, etiquetas) |
| `--text-gold` | `#D9C08A` | Texto dorado puntual |
| `--accent` / `--accent-text` / `--accent-soft` | oro `#C9A55E` | Subrayados, detalles de marca, LP / texto dorado legible / fondo tenue |
| `--accent-2` / `--accent-2-text` / `--accent-2-soft` | turquesa `#1FC7B6` | Activo, seleccionado, "on" / texto turquesa / fondo tenue |
| `--on-accent-2` | `#06201D` | Texto sobre relleno turquesa |
| `--primary-bg` / `--primary-bg-hover` / `--primary-fg` / `--primary-border` | | Botón principal (`.btn-primary`) |
| `--win` / `--loss` / `--warn` / `--ok` | `#2BCFA4` / `#F25A6E` / `#F0AA4A` / `#3FCF7E` | Estados (texto, barras, trazos) |
| `--win-soft` / `--loss-soft` / `--warn-soft` / `--ok-soft` | | Fondos tenues de esos estados |
| `--loss-text` / `--ok-text` / `--warn-text` | | Texto de esos estados sobre su fondo tenue (pastillas) |
| `--tip-bg` / `--tip-fg` / `--tip-title` / `--tip-border` | | Tooltip |
| `--chart-grid` / `--chart-fill` | | Rejilla y relleno de gráficas |
| `--radius-sm` / `--radius` / `--radius-lg` | 6 / 8 / 12 px | Controles / tarjetas / paneles grandes |
| `--shadow-sm` / `--shadow` / `--shadow-lg` | | Sombras (en oscuro casi no se usan; tooltips y toasts: `-lg`) |
| `--focus` | | Anillo de foco |
| `--ease`, `--dur-fast` (120 ms), `--dur` (180 ms) | | Movimiento |
| `--font-title` (Cinzel), `--font-body` (Source Sans 3) | | Tipografías |

### Heredados (mismos nombres; valores adaptados)

| Token | Oscuro | Claro | Significado |
|---|---|---|---|
| `--gold-1` | `#F2F3F5` | `#14171D` | Texto destacado (= `--text-hi`) |
| `--gold-2` | `#D5D9E0` | `#2E343E` | Texto normal (= `--text`) |
| `--gold-3` / `--gold-4` | `#C9A55E` / `#B8924A` | `#8F6A2A` / `#A88038` | Acento dorado |
| `--gold-5` | `#3B424E` | `#CFC6B2` | Borde apagado (neutro) |
| `--gold-6` / `--gold-7` | `#2D333D` / `#252A33` | `#E6DFCF` / `#F2EEE5` | Rellenos suaves |
| `--blue-1` | `#BDF3EC` | `#0B4F4A` | Texto sobre fondo turquesa |
| `--blue-2` / `--blue-3` / `--blue-4` | turquesas | turquesas oscuros | Acción |
| `--blue-5` | `#18393D` | `#DCF1EE` | Fondo turquesa apagado |
| `--blue-6` / `--blue-7` / `--black` | superficies oscuras | blanco / crema | Fondos |
| `--grey-1` / `--grey-2` | `#B3B9C3` / `#6E7684` | `#4B515C` / `#8F939B` | Texto secundario / desactivado |
| `--grey-3` / `--grey-4` / `--grey-5` | | | Bordes / rellenos |
| `--panel`, `--border-gold`, `--border-gold-hi` | planos | planos | Fondo y borde de panel (ya sin degradado real) |
| `--glow-gold`, `--glow-blue` | | | Anillo de 3 px (hover/foco) |

## Componentes y clases (`theme.css`, `app.css`)

- **`.card`** plana con `--surface`, borde `--border` y `--radius`. `.card.interactive`: tarjeta
  clicable (cambia de tono y se eleva). Las escuadras doradas antiguas ya no se pintan; `.flat`
  se mantiene.
- **`.card-head`** con `h2` (16 px, Source Sans, negrita), `.sub` y `.spacer`.
- **Botones**: `.btn` (neutro), `.btn-primary` (turquesa relleno), `.btn.small`, `.btn.ghost`
  (sin borde, acciones secundarias), `.icon-btn`.
- **Controles**: `.input`, `.select`, `.check` (casilla turquesa), `.switch` (píldora),
  `.range`, `.seg` (+ `.seg-sm` compacto), `.search` (campo con lupa: `SVG.search` + `.input`).
- **`.tag`**: píldora neutra; `.gold`, `.blue`, `.red`, `.green`, `.warn`. `button.tag` = filtro.
- **`.label`**: etiqueta corta de 13 px en `--text-muted` encima de un dato o campo.
- **`.notice`** (`.warn`, `.error`): aviso con barra de color a la izquierda.
- **`.xp` / `.xp-head` / `.xp-body` / `.xp-chev`**: bloque desplegable.
- **Estados**: `emptyState`, `loadingState`, `skeletonRows`, `.skel`, `.spinner`.
- **`kbd`**: atajo de teclado.
- **`.title`**: único sitio con Cinzel (títulos de vista).

## Helpers de JS nuevos (`ui.js`, `util.js`)

- `Theme.set(pref)`: aplica `'dark'|'light'|'system'`. `Theme.current()` da el tema efectivo.
- `Seg`: indicador deslizante automático de los `.seg`. `Seg.syncAll(root)` recoloca a mano
  (lo llama `App.go` al mostrar una vista).
- `Expand`, `xpOpen(key)`, `xpExpanded(key)`: desplegables que recuerdan si estaban abiertos.
  Marcado: `<div class="xp ${xpOpen(k)}"><button class="xp-head" data-expand="${k}"
  aria-expanded="${xpExpanded(k)}">… <span class="xp-chev">${raw(SVG.chevron)}</span></button>
  <div class="xp-body"><div>…</div></div></div>`.
- `skeletonRows(n, icon = true)`: filas de esqueleto mientras carga una lista.
- `SVG.chevron`, `SVG.search`, `SVG.sort`, `SVG.sun`, `SVG.moon`, `SVG.monitor`, `SVG.arrow`.
  `SVG.logo` toma los colores de `.logo-a/b/c` (sigue el tema).
- Gráficas: el relleno usa `.fill-stop` y el mapa de muertes `.dm-bg/.dm-map/.dm-frame`, todo con
  tokens.

## Tipografía (`src/renderer/fonts/`, OFL, sin CDN)

- **Source Sans 3** (400/600/700) para toda la interfaz y los datos, con cifras tabulares (`.num`).
- **Cinzel** (600/700), sustituto libre de *Beaufort for LoL*, solo en `.title` y la marca.

## Overlay (`overlay.html/.css/.js`)

No usa `theme.css` ni el tema: tiene sus propias variables. Panel HUD compacto de 176 px
(escalable 0,8–1,4) bajo el marcador; avisos de 90 s antes de los objetivos; flecha de habilidad;
con Tab, franja de oro por línea encima del marcador. Necesita el juego en «Sin bordes» o
«Ventana».

## Restricciones técnicas que condicionan el diseño

- CSP `style-src 'self'`: no hay atributos `style` en el HTML; los valores dinámicos van en
  `data-vars="--w:40%"` y `hydrate()` los aplica vía CSSOM (los indicadores animados también
  usan `style.setProperty`).
- Sin `onerror` en línea: los fallos de imagen se capturan con un listener global.
- Números siempre con `Intl.NumberFormat('es-ES')` (`fmt` en `util.js`).
