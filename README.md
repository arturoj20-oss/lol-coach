# LoL Coach

Asistente personal para League of Legends (uso propio, cuenta Artiloked#EUW).

## Qué hace

| Momento | Funciones |
|---|---|
| Cola | Acepta la partida automáticamente (con retraso opcional) |
| Selección | Preselecciona, bloquea y banea; picks recomendados (meta + tu historial + counters + sinergias + daño del equipo, con motivos); baneos recomendados; build del campeón e importación de runas, hechizos (respetando tu tecla de Destello) y set de objetos |
| Carga | Scouting de los 10 jugadores: rango, maestría, rachas, OTP |
| Partida | Overlay: timers de objetivos con aviso previo, timers de tus campamentos de jungla encima del minimapa (leyendo el minimapa de la pantalla), buffs de Barón/Ancestral, diferencia de oro, CS/min, siguiente objeto, habilidad a subir |
| Después | Historial, gráficas de oro/XP/CS contra tu rival de línea, mapa de muertes, comparación con tu media, consejos y análisis con IA |

Solo usa APIs oficiales: la del cliente (LCU), la de partida en directo (Live Client Data), la de Riot
y los datos públicos de OP.GG y Data Dragon. No lee la memoria del juego ni muestra información oculta.

## Uso

- Descarga: el instalador está en [Releases](https://github.com/Artiloked/lol-coach/releases/latest). Cada uno pone sus propias claves (Riot y, si quiere, Anthropic) en Ajustes.
- Desarrollo: `npm start` (o doble clic en `Iniciar.bat`).
- Instalador local: `npm run dist` → `dist\LoL Coach Setup <versión>.exe` (no publica nada).
- El overlay necesita el juego en modo **sin bordes** o **ventana**.

## Actualizaciones

La app instalada se actualiza sola desde las Releases de este repositorio (`src/main/updater.js`).
Busca versión nueva al arrancar y cada 4 h y la descarga en segundo plano. La instala al cerrar la
app o, si el cliente de LoL lleva 10 min cerrado, en silencio. Nunca durante una selección o partida.

Para publicar una versión: sube `version` en `package.json`, haz commit y ejecuta `npm run release`
(necesita `gh auth login`).

## Claves y datos

Todo se guarda en `%APPDATA%\LoL Coach\`:

| Archivo | Para qué |
|---|---|
| `riot-key.txt` | Clave personal de Riot (perfil, historial, scouting) |
| `anthropic-key.txt` | Clave de Anthropic (opcional, coach con IA) |
| `config.json` | Ajustes. `objectiveTimes` permite corregir los tiempos de objetivos si Riot los cambia |
| `lp-history.json` | Historial de LP (la curva anterior se estima a partir de tus resultados) |
| `jungle-calibration.json` | Ajuste de la posición del minimapa y de la detección (opcional) |
| `jungle-ref-*.json` | Cómo se ve cada campamento vivo en tu minimapa (se crea solo al minuto 1:40) |
| `minimap-samples\` | Recortes del minimapa de las últimas 5 partidas, para calibrar (`jungleRecord` en config.json) |
| `cache\` | Data Dragon, OP.GG (12 h), partidas y timelines de Riot |
| `log.txt` | Registro para diagnosticar fallos |

Las claves también se pueden poner desde Ajustes en la app.

## Estructura

- `src/main/`: proceso principal. `companion.js` coordina; `lcu.js` (cliente), `champselect.js`
  (auto pick/ban), `draft.js` (picks y builds), `recommend.js` (baneos), `live.js` + `objectives.js`
  (partida), `scouting.js`, `profile.js` (perfil y análisis), `coach.js` (IA), `riot.js`, `opgg.js`, `ddragon.js`.
- `src/renderer/`: interfaz (ventana principal y overlay). Contrato con el proceso principal en `docs/ui-contract.md`.
