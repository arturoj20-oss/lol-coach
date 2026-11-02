# Índice del código

Para localizar código sin explorar el proyecto. Las líneas son las del 29/10/2026 y pueden moverse: búscalas con Grep por el nombre.

## Flujo
`main.js` crea las ventanas, el IPC y `Companion`. `companion.tick()` se ejecuta cada segundo, lee la fase del LCU y reparte el trabajo:
- `ChampSelect`: auto pick/ban;
- `Draft`: picks, builds e importación;
- `Recommender`: baneos;
- `LiveGame`: overlay;
- `Profile`: post-partida;
- `Scouting`: pantalla de carga.

El estado completo llega a la interfaz con `send('state')`. La interfaz pide cosas con `window.api.action(name, args)`, que acaba en `companion.action()` (companion.js:367).

Acciones disponibles:
- `refreshProfile`, `getMatch`;
- `askCoach`, `askDraftCoach`;
- `patchNotes`, `championStats`;
- `invitation`, `searchQueue`, `createLobby`, `setPositions`;
- `chooseBuild`, `hoverChampion`, `lockChampion`, `importBuild`, `importItems`;
- `testOverlay`, `testMatchup` (`{ championId, role, vs }`: «Tu enfrentamiento» con datos reales fuera de la selección).

Contrato completo entre interfaz y proceso principal: `docs/ui-contract.md`. Diseño: `docs/design.md`.

## Proceso principal: `src/main/`
| Archivo | Qué contiene (funciones clave) |
|---|---|
| `updater.js` | `initUpdater({ isIdle, beforeInstall, onChange })` → `{ status, check, install }` (GitHub Releases; `status` va en `state.update`; acciones `checkUpdate` e `installUpdate`), `consumeShowMark` |
| `main.js` | `createWindow`, `createOverlay` (transparente, sin clics), `updateOverlay`, `createTray`, `cleanConfig` (valida los parches de configuración), `setupIpc`, `start` |
| `preload.js` | `window.api`: `init`, `on`, `setConfig`, `setSecret`, `action`, `window` |
| `companion.js` | `Companion`: `tick` (283), `onPhaseChange`, `onConnected`, `syncCampTimers` (timers nativos), `csTarget`, `refreshLobby` (invitaciones, cola, posiciones), `queueList` (colas disponibles), `refreshRecs`, `refreshCounterBans`, `action` (367), `setSecret`, `state`/`snapshot` |
| `lcu.js` | `findAuth` (línea de comandos de LeagueClientUx o lockfile), `Lcu.request(method, path, body)` |
| `champselect.js` | `ChampSelect.tick`, `doPick`, `pickAllowed` (preselección solo en la posición principal), `doBan`, `stepConfirm` (PATCH `completed` con reintentos) |
| `draft.js` | `Draft.update(session)`, `computePicks` (puntuación de picks, 416), `loadBuild`, `laneOpponent`, `choose`, `hover`, `lock` (bloquear a mano), `importBuild` (cola, llama a `doImport`), `importRunes`, `importItemSet` (sin repetir en las automáticas; archivo propio con `writeItemSetFile` o, si no se puede, la LCU), `scheduleItemReimport`/`flushItemReimport` (reimportación agrupada al revelarse enemigos); sueltas: `itemSetFor` (mascotas en jungla; Atlas y mejoras en support), `itemSetFile` (formato `!!!!lol-coach.json`), `mergeItemSets` (quita también el de iTero), `buildFrom`, `applyChoice` |
| `buildsets.js` | Builds coherentes: `coherentBuilds`, `buildsByKeystone`, `mergeBuilds` (OP.GG + U.GG), `contextItems`/`enemyContext`/`liveContext` (objetos por situación), `supportStarter`/`supportUpgrades`/`supportTopOf` (objeto de apoyo y sus mejoras), `itemLayout` (**duplicado en `views/select.js`**) |
| `recommend.js` | `Recommender.update` (baneos global y personal), `updateCounter` (baneos para contrarrestar, con U.GG) |
| `matchup.js` | `matchupCheck(champions, myId, vsId, role, uggMatchup)` (comparativa y consejos del enfrentamiento: guía de OP.GG en los dos sentidos y consejos de Data Dragon), `championTips` (caché `ddragon/{versión}-tips-{key}.json`), `scaling`, `dataTips`. Lo llama `draft.loadMatchup` (y `visibleOpponent`). En `views/select.js` lo pinta `matchupCard` (función suelta), que usan `renderMatchup` y el botón de prueba del explorador (`runMatchupTest`, `matchupTestPanel`, acción `testMatchup`) |
| `champstats.js` | `ChampStats.get(championId, role, vsId)`, que alimenta el explorador; `ROLES` |
| `opgg.js` | MCP de OP.GG: `callTool`, `parseCompact`, `championAnalysis`, `matchupGuide`, `mainPosition`, `laneMeta`, `lpHistory` |
| `ugg.js` | U.GG: `championBuilds`/`uggBuilds`, `matchups`/`laneMatchup`, `championCs`, `latest` |
| `ddragon.js` | `DataDragon.load` (en español, caché por versión con componentes `from`) |
| `champions.js` | `Champions`: `get`, `name`, `find`, `idFromEnglish`, `idFromKey`, `load(lcu)` |
| `live.js` | `LiveGame`: `poll`, `compute` (129, todo el cálculo de partida), `nextSkill`, `readHudScale` |
| `objectives.js` | `DEFAULT_TIMES`, `NOTIFY_BEFORE`, `NOTIFY_KEYS`, `LANES` |
| `keys.js` | `TabWatcher` (koffi + `GetAsyncKeyState`) |
| `scouting.js` | `Scouting.start(puuid)`: espectador, liga, maestría, posiciones recientes (`recentPositions`, OP.GG) y premades (`markPremades`, async: comprueba en `riot.match` que iban en el mismo equipo); `sampleScouting` para «Probar overlay» |
| `profile.js` | `Profile`: `doRefresh`, `apiPuuid`, `estimateLp` (curva estimada), `recordLp`, `afterGame`, `analyze(matchId)` (302), `tips`; suelta: `summarize` |
| `riot.js` | `RiotApi` con limitador y caché: `account`, `summoner`, `league`, `matchIds`, `match`, `timeline`, `mastery`, `activeGame`; de otras regiones: `apexLeague`, `topMasteriesOn`, `matchIdsOn`, `matchIdsSince`, `matchOn`, `accountByRiotId`, `accountByPuuid`; `recentCount` |
| `otp.js` | `OtpBuilds` = mains (segundo plano; datos de la app en `data/mains/*.json.gz` + del equipo en `cache/mains/*.json`: `load`, `merge`, `save` solo de `changed`, `exportOf`, `keyPuuid` para puuids de otra clave): `step` (por campeón en `order()`: `discover` con el leaderboard de OP.GG → `vet` del candidato → `fetchBatch` de su season → `refresh` cada 3 días), `matchup(championId, role, vsId)` (mains contra un rival en la season; lo usa `matchup.js`), `isReady`, `migrate`, `options(championId, role, items)` (con `otp.names` y `otp.matches`; en la interfaz: `otpByline` y `otpMatches`), `summary(championId, role)` (aviso en la interfaz: `otpNote` en `views/select.js`); lo usan `draft.loadBuild` y `champstats.get`; sueltas: `summarize` (partida → resumen), `buildOf` |
| `coach.js` | `Coach.run`, `analyze` (post-partida), `draftAdvice` (selección) |
| `localclaude.js` | `LocalClaude.find`, `ask` (`claude -p --safe-mode ...`) |
| `patchnotes.js` | `PatchNotes.get`, `NotesParser` (HTML a secciones, entradas y cambios), `parseChange`, `verdictOf`, `forYou` |
| `config.js` | `Config.get`/`set`/`save` e `importOldConfig` (de lol-auto-accept) |
| `log.js`, `util.js` | `log`; `mapLimit`, `pct`, `ROLE_*`, `RIFT_QUEUES`, `laneToRole` |

## Interfaz: `src/renderer/`
| Archivo | Qué contiene |
|---|---|
| `index.html`, `app.js` | `App`: navegación, cambio automático de vista según la fase (`PHASE_NAMES`) y barra de actualización (`paintUpdate`) |
| `util.js` | `html` (plantilla con escape), `setHtml` (no toca el DOM si no hay cambios), `hydrate` (`data-vars`), `fmt`, `Dd`, `icon`, `objIcon`, nombres de rangos y roles |
| `ui.js` | `Tip`, `Theme`, `Seg`, `Expand`, `ChampPicker`, gráficas SVG (`lineChart`, `diffChart`, `ring`, `deathMap`, `compareBar`) y estados vacío y cargando |
| `views/home.js` | Inicio: perfil, LP y Cliente (invitaciones, elegir cola y posiciones en `lobbyBlock`, buscar, «Próxima selección») |
| `views/select.js` | Campeones: Mi selección y el explorador; `champButtons` (Fijar/Bloquear), `buildPanel` (maestro-detalle de builds), `runesView`, `skillsView`, `itemLayout`, `contextBlock` |
| `views/history.js` | Historial y análisis post-partida con el coach (`miniMarkdown`) |
| `views/patch.js` | Notas del parche: filtros, veredictos y «Tus campeones» |
| `views/settings.js` | Ajustes |
| `theme.css`, `app.css`, `views/*.css` | Estilos: tokens en `theme.css` y uno por vista |
| `overlay.html/.js/.css` | Overlay: `SKILL_BAR` (calibrado), avisos, franja de Tab (`renderTab`) y etiquetas del marcador (`renderScout`, `scoutInfo`, `SCOREBOARD` estimado) |
| `mock-api.js` | Datos de ejemplo sin Electron; F9 abre el simulador de fases |

## Otros
`docs/ui-contract.md`, `docs/design.md`, `docs/contexto-historico.md` (contexto largo antiguo), `README.md`, `package.json` (electron-builder/NSIS; `npm run export-mains`), `build/icon.png`, `scripts/export-mains.js`, `scripts/mains-worker.js` (programa de fondo de mains; `otp.js`: `isWorker`, `heartbeat`, `workerAlive`, `writeFocus`/`readFocus`, `reloadChanged`, `complete`), `scripts/mains-worker-task.ps1` (instalar, quitar y estado en el inicio de Windows), `data/mains/` (datos de mains que lleva el instalador).
