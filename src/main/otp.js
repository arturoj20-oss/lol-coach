// Builds y enfrentamientos de MAINS: los jugadores Master+ con mas partidas de cada campeon en EUW, KR
// y NA, con su season entera descargada de la Riot API. Trabaja en segundo plano y sin prisa:
// 1) descubrir: leaderboard del campeon en OP.GG (top 10 de cada region; no gasta cuota de Riot);
// 2) elegir MAINS_PER_CHAMP mains activos: Riot ID -> puuid (account-v1; el puuid de OP.GG no vale con
//    esta clave), al menos MIN_SEASON_GAMES clasificatorias Solo/Duo esta season y alguna en los
//    ultimos ACTIVE_DAYS dias;
// 3) descargar toda su season (una peticion por partida) y guardar un resumen de las partidas con ese
//    campeon (rival de linea, runas, hechizos, objetos). Si menos del MIN_SHARE las juega con el, se
//    cambia por el siguiente candidato. Cada 3 dias se anaden sus partidas nuevas.
// Orden: el campeon que estas viendo, tus campeones y los de la seleccion, y despues todos los demas.
// Enfrentamientos: toda la season. Builds: ultimos 30 dias (los objetos cambian a lo largo de la season).
// El nombre de la clase y de la fuente ('otp') se conservan de la version anterior (OTP por maestria).
// Almacenamiento: un archivo por campeon. Los que vienen con la app (data/mains/{id}.json.gz, solo
// lectura, se generan con scripts/export-mains.js) se juntan al arrancar con los descargados en este
// equipo (cache/mains/{id}.json), que son los unicos que se escriben.
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { EventEmitter } = require('events');
const { PLATFORMS } = require('./riot');
const opgg = require('./opgg');
const { coreKind, contextItems, isFinal, NAMES, supportUpgrades, supportTopOf } = require('./buildsets');
const { ROLE_FROM_POSITION } = require('./util');
const { log } = require('./log');

const REGIONS = ['EUW', 'KR', 'NA'];
const SEASON_START = Date.UTC(2026, 0, 8);   // season 2026 (parche 26.1); cambiar al empezar otra
const MAINS_PER_CHAMP = 3;
const MIN_SEASON_GAMES = 150;     // clasificatorias Solo/Duo esta season (con cualquier campeon)
const ACTIVE_DAYS = 21;
const MIN_SHARE = 0.3;            // partidas con su campeon; se mira tras MIN_SHARE_AFTER descargadas
const MIN_SHARE_AFTER = 40;
const BOARD_TTL = 14 * 864e5;     // candidatos del leaderboard
const REFRESH_TTL = 3 * 864e5;    // partidas nuevas de cada main
const BUILD_DAYS = 30;            // partidas que cuentan para las builds
const PER_STEP = 10;              // partidas descargadas por paso
const BG_BUDGET = 60;             // de las 95 peticiones cada 2 min, las de fondo usan como mucho estas
const MIN_GAMES = 6;              // partidas de los mains del campeon en el rol para dar una build
const SHARD_ORDER = ['offense', 'flex', 'defense'];
const RECORD_VERSION = 2;         // 2: con el rival de linea (o)
const DATA_VERSION = 3;           // 3: mains del leaderboard (antes: OTP por maestria)
const MATCHES_SHOWN = 20;         // partidas de cada build o enfrentamiento que se ensenan
const BOARD_FIELDS = ['leaderboard[].rank', 'leaderboard[].summoner.{game_name,tagline}', 'leaderboard[].most_champion_stat.{play,win}'];
const BUNDLED_DIR = path.join(__dirname, '..', '..', 'data', 'mains');

const LOCK_FILE = '.worker.lock';   // { pid, at } del programa de fondo
const FOCUS_FILE = '.focus.json';   // { focus, priority } que la app le pasa
const LOCK_STALE = 3 * 60000;

const recKey = r => `${r.m}|${r.p}`;

// Emite 'update' (championId) cuando hay partidas nuevas de los mains de ese campeon
class OtpBuilds extends EventEmitter {
  // bundledDir: datos que vienen con la app (por defecto data/mains del proyecto); legacy: pasar el
  // otp.json de versiones anteriores a archivos por campeon
  constructor(riot, dir, bundledDir = BUNDLED_DIR, legacy = true) {
    super();
    this.riot = riot;
    this.dir = path.join(dir, 'cache', 'mains');
    this.bundledDir = bundledDir;
    this.data = { champs: {}, players: {} };
    this.recs = new Map();       // championId -> partidas de sus mains
    this.changed = new Set();    // campeones con cambios sin guardar
    this.mtimes = new Map();     // archivo -> fecha de modificacion al leerlo (recargas del programa de fondo)
    this.isWorker = false;       // true en scripts/mains-worker.js
    this.watching = false;       // la app deja la descarga al programa de fondo
    this.running = false;
    this.paused = false;
    this.priority = new Set();   // campeones que van primero
    this.champions = null;       // Champions (lista de campeones y nombres de OP.GG); lo pone companion
    this.current = null;         // campeon en el que se esta trabajando
    this.dirty = 0;
    this.load(legacy ? path.join(dir, 'cache', 'otp.json') : null);
  }

  recordsOf(championId) {
    let list = this.recs.get(championId);
    if (!list) this.recs.set(championId, list = []);
    return list;
  }

  allRecords() {
    return [...this.recs.values()].flat();
  }

  // Junta un archivo de campeon ({ champ, players, records }) con lo cargado; over: lo suyo manda
  // (los datos de este equipo pisan a los de la app, que pueden ser mas antiguos)
  merge(id, file, over) {
    if (file.champ) this.data.champs[id] = over || !this.data.champs[id] ? file.champ : this.data.champs[id];
    for (const [puuid, p] of Object.entries(file.players || {})) {
      if (over || !this.data.players[puuid]) this.data.players[puuid] = p;
    }
    const list = this.recordsOf(id);
    const have = new Set(list.map(recKey));
    for (const r of file.records || []) {
      if (r.v === RECORD_VERSION && r.t >= SEASON_START && !have.has(recKey(r))) { list.push(r); have.add(recKey(r)); }
    }
  }

  // Primero lo que viene con la app y despues lo de este equipo. legacyFile: el otp.json de versiones
  // anteriores (todo en un archivo), que se pasa a archivos por campeon y se borra
  load(legacyFile) {
    const readDir = (dir, gz) => {
      let names = [];
      try { names = fs.readdirSync(dir).filter(f => f.endsWith(gz ? '.json.gz' : '.json')); } catch { return; }
      for (const f of names) {
        try {
          if (!gz) this.mtimes.set(f, fs.statSync(path.join(dir, f)).mtimeMs);
          const raw = fs.readFileSync(path.join(dir, f));
          this.merge(Number(f.split('.')[0]), JSON.parse((gz ? zlib.gunzipSync(raw) : raw).toString('utf8')), !gz);
        } catch (e) {
          log(`otp: no se pudo leer ${f} (${e.message})`);
        }
      }
    };
    readDir(this.bundledDir, true);
    readDir(this.dir, false);
    if (legacyFile) this.migrateLegacy(legacyFile);
  }

  // Archivo de un campeon para meterlo en la app (scripts/export-mains.js): sin el puuid propio de esta
  // clave, que en otro equipo no vale (alli se resuelve otra vez por el Riot ID)
  exportOf(id) {
    const f = this.fileOf(id);
    f.players = Object.fromEntries(Object.entries(f.players).map(([k, p]) => {
      const { apiPuuid, ...rest } = p;
      return [k, rest];
    }));
    return f;
  }

  // Campeones con datos (ficha o partidas)
  storedIds() {
    return [...new Set([...Object.keys(this.data.champs).map(Number), ...[...this.recs.entries()].filter(([, l]) => l.length).map(([id]) => id)])];
  }

  // otp.json (v1-v3): se conservan las partidas de esta season con el formato actual, sus jugadores y,
  // en v3, los campeones con sus mains
  migrateLegacy(file) {
    let d;
    try { d = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return; }
    const records = (d.records || []).filter(r => r.v === RECORD_VERSION && r.t >= SEASON_START);
    const byChamp = groupBy(records, r => r.c);
    const ids = new Set([...byChamp.keys(), ...Object.keys(d.champs || {}).map(Number)]);
    for (const id of ids) {
      const players = {};
      for (const [puuid, p] of Object.entries(d.players || {})) {
        if (p.champ !== id) continue;
        players[puuid] = d.version === DATA_VERSION ? p : { name: p.name || null, region: p.region, champ: p.champ, main: false };
      }
      this.merge(id, { champ: d.version === DATA_VERSION ? d.champs?.[id] : undefined, players, records: byChamp.get(id) || [] }, true);
      this.changed.add(id);
    }
    this.save();
    try { fs.renameSync(file, `${file}.old`); } catch { }
    log(`otp: otp.json pasado a archivos por campeón (${records.length} partidas de la season)`);
  }

  // Escribe solo los campeones que han cambiado (cache/mains/{id}.json). Primero en un temporal y luego se
  // renombra: el programa de fondo y la app nunca leen un archivo a medias
  save() {
    this.dirty = 0;
    if (!this.changed.size) return;
    try {
      fs.mkdirSync(this.dir, { recursive: true });
      for (const id of this.changed) {
        const file = path.join(this.dir, `${id}.json`);
        fs.writeFileSync(`${file}.tmp`, JSON.stringify(this.fileOf(id)));
        fs.renameSync(`${file}.tmp`, file);
        this.mtimes.set(`${id}.json`, fs.statSync(file).mtimeMs);
      }
      this.changed.clear();
    } catch (e) {
      log(`otp: no se pudo guardar (${e.message})`);
    }
  }

  // ---- Programa de fondo (scripts/mains-worker.js) ----
  // Mientras esta activo (bloqueo con latido cada minuto), la app no descarga: solo recarga lo que el
  // programa guarda y le pasa sus prioridades (el campeon que estas viendo y los tuyos)

  workerAlive() {
    try {
      const l = JSON.parse(fs.readFileSync(path.join(this.dir, LOCK_FILE), 'utf8'));
      if (Date.now() - l.at > LOCK_STALE) return false;
      process.kill(l.pid, 0);   // lanza si el proceso ya no existe
      return l.pid !== process.pid;
    } catch {
      return false;
    }
  }

  heartbeat() {
    if (Date.now() - (this.beatAt || 0) < 60000) return;
    this.beatAt = Date.now();
    try {
      fs.mkdirSync(this.dir, { recursive: true });
      fs.writeFileSync(path.join(this.dir, LOCK_FILE), JSON.stringify({ pid: process.pid, at: this.beatAt }));
    } catch { }
  }

  releaseLock() {
    try {
      const l = JSON.parse(fs.readFileSync(path.join(this.dir, LOCK_FILE), 'utf8'));
      if (l.pid === process.pid) fs.unlinkSync(path.join(this.dir, LOCK_FILE));
    } catch { }
  }

  // App -> programa de fondo: prioridades
  writeFocus() {
    const text = JSON.stringify({ focus: this.focus || null, priority: [...this.priority] });
    if (text === this.focusText) return;
    this.focusText = text;
    try { fs.writeFileSync(path.join(this.dir, FOCUS_FILE), text); } catch { }
  }

  readFocus() {
    try {
      const f = JSON.parse(fs.readFileSync(path.join(this.dir, FOCUS_FILE), 'utf8'));
      if (f.focus) this.focus = f.focus;
      for (const id of f.priority || []) this.priority.add(id);
    } catch { }
  }

  // Programa de fondo -> app: los campeones que ha guardado desde la ultima vez
  reloadChanged() {
    let names = [];
    try { names = fs.readdirSync(this.dir).filter(f => /^\d+\.json$/.test(f)); } catch { return; }
    for (const f of names) {
      try {
        const mtime = fs.statSync(path.join(this.dir, f)).mtimeMs;
        if (this.mtimes.get(f) === mtime) continue;
        this.mtimes.set(f, mtime);
        const id = Number(f.split('.')[0]);
        this.merge(id, JSON.parse(fs.readFileSync(path.join(this.dir, f), 'utf8')), true);
        this.emit('update', id);
      } catch { }
    }
  }

  // Todos los campeones con sus mains y su season descargada
  complete() {
    const ids = this.allIds();
    return ids.length > 0 && ids.every(id => this.isReady(id));
  }

  // Lo que se guarda de un campeon: su ficha (candidatos y mains), sus jugadores y sus partidas
  fileOf(id) {
    const players = Object.fromEntries(Object.entries(this.data.players).filter(([, p]) => p.champ === id));
    return { version: DATA_VERSION, champ: this.data.champs[id], players, records: this.recordsOf(id) };
  }

  // Resumen para Ajustes
  status() {
    const mains = Object.values(this.data.players).filter(p => p.main && !p.dropped);
    const ids = this.allIds();
    const ready = ids.filter(id => this.isReady(id)).length;
    const cur = this.current && this.data.champs[this.current];
    const curMains = (cur?.mains || []).map(id => this.data.players[id]).filter(Boolean);
    return {
      running: this.running && !this.paused, worker: this.watching, mains: mains.length, ready, total: ids.length,
      games: [...this.recs.values()].reduce((n, l) => n + l.length, 0),
      current: this.current ? {
        championId: this.current,
        fetched: curMains.reduce((n, p) => n + (p.fetched || 0), 0),
        season: curMains.reduce((n, p) => n + (p.season || 0), 0),
      } : null,
    };
  }

  // first: el campeon que estas viendo ahora (seleccion o explorador) va antes que el resto
  prioritize(ids, first = false) {
    for (const id of ids) if (id) this.priority.add(id);
    if (first && ids[0]) this.focus = ids[0];
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.loop().catch(e => log(`otp: ${e.message}`)).finally(() => { this.running = false; this.save(); });
  }

  stop() {
    this.running = false;
  }

  // Una peticion de fondo a la Riot API: espera mientras este en pausa o se acerque al limite de la clave
  async call(fn) {
    for (;;) {
      if (!this.running) throw new Error('detenido');
      if (!this.paused && this.riot.recentCount() < BG_BUDGET) break;
      if (this.isWorker) this.heartbeat();
      await new Promise(r => setTimeout(r, 3000));
    }
    if (this.isWorker) this.heartbeat();
    const out = await fn();
    if (++this.dirty >= 25) this.save();
    return out;
  }

  async loop() {
    while (this.running) {
      // Con el programa de fondo activo, la app solo recarga lo suyo y le pasa sus prioridades
      if (!this.isWorker && this.workerAlive()) {
        // Lo que la app tuviera sin guardar se descarta: manda lo que guarde el programa de fondo
        if (!this.watching) this.changed.clear();
        this.watching = true;
        this.writeFocus();
        this.reloadChanged();
        await new Promise(r => setTimeout(r, 60000));
        continue;
      }
      if (this.watching) { this.watching = false; this.reloadChanged(); }
      if (this.isWorker) { this.heartbeat(); this.readFocus(); }
      // Lista de campeones de Data Dragon (no hace falta el cliente de LoL)
      if (!this.riot.hasKey() || !this.allIds().length) { await this.sleep(60000); continue; }
      const did = await this.step().catch(e => { log(`otp: ${e.message}`); return 'error'; });
      if (did === 'error') await new Promise(r => setTimeout(r, 30000));
      // El programa de fondo termina cuando esta todo descargado (las actualizaciones siguen en la app)
      if (!did && this.isWorker && this.complete()) { this.emit('complete'); return; }
      // Todo al dia: se vuelve a mirar dentro de 10 min
      if (!did) await this.sleep(600000);
    }
  }

  // Espera que el programa de fondo corta en trozos para mantener vivo el bloqueo
  async sleep(ms) {
    const end = Date.now() + ms;
    while (this.running && Date.now() < end) {
      if (this.isWorker) this.heartbeat();
      await new Promise(r => setTimeout(r, Math.min(30000, end - Date.now())));
    }
  }

  allIds() {
    return (this.champions?.ddragon?.champions || []).map(c => c.id);
  }

  // Orden de trabajo: el que estas viendo, los prioritarios y el resto
  order() {
    return [...new Set([this.focus, ...this.priority, ...this.allIds()].filter(id => id && this.champions?.get(id)))];
  }

  mainsOf(championId) {
    return (this.data.champs[championId]?.mains || []).map(id => [id, this.data.players[id]]).filter(([, p]) => p && !p.dropped);
  }

  // Campeon con sus mains elegidos y su season descargada (o sin candidatos que valgan)
  isReady(championId) {
    const c = this.data.champs[championId];
    if (!c?.at) return false;
    const mains = this.mainsOf(championId);
    if (mains.some(([, p]) => p.queue?.length)) return false;
    return mains.length >= MAINS_PER_CHAMP || (c.candidates || []).every(x => x.tried);
  }

  // Hace una tarea pendiente (del primer campeon que la tenga); devuelve false si no habia nada
  async step() {
    const now = Date.now();
    for (const id of this.order()) {
      const c = this.data.champs[id] ||= { at: 0, candidates: [], mains: [] };
      this.current = id;
      // 1) Candidatos del leaderboard
      if (!c.at || now - c.at > BOARD_TTL) return this.discover(id, c);
      // 2) Partidas pendientes de sus mains
      const busy = this.mainsOf(id).find(([, p]) => p.queue?.length);
      if (busy) return this.fetchBatch(id, ...busy);
      // 3) Faltan mains: se prueba el siguiente candidato
      if (this.mainsOf(id).length < MAINS_PER_CHAMP) {
        const next = c.candidates.find(x => !x.tried);
        if (next) return this.vet(id, c, next);
      }
      // 4) Partidas nuevas de sus mains cada 3 dias
      const due = this.mainsOf(id).find(([, p]) => now - (p.refreshedAt || 0) > REFRESH_TTL);
      if (due) return this.refresh(...due);
    }
    this.current = null;
    return false;
  }

  // Top 10 del leaderboard de OP.GG en cada region, del que mas partidas tiene con el campeon al que menos
  async discover(championId, c) {
    const key = opgg.opggName(this.champions.get(championId).key);
    const list = [];
    for (const region of REGIONS) {
      try {
        const res = await opgg.callTool('lol_list_champion_leaderboard', { champion: key, region, desired_output_fields: BOARD_FIELDS });
        for (const e of res?.leaderboard || []) {
          if (e.summoner?.game_name) list.push({ name: e.summoner.game_name, tag: e.summoner.tagline, region, games: e.most_champion_stat?.play || 0 });
        }
      } catch (e) {
        log(`otp: leaderboard de ${key} en ${region}: ${e.message}`);
      }
    }
    // Se conserva lo ya probado de cada candidato
    const old = new Map((c.candidates || []).map(x => [`${x.name}#${x.tag}`, x]));
    c.candidates = list.sort((a, b) => b.games - a.games).map(x => ({ ...x, tried: old.get(`${x.name}#${x.tag}`)?.tried || false }));
    c.at = Date.now();
    log(`otp: ${this.champions.name(championId)}, ${c.candidates.length} candidatos en los leaderboards`);
    this.changed.add(championId);
    this.save();
    return true;
  }

  // Comprueba un candidato: existe, juega esta season y sigue activo. Si vale, se apuntan todas sus
  // partidas de la season para descargarlas
  async vet(championId, c, cand) {
    cand.tried = true;
    const [, routing] = PLATFORMS[cand.region];
    const acc = await this.call(() => this.riot.accountByRiotId(routing, cand.name, cand.tag)).catch(() => null);
    if (!acc?.puuid) return true;
    const recent = await this.call(() => this.riot.matchIdsSince(routing, acc.puuid, Math.floor((Date.now() - ACTIVE_DAYS * 864e5) / 1000), 0, 1));
    if (!recent?.length) { log(`otp: ${cand.name}#${cand.tag} no juega desde hace ${ACTIVE_DAYS} días`); return true; }
    const ids = [];
    for (let start = 0; ; start += 100) {
      const page = await this.call(() => this.riot.matchIdsSince(routing, acc.puuid, Math.floor(SEASON_START / 1000), start, 100)) || [];
      ids.push(...page);
      if (page.length < 100) break;
    }
    if (ids.length < MIN_SEASON_GAMES) { log(`otp: ${cand.name}#${cand.tag}, solo ${ids.length} clasificatorias esta season`); return true; }
    // Las ya guardadas (de antes) no se vuelven a descargar
    const have = new Set(this.recordsOf(championId).filter(r => r.p === acc.puuid).map(r => r.m));
    this.data.players[acc.puuid] = {
      name: `${acc.gameName}#${acc.tagLine}`, region: cand.region, champ: championId, main: true,
      season: ids.length, queue: ids.filter(id => !have.has(id)), recent: ids.slice(0, 100),
      fetched: have.size, onChamp: have.size, refreshedAt: Date.now(),
    };
    c.mains = [...new Set([...(c.mains || []), acc.puuid])];
    log(`otp: ${this.champions.name(championId)}, main ${acc.gameName}#${acc.tagLine} (${cand.region}): ${ids.length} clasificatorias esta season`);
    this.changed.add(championId);
    this.save();
    this.emit('update', championId);
    return true;
  }

  // puuid de un main valido para la clave de este equipo. Los puuid estan cifrados por clave: los de los
  // datos que vienen con la app (descargados con otra clave) dan 400, y se resuelven por su Riot ID.
  // Las partidas siguen guardadas con el puuid original del main
  async keyPuuid(puuid, p) {
    if (p.apiPuuid) return p.apiPuuid;
    const [, routing] = PLATFORMS[p.region];
    const probe = await this.call(() => this.riot.matchIdsSince(routing, puuid, Math.floor(Date.now() / 1000) - 60, 0, 1)).catch(e => e);
    if (!(probe instanceof Error)) return (p.apiPuuid = puuid);
    if (!/400/.test(probe.message) || !p.name) throw probe;
    const [gameName, tagLine] = p.name.split('#');
    const acc = await this.call(() => this.riot.accountByRiotId(routing, gameName, tagLine));
    if (!acc?.puuid) throw new Error(`no se encuentra a ${p.name}`);
    return (p.apiPuuid = acc.puuid);
  }

  // Descarga unas cuantas partidas pendientes de un main
  async fetchBatch(championId, puuid, p) {
    const [, routing] = PLATFORMS[p.region];
    const own = await this.keyPuuid(puuid, p);
    for (let n = 0; n < PER_STEP && p.queue.length; n++) {
      const id = p.queue.shift();
      const m = await this.call(() => this.riot.matchOn(routing, id)).catch(() => null);
      p.fetched = (p.fetched || 0) + 1;
      const rec = summarize(m, own, puuid);
      if (rec && rec.c === p.champ) { this.recordsOf(championId).push(rec); p.onChamp = (p.onChamp || 0) + 1; }
    }
    this.changed.add(championId);
    // Ya no lo juega lo suficiente: deja de ser main (sus partidas con el campeon se quedan)
    if (p.fetched >= MIN_SHARE_AFTER && p.onChamp / p.fetched < MIN_SHARE) {
      p.dropped = true;
      p.queue = [];
      log(`otp: ${p.name} solo juega ${this.champions.name(championId)} en ${p.onChamp} de ${p.fetched} partidas: descartado`);
    }
    if (!p.queue.length) log(`otp: ${p.name}, season descargada (${p.onChamp} partidas con ${this.champions.name(championId)})`);
    // Avisos a la interfaz cada 50 partidas y al acabar
    if (!p.queue.length || p.fetched % 50 < PER_STEP) { this.save(); this.emit('update', championId); }
    return true;
  }

  async refresh(puuid, p) {
    const [, routing] = PLATFORMS[p.region];
    const own = await this.keyPuuid(puuid, p);
    const since = Math.floor(((p.refreshedAt || SEASON_START) - 3600e3) / 1000);
    const ids = await this.call(() => this.riot.matchIdsSince(routing, own, since, 0, 100)) || [];
    this.changed.add(p.champ);
    const seen = new Set(p.recent || []);
    const fresh = ids.filter(id => !seen.has(id));
    p.queue = [...(p.queue || []), ...fresh];
    p.recent = [...fresh, ...(p.recent || [])].slice(0, 100);
    p.season = (p.season || 0) + fresh.length;
    p.refreshedAt = Date.now();
    return true;
  }

  // Estado de un campeon en un rol (para avisar en la interfaz si aun no hay builds)
  summary(championId, role) {
    const c = this.data.champs[championId];
    const mains = this.mainsOf(championId).map(([, p]) => p);
    const recs = this.recordsOf(championId).filter(r => r.r === role);
    const since = Date.now() - BUILD_DAYS * 864e5;
    const pending = this.order().filter(id => !this.isReady(id));
    return {
      state: !c?.at ? 'waiting' : mains.some(p => p.queue?.length) ? 'downloading' : mains.length ? 'ready' : this.isReady(championId) ? 'none' : 'vetting',
      queuePos: Math.max(0, pending.indexOf(championId)) + 1,
      mains: mains.map(p => ({ name: p.name, region: p.region, fetched: p.fetched || 0, season: p.season || 0, onChamp: p.onChamp || 0 })),
      games: recs.filter(r => r.t >= since).length, seasonGames: recs.length, minGames: MIN_GAMES,
      running: this.running && !this.paused,
    };
  }

  // Builds de los mains de un campeon en un rol (forma de coherentBuilds); items: objetos de Data Dragon
  options(championId, role, items = {}) {
    const since = Date.now() - BUILD_DAYS * 864e5;
    const recs = this.recordsOf(championId).filter(r => r.r === role && r.t >= since);
    if (recs.length < MIN_GAMES) return [];
    // Una build por piedra angular con al menos el 25 % de las partidas (como mucho dos)
    const groups = groupBy(recs, r => r.k[0]);
    return [...groups.values()].sort((a, b) => b.length - a.length)
      .filter(g => g.length >= Math.max(4, recs.length * 0.25)).slice(0, 2)
      .map(g => buildOf(g, items, recs.length, this.data.players));
  }

  // Los mains de un campeon contra un rival concreto en un rol, en toda la season: partidas, % de
  // victorias, la pagina de runas que mas usan en ese enfrentamiento y sus ultimas partidas
  matchup(championId, role, vsId) {
    const recs = this.recordsOf(championId).filter(r => r.r === role && r.o === vsId);
    if (!recs.length) return null;
    const wins = recs.reduce((n, r) => n + r.w, 0);
    const pages = groupBy(recs, r => JSON.stringify([r.s, r.k]));
    const [pageKey, pageRecs] = [...pages.entries()].sort((a, b) => b[1].length - a[1].length)[0];
    const [styles, perks] = JSON.parse(pageKey);
    return {
      games: recs.length, wins, winRate: wins / recs.length,
      players: playersOf(recs, this.data.players),
      runes: { primaryStyle: styles[0], subStyle: styles[1], perks }, runeGames: pageRecs.length,
      runeWinRate: pageRecs.reduce((n, r) => n + r.w, 0) / pageRecs.length,
      matches: matchesOf(recs, this.data.players),
    };
  }
}

// Resumen de una partida de match-v5 para el jugador puuid (o null si no es de la Grieta). as: id con el
// que se guarda (el puuid original del main si el de esta clave es otro)
function summarize(m, puuid, as = puuid) {
  const info = m?.info;
  const me = info?.participants?.find(x => x.puuid === puuid);
  if (!me || info.queueId !== 420 || info.gameDuration < 900) return null;
  const [prim, sec] = me.perks?.styles || [];
  const perks = [...(prim?.selections || []), ...(sec?.selections || [])].map(s => s.perk);
  const shards = SHARD_ORDER.map(k => me.perks?.statPerks?.[k]).filter(Boolean);
  if (perks.length !== 6 || shards.length !== 3) return null;
  // Rival de su linea: el enemigo con la misma posicion
  const opp = me.teamPosition && info.participants.find(x => x.teamId !== me.teamId && x.teamPosition === me.teamPosition);
  return {
    v: RECORD_VERSION, o: opp?.championId || 0,
    m: m.metadata?.matchId, p: as, c: me.championId, r: ROLE_FROM_POSITION[me.teamPosition] || '',
    w: me.win ? 1 : 0, t: info.gameCreation,
    s: [prim.style, sec.style], k: [...perks, ...shards],
    sp: [me.summoner1Id, me.summoner2Id],
    // Huecos 0-5 en orden: un objeto nuevo va al primer hueco libre, asi que se parece al orden de compra
    i: [0, 1, 2, 3, 4, 5].map(n => me[`item${n}`] || 0),
  };
}

function groupBy(list, key) {
  const out = new Map();
  for (const x of list) {
    const k = key(x);
    if (!out.has(k)) out.set(k, []);
    out.get(k).push(x);
  }
  return out;
}

// Lo mas repetido de una lista de valores (las listas se comparan como texto)
function mode(values) {
  const count = new Map();
  for (const v of values) { const k = JSON.stringify(v); count.set(k, (count.get(k) || 0) + 1); }
  const best = [...count.entries()].sort((a, b) => b[1] - a[1])[0];
  return best ? JSON.parse(best[0]) : null;
}

// Jugadores de unas partidas, del que mas aporta al que menos
function playersOf(recs, players) {
  return [...groupBy(recs, r => r.p).entries()].map(([puuid, list]) => ({
    name: players[puuid]?.name || null, region: players[puuid]?.region || '',
    games: list.length, wins: list.reduce((n, r) => n + r.w, 0),
  })).sort((a, b) => b.games - a.games);
}

// Partidas concretas (las mas recientes): rival de linea, resultado, runas, hechizos y objetos
function matchesOf(recs, players) {
  return [...recs].sort((a, b) => b.t - a.t).slice(0, MATCHES_SHOWN).map(r => ({
    id: r.m, name: players[r.p]?.name || null, region: players[r.p]?.region || '',
    vs: r.o || null, win: !!r.w, t: r.t,
    runes: { primaryStyle: r.s[0], subStyle: r.s[1], perks: r.k }, spells: r.sp, items: r.i.filter(Boolean),
  }));
}

// players: { puuid: { name, region } } para poner nombre a los mains de la build
function buildOf(recs, items, total, players = {}) {
  const wins = recs.reduce((n, r) => n + r.w, 0);
  // Pagina: las 6 runas mas repetidas con esa piedra angular, y los fragmentos mas repetidos
  const page = mode(recs.map(r => [r.s, r.k.slice(0, 6)]));
  const shards = mode(recs.map(r => r.k.slice(6)));
  const spells = mode(recs.map(r => [...r.sp].sort((a, b) => a - b)));
  // Objetos: frecuencia y hueco medio de cada legendario y de cada bota
  const stats = new Map();
  for (const r of recs) {
    r.i.forEach((id, slot) => {
      if (!id || !items[id]) return;
      const s = stats.get(id) || { n: 0, slot: 0 };
      s.n++; s.slot += slot;
      stats.set(id, s);
    });
  }
  const finals = [...stats.entries()].filter(([id]) => isFinal(id, items[id])).sort((a, b) => b[1].n - a[1].n);
  const core = finals.slice(0, 3).sort((a, b) => a[1].slot / a[1].n - b[1].slot / b[1].n).map(([id]) => id);
  const boots = [...stats.entries()].filter(([id]) => +id !== 1001 && items[id]?.tags?.includes('Boots'))
    .sort((a, b) => b[1].n - a[1].n).slice(0, 2).map(([id]) => id);
  const situational = finals.slice(3, 9).map(([id]) => id);
  const kind = coreKind(core, items);
  const popularity = new Map(finals.map(([id, s]) => [id, s.n]));
  // Todos los objetos que llevan (para la mejora del objeto de apoyo, que no es legendario)
  const bought = new Map([...stats.entries()].map(([id, s]) => [+id, s.n]));
  const names = playersOf(recs, players);
  return {
    kind, label: `Mains · ${NAMES[kind] || 'Build'}`,
    keystone: page[1][0],
    runes: { primaryStyle: page[0][0], subStyle: page[0][1], perks: [...page[1], ...shards] },
    core, boots, situational, starter: [], spells,
    context: contextItems(kind, items, popularity, core),
    support: supportUpgrades(items, bought), supportTop: supportTopOf(items, bought),
    games: recs.length, winRate: wins / recs.length,
    runeGames: recs.length, runeWinRate: wins / recs.length,
    otp: { players: names.length, names, games: recs.length, share: recs.length / total, matches: matchesOf(recs, players) },
  };
}

module.exports = { OtpBuilds, summarize, buildOf, SEASON_START };
