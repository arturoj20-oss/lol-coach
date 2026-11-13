# LoL Coach: contexto (versión corta)

Actualizado: 13/11/2026. El detalle antiguo, con fórmulas y la historia completa, está en `docs/contexto-historico.md`. Léelo solo si hace falta.

## Usuario y entorno
- Uso **personal**. Cuenta Artiloked#EUW, Esmeralda, jungla (Shaco, Shyvana). Responder en **español de España**. Comentarios del código en español, breves y sin acentos en `src/main`.
- Equipo: Windows 11, PowerShell 5.1 y Node 24. Sin Python. Git y GitHub CLI instalados el 01/11 (si `git` no está en el PATH de la sesión, recargarlo desde las variables de entorno).
- **Repositorio público** https://github.com/arturoj20-oss/lol-coach (rama `main`, commits con el correo noreply de GitHub; sesión de `gh` como arturoj20-oss). El 02/11 GitHub **suspendió la cuenta Artiloked** (motivo desconocido) y el repositorio se movió aquí; `package.json` publica en arturoj20-oss. Las apps de la 1.2.8 o anteriores buscan en Artiloked y no se actualizan: hay que instalar la 1.2.9 a mano una vez. `CONTEXTO.md` e `INDICE.md` se suben y son **públicos** (decisión del usuario del 01/11): no poner aquí claves, correos ni rutas personales. `docs/contexto-historico.md` sigue solo en local (`.gitignore`). Al cambiar código: commit y push.
- **Actualizaciones** (`src/main/updater.js`, electron-updater con GitHub Releases). Desde el 01/11 (después de la 1.2.4), a petición del usuario, **al abrir la app** comprueba a los 3 s y al mostrar la ventana (si hace más de 30 min de la última comprobación), además de cada 4 h:
  - si está al día, sale un aviso breve;
  - si hay versión nueva, se descarga y una barra arriba (`#updateBar`, `App.paintUpdate`) muestra el porcentaje y luego **«Instalar y reiniciar»** (acción `installUpdate`, bloqueada en selección o partida; la ventana se vuelve a abrir con la marca `show-after-update`);
  - en Ajustes, «Buscar actualizaciones» (`checkUpdate`).
  - Respaldo automático: se instala al salir o con el cliente de LoL cerrado 10 min (en silencio, vuelve a la bandeja con `--updated`). Estado en `state.update` (`state`, `next`, `percent`). Publicar: subir `version`, commit y `npm run release` (`scripts/release.ps1`). La 1.2.2 y las anteriores no se actualizan solas: hay que instalar la 1.2.3 a mano una vez. LoL en `E:\Riot Games\League of Legends`. Monitores de 2560×1440 y 1920×1080.
- Ejecutar con `npm start` o `Iniciar.bat`. Instalador local con `npm run dist` (no publica); **no reconstruirlo ni publicar una release hasta que el usuario lo pida**. Si falta el binario de Electron: `node node_modules\electron\install.js`.
- Datos en `%APPDATA%\LoL Coach\`:
  - `riot-key.txt` con la Personal API Key. No caduca y **nunca va en el código**.
  - `config.json`, `lp-history.json`, `log.txt` y `cache\`.
  - `claude\`, directorio de trabajo del Claude local.
- Al probar con el cliente abierto, la app **acepta colas y hace pick/ban**. Después, cerrarla con `Stop-Process`. El antiguo `lol-auto-accept` puede pisarse con ella.

## Qué es
Una app Electron 45 en JS puro, sin bundler, al estilo Blitz/iTero. Fases 0 a 5 hechas:
- auto-aceptar y auto pick/ban;
- picks y baneos recomendados, incluidos baneos para contrarrestar;
- builds de OP.GG y U.GG en una sola lista, que se importan al cliente (runas, hechizos y un set de objetos **global**);
- explorador de campeón y notas del parche **sin IA**;
- overlay mínimo;
- perfil, LP y curva de LP estimada, historial, análisis post-partida y scouting;
- coach con IA a través de Claude Code local (`claude -p`, suscripción) o de la API.

Fuentes de datos: LCU, Live Client Data (`127.0.0.1:2999`), Riot API, MCP público de OP.GG, JSON públicos de U.GG y Data Dragon en español.

## Decisiones del usuario (no volver a proponer)
- ❌ Timers de jungla propios, ya sea marcando a mano o leyendo el minimapa. La app activa los **nativos** (`HUD.MinimapEnableAllTimers`).
- ❌ Overwolf. Tampoco destripar iTero ni Overwolf.
- ❌ Objetos recomendados por IA en partida.
- ❌ Pestaña «Partida» en la ventana (quitada el 01/11): esa información ya se ve en el juego y en el overlay. Con ella se fue la vista del scouting de la pantalla de carga; `scouting.js` y `live.js` siguen funcionando por dentro (el overlay usa `live`).
- ❌ Timers completos o siguiente objeto en el overlay.
- ❌ Usar el historial del cliente cuando no hay clave. Si se comparte la app, cada persona pone sus propias claves. La app se comparte con compañeros y cada uno tiene su propia clave personal de Riot. Los datos de mains del instalador (`data/mains`) son de la clave del usuario: se le avisó de que, estrictamente, eso queda fuera del uso personal, aunque con riesgo bajo.
- ❌ IA en las notas del parche, para que también las lea quien no tiene Claude.
- "Más claro" = **más fácil de leer**, no un tema blanco. Tema oscuro gris pizarra por defecto.
- Runas **una vez al bloquear** (06/11, sustituye a la decisión del 04/11 de la v1.2.12, «solo con un clic»): se importan una sola vez por campeón al bloquearlo. Después solo cambian al pulsar una build en Mi selección o «Importar build»; nunca al revelarse enemigos (ahí solo se reescribe el set de objetos). Siempre en una única página «LoL Coach». La casilla «Runas» de Ajustes (`autoImport.runes`) vuelve, activada por defecto, y al desactivarla no se importan al bloquear. **Publicado en la v1.2.13** (06/11).
- Normas de Riot:
  - sin timers de definitivas ni de Flash enemigos;
  - sin "haz X ahora" en partida;
  - sin MMR ni leer memoria;
  - sin nombres de aliados en la selección clasificatoria. Al coach solo se le pasan campeones y roles.

## Trampas técnicas
- El puuid del LCU **no vale** para la API de Riot: usar `profile.apiPuuid()`, que pasa por account-v1.
- OP.GG da la runa, el núcleo y las botas sin emparejar, así que `buildsets.js` arma builds coherentes. Los counters de OP.GG solo traen el top 3, y sus nombres van en inglés (`champions.idFromEnglish`).
- **Matchups de U.GG:** cada fila es `[rival, victorias DEL RIVAL, partidas]`. Hasta el 29/10 se leían al revés: estaban invertidos el % de «Tu enfrentamiento», los baneos para contrarrestar y el explorador. Ahora `ugg.matchups` lo corrige (caché `-matchups-v2`). Comprobación: la media ponderada de las filas tiene que dar el % general del campeón. En OP.GG, `counters[].win`, `strong_counters.win_rate` y `weak_counters.my_win_rate` son del campeón consultado.
- OP.GG: si no se manda `tier`, usa Esmeralda+ (igual que U.GG). Admite `all`, `platinum_plus`, `emerald_plus`, `diamond_plus` y `master_plus`.
- La CSP no permite `style`: los valores dinámicos van en `data-vars` (`renderer/util.js`).
- El overlay solo se ve en «Sin bordes» o «Ventana», no en pantalla completa.
- Capturas de la app: `PrintWindow` sobre `MainWindowHandle`. `SendKeys` no llega a la ventana.
- `itemLayout` está duplicado en `buildsets.js` y `views/select.js`. Si se cambia uno, hay que cambiar el otro.
- **Orden de la tienda:** la partida lee los archivos de `Config\Global\Recommended` (y `Config\Champions\X\Recommended`) y los ordena por nombre. El cliente escribe ahí los sets de la LCU como `RIOT_ItemSet_N.json` y no toca los demás. Blitz usa `!!!blitz-N.json`, `priority: true` y `sortrank` 1e9. El orden de la lista de la LCU no cuenta.
- **OP.GG cambia de parche en cuanto sale** (16.22: datos desde el 03/11 por la tarde) y no admite pedir otro parche: los primeros días todo OP.GG tiene poca muestra (Shaco jungla Esmeralda+ el 04/11: 1.729 partidas; contra Lee Sin, 117). U.GG sigue en el parche anterior hasta tener datos (16.21: 106.077 partidas de Shaco jungla). `trends.win[]` de la guía da la fecha de cada parche.
- La guía de OP.GG contra un rival (`matchupGuide`) trae **poca muestra** (Shaco contra Lee Sin: unas 80 partidas; núcleos de 1 o 2 partidas al 100 %). `coherentBuilds` descarta los núcleos, páginas y botas con menos de `MIN_GUIDE_GAMES` (20) y, si no queda ningún núcleo, usa el del análisis general (`general: true`; el grupo dice «análisis general (poca muestra contra X)»). En la lista, las builds con menos de 20 partidas salen con el % atenuado (`low-sample`).
- OP.GG y U.GG **no** traen el Atlas mundial en el inicial de support (solo pociones). La mejora (Tejesueños...) sale en `last_items`.

## Estado y pendientes
- Probado en real:
  - perfil, historial de la API, LP y notas del parche;
  - **una selección real el 26/10**: auto-ban, auto-pick de Shaco e importación del set.
- Arreglado (29/10, sin probar en real): el set de objetos se reimportaba hasta 6 veces por selección, una por cada enemigo que, al revelarse, cambiaba `enemyFlags`. Ahora la reimportación espera 6 s sin cambios (se fuerza al salir de la selección), las escrituras van en cola y las automáticas no repiten un set idéntico.
- Arreglado (29/10, sin probar en real): fallos de las runas. Toda la importación va en cola (antes dos a la vez se pisaban al borrar y crear la página), el DELETE tolera el 404, se completan los fragmentos si faltan y, si no queda hueco para una página, se reutiliza una de iTero o Blitz (desde la 1.2.11) o se avisa, sin tocar las páginas del jugador. Ahora se registra cada página creada.
- Nuevo (29/10): **mains** (`otp.js`, opción `otpBuilds` en Ajustes; la fuente se sigue llamando `otp` por dentro y en la interfaz sale «Mains»). Sustituye al primer sistema de OTP por maestría, que daba muy poca muestra.
  - Decisiones del usuario: estadísticas de **toda la season**; mains reconocibles y activos (ej.: PinkWard#Laugh en Shaco, Solarbacca#NA1 en Gangplank); 3 mains por campeón; primero sus campeones y después todos; sin raspar webs.
  - Descubrimiento: leaderboard de campeón del MCP de OP.GG (`lol_list_champion_leaderboard`, top 10 Master+ por región en EUW, KR y NA). Sus partidas son **totales**, no de la season.
  - El puuid de OP.GG **no vale** con nuestra clave (400): se resuelve el Riot ID con account-v1.
  - Un candidato vale si tiene 150 o más clasificatorias Solo/Dúo esta season (`SEASON_START` = 8/1/2026) y alguna en los últimos 21 días. Se descarga su season entera (una petición por partida). Se descarta si tras 40 partidas menos del 30 % son con el campeón.
  - Coste: unas 30 partidas por minuto (60 de cada 95 peticiones por 2 min); unos 25 min por main y 1 h por campeón. Los 173 campeones tardan una semana con la app abierta. Se pausa entre la carga y el post-partida. Cada 3 días se añaden sus partidas nuevas.
  - Orden: el campeón que estás viendo (`focus`), los prioritarios (preselección, perfil, selección, explorador) y luego el resto.
  - Usos: **builds** con sus partidas de los últimos 30 días (grupo «Mains», con nombres y partidas desplegables) y **enfrentamientos** con toda la season (`otp.matchup`). Estos últimos salen en «Tu enfrentamiento»: partidas y % contra ese rival, la página de runas que más usan ahí y sus partidas.
  - Avisos en la interfaz: `otp.summary` (`waiting`, `vetting`, `downloading`, `ready`, `none`). El evento `otp` recarga la selección (`draft.refreshOtp`) y el explorador.
  - **Datos incluidos en la app** (decisión del usuario, 29/10): `data/mains/{id}.json.gz` entra en el instalador (`build.files`).
    - Se generan con `npm run export-mains` (`scripts/export-mains.js`), que junta lo que ya trae la app con lo descargado en este equipo.
    - Al arrancar se leen los de la app y después los del equipo (`cache/mains/{id}.json`, un archivo por campeón; solo se escriben estos, y solo los que cambian). Lo del equipo manda.
    - Quien no tenga clave de Riot ve igualmente las builds y los enfrentamientos incluidos.
    - Los puuid van cifrados por clave: en otro equipo, `keyPuuid` resuelve cada main por su Riot ID (`apiPuuid`, que no se exporta). Las partidas conservan el puuid original.
    - El `otp.json` antiguo se pasa a archivos por campeón al arrancar y queda como `otp.json.old`.
    - Para que el instalador lleve datos nuevos: `npm run export-mains` y después `npm run dist`, **solo cuando el usuario lo pida**.
  - **Programa de fondo** (`scripts/mains-worker.js`, decisión del usuario, 29/10): descarga los mains aunque la app esté cerrada, hasta tener los 173 campeones.
    - Instalado el 29/10 en la carpeta Inicio de Windows (`LoL Coach - Mains.vbs`, que lanza node sin ventana). No usa tareas programadas, que pedirían permisos de administrador.
    - Comandos: `npm run mains-worker:install`, `:uninstall` y `:status` (`scripts/mains-worker-task.ps1`).
    - Al terminar se quita solo de Inicio; después las actualizaciones siguen con la app abierta.
    - Coordinación con la app: bloqueo `cache/mains/.worker.lock` (pid y latido cada minuto; caduca a los 3 min).
      - Con el programa activo, la app no descarga: recarga cada minuto los archivos cambiados (`reloadChanged`) y le pasa sus prioridades por `.focus.json`.
      - Las escrituras son atómicas (temporal y renombrado).
    - Se pausa con `League of Legends.exe` abierto y 3 minutos después.
  - Arreglado: la descarga de mains de la app esperaba a `champions.loaded`, que solo se activa con el cliente abierto. Ahora usa la lista de Data Dragon.
  - Probado con datos reales: Shaco Mid Lane#EUW, 631 clasificatorias esta season; 52 de sus 60 primeras con Shaco.
- Nuevo (29/10): tarjeta **«Tu enfrentamiento»** en Mi selección (`matchup.js`), sin IA. Aparece cuando se revela tu rival de línea y muestra:
  - el % del enfrentamiento en U.GG y OP.GG, con aviso si discrepan 3 puntos o más (ej.: Shaco contra Graves da 48,6 % en U.GG y 52,8 % en OP.GG);
  - quién gana el inicio de partida y quién consigue más asesinatos en solitario;
  - el estilo recomendado, el % general y el tier;
  - el perfil de Riot y la curva de % de victorias según la duración;
  - consejos derivados de los datos, consejos oficiales de Riot en español y el consejo de OP.GG, que viene en inglés.
  Probado con datos reales en Node y con una captura del simulador; falta verlo en una selección real.
  Para probarlo sin selección, en el explorador está el botón «Probar «Tu enfrentamiento»». Usa el campeón, la línea y el rival del explorador (o el rival más jugado) y pide datos reales.
- 30/10: avisos del overlay más grandes (texto de 20 px, icono de 32 px, hasta 340 px de ancho y pegados al lateral). Sin probar en partida.
- 30/10: la casilla `otpBuilds` de Ajustes se llama ahora «Descargar datos de mains con mi clave de Riot». Solo controla la descarga; los datos incluidos se usan siempre. Instalador 1.2.1 reconstruido (20 campeones de mains incluidos) y subido a la carpeta de Drive del usuario.
- 01/11: el set de objetos va **el primero en la tienda** (petición del usuario). Se escribe como archivo `!!!!lol-coach.json` en `Config\Global\Recommended` con `priority` y `sortrank` 2e9 (`draft.writeItemSetFile`, `itemSetFile`). Se quita el set de LoL Coach de la LCU para que no salga dos veces y **siempre el de iTero** (decisión del usuario). Si no hay carpeta del juego, se usa la LCU como antes. Probado contra el cliente; falta verlo en la tienda de una partida.
- 01/11: en **support**, el set lleva el Atlas mundial en el inicial y la mejora más jugada con el campeón en la build final (ocupa un hueco). Además, hay un bloque «Mejoras del objeto de apoyo» con las 5 mejoras (`supportStarter`/`supportUpgrades`/`supportTopOf` en `buildsets.js`, opciones `support`/`supportTop`; en mains, según lo que llevan). La vista Campeones aún no lo muestra.
- 01/11: instalador **1.2.2** reconstruido (set primero en la tienda y objetos de support) con 30 campeones de mains incluidos. Sin subir a Drive.
- 01/11 (después de la 1.2.2, sin probar en real):
  - **Colas en Inicio:** lista de colas sacada del cliente (`companion.queueList`, caché de 10 min, sin TFT ni personalizadas) para crear sala o cambiar la cola si eres líder. En las colas con posiciones, también se eligen principal y secundaria.
  - **Preselección solo en la posición principal** (decisión del usuario; ej.: Draven con ADC/mid y te toca mid → no se marca). Con Relleno de principal no se marca. En colas sin posiciones, o si no se sabe la principal, se marca como antes. `ChampSelect.pickAllowed`; la principal se lee de la sala al empezar la selección y, si no, de la última vista en Inicio.
  - **Fijar campeón y Bloquear campeón** en la pestaña Campeones (tarjetas de picks y cabecera del explorador; `champButtons` en `views/select.js`, acción `lockChampion` → `draft.lock`). Fuera de la selección, «Fijar» lo deja preseleccionado.
- 01/11: **publicada la v1.2.3** en GitHub Releases (https://github.com/Artiloked/lol-coach/releases/tag/v1.2.3): primera con actualizaciones automáticas; incluye lo de arriba (colas, posición principal, Fijar/Bloquear, set de support) **sin probar en real**. Tú y tus compañeros tenéis que instalarla a mano una vez desde Releases. La actualización automática de principio a fin se comprobará con la próxima versión (en Ajustes se ve el estado; en `log.txt`, las líneas `actualizar:`). `--publish always` daba 422: sin etiqueta («Published releases must have a valid tag») y por carrera (instalador y blockmap creaban la release a la vez, `already_exists`). `release.ps1` crea la etiqueta y la release con `gh` antes de que electron-builder suba los archivos.
- 01/11: **publicada la v1.2.4** (sin pestaña Partida y flecha de subir habilidad más clara). Primera que deberían recibir solas las apps con la 1.2.3: falta confirmarlo.
- 01/11: **publicada la v1.2.5** (aviso al abrir y «Instalar y reiniciar»). Instalador local en `dist\LoL Coach Setup 1.2.5.exe`, idéntico al publicado (mismo SHA-512).
- **Hecho el 01/11 (v1.2.6, sin probar en partida):** etiquetas de **maestría, posición y premades** a los lados del marcador, **siempre que se mantiene Tab** (decisión del usuario: no solo los 10 primeros segundos; sin cuenta atrás).
  - Código: `overlay.js` (`renderScout`, `scoutInfo`, constantes `SCOREBOARD`), `scouting.js` (`recentPositions`, `markPremades`, `sampleScouting`). `live.js` añade `riotId` a cada línea y `myTeam`.
  - La geometría del marcador (`SCOREBOARD`) es **estimada**, sin captura. Se cuadra en Ajustes con `overlay.scoutX/scoutY/scoutRow`, «Mi equipo sale a la derecha» (`scoutSwap`) y «Etiquetas de ejemplo» (`scoutCalibrate`, para el modo práctica, donde no hay scouting). Cuando haya una captura del usuario, medir y fijar los valores por defecto.
  - «Probar overlay» manda un scouting de ejemplo: se ve manteniendo Tab.
  - Detalle del diseño aprobado:
  - Diseño: https://claude.ai/artifact/Ho1T2CV3cLk41aoM2exXAG
  - Una etiqueta por jugador pegada al borde, a la altura de su fila: tu equipo a la izquierda y los rivales a la derecha.
  - Contenido: puntos y nivel de maestría; la posición (✓ «En su línea», ⚠ «Suele ir de X», ✕ «Primera vez» si tiene menos de 10 k puntos, «Perfil oculto»); y un icono de enlace de 16 px del color del grupo si es premade (sin texto, mismo tamaño de etiqueta).
  - Datos:
    - maestría, de Riot (como `scouting.js`);
    - posición habitual: la más repetida en las 20 últimas partidas de OP.GG (`lol_list_summoner_matches` con `limit: 20`, `participants[].position`; no gasta la clave de Riot). Está «en su línea» si es la habitual o la juega en al menos el 30 % de sus partidas;
    - posición en esta partida: la de Live Client;
    - premades: compartir 2 o más de las 20 últimas partidas (`matchIds`, 10 peticiones) y estar en el mismo equipo ahora. No se usa la sala del cliente, porque sus puuid no valen con la API.
  - Falta: una captura del Tab del usuario para fijar la geometría (y ver si su equipo sale siempre a la izquierda).
  - 02/11, el usuario lo probó en partida: las etiquetas salen **demasiado al centro y tapan los objetos** de cada campeón, y los premades fallaban. Arreglado (sin probar): las partidas compartidas solo cuentan si iban **en el mismo equipo** (se descargan hasta 4 por pareja; se registran los grupos en `log.txt`). Tab se vigila también con el oro por línea desactivado. La geometría sigue pendiente de la captura. **Publicado en la v1.2.7** (02/11).
  - 02/11, v1.2.8: diseño aprobado de las etiquetas **fuera del cuadro del Tab, pegadas a su margen** (demo: https://claude.ai/artifact/PShUVo4M3RaffpDTvRNEtx). El usuario tiene `MirroredScoreboard=1` (objetos en el borde exterior), `GlobalScale=0.42` y 2560×1440. `SCOREBOARD.HALF_W` pasa de 500 a 740 (estimado) más `GAP` de 6. La app guarda una captura del marcador la primera vez que se pulsa Tab en cada partida (`cache\tab-capture.png`, `captureScoreboard` en `main.js`, sin el overlay): con ella medir el borde real y la altura de las filas.
  - 03/11: la captura de la app no servía (salía el escritorio: capturaba aunque el juego no estuviera en primer plano). Ahora solo captura con el juego delante (`gameFocused` en `keys.js`). **Geometría medida** con una captura en práctica (2560×1440, GlobalScale 0,42): `SCOREBOARD` = `HALF_W` 720, `ROW0_Y` −241,3, `ROW_H` 95,4 (antes las filas iban demasiado abajo y juntas). **Publicado en la v1.2.10** (03/11). Falta verlo en partida y comprobar si el marcador escala igual con otro `GlobalScale`.
- 03/11, **gráfica de LP** (Inicio), sin publicar:
  - **Por cuenta:** cada punto de `lp-history.json` guarda `account` (puuid de la API) y se filtra con `profile.lpOf`. Los antiguos sin cuenta valen para cualquiera. El 02/11 se coló otra cuenta en Oro (otra sesión en el cliente): esos 3 puntos se marcaron como `otra-cuenta` (copia en `lp-history.json.bak`).
  - **Periodo** Semana / Mes / Año (`LP_RANGES`, por defecto Mes), con el último punto anterior como partida.
  - **Color por rango:** la línea y el relleno cambian de color al cruzar cada rango (`bands` en `lineChart`, tokens `--tier-*` en los dos temas). El simulador trae un año de LP de Oro a Esmeralda para probarlo.
- 04/11, **v1.2.11**: un compañero con la 1.2.10 no importaba runas («Max pages reached»): la comprobación por `ownedPageCount` no veía las páginas llenas. Ahora se usa `canAddCustomPage` del inventario y, sin hueco, **se reutiliza una página de iTero o Blitz** (decisión del usuario; las del jugador siguen sin tocarse). Si el cliente responde «Max pages reached» igualmente, se reutiliza y se reintenta. Probado con un cliente simulado; falta verlo en real. También van en esta versión el mínimo de partidas de la guía de OP.GG y la gráfica de LP por cuenta.
- Visto en el registro del 01/11 (15:12:48-54, Nami): las runas y el set se reimportaron cada segundo, alternando dos builds. Falta saber si fueron clics del usuario o un bucle.
- Falta probar en real: el overlay en partida, el scouting, el post-partida automático, el coach de IA en la selección y la vista Historial.
- 13/11, **easter eggs** (petición del usuario, irán varios): en Ajustes > General, el botón «Activar Características de Coach Remoto con IA» (antes «Opciones de Desarrollo»; `devOptions` en `views/settings.js`) reproduce **dentro de la app** 5 s del rickroll (`renderer/media/rickroll.webm`, `App.rickroll`; se cierra solo, con clic o con Esc). Las novedades de la 1.2.15 son **de broma**: anuncian un «Coach Remoto con IA» alojado en nuestros servidores que no existe, como cebo del botón. Al **bloquear Tryndamere** suena una vez `renderer/sounds/tryndamere.mp3` (3,2 s de un vídeo de YouTube, a 1,25×; `App.easterEggs` en `app.js`, con el canal `draft`). Sin probar en una selección real.
- 13/11, **novedades tras actualizar** (`App.whatsNew`, `WHATS_NEW` en `app.js`): una ventana de una sola vez al abrir una versión con notas; al cerrarla se guarda `config.seenVersion`. Los easter eggs **no se anuncian** (decisión del usuario). Al publicar una versión con cambios visibles, añadir su entrada a `WHATS_NEW`. **Publicado en la v1.2.14** (13/11) con el botón y el audio de Tryndamere.
- `objectives.js`: falta confirmar cuándo se retira el Heraldo. Ahora se supone que se va cuando sale el Barón, a los 20:00.
