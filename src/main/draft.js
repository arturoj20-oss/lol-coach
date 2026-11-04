// Seleccion de campeones: picks recomendados para tu rol, build del campeon que llevas
// e importacion de runas, hechizos y set de objetos al cliente.
const { EventEmitter } = require('events');
const fs = require('fs');
const path = require('path');
const opgg = require('./opgg');
const { coherentBuilds, MIN_GUIDE_GAMES, tagBuilds, mergeBuilds, enemyContext, itemLayout, supportStarter, supportUpgrades } = require('./buildsets');
const ugg = require('./ugg');
const { matchupCheck } = require('./matchup');
const { log } = require('./log');
const { mapLimit, pct, ROLE_FROM_POSITION, ROLE_NAMES, RIFT_QUEUES, laneToRole } = require('./util');

const TIER_BONUS = { 1: 1.5, 2: 0.75, 3: 0, 4: -0.5, 5: -1 };
const FLASH = 4;
const MAX_PICKS = 8;

// Set de objetos de la tienda del juego (/lol-item-sets/v1/item-sets/{summonerId}/sets; con el puuid
// la LCU responde 400). uid fijo con formato UUID, como los que crea el propio cliente; 'lol-coach'
// es el de versiones anteriores y se sustituye
const ITEM_SET_UID = '1c0ac4e0-1c0a-4c0a-9c0a-00000001c0ac';
const OLD_ITEM_SET_UIDS = ['lol-coach'];
const JUNGLE_PETS = [1101, 1102, 1103];                  // Garra ignea, Caminabrisas, Brincamontes
const CONSUMABLES = [2003, 2031, 2055, 2138, 2139, 2140]; // pociones, guardian de control, elixires
const TRINKETS = [3340, 3364, 3363];                      // abalorios

// Set de objetos a partir de una build (funcion pura: se puede probar sin cliente). Bloques al estilo
// Blitz (ver itemLayout); items: objetos de Data Dragon (componentes); label: nombre de la build elegida
function itemSetFor(build, champName, roleName, items = {}, label = '') {
  // merge: los repetidos (p. ej. dos pociones) se juntan en count; en el orden de compra no, para
  // conservar la secuencia (dos tomos amplificadores salen como dos casillas)
  const block = (type, ids, merge = true) => {
    const list = [];
    for (const id of ids) {
      const it = merge && list.find(x => x.id === String(id));
      if (it) it.count++;
      else list.push({ id: String(id), count: 1 });
    }
    return { type, hideIfSummonerSpell: '', showIfSummonerSpell: '', items: list };
  };
  const lay = itemLayout(build, items);
  const starter = [...lay.starter];
  // En jungla, las tres mascotas si OP.GG no trae ninguna
  if (build.role === 'jungle' && !starter.some(id => JUNGLE_PETS.includes(id))) starter.unshift(...JUNGLE_PETS);
  // En support, el objeto de apoyo (OP.GG y U.GG no lo traen en el inicial) y su mejora final: la mas
  // jugada entra en la build final (ocupa un hueco) y hay un bloque con todas las mejoras
  let final = lay.final, situational = lay.situational, upgrades = [];
  if (build.role === 'support') {
    const atlas = supportStarter(items);
    if (!starter.includes(atlas)) starter.unshift(atlas);
    upgrades = build.support?.length ? build.support : supportUpgrades(items);
    const top = build.supportTop;
    if (top) {
      final = [top, ...lay.final.filter(id => id !== top)].slice(0, 6);
      situational = [...lay.final.filter(id => !final.includes(id)), ...lay.situational];
    }
  }
  const role = roleName ? ` (${roleName[0].toUpperCase()}${roleName.slice(1)})` : '';
  return {
    uid: ITEM_SET_UID,
    title: `LoL Coach: ${label ? `${label} ` : ''}${champName}${role}`,
    // Set global (sin campeon ni mapa), como el que crea iTero: los sets asociados a un campeon no le
    // aparecian al usuario en la tienda; el global se sobrescribe en cada seleccion
    associatedChampions: [], associatedMaps: [], map: '', mode: 'any',
    preferredItemSlots: [], sortrank: 0, startedFrom: 'blank', type: 'custom',
    blocks: [
      block('Objetos iniciales', starter),
      block('Orden de compra', lay.order, false),
      block('Build final', final),
      block(build.supportTop ? 'Mejoras del objeto de apoyo (la más jugada primero)' : 'Mejoras del objeto de apoyo', upgrades),
      block('Situacionales que también van bien', situational),
      block('Opciones de botas', lay.boots),
      // Un bloque por contexto ("Si te hacen mucho daño mágico", "Contra curaciones"...): primero y
      // marcados los que pide el equipo enemigo
      ...[...(build.context || [])]
        .sort((a, b) => (build.enemyFlags || []).includes(b.key) - (build.enemyFlags || []).includes(a.key))
        .map(g => block(`${(build.enemyFlags || []).includes(g.key) ? '★ Recomendado: ' : ''}${g.label}`, g.items)),
      block('Consumibles y abalorios', [...CONSUMABLES, ...TRINKETS]),
    ].filter(x => x.items.length),
  };
}

// Respuesta del GET + nuestro set: se conservan los sets del jugador y se cambia solo el nuestro. El
// de iTero se quita siempre (decision del usuario). mine = null: solo quitar el nuestro y el de iTero
const isIteroSet = s => /^iTero\b/i.test(s.title || '');
function mergeItemSets(current, mine) {
  // Sin una lectura valida no se escribe: un PUT con la lista vacia borraria los sets del jugador
  if (!current || !Array.isArray(current.itemSets)) throw new Error('respuesta inesperada al leer los sets de objetos');
  const others = current.itemSets.filter(s => s.uid !== ITEM_SET_UID && !OLD_ITEM_SET_UIDS.includes(s.uid) && !isIteroSet(s));
  return { ...current, itemSets: mine ? [mine, ...others] : others, timestamp: Date.now() };
}

// Archivo del set para Config/Global/Recommended. La tienda ordena esos archivos por nombre (los del
// cliente son RIOT_ItemSet_N.json; Blitz usa !!!blitz-N.json con priority y sortrank 1e9): con
// !!!! delante y sortrank mayor, el nuestro sale el primero
const ITEM_SET_FILE = '!!!!lol-coach.json';
function itemSetFile(mine) {
  const { uid, ...rest } = mine;
  return { ...rest, map: 'any', mode: 'any', priority: true, sortrank: 2000000000 };
}

function emptyState() {
  return {
    active: false, role: '', myChampionId: null, locked: false,
    turn: null, phase: '',
    allies: [], enemies: [], bans: { ally: [], enemy: [] },
    picks: [], build: null,
    choice: 0,   // build elegida (indice en build.options)
    matchup: null,   // { vs, winRate, games, patch }: tu campeon contra tu rival de linea (U.GG)
    matchupCheck: null,   // comparativa y consejos del enfrentamiento (matchup.js)
    imported: { runes: null, spells: null, items: null, message: '' },
    loading: false, error: null,
  };
}

// Orden en que se maximizan Q/W/E segun el orden de subida de habilidades
function skillPriority(order) {
  const fifth = k => {
    let n = 0;
    for (let i = 0; i < order.length; i++) if (order[i] === k && ++n === 5) return i;
    return 99 + 'QWE'.indexOf(k);
  };
  return ['Q', 'W', 'E'].sort((a, b) => fifth(a) - fifth(b));
}

function buildFrom(data, championId, role) {
  const runes = data.runes;
  const ids = x => (x && x.ids) || [];
  const core = ids(data.core_items);
  const situationalAll = [...new Set([...(data.fourth_items || []), ...(data.fifth_items || [])].flatMap(ids))];
  const situational = situationalAll.filter(id => !core.includes(id)).slice(0, 6);
  const order = data.skills?.order || data.skill_masteries?.builds?.[0]?.order || [];
  return {
    championId, role,
    games: runes?.play || 0,
    winRate: runes?.play ? runes.win / runes.play : null,
    runes: runes ? {
      primaryStyle: runes.primary_page_id, subStyle: runes.secondary_page_id,
      perks: [...runes.primary_rune_ids, ...runes.secondary_rune_ids, ...runes.stat_mod_ids],
    } : null,
    spells: ids(data.summoner_spells),
    skillOrder: order,
    skillPriority: order.length ? skillPriority(order) : [],
    starter: ids(data.starter_items),
    core,
    // Partidas y victorias del nucleo en el analisis general (respaldo si la guia contra el rival tiene poca muestra)
    corePlay: data.core_items?.play || null, coreWin: data.core_items?.win ?? null,
    boots: ids(data.boots),
    situational,
    situationalAll,
  };
}

// Build con la opcion elegida aplicada (cada opcion es una build completa y coherente: runas, nucleo,
// botas y situacionales del mismo tipo de dano; ver buildsets.js)
// Las opciones pueden venir de OP.GG o de U.GG: cada una trae tambien sus hechizos, inicial y habilidades
function applyChoice(build, index) {
  const o = build.options?.[index];
  if (!o) return build;
  const own = (k) => (o[k]?.length ? o[k] : build[k]);
  return {
    ...build, runes: o.runes || build.runes, core: o.core, boots: o.boots, situational: o.situational, context: o.context || [],
    support: o.support || [], supportTop: o.supportTop || null,
    spells: own('spells'), starter: own('starter'), skillOrder: own('skillOrder'), skillPriority: own('skillPriority'),
  };
}

// 6 runas + 3 fragmentos; si la fuente no trae los fragmentos se ponen los mas comunes
// (adaptativo, adaptativo, vida)
const DEFAULT_SHARDS = [5008, 5008, 5011];
function completePerks(perks = []) {
  const ids = perks.map(Number).filter(Boolean);
  return ids.length === 6 ? [...ids, ...DEFAULT_SHARDS] : ids;
}

// Indice de la opcion con esa clave (para conservar lo elegido al recargar), o -1
const optionIndex = (options, key) => (key ? (options || []).findIndex(o => o.key === key) : -1);
const UGG_WAIT = 8000;   // ms que se espera a U.GG antes de mostrar solo las de OP.GG
const ITEM_REIMPORT_WAIT = 6000;   // ms sin cambios en los enemigos antes de reescribir el set

class Draft extends EventEmitter {
  constructor(lcu, champions, config) {
    super();
    this.lcu = lcu;
    this.champions = champions;
    this.config = config;
    this.state = emptyState();
    this.session = null;
    this.signature = null;
    this.buildKey = null;
    this.computing = false;
    this.dirty = false;
    this.importedFor = null;
    this.lastItemSet = null;   // JSON del ultimo set escrito (para no repetir el mismo)
    this.importQueue = Promise.resolve();   // las importaciones van de una en una
    this.itemTimer = null;
    this.personal = null;   // { at, stats: Map(id -> { games, wins, roles }) }
  }

  emitState() {
    this.emit('change', this.state);
  }

  start() {
    this.state = { ...emptyState(), active: true, loading: true };
    this.signature = null;
    this.buildKey = null;
    this.importedFor = null;
    this.lastItemSet = null;
    clearTimeout(this.itemTimer);
    this.itemTimer = null;
    this.personalStats();   // que el historial este listo cuanto antes
    this.emitState();
  }

  // Al salir de la seleccion se conserva la build (la usa el overlay de partida)
  stop() {
    if (!this.state.active) return;
    // Si quedaba una reimportacion de objetos pendiente, se hace ya, antes de entrar en partida
    if (this.itemTimer) this.flushItemReimport();
    this.state = { ...this.state, active: false, loading: false };
    this.session = null;
    this.emitState();
  }

  // Tras jugar una partida, el historial cambia
  clearPersonal() {
    this.personal = null;
  }

  // Tus campeones y roles en tus ultimas 100 partidas de la Grieta (historial del cliente)
  async personalStats() {
    if (this.personal && Date.now() - this.personal.at < 10 * 60 * 1000) return this.personal.stats;
    const stats = new Map();
    try {
      const list = await this.lcu.request('GET',
        '/lol-match-history/v1/products/lol/current-summoner/matches?begIndex=0&endIndex=100', undefined, 20000);
      for (const g of list?.games?.games || []) {
        if (!RIFT_QUEUES.includes(g.queueId) || g.gameDuration < 300) continue;
        const me = g.participants?.[0];
        if (!me) continue;
        let s = stats.get(me.championId);
        if (!s) stats.set(me.championId, s = { games: 0, wins: 0, roles: {} });
        s.games++;
        if (me.stats?.win) s.wins++;
        const role = laneToRole(me.timeline);
        if (role) s.roles[role] = (s.roles[role] || 0) + 1;
      }
    } catch (e) {
      log(`historial para el draft: ${e.message}`);
    }
    this.personal = { at: Date.now(), stats };
    return stats;
  }

  // Tus campeones en un rol, del mas jugado al menos (para el coach de la seleccion)
  async pool(role, max = 8) {
    return [...(await this.personalStats()).entries()]
      .filter(([, s]) => s.roles[role])
      .sort((a, b) => b[1].games - a[1].games).slice(0, max)
      .map(([championId, s]) => ({ championId, games: s.games, wins: s.wins }));
  }

  // Rol mas jugado en tu historial
  async mainRole() {
    const totals = {};
    for (const s of (await this.personalStats()).values()) {
      for (const [r, n] of Object.entries(s.roles)) totals[r] = (totals[r] || 0) + n;
    }
    return Object.entries(totals).sort((a, b) => b[1] - a[1])[0]?.[0] || 'mid';
  }

  // Se llama en cada vuelta del bucle con la sesion de la seleccion
  async update(session, manualRole) {
    this.session = session;
    const cells = new Set((session.myTeam || []).map(p => p.cellId));
    const actions = (session.actions || []).flat();
    const me = (session.myTeam || []).find(p => p.cellId === session.localPlayerCellId);
    const myPick = actions.find(a => a.actorCellId === session.localPlayerCellId && a.type === 'pick');

    const role = manualRole || ROLE_FROM_POSITION[me?.assignedPosition] || this.state.role || await this.mainRole();
    const allies = (session.myTeam || []).map(p => ({
      cellId: p.cellId, championId: p.championId || p.championPickIntent || 0,
      position: ROLE_FROM_POSITION[p.assignedPosition] || '', isMe: p.cellId === session.localPlayerCellId,
    }));
    const enemies = (session.theirTeam || []).map(p => ({ cellId: p.cellId, championId: p.championId || 0 }));
    const doneBans = actions.filter(a => a.type === 'ban' && a.completed && a.championId > 0);
    const bans = {
      ally: [...new Set([...(session.bans?.myTeamBans || []), ...doneBans.filter(a => cells.has(a.actorCellId)).map(a => a.championId)])].filter(id => id > 0),
      enemy: [...new Set([...(session.bans?.theirTeamBans || []), ...doneBans.filter(a => !cells.has(a.actorCellId)).map(a => a.championId)])].filter(id => id > 0),
    };
    const myChampionId = me?.championId || myPick?.championId || me?.championPickIntent || null;
    const locked = !!(myPick?.completed && myPick.championId);
    // Accion tuya en curso: 'ban' | 'pick' | null
    const turn = actions.find(a => a.actorCellId === session.localPlayerCellId && a.isInProgress && !a.completed)?.type || null;
    const phase = { PLANNING: 'planificación', BAN_PICK: 'baneos y picks', FINALIZATION: 'últimos segundos' }[session.timer?.phase] || '';

    Object.assign(this.state, { role, allies, enemies, bans, myChampionId, locked, turn: turn === 'ban' || turn === 'pick' ? turn : null, phase });

    const signature = JSON.stringify([role, allies.map(a => [a.championId, a.position]), enemies.map(e => e.championId), bans]);
    if (signature !== this.signature) {
      this.signature = signature;
      this.recomputePicks();
    }
    // Las alternativas dependen del rival, asi que la build se recarga al revelarse enemigos
    const enemyIds = enemies.map(e => e.championId).filter(id => id > 0);
    if (!myChampionId) { this.state.matchup = null; this.state.matchupCheck = null; }
    const buildKey = `${myChampionId}|${role}|${enemyIds.join(',')}`;
    if (myChampionId && buildKey !== this.buildKey) {
      this.buildKey = buildKey;
      this.loadBuild(myChampionId, role, enemyIds, buildKey);
      this.loadMatchup(myChampionId, role, enemyIds, buildKey);
    }
    // Importar al bloquear (una vez por campeon)
    const { autoImport } = this.config.get();
    if (locked && this.state.build?.championId === myChampionId && this.importedFor !== myChampionId &&
        (autoImport.runes || autoImport.spells || autoImport.items)) {
      this.importedFor = myChampionId;
      this.importBuild({ ...autoImport, auto: true }).catch(e => log(`importar: ${e.message}`));
    }
    this.emitState();
  }

  async loadBuild(championId, role, enemyIds = [], token = this.buildKey) {
    const key = this.champions.get(championId)?.key;
    if (!key) return;
    // U.GG en paralelo (segunda fuente de builds); su fallo no impide la build de OP.GG
    const uggP = ugg.uggBuilds(championId, role, this.champions.ddragon || {})
      .catch(e => { log(`builds U.GG de ${key}: ${e.message}`); return null; });
    try {
      const data = await opgg.championAnalysis(key, role);
      if (this.buildKey !== token) return;
      const build = buildFrom(data, championId, role);
      // Builds coherentes con la guia contra tu rival de linea (o el mas jugado del rol si aun no se ve)
      let guide = null;
      try {
        const vs = await this.laneOpponent(role, enemyIds, championId);
        if (vs) { guide = await opgg.matchupGuide(key, role, this.champions.get(vs).key); build.vs = vs; }
      } catch (e) {
        log(`alternativas de ${key}: ${e.message}`);
      }
      if (this.buildKey !== token) return;
      const opggOptions = tagBuilds(coherentBuilds(build, guide, this.champions.ddragon?.items || {}, MIN_GUIDE_GAMES), build, 'opgg');
      // Builds de OTP (Challenger y Gran Maestro) si hay partidas suficientes; si no, se piden para la proxima
      this.otp?.prioritize([championId], true);
      const otpOptions = this.otp ? tagBuilds(this.otp.options(championId, role, this.champions.ddragon?.items || {}), build, 'otp') : [];
      // Una sola lista de builds: OP.GG primero y luego las de U.GG que no repitan piedra angular y nucleo.
      // Si U.GG tarda, se muestran ya las de OP.GG y las suyas se anaden al final al llegar
      const late = Symbol('late');
      const u = await Promise.race([uggP, new Promise(r => setTimeout(() => r(late), UGG_WAIT))]);
      if (this.buildKey !== token) return;
      build.options = mergeBuilds(opggOptions, u && u !== late ? u.options : [], otpOptions);
      // Como va la recopilacion OTP de este campeon (aviso si aun no hay builds)
      build.otpInfo = this.otp?.running ? this.otp.summary(championId, role) : null;
      if (u === late) uggP.then(x => this.appendBuilds(x, token));
      // Grupos de objetos que pide el equipo enemigo (mucho dano magico, fisico, tanques)
      build.enemyFlags = enemyContext(enemyIds, this.champions);
      // Se conserva lo elegido si solo cambia el rival (la misma build si sigue en la lista)
      const same = this.state.build?.championId === championId;
      const prevKey = same ? this.state.build.options?.[this.state.choice]?.key : null;
      const byKey = optionIndex(build.options, prevKey);
      const keep = byKey >= 0 ? byKey : same ? this.state.choice : 0;
      this.state.choice = Math.max(0, Math.min(Number(keep) || 0, build.options.length - 1));
      const prevFlags = this.state.build?.championId === championId ? (this.state.build.enemyFlags || []).join() : null;
      this.state.build = applyChoice(build, this.state.choice);
      // Ya importado al bloquear y se han revelado enemigos que cambian lo recomendado: se actualiza
      // el set de la tienda para que entre en la partida con los objetos adecuados. Con el equipo a
      // medias los grupos cambian a cada revelacion, asi que se espera a que se asiente
      if (this.state.locked && this.importedFor === championId && this.config.get().autoImport?.items &&
          prevFlags !== null && prevFlags !== build.enemyFlags.join()) {
        this.scheduleItemReimport();
      }
    } catch (e) {
      log(`build de ${key}: ${e.message}`);
      if (this.buildKey === token) this.state.build = null;
    }
    this.emitState();
  }

  // Reimportacion de objetos agrupada: una sola escritura cuando dejan de revelarse enemigos
  scheduleItemReimport() {
    clearTimeout(this.itemTimer);
    this.itemTimer = setTimeout(() => this.flushItemReimport(), ITEM_REIMPORT_WAIT);
  }

  flushItemReimport() {
    clearTimeout(this.itemTimer);
    this.itemTimer = null;
    this.importBuild({ items: true, auto: true }).catch(e => log(`objetos (rival revelado): ${e.message}`));
  }

  // Nuevas partidas OTP de tu campeon: se rehace solo el grupo OTP de la lista, sin perder la elegida
  refreshOtp(championId) {
    const b = this.state.build;
    if (!this.otp || !b || b.championId !== championId) return;
    const prevKey = b.options?.[this.state.choice]?.key;
    const others = (b.options || []).filter(o => o.source !== 'otp').map(o => ({ ...o, sources: (o.sources || []).filter(s => s !== 'otp'), otp: undefined }));
    const otpOptions = tagBuilds(this.otp.options(championId, b.role, this.champions.ddragon?.items || {}), b, 'otp');
    const options = mergeBuilds(others, otpOptions);
    const idx = optionIndex(options, prevKey);
    this.state.choice = idx >= 0 ? idx : 0;
    this.state.build = { ...b, options, otpInfo: this.otp.summary(championId, b.role) };
    this.emitState();
  }

  // Builds de U.GG que llegan tarde: se anaden al final para no mover el indice de la elegida
  appendBuilds(u, token) {
    const b = this.state.build;
    if (!u?.options?.length || this.buildKey !== token || !b) return;
    const options = mergeBuilds(b.options || [], u.options);
    if (options.length === (b.options || []).length) return;
    this.state.build = { ...b, options };
    this.emitState();
  }

  // % de victorias de tu campeon contra tu rival de linea (U.GG, Esmeralda+), si ya se ve
  async loadMatchup(championId, role, enemyIds, token) {
    let matchup = null;
    try {
      matchup = await ugg.laneMatchup(championId, role, enemyIds);
    } catch (e) {
      log(`enfrentamiento: ${e.message}`);
    }
    if (this.buildKey !== token) return;
    this.state.matchup = matchup;
    this.emitState();
    // Chequeo comparativo y consejos contra tu rival de linea (solo si ya se ve)
    let check = null;
    try {
      const vs = matchup?.vs || await this.visibleOpponent(role, enemyIds);
      if (vs) check = await matchupCheck(this.champions, championId, vs, role, matchup, this.otp);
    } catch (e) {
      log(`chequeo del enfrentamiento: ${e.message}`);
    }
    if (this.buildKey !== token) return;
    this.state.matchupCheck = check;
    this.emitState();
  }

  // Enemigo visible que mas juega tu rol (null si ninguno lo juega de verdad)
  async visibleOpponent(role, enemyIds) {
    if (!enemyIds.length) return null;
    const meta = await opgg.laneMeta(role).catch(() => []);
    const rate = id => meta.find(m => this.champions.idFromEnglish(m.champion) === id)?.role_rate ?? 0;
    const best = enemyIds.map(id => ({ id, r: rate(id) })).sort((a, b) => b.r - a.r)[0];
    return best && best.r > 0.2 ? best.id : null;
  }

  // Rival de tu linea: el enemigo visible que mas juega tu rol; si no hay, el mas jugado del rol
  async laneOpponent(role, enemyIds, myId) {
    const meta = await opgg.laneMeta(role).catch(() => []);
    const idOf = m => this.champions.idFromEnglish(m.champion);
    const rate = id => meta.find(m => idOf(m) === id)?.role_rate ?? 0;
    const seen = enemyIds.map(id => ({ id, r: rate(id) })).sort((a, b) => b.r - a.r)[0];
    if (seen && seen.r > 0.2) return seen.id;
    const top = meta.map(m => ({ id: idOf(m), pick: m.pick_rate || 0 })).filter(x => x.id && x.id !== myId).sort((a, b) => b.pick - a.pick)[0];
    return top?.id || null;
  }

  // Elegir una de las builds completas; si ya has bloqueado, se reimportan runas y objetos
  async choose(index) {
    const b = this.state.build;
    if (!b?.options?.[index]) throw new Error('Esa build no está disponible');
    this.state.choice = index;
    this.state.build = applyChoice(b, index);
    this.emitState();
    if (this.state.locked) await this.importBuild({ runes: true, items: true });
    return true;
  }

  // Build para la partida aunque no se haya pasado por la seleccion con la app abierta
  async buildFor(championId, role) {
    if (this.state.build?.championId === championId) return this.state.build;
    const key = this.champions.get(championId)?.key;
    if (!key) return null;
    try {
      const pos = role || await opgg.mainPosition(key);
      const build = buildFrom(await opgg.championAnalysis(key, pos), championId, pos);
      // Con objetos por situacion (para la vista Partida), aunque sin guia contra un rival
      build.options = tagBuilds(coherentBuilds(build, null, this.champions.ddragon?.items || {}), build, 'opgg');
      return applyChoice(build, 0);
    } catch {
      return null;
    }
  }

  // Sin solapar calculos: si cambia algo mientras se calcula, se repite al terminar
  async recomputePicks() {
    if (this.computing) { this.dirty = true; return; }
    this.computing = true;
    try {
      do {
        this.dirty = false;
        const ctx = { role: this.state.role, allies: this.state.allies, enemies: this.state.enemies, bans: this.state.bans };
        this.state.loading = true;
        this.emitState();
        try {
          const picks = await this.computePicks(ctx);
          if (!this.dirty) { this.state.picks = picks; this.state.error = null; }
        } catch (e) {
          this.state.error = `No se pudieron calcular los picks: ${e.message}`;
        }
      } while (this.dirty && this.state.active);
    } finally {
      this.computing = false;
      this.state.loading = false;
      this.emitState();
    }
  }

  // Descarga por adelantado los datos de tu rol para que la seleccion vaya rapida
  async prewarm(role) {
    try {
      await this.computePicks({ role: role || await this.mainRole(), allies: [], enemies: [], bans: { ally: [], enemy: [] } });
    } catch { }
  }

  async computePicks({ role, allies, enemies, bans }) {
    const C = this.champions;
    const [meta, personal] = await Promise.all([opgg.laneMeta(role).catch(() => []), this.personalStats()]);
    const metaById = new Map();
    for (const m of meta) {
      const id = C.idFromEnglish(m.champion);
      if (id) metaById.set(id, m);
    }

    const taken = new Set([
      ...bans.ally, ...bans.enemy,
      ...allies.filter(a => !a.isMe).map(a => a.championId),
      ...enemies.map(e => e.championId),
    ].filter(id => id > 0));
    const owned = new Set(C.owned);
    const pool = [...personal.entries()].filter(([, s]) => s.roles[role]).sort((a, b) => b[1].games - a[1].games).map(([id]) => id);
    const metaTop = meta.filter(m => m.tier <= 3).slice(0, 16).map(m => C.idFromEnglish(m.champion)).filter(Boolean);
    const candidates = [...new Set([...pool.slice(0, 10), ...metaTop])]
      .filter(id => owned.has(id) && !taken.has(id) && C.get(id)).slice(0, 22);

    const enemyIds = enemies.map(e => e.championId).filter(id => id > 0);
    const keyOf = id => C.get(id)?.key;
    const [enemyData, candData] = await Promise.all([
      mapLimit(enemyIds, 4, id => opgg.championAnalysis(keyOf(id), role).catch(() => null)),
      mapLimit(candidates, 5, id => opgg.championAnalysis(keyOf(id), role).catch(() => null)),
    ]);

    const alliesWithChamp = allies.filter(a => !a.isMe && a.championId > 0);
    const ad = alliesWithChamp.filter(a => C.get(a.championId)?.damage === 'AD').length;
    const ap = alliesWithChamp.length - ad;

    const picks = candidates.map((id, i) => {
      const data = candData[i] || {};
      const reasons = [];
      let score = 0;
      const add = (v, text) => { score += v; if (text) reasons.push({ v, text }); };

      // Meta: winrate del campeon en el rol y su tier
      const m = metaById.get(id);
      const avg = data.summary?.average_stats;
      const tier = m?.tier ?? avg?.tier ?? null;
      const metaWinRate = m?.win_rate ?? avg?.win_rate ?? null;
      if (metaWinRate != null) {
        const v = (metaWinRate - 0.5) * 100 + (TIER_BONUS[tier] || 0);
        add(v, tier && tier <= 2 ? `Tier ${tier} en ${ROLE_NAMES[role]} (${pct(metaWinRate)} de victorias)` : null);
      }

      // Tu historial: winrate suavizado (5 partidas virtuales al 50%) + soltura con el campeon
      const p = personal.get(id);
      if (p?.games) {
        const wr = (p.wins + 2.5) / (p.games + 5);
        add((wr - 0.5) * 50 + Math.min(p.games, 15) / 15 * 2, `Llevas ${pct(p.wins / p.games)} de victorias en ${p.games} partidas`);
      }

      // Counters contra cada rival visible; pesa mas el que suele jugar tu rol
      enemyIds.forEach((e, k) => {
        const deltas = [];
        const sc = data.strong_counters?.find(x => x.champion_id === e);
        if (sc) deltas.push(sc.win_rate - 0.5);
        const wc = data.weak_counters?.find(x => x.champion_id === e);
        if (wc) deltas.push(wc.my_win_rate - 0.5);
        const ed = enemyData[k];
        const ew = ed?.weak_counters?.find(x => x.champion_id === id);
        if (ew) deltas.push(ew.counter_win_rate - 0.5);
        const es = ed?.strong_counters?.find(x => x.champion_id === id);
        if (es) deltas.push(0.5 - es.win_rate);
        if (!deltas.length) return;
        const delta = deltas.reduce((a, b) => a + b, 0) / deltas.length;
        const lane = (metaById.get(e)?.role_rate ?? 0) > 0.2;
        const v = delta * 100 * (lane ? 1 : 0.35);
        const name = C.name(e);
        add(v, Math.abs(v) >= 1 ? (delta > 0 ? `Gana a ${name} (${pct(0.5 + delta)})` : `Sufre contra ${name} (${pct(0.5 + delta)})`) : null);
      });

      // Sinergia con aliados que ya tienen campeon y rol
      for (const a of alliesWithChamp) {
        const syn = a.position && data.synergies?.[a.position]?.find(x => x.synergy_champion_id === a.championId);
        if (!syn) continue;
        const v = (syn.win_rate - 0.5) * 50;
        add(v, v >= 1 ? `Buena sinergia con ${C.name(a.championId)} (${pct(syn.win_rate)})` : null);
      }

      // Equilibrio de dano del equipo
      const dmg = data.damage_type === 'AP' || data.damage_type === 'AD' ? data.damage_type : C.get(id).damage;
      if (ad >= 3 && ap === 0 && dmg === 'AP') add(2, 'Tu equipo necesita daño mágico');
      if (ap >= 3 && ad === 0 && dmg === 'AD') add(2, 'Tu equipo necesita daño físico');

      const counterSum = reasons.filter(r => /^(Gana|Sufre)/.test(r.text)).reduce((s, r) => s + r.v, 0);
      const tags = [];
      if (counterSum >= 1.5) tags.push('Counter');
      if (counterSum <= -1.5) tags.push('Riesgo');
      if (p?.games >= 3) tags.push('Tu pool');
      if (tier && tier <= 2) tags.push('Meta');
      if (reasons.some(r => r.text.startsWith('Buena sinergia'))) tags.push('Sinergia');

      return {
        championId: id, score: Math.round(score * 10) / 10,
        metaTier: tier, metaWinRate,
        personal: p?.games ? { games: p.games, winRate: p.wins / p.games } : null,
        tags,
        reasons: reasons.sort((a, b) => Math.abs(b.v) - Math.abs(a.v)).slice(0, 4).map(r => r.text),
      };
    });
    return picks.sort((a, b) => b.score - a.score).slice(0, MAX_PICKS);
  }

  // Marca un campeon en tu turno de pick (sin bloquear)
  async hover(championId) {
    const s = this.session;
    if (!s) throw new Error('No estás en la selección de campeones');
    const action = (s.actions || []).flat().find(a => a.actorCellId === s.localPlayerCellId && a.type === 'pick' && !a.completed);
    if (!action) throw new Error('No tienes un pick pendiente');
    await this.lcu.request('PATCH', `/lol-champ-select/v1/session/actions/${action.id}`, { championId });
  }

  // Bloquea un campeon en tu turno de pick (boton «Bloquear campeón»). Como en ChampSelect.stepConfirm:
  // el cliente ignora la confirmacion si el campeon no se marco durante el turno, asi que se marca,
  // se confirma con PATCH completed y, si no queda bloqueado, se reintenta con POST complete
  async lock(championId) {
    const wait = ms => new Promise(r => setTimeout(r, ms));
    const mine = s => (s?.actions || []).flat().find(a => a.actorCellId === s.localPlayerCellId && a.type === 'pick' && !a.completed);
    let s = await this.lcu.request('GET', '/lol-champ-select/v1/session').catch(() => null);
    if (!s) throw new Error('No estás en la selección de campeones');
    const action = mine(s);
    if (!action) throw new Error('No tienes un pick pendiente');
    if (!action.isInProgress) throw new Error('Todavía no es tu turno de pick');
    const url = `/lol-champ-select/v1/session/actions/${action.id}`;
    const name = this.champions.name(championId);
    log(`bloquear a mano: accion=${action.id} campeon=${championId}`);
    await this.lcu.request('PATCH', url, { championId });
    await wait(500);
    for (const step of ['patch', 'post']) {
      if (step === 'patch') await this.lcu.request('PATCH', url, { championId, completed: true });
      else await this.lcu.request('POST', `${url}/complete`).catch(() => {});
      await wait(1000);
      s = await this.lcu.request('GET', '/lol-champ-select/v1/session').catch(() => null);
      const done = (s?.actions || []).flat().find(a => a.id === action.id);
      if (done?.completed) {
        if (done.championId !== championId) throw new Error(`El cliente ha bloqueado otro campeón`);
        log(`bloquear a mano: ${name} bloqueado`);
        return true;
      }
    }
    throw new Error(`El cliente no ha bloqueado a ${name} (¿baneado o cogido?)`);
  }

  // Las importaciones se encadenan: dos a la vez se pisan (borrar y crear la pagina de runas, leer y
  // escribir los sets de objetos)
  importBuild(what = { runes: true, spells: true, items: true }) {
    const run = this.importQueue.then(() => this.doImport(what));
    this.importQueue = run.catch(() => {});
    return run;
  }

  async doImport(what) {
    const b = this.state.build;
    if (!b) throw new Error('Todavía no hay build para tu campeón');
    const name = this.champions.name(b.championId);
    const imported = { runes: null, spells: null, items: null, message: '' };
    const done = [];

    let runesError = null;
    if (what.runes && !b.runes) log(`runas: la build de ${name} no trae página de runas`);
    if (what.runes && b.runes) {
      try {
        await this.importRunes(b.runes, name);
        imported.runes = 'ok';
        done.push('runas');
      } catch (e) {
        imported.runes = 'error';
        runesError = e.userMessage || null;
        log(`runas: ${e.message}`);
      }
    }

    if (what.spells && b.spells.length === 2 && this.session) {
      try {
        // Mantener Destello en la tecla en la que lo sueles llevar
        const me = (this.session.myTeam || []).find(p => p.cellId === this.session.localPlayerCellId);
        let spells = [...b.spells];
        const flashSlot = me?.spell1Id === FLASH ? 0 : me?.spell2Id === FLASH ? 1 : -1;
        if (flashSlot >= 0 && spells.includes(FLASH) && spells[flashSlot] !== FLASH) spells.reverse();
        await this.lcu.request('PATCH', '/lol-champ-select/v1/session/my-selection', { spell1Id: spells[0], spell2Id: spells[1] });
        imported.spells = 'ok';
        done.push('hechizos');
      } catch (e) {
        imported.spells = 'error';
        log(`hechizos: ${e.message}`);
      }
    }

    let itemsError = null;
    if (what.items) {
      try {
        // En las automaticas no se reescribe un set identico al ultimo
        await this.importItemSet(b, name, !!what.auto);
        imported.items = 'ok';
        done.push('objetos (tienda: «LoL Coach: ' + name + '»)');
      } catch (e) {
        imported.items = 'error';
        itemsError = e.status ? `el cliente respondió ${e.status}` : e.message;
        log(`objetos: ${e.message}`);
      }
    }

    const failed = ['runes', 'spells', 'items'].filter(k => imported[k] === 'error').length;
    imported.message = done.length
      ? `Importado: ${done.join(', ')}${failed ? ' (algo falló, mira el registro)' : ''}`
      : itemsError ? `No se pudieron importar los objetos: ${itemsError}` : 'No se pudo importar la build';
    // Si solo se pedian los objetos y fallan, la interfaz muestra el motivo
    if (itemsError && done.length) imported.message += `. Objetos: ${itemsError}`;
    if (runesError) imported.message += `. Runas: ${runesError}`;
    this.state.imported = imported;
    this.emitState();
    return imported;
  }

  // Pagina de runas "LoL Coach: X": se borra la anterior de LoL Coach y se crea otra como actual.
  // No se toca ninguna pagina del jugador: si no queda hueco, se avisa
  async importRunes(runes, name) {
    const perks = completePerks(runes.perks);
    if (perks.length !== 9) throw new Error(`página incompleta (${runes.perks?.length || 0} runas)`);
    const pages = await this.lcu.request('GET', '/lol-perks/v1/pages', undefined, 5000);
    const ours = pages.filter(p => p.isDeletable && String(p.name).startsWith('LoL Coach'));
    for (const p of ours) {
      try {
        await this.lcu.request('DELETE', `/lol-perks/v1/pages/${p.id}`, undefined, 5000);
      } catch (e) {
        if (e.status !== 404) throw e;   // ya borrada
      }
    }
    if (!ours.length) {
      const inv = await this.lcu.request('GET', '/lol-perks/v1/inventory', undefined, 5000).catch(() => null);
      const custom = pages.filter(p => p.isDeletable).length;
      if (inv?.ownedPageCount != null && custom >= inv.ownedPageCount) {
        const err = new Error(`sin hueco para páginas (${custom}/${inv.ownedPageCount})`);
        err.userMessage = 'no queda hueco para otra página; borra una o llámala «LoL Coach»';
        throw err;
      }
    }
    await this.lcu.request('POST', '/lol-perks/v1/pages', {
      name: `LoL Coach: ${name}`, primaryStyleId: runes.primaryStyle, subStyleId: runes.subStyle,
      selectedPerkIds: perks, current: true,
    }, 5000);
    log(`runas: página "LoL Coach: ${name}" creada (${perks.join(',')})`);
  }

  // Escribe el set de objetos en el cliente; aparece en la tienda del juego (desplegable de sets)
  // en la siguiente partida con ese campeon
  async importItemSet(b, name, skipSame = false) {
    // Titulo corto como el de Blitz ("LoL Coach: AP Locke")
    const label = { ap: 'AP', ad: 'AD', tank: 'Tanque' }[b.options?.[this.state.choice]?.kind] || '';
    const mine = itemSetFor(b, name, ROLE_NAMES[b.role] || '', this.champions.ddragon?.items || {}, label);
    const json = JSON.stringify(mine);
    if (skipSame && json === this.lastItemSet) return;
    const summoner = await this.lcu.request('GET', '/lol-summoner/v1/current-summoner');
    const url = `/lol-item-sets/v1/item-sets/${summoner.summonerId}/sets`;
    const current = await this.lcu.request('GET', url, undefined, 5000);

    // 1) Archivo propio en la carpeta del juego (sale el primero en la tienda); se quita el set del
    //    cliente para que no salga dos veces, y el de iTero
    const file = this.writeItemSetFile(mine);
    if (file) {
      const body = mergeItemSets(current, null);
      if (body.itemSets.length !== current.itemSets.length) await this.lcu.request('PUT', url, body, 5000);
      this.lastItemSet = json;
      log(`objetos: set "${mine.title}" escrito en ${file} (${mine.blocks.map(x => `${x.type}: ${x.items.length}`).join(', ')})`);
      return;
    }

    // 2) Sin carpeta del juego: set del cliente por la LCU
    const body = mergeItemSets(current, mine);
    try {
      await this.lcu.request('PUT', url, body, 5000);
    } catch (e) {
      // Alternativa: el cuerpo minimo con el accountId del invocador
      log(`objetos: PUT rechazado (${e.status || '-'}): ${e.body || e.message}; se reintenta con el cuerpo minimo`);
      await this.lcu.request('PUT', url, { accountId: summoner.accountId, itemSets: body.itemSets, timestamp: body.timestamp }, 5000);
    }
    // Comprobacion: el set tiene que estar al releer
    const after = await this.lcu.request('GET', url, undefined, 5000);
    if (!after?.itemSets?.some(s => s.uid === ITEM_SET_UID)) throw new Error('el cliente aceptó el set pero no aparece al releerlo');
    this.lastItemSet = json;
    log(`objetos: set "${mine.title}" importado (${mine.blocks.map(x => `${x.type}: ${x.items.length}`).join(', ')})`);
  }

  // Escribe Config/Global/Recommended/!!!!lol-coach.json (temporal y renombrado). Devuelve la ruta o
  // null si no se conoce la carpeta del juego o falla la escritura
  writeItemSetFile(mine) {
    const dir = this.lcu.auth?.installDir;
    if (!dir) return null;
    try {
      const folder = path.join(dir, 'Config', 'Global', 'Recommended');
      if (!fs.existsSync(path.join(dir, 'Config'))) return null;
      fs.mkdirSync(folder, { recursive: true });
      const file = path.join(folder, ITEM_SET_FILE);
      fs.writeFileSync(file + '.tmp', JSON.stringify(itemSetFile(mine)), 'utf8');
      fs.renameSync(file + '.tmp', file);
      return file;
    } catch (e) {
      log(`objetos: no se pudo escribir el archivo del set (${e.message}); se usa la LCU`);
      return null;
    }
  }
}

module.exports = { Draft, itemSetFor, itemSetFile, mergeItemSets, buildFrom };
