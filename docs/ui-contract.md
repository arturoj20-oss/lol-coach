# LoL Coach — contrato entre el proceso principal y la interfaz

La interfaz (todo lo que hay en `src/renderer/`) solo habla con el proceso principal a traves de
`window.api`, que expone `src/main/preload.js`. Si `window.api` no existe (abriendo el HTML en un
navegador), la interfaz carga `mock-api.js`, que implementa este mismo contrato con datos de ejemplo.

Idioma de la interfaz: espanol (de Espana). Todos los textos que vienen del proceso principal
(`reasons`, `tips`, `status.text`...) ya vienen en espanol.

## Ventanas

| Ventana | Archivo | Descripcion |
|---|---|---|
| Principal | `src/renderer/index.html` | 1280x720 (minimo 1024x640), **sin marco**: la interfaz dibuja su propia barra de titulo. La zona de arrastre usa `-webkit-app-region: drag`; los botones dentro de ella `no-drag`. |
| Overlay | `src/renderer/overlay.html` | Ventana transparente a pantalla completa encima del juego. **No recibe clics** (todo es informativo). Fondo `transparent`. Solo se ve durante la partida. |

## Recursos graficos (Data Dragon / CommunityDragon)

`v` = `champions.version` (version de Data Dragon).

| Recurso | URL |
|---|---|
| Icono de campeon | `https://ddragon.leagueoflegends.com/cdn/${v}/img/champion/${key}.png` (`key` de `champions.all`) |
| Objeto | `https://ddragon.leagueoflegends.com/cdn/${v}/img/item/${itemId}.png` |
| Hechizo de invocador | `https://ddragon.leagueoflegends.com/cdn/${v}/img/spell/${spellKey}.png` (`spellKey` de `champions.spells[id].key`) |
| Runa | `https://ddragon.leagueoflegends.com/cdn/img/${icon}` (`icon` de `champions.runes[id].icon`) |
| Icono de perfil | `https://ddragon.leagueoflegends.com/cdn/${v}/img/profileicon/${id}.png` |
| Mapa (Grieta) | `https://ddragon.leagueoflegends.com/cdn/${v}/img/map/map11.png` (coordenadas del juego 0..14870 en x e y, y crece hacia arriba) |
| Emblema de rango | `https://raw.communitydragon.org/latest/plugins/rcp-fe-lol-static-assets/global/default/images/ranked-emblem/emblem-${tier.toLowerCase()}.png` |

La CSP del HTML debe permitir imagenes de esos dos dominios y nada mas externo
(`img-src 'self' data: https://ddragon.leagueoflegends.com https://raw.communitydragon.org`).
Las fuentes se incluyen en local (`src/renderer/fonts/`), sin CDN.

## `window.api`

```js
window.api.init()                 // Promise<Snapshot> con el estado inicial completo
window.api.on(channel, fn)        // suscribirse a cambios; fn(data) recibe el objeto completo del canal
window.api.setConfig(patch)       // cambia la configuracion (parcial); responde por el canal 'config'
window.api.setSecret(name, value) // name: 'riot' | 'anthropic'; Promise<{ ok, error? }> (valida la clave)
window.api.action(name, args)     // Promise<any>, ver "Acciones"
window.api.window(cmd)            // 'minimize' | 'close' (cerrar = esconder en la bandeja)
```

`Snapshot` = `{ config, state, champions, recs, draft, scouting, live, profile, postgame }`
(cada clave con la misma forma que su canal). Los canales son esos mismos nombres, mas `tab`
(solo el overlay): `true`/`false` mientras el jugador mantiene Tab en el juego. El proceso principal
lo lee con GetAsyncKeyState de user32 (via `koffi`) cada 50 ms sin capturar la tecla, y solo con el
overlay visible y `overlay.goldDiff` activo.

**Overlay:** HUD lateral compacto (objetivos y una fila con CS/min, siguiente objeto y habilidad),
avisos, franja de oro por linea centrada encima del marcador del juego **solo con Tab pulsado**
(`live.lanes`, desplazable con `overlay.tabOffsetY`) y timers de campamento como numero flotante sin
fondo encima de cada campamento del minimapa. Necesita el juego en «Sin bordes» o «Ventana» (en
pantalla completa Windows no deja dibujar encima); mientras se ve, el proceso principal lo vuelve a
poner encima cada 2 s sin quitar el foco al juego.

### Acciones (`window.api.action`)

| Nombre | args | Devuelve / efecto |
|---|---|---|
| `refreshProfile` | — | Recarga perfil e historial (llega por `profile`) |
| `getMatch` | `{ matchId }` | `Promise<MatchAnalysis>` (ver abajo) |
| `askCoach` | `{ matchId }` | `Promise<{ text }>` analisis de IA de esa partida (markdown sencillo). Error si la IA no esta lista (`state.ai.ready`) |
| `askDraftCoach` | — | `Promise<{ text }>` consejo de baneo, pick y plan con la seleccion actual (markdown sencillo). Error fuera de la seleccion o sin IA |
| `patchNotes` | `{ refresh?: boolean }` | `Promise<PatchNotes>` notas del ultimo parche estructuradas sin IA, con veredicto por entrada y tus campeones afectados (ver abajo). `refresh` vuelve a descargarlas |
| `invitation` | `{ id, accept: boolean }` | Acepta o rechaza una invitación a sala (`state.lobby.invitations`) |
| `searchQueue` | `{ start: boolean }` | Empieza (si eres líder de la sala) o cancela la búsqueda de partida |
| `createLobby` | `{ queueId }` | Crea la sala de esa cola (de `state.lobby.queues`) o cambia la cola de tu sala si eres líder |
| `setPositions` | `{ first, second }` | Posiciones de la sala: `TOP` `JUNGLE` `MIDDLE` `BOTTOM` `UTILITY` `FILL` `UNSELECTED` (con `FILL` no hay secundaria) |
| `lockChampion` | `{ championId }` | Marca y bloquea ese campeón en tu turno de pick; error si no es tu turno o el cliente no lo bloquea |
| `chooseBuild` | `{ index }` | Elige cualquier build de la lista unificada `draft.build.options` (OP.GG y U.GG; `draft.choice`). Aplica sus runas, objetos, hechizos, inicial y habilidades; si ya está bloqueado, reimporta runas y objetos |
| `championStats` | `{ championId, role, vs? }` | `Promise<ChampionStats>` estadísticas de cualquier campeón en una línea (OP.GG, funciona sin cliente). `role` vacío = su línea principal. `vs` = rival elegido a mano para comprobar el enfrentamiento (si no, el más jugado de la línea); la respuesta trae `vs`, `vsManual` y `matchup: { vs, winRate, games, source: 'U.GG'\|'OP.GG'\|null }`. Ver «Explorador de campeón» |
| `hoverChampion` | `{ championId }` | Marca ese campeon en la seleccion (sin bloquear) |
| `importBuild` | — | Importa runas/hechizos/objetos del campeon actual; el resultado llega por `draft.imported` |
| `testOverlay` | — | Muestra el overlay 10 s con datos de ejemplo para colocarlo |

## Canales

### `config`
```js
{
  autoAccept: true, acceptDelay: 0,                      // 0..10 s
  pick: { id, name } | null, autoLock: false,
  ban: { id, name } | null,
  role: '',                                              // '' auto | top | jungle | mid | adc | support
  startWithWindows: false,
  autoImport: { runes: true, spells: true, items: true },// al bloquear campeon
  otpBuilds: true,  // builds OTP (state.otp: { running, otps, champions, games, scanned, total }; opciones con source 'otp' y otp: { players, games, share })
  overlay: {
    enabled: true,
    objectives: true, goldDiff: true, nextItem: true, skillOrder: true, cs: true,
    notifyBefore: 60,                                    // s de aviso antes de que salga un objetivo (0 = sin aviso)
    sound: true,
    side: 'right',                                       // 'left' | 'right'
    scale: 1,                                            // 0.8..1.4
    tabOffsetY: 0,                                       // px (-600..600) para subir/bajar el panel de oro de Tab; opcional (0 si falta)
  },
  csTarget: 7,                                           // CS/min objetivo manual (respaldo)
  csAuto: true,                                          // objetivo automatico por campeon y posicion (U.GG); live.cs.auto = { perMin, csPerGame, minutes, role, championId } | null
  ai: 'local',                                           // coach con IA: 'local' (Claude Code del equipo) | 'api' (clave de Anthropic)
  theme: 'dark',                                         // tema de la ventana: 'dark' (por defecto) | 'light' | 'system' (sigue a Windows)
}
```

### `state`
```js
{
  connected: true,                    // cliente de LoL abierto
  phase: 'ChampSelect',               // None | Lobby | Matchmaking | ReadyCheck | ChampSelect | InProgress | EndOfGame ...
  status: { text: 'Seleccion de campeones\nShaco preseleccionado', color: 'gray'|'blue'|'green'|'red' },
  acceptedCount: 3,
  summoner: { gameName: 'Artiloked', tagLine: 'EUW', profileIconId: 4568, level: 412 } | null,
  keys: { riot: true, anthropic: false },
  ai: { mode: 'local', local: true, api: false, ready: true },
  lobby: {                            // solo en None/Lobby/Matchmaking; null en selección o partida
    invitations: [{ id, from: 'Nombre#TAG', queue: 'Clasificatoria Flexible' }],
    canSearch: true, queue: 'Clasificatoria Solo/Dúo' | null,   // en la sala: eres líder y se puede buscar
    searching: { time: 83, estimated: 140 } | null,             // buscando partida (s)
    queues: [{ id: 420, name, group: 'Clasificatorias'|'Normales y modos'|'Contra la IA' }],  // en None/Lobby: colas disponibles
    queueId: 420 | null, isLeader: true, members: 2,            // en la sala
    positions: { first: 'JUNGLE', second: 'MIDDLE' } | null,     // en la sala, si la cola tiene posiciones
  } | null,  // via elegida, si Claude Code esta instalado, si hay clave y si se puede usar
}
```

### `champions`
```js
{
  version: '15.21.1',
  all: [{ id: 35, name: 'Shaco', key: 'Shaco' }, ...],   // ordenados por nombre
  owned: [35, 102, ...],                                   // ids que puedes elegir
  spells: { 4: { key: 'SummonerFlash', name: 'Destello' }, ... },
  runes:  { 8112: { name: 'Electrocutar', icon: 'perk-images/Styles/...png', style: 8100, slot: 0 }, ... },  // incluye estilos (8000...); style/slot: arbol y fila (la vista Seleccion pinta el arbol completo con ellos)
  items:  { 3158: { name: 'Botas jonias de la lucidez', gold: 900 }, ... },
}
```

### `recs` (baneos recomendados)
```js
{
  global: { title: 'Global (jungla, % de derrotas, OP.GG):', items: [{ id, name, text: '58%', tip }], empty: 'Texto si no hay items' },
  mine:   { title: 'Para ti (derrotas/partidas, 24 partidas con el):', items: [...], empty: '...' },
}
```

### Explorador de campeón (`championStats`, src/main/champstats.js)
```js
ChampionStats = {
  championId: 35, role: 'jungle',                         // linea resuelta (la principal si se pidio '')
  stats: { winRate: 0.5, pickRate: 0.06, banRate: 0.17, tier: 2, rank: 76 },
  damageType: 'AD' | 'AP' | 'BOTH' | null,
  counters: { strong: [{ championId, winRate, games }],   // gana a (winRate = el tuyo contra el)
              weak:   [{ championId, winRate, games }] }, // sufre contra
  synergies: { top: [{ championId, winRate, games }], jungle: [...], mid: [...], adc: [...], support: [...] },  // sin su propia linea
  build: { ...mismo formato que draft.build },             // la mas jugada (analisis general de OP.GG)
  options: [BuildOption],                                  // lista unificada OP.GG + U.GG (ver «Builds completas»)
  vs: 64 | null,                                           // rival mas jugado de la linea (base de las de OP.GG)
  ugg: { patch, games, winRate, keystones, options, spells, starter, skillOrder, skillPriority } | null,  // datos sueltos de U.GG
}
```
En la vista Selección: fuera de la selección ocupa el centro; dentro, conmutador «Mi selección / Explorar campeón».
El visor tiene cabecera fija (campeón, línea, tier, victorias/selección/baneos) y pestañas Build, Objetos por
situación, Counters y Sinergias (la elegida se guarda en `localStorage` como `lolcoach.expTab`). No hay pestaña
aparte de U.GG: sus builds salen en la misma lista que las de OP.GG, con su etiqueta de fuente. Clic en un counter o
una sinergia = explorar ese campeón en esa línea.

### `draft` (seleccion de campeones)
```js
{
  active: true,
  role: 'jungle',                                  // rol usado para recomendar
  myChampionId: 35 | null,                         // marcado o bloqueado
  locked: false,
  turn: 'ban' | 'pick' | null,                     // accion tuya en curso
  phase: 'baneos y picks',                         // fase del temporizador de la seleccion, en espanol ('' si no se sabe)
  allies:  [{ cellId, championId, position, isMe }], // sin nombres (Riot los oculta en clasificatoria)
  enemies: [{ cellId, championId }],
  bans: { ally: [ids], enemy: [ids] },
  picks: [{                                         // ordenados por score desc (hasta 8)
    championId, score: 7.4,                         // puntos sobre la media (puede ser negativo)
    metaTier: 2, metaWinRate: 0.51,
    personal: { games: 24, winRate: 0.58 } | null,
    tags: ['Counter', 'Tu pool', 'Meta'],           // etiquetas cortas
    reasons: ['Gana a Vi en jungla (58% en OP.GG)', 'Llevas 58% en 24 partidas', ...],
  }],
  build: {
    championId, role, games: 12000, winRate: 0.52,
    runes: { primaryStyle: 8100, subStyle: 8000, perks: [9923, 8143, 8140, 8105, 8014, 9104, 5005, 5008, 5001] },
    spells: [11, 4],
    skillOrder: ['W','Q','E','E','E','R', ...],    // 15-18 niveles
    skillPriority: ['E','Q','W'],
    starter: [1102, 2003], core: [2503, 6653, 4005], boots: [3158], situational: [3036, 3031, 3137],
  } | null,
  imported: { runes: 'ok'|'error'|null, spells: ..., items: ..., message: 'Runas importadas' },
  loading: false, error: null,
}
```

### `scouting` (pantalla de carga, necesita clave de Riot)
```js
{
  active: true, loading: false, error: null,
  players: [{
    team: 'ally' | 'enemy', isMe: false,
    riotId: 'Nombre#TAG', championId: 64, spells: [4, 11],
    rank: { tier: 'EMERALD', division: 'II', lp: 93, wins: 310, losses: 297 } | null,   // Solo/Duo
    hotStreak: true,
    mastery: { level: 32, points: 412000 } | null,     // con ese campeon
    tags: ['OTP', 'En racha'],                          // etiquetas cortas
  }],                                                    // 10 jugadores, primero tu equipo
}
```

### `live` (en partida; lo usan la vista "Partida" y el overlay)
```js
{
  active: true,
  gameTime: 754.2,                                   // s
  myChampionId: 35,
  objectives: [{
    key: 'dragon' | 'grubs' | 'herald' | 'atakhan' | 'baron' | 'elder' | 'inhib_top' ...,
    label: 'Dragon', detail: 'Infernal' | null,
    state: 'pending' | 'alive' | 'respawning' | 'gone',
    spawnAt: 900 | null,                              // gameTime en que sale (pending/respawning)
    team: 'ally' | 'enemy' | null,                    // quien lo mato por ultima vez
  }],
  buffs: [{ key: 'baron', label: 'Baron', team: 'ally', endsAt: 1450 }],
  gold: { ally: 24300, enemy: 22100, diff: 2200 },  // valor de objetos
  lanes: [{                                          // oro de cada linea contra su rival (valor de objetos)
    position: 'TOP' | 'JUNGLE' | 'MIDDLE' | 'BOTTOM' | 'UTILITY' | '',   // '' si la API no da posiciones (se empareja por orden)
    isMe: false,
    ally: { championId: 86, gold: 5300 }, enemy: { championId: 122, gold: 4650 },
    diff: 650,
  }],
  cs: { total: 98, perMin: 7.8, target: 7 },
  nextItem: { id: 6653, name: 'Tormento de Liandry' } | null,
  skillToLevel: 'E' | null,                          // si tienes un punto de habilidad sin gastar
  camps: {                                           // campamentos de tu lado leidos del minimapa (null si no se lee)
    status: 'Calibrando los campamentos' | null,
    minimap: { x, y, size },                         // px CSS de la pantalla principal
    list: [{ key: 'blue', label: 'Azul', buff: true, state: 'pending'|'alive'|'respawning', spawnAt: 905 | null, x: 2288, y: 1242 }],
  } | null,                                          // el overlay dibuja el timer encima de (x, y)
  events: [{ time: 720, text: 'Tu equipo ha matado al Dragon Infernal' }],   // los ultimos 6
  notify: { id: 17, text: 'Baron en 60 s', kind: 'objective' } | null,       // aviso nuevo (el overlay lo muestra unos segundos)
}
```

### `profile` (necesita clave de Riot)
```js
{
  loading: false, error: null, updatedAt: 1761400000000,
  summoner: { gameName, tagLine, level, profileIconId },
  ranked: [{ queue: 'RANKED_SOLO_5x5' | 'RANKED_FLEX_SR', tier: 'EMERALD', division: 'II', lp: 93, wins: 310, losses: 297, hotStreak: false }],
  lpHistory: [{ t: 1761400000000, queue: 'RANKED_SOLO_5x5', value: 2193, label: 'EMERALD II 93 LP' }],  // value: puntos absolutos para graficar
  recent: { games: 20, wins: 11, kda: 3.1, csPerMin: 6.8, visionPerMin: 1.1, killParticipation: 0.56 },
  champions: [{ championId, games, wins, kda, csPerMin }],   // ultimas 20 partidas
  roles: [{ role: 'jungle', games: 14, wins: 8 }],
  matches: [MatchSummary],                                    // ultimas 20, mas reciente primero
}
```

`MatchSummary`:
```js
{ matchId: 'EUW1_8025583944', queue: 'Clasificatoria Solo/Duo', championId: 35, role: 'jungle', win: true,
  kills: 8, deaths: 3, assists: 11, cs: 182, csPerMin: 6.1, durationSec: 1790, endedAt: 1761400000000,
  items: [7 ids, 0 = hueco], spells: [11, 4], keystone: 9923, subStyle: 8000,
  visionScore: 31, killParticipation: 0.61, damage: 21400, remake: false }
```

### `postgame` (ultima partida terminada; tambien es la forma de `getMatch`)
`MatchAnalysis`:
```js
{
  matchId, summary: MatchSummary,
  opponent: { championId, riotId } | null,               // rival de linea
  timeline: { minutes: [0,1,2,...], goldDiff: [...], xpDiff: [...], csDiff: [...] },   // tu - rival de linea
  at10: { cs, goldDiff, xpDiff }, at15: { cs, goldDiff, xpDiff } | null,
  deaths: [{ t: 412, x: 5230, y: 9120, killerChampionId: 64 }],
  comparison: [{ label: 'CS/min', value: 6.1, avg: 6.8, better: false, format: 'number'|'percent'|'integer' }],
  tips: [{ severity: 'high'|'mid'|'low', title: 'Mueres pronto', detail: '3 muertes antes del min 10...' }],
}
```
El canal `postgame` envia `{ loading, error, analysis: MatchAnalysis | null }`.

### `PatchNotes` (respuesta de la accion `patchNotes`)
Fuente: notas oficiales en espanol (`/es-es/news/tags/patch-notes/` -> la mas reciente; HTML en
`__NEXT_DATA__`). **Sin IA**: `src/main/patchnotes.js` interpreta el HTML de forma determinista (h2 = seccion,
h3.change-title / h4 / negrita = entrada, titulos de habilidad = grupo, `<li>` = cambio «Estadística: antes ⇒
después», etiquetas NUEVO/NOVEDAD/ELIMINADO). Cache en `%APPDATA%\LoL Coach\cache\patch-<version>.json` con el
HTML original (`format: 2`; las de formato viejo, con resumen de IA, se descartan); se vuelve a interpretar en cada
llamada. `refresh` vuelve a descargar. Sin conexion usa la ultima guardada (`offline: true`).
```js
{
  version: '26.21', url, title: 'Notas de la versión 26.21', date: '2026-10-20T18:00:00.000Z', description,
  intro: 'texto de los diseñadores', authors: ['Austin "Riot wroadie" Wright'],
  highlights: { image, text: ['...'] } | null,   // la imagen es de cmsassets (la CSP no la deja pintar)
  sections: [{
    id: 'champions', title: 'Campeones', context: '',
    kind: 'champions' | 'items' | 'runes' | 'systems' | 'modes' | 'other',   // la de mitad de version va como champions
    entries: [{
      id: 'champions-4', name: 'Lee Sin',
      championId?, itemId?, runeId?,           // por la imagen de Data Dragon, el enlace o el nombre
      icon: url de Data Dragon | null, category: 'Nuevos aumentos' | null (subapartado en modos),
      context: 'cita del diseñador', summary: 'W · Enfriamiento: 7 s → 8 s · ...',
      verdict: 'buff' | 'nerf' | 'adjust' | 'new',
      mine?: true,                             // campeón de tu pool (fuera de modos de juego)
      groups: [{
        title: 'W - Salvaguarda' | '', icon: url | null,
        changes: [{ stat: 'Enfriamiento' | null, before: '7 s' | null, after: '8 s' | null, text: 'línea completa',
                    dir: 'up' | 'down' | 'new' | 'removed' | 'change', good: true | false | null, mark?: 'new' | 'removed' }],
      }],
    }],
  }],
  forYou: { role: 'jungle', roleName: 'jungla',
            champions: [{ championId, name, games, winRate, changed, verdict, refs: [{ sectionId, entryId, verdict }] }] },
  updatedAt, offline,
}
```
- `dir` compara las cifras de antes y después (las de fuera de paréntesis primero; con distinto número de cifras,
  la media; si suben unas y bajan otras, `change`). `good` aplica el sentido de la estadística: en enfriamiento,
  coste, tiempo de lanzamiento, retraso o daño recibido, más es peor (salvo «reducción/recuperación de...»).
  Receta, nombre o descripción no tienen sentido (`good: null`).
- `verdict`: `new` si la entrada es nueva; `buff`/`nerf` si todos los cambios evaluables van a un lado o hay
  mayoría clara (el doble y al menos 2 de diferencia); si no, decide el texto del diseñador solo cuando habla en un
  único sentido («mejora», «empujoncito» / «debilitación», «en vereda»); si no, `adjust`.

## Vistas de la ventana principal

1. **Inicio**: perfil (icono, nombre, nivel, emblema y LP de Solo/Duo y Flex), grafica de LP, resumen de las
   ultimas 20 partidas, campeones mas jugados, estado del cliente (`state.status`) y auto-aceptar.
2. **Seleccion**: equipos con sus campeones y bans, picks recomendados con score, etiquetas y motivos
   (clic = `hoverChampion`), build del campeon (runas, hechizos, orden de habilidades, objetos) con boton
   "Importar", tarjeta "Coach IA" con boton "Pedir consejo" (`askDraftCoach`), baneos recomendados (`recs`)
   y los ajustes rapidos de pick/ban (campeon, bloquear, rol).
   Fuera de la seleccion: muestra los ajustes de pick/ban y un aviso de que se activa en la seleccion.
3. **Partida**: durante la carga, el scouting de los 10 jugadores; en partida, timers de objetivos,
   oro, CS, siguiente objeto y eventos. Fuera de partida, un estado vacio.
4. **Historial**: lista de partidas (`profile.matches`); al abrir una, su `MatchAnalysis` (graficas de
   diferencia de oro/XP/CS contra el rival, comparacion con tu media, consejos, mapa de muertes) y boton
   "Analizar con IA" (`askCoach`, desactivado si `state.ai.ready` es false).
5. **Parche**: notas del ultimo parche (`patchNotes`, se carga al abrir la pestana), sin IA: resumen rapido
   (mejoras/empeoras/ajustes por tipo, pulsables, y tus campeones afectados), barra fija con buscador, filtros por
   tipo y por veredicto y "Solo mis campeones", indice de secciones, tarjetas plegadas por campeon/objeto/runa con
   veredicto y una linea que se despliegan con los cambios alineados (estadistica | antes | flecha | despues, en
   verde o rojo segun mejore o empeore) y "Por que lo cambian" plegable; modos de juego y "otros" empiezan
   plegados. Enlace a las notas oficiales y boton "Actualizar".
6. **Ajustes**: todo `config`, claves (`setSecret`), via del coach con IA (`config.ai`), boton "Probar overlay".

Al terminar una partida, la app cambia sola a Historial con el `postgame` nuevo.
La app cambia sola a Seleccion al entrar en la seleccion y a Partida al empezar la carga.

### Builds completas (`draft.build.options` y `championStats.options`)
`BuildOption`: `{ kind: 'ap'|'ad'|'tank', label, keystone, runes, core, boots, situational, starter, spells, skillOrder, skillPriority, games, winRate, source: 'opgg'|'ugg', sources: ['opgg', 'ugg'], key, context: [{ key: 'mr'|'armor'|'antiheal'|'antitank'|'survive', label, items }] }`. Las genera `buildsets.js`: núcleo de objetos más jugado, más la página de runas, las botas y los situacionales más jugados **del mismo tipo de daño**.

**Lista unificada** (`mergeBuilds`): primero las de OP.GG (`coherentBuilds`, hasta 2, contra el rival de línea) y después las de U.GG (`buildsByKeystone`, una por piedra angular), sin repetir las equivalentes (misma piedra angular y mismo núcleo): la que se queda lleva las dos fuentes en `sources`. `source` es la fuente de sus datos y `games`/`winRate` son de esa fuente (OP.GG: partidas contra el rival; U.GG: mundo, Esmeralda+), así que no son comparables entre fuentes. Cada opción trae sus propios hechizos, inicial y habilidades (`tagBuilds`), para importarla entera. `key` identifica la build (se usa para conservar la elegida al recargar). En la selección, si U.GG tarda más de 8 s, sus builds se añaden al final cuando llegan (los índices de las anteriores no cambian). `draft.build.enemyFlags` marca los grupos de `context` que pide el equipo enemigo.

### `championStats.ugg` (segunda fuente, U.GG)
`{ patch: '16_21', games, winRate, keystones: [{ keystone, subStyle, games, winRate }] (top 5), options: [BuildOption de U.GG], spells, starter, skillOrder, skillPriority } | null`. Sale de `src/main/ugg.js` (`uggBuilds`): JSON públicos de stats2.u.gg (builds y overview 1.5.0), todas las regiones (12) y Esmeralda+ (17), con caché en `cache\ugg\<parche>-<id>.json` (12 h). Sus builds ya van dentro de `championStats.options` y de `draft.build.options`.

### `live.itemAdvice` (vista Partida)
`{ reasons: ['3 enemigos hacen sobre todo daño mágico', ...], groups: [{ key, label, items, recommended }] } | null`. Son los grupos de objetos por situación de tu build (`build.context`), sin los que ya tienes. Los recomendados van primero y se calculan con los **objetos que lleva cada enemigo** (`buildsets.liveContext`) o, si aún no llevan, con su campeón. Detecta daño mágico, daño físico, tanques y curación (robo de vida u omnivampirismo).

### `draft.matchup`
`{ vs, winRate, games, patch } | null`: tu campeón contra tu rival de línea, con datos de U.GG (Esmeralda+, todas las regiones). El rival es, de los enemigos visibles, el que más partidas tiene contra tu campeón en tu rol, con un mínimo de 30 (`ugg.laneMatchup`). Se muestra en la cabecera de la selección y se pasa al coach IA.
