// Partida en directo: lee la Live Client Data API del juego (https://127.0.0.1:2999), que solo
// da informacion visible para el jugador (marcador, eventos, tus estadisticas). A partir de los
// eventos calcula los timers de objetivos, y avisa antes de que aparezcan.
const fs = require('fs');
const path = require('path');
const https = require('https');
const { EventEmitter } = require('events');
const { DEFAULT_TIMES, DRAGON_TYPES, LANES, LANE_NAMES, NOTIFY_BEFORE, NOTIFY_KEYS } = require('./objectives');
const { liveContext } = require('./buildsets');

const agent = new https.Agent({ rejectUnauthorized: false, keepAlive: false });

function getAllGameData() {
  return new Promise((resolve, reject) => {
    const req = https.get({ host: '127.0.0.1', port: 2999, path: '/liveclientdata/allgamedata', agent, timeout: 1500 }, res => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        if (res.statusCode !== 200) return reject(new Error(`${res.statusCode}`));
        try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); } catch (e) { reject(e); }
      });
    });
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', reject);
  });
}

function emptyState() {
  return {
    active: false, gameTime: 0, myChampionId: null, objectives: [], buffs: [],
    gold: { ally: 0, enemy: 0, diff: 0 }, lanes: [], cs: { total: 0, perMin: 0, target: 7 },
    skillToLevel: null, events: [], notify: null,
  };
}

class LiveGame extends EventEmitter {
  constructor(champions, config) {
    super();
    this.champions = champions;
    this.config = config;
    this.state = emptyState();
    this.timer = null;
    this.build = null;
    this.notifyId = 0;
  }

  times() {
    return { ...DEFAULT_TIMES, ...(this.config.get().objectiveTimes || {}) };
  }

  // csProvider(championId, position) -> { perMin, ... } | null: objetivo de CS automatico
  start(buildProvider, csProvider = null) {
    if (this.timer) return;
    this.state = emptyState();
    this.buildProvider = buildProvider;
    this.build = null;
    this.buildRequested = false;
    this.csProvider = csProvider;
    this.csAuto = null;
    this.csRequested = false;
    this.warned = new Set();
    this.hudScale = this.readHudScale();
    this.timer = setInterval(() => this.poll().catch(() => { }), 1000);
  }

  // Habilidad a subir con un punto libre, segun lo que YA tienes subido (no la posicion en la lista, que
  // se descuadra en cuanto subes otra): la definitiva si toca (6, 11, 16); si no, la que va por detras
  // de lo que la build tendria a tu nivel; si vas al dia, la de mas prioridad que aun se pueda subir
  static nextSkill(active, build) {
    const level = active?.level || 0;
    const ab = active?.abilities || {};
    const cur = k => ab[k]?.abilityLevel || 0;
    if (['Q', 'W', 'E', 'R'].reduce((s, k) => s + cur(k), 0) >= level) return null;
    if ([6, 11, 16].filter(l => l <= level).length > cur('R')) return 'R';
    // Rango maximo de una basica a tu nivel: 1 en el 1-2, 2 en el 3-4... hasta 5
    const cap = Math.min(5, Math.ceil(level / 2));
    const can = k => cur(k) < cap;
    const order = (build?.skillOrder || []).slice(0, level);
    const behind = ['Q', 'W', 'E'].filter(k => can(k) && cur(k) < order.filter(x => x === k).length);
    if (behind.length) return order.find(k => behind.includes(k));
    const priority = build?.skillPriority?.length ? build.skillPriority : [];
    return priority.find(can) || null;
  }

  // Escala del HUD del juego (GlobalScale de game.cfg, 0..1): coloca la flecha de la habilidad a subir
  readHudScale() {
    try {
      const text = fs.readFileSync(path.join(this.installDir, 'Config', 'game.cfg'), 'utf8');
      const v = Number(/^GlobalScale=(.*)$/m.exec(text)?.[1]);
      return Number.isFinite(v) ? v : 1;
    } catch {
      return 1;
    }
  }

  stop() {
    clearInterval(this.timer);
    this.timer = null;
    if (this.state.active) {
      this.state = emptyState();
      this.emit('change', this.state);
    }
  }

  async poll() {
    let data;
    try {
      data = await getAllGameData();
    } catch {
      return;   // todavia en la pantalla de carga
    }
    if (!data?.activePlayer || !data.gameData) return;
    this.state = this.compute(data);
    this.emit('change', this.state);
  }

  // Identifica a un jugador por su Riot ID o por su nombre antiguo
  static samePlayer(p, name) {
    if (!name) return false;
    return [p.riotId, p.riotIdGameName, p.summonerName].some(n => n && (n === name || n.split('#')[0] === name.split('#')[0]));
  }

  championIdOf(p) {
    // rawChampionName: "game_character_displayname_MonkeyKing"
    const key = String(p.rawChampionName || '').split('_').pop();
    return this.champions.idFromKey(key) || this.champions.find(p.championName)?.id || null;
  }

  compute(data) {
    const T = this.times();
    const cfg = this.config.get();
    const gameTime = data.gameData.gameTime;
    const players = data.allPlayers || [];
    const active = data.activePlayer;
    const me = players.find(p => LiveGame.samePlayer(p, active.riotId || active.summonerName)) || players[0];
    const myTeam = me?.team;
    const teamOf = name => {
      const p = players.find(x => LiveGame.samePlayer(x, name));
      return p ? (p.team === myTeam ? 'ally' : 'enemy') : null;
    };
    const myChampionId = me ? this.championIdOf(me) : null;

    // Build del campeon para el siguiente objeto y el orden de habilidades
    if (myChampionId && !this.buildRequested && this.buildProvider) {
      this.buildRequested = true;
      this.buildProvider(myChampionId).then(b => { this.build = b; }).catch(() => { });
    }
    // Objetivo de CS segun tu campeon y tu posicion (una vez por partida)
    if (myChampionId && !this.csRequested && this.csProvider) {
      this.csRequested = true;
      this.csProvider(myChampionId, me?.position || '').then(t => { this.csAuto = t; }).catch(() => { });
    }

    // ---- Objetivos a partir de los eventos ----
    const events = data.events?.Events || [];
    const dragons = { ally: 0, enemy: 0 };
    let dragon = { state: 'pending', spawnAt: T.dragonFirst, team: null, detail: null };
    let elder = null;
    let grubs = { state: 'pending', spawnAt: T.grubs, team: null };
    let grubKills = 0;
    let herald = { state: 'pending', spawnAt: T.herald, team: null };
    let atakhan = { state: 'pending', spawnAt: T.atakhan, team: null };
    let baron = { state: 'pending', spawnAt: T.baron, team: null };
    const inhibs = {};
    const buffs = [];
    const log = [];

    for (const ev of events) {
      const t = ev.EventTime;
      const team = teamOf(ev.KillerName);
      const who = team === 'ally' ? 'Tu equipo' : team === 'enemy' ? 'El equipo enemigo' : 'Alguien';
      switch (ev.EventName) {
        case 'DragonKill': {
          const type = DRAGON_TYPES[ev.DragonType] || ev.DragonType;
          if (ev.DragonType === 'Elder') {
            elder = { state: 'respawning', spawnAt: t + T.elderRespawn, team, detail: null };
            if (team) buffs.push({ key: 'elder', label: 'Ancestral', team, endsAt: t + T.elderBuff });
            log.push({ time: t, text: `${who} ha matado al Dragón Ancestral${ev.Stolen === 'True' ? ' (robado)' : ''}` });
            break;
          }
          if (team) dragons[team]++;
          log.push({ time: t, text: `${who} ha matado al Dragón ${type}${ev.Stolen === 'True' ? ' (robado)' : ''}` });
          // Con el alma (4 dragones) dejan de salir dragones elementales y llega el ancestral
          if (dragons.ally >= 4 || dragons.enemy >= 4) {
            dragon = { state: 'gone', spawnAt: null, team, detail: null };
            elder = elder || { state: 'respawning', spawnAt: t + T.elderRespawn, team: null, detail: null };
          } else {
            dragon = { state: 'respawning', spawnAt: t + T.dragonRespawn, team, detail: null };
          }
          break;
        }
        case 'HordeKill':
          grubKills++;
          if (grubKills >= 3) grubs = { state: 'gone', spawnAt: null, team };
          if (grubKills === 3) log.push({ time: t, text: `${who} ha matado a las larvas del vacío` });
          break;
        case 'HeraldKill':
          herald = { state: 'gone', spawnAt: null, team };
          log.push({ time: t, text: `${who} ha matado al Heraldo` });
          break;
        case 'AtakhanKill':
          atakhan = { state: 'gone', spawnAt: null, team };
          log.push({ time: t, text: `${who} ha matado a Atakhan` });
          break;
        case 'BaronKill':
          baron = { state: 'respawning', spawnAt: t + T.baronRespawn, team };
          if (team) buffs.push({ key: 'baron', label: 'Barón', team, endsAt: t + T.baronBuff });
          log.push({ time: t, text: `${who} ha matado al Barón${ev.Stolen === 'True' ? ' (robado)' : ''}` });
          break;
        case 'InhibKilled': {
          // Barracks_T1_L1: T1 = equipo azul (ORDER), T2 = rojo (CHAOS); L/C/R = linea
          const m = /_T(\d)_([LCR])/.exec(ev.InhibKilled || '');
          if (!m) break;
          const owner = (m[1] === '1' ? 'ORDER' : 'CHAOS') === myTeam ? 'ally' : 'enemy';
          const lane = LANES[m[2]];
          inhibs[`${owner}_${lane}`] = { owner, lane, spawnAt: t + T.inhibRespawn };
          log.push({ time: t, text: `${owner === 'ally' ? 'Han destruido vuestro' : 'Habéis destruido el'} inhibidor ${LANE_NAMES[lane]}` });
          break;
        }
        case 'InhibRespawned': {
          const m = /_T(\d)_([LCR])/.exec(ev.InhibRespawned || '');
          if (!m) break;
          const owner = (m[1] === '1' ? 'ORDER' : 'CHAOS') === myTeam ? 'ally' : 'enemy';
          delete inhibs[`${owner}_${LANES[m[2]]}`];
          break;
        }
        case 'FirstBlood':
          log.push({ time: t, text: `Primera sangre: ${ev.Recipient}` });
          break;
        case 'Ace':
          log.push({ time: t, text: `${ev.AcingTeam === myTeam ? 'Tu equipo' : 'El equipo enemigo'} ha hecho un ace` });
          break;
        default:
      }
    }

    // El heraldo no reaparece y se va cuando sale el siguiente objetivo de la fosa superior
    // (Atakhan hasta 2025, el baron desde el parche 26.1)
    const resolve = o => {
      if (o.state === 'gone') return o;
      return o.spawnAt != null && gameTime >= o.spawnAt ? { ...o, state: 'alive', spawnAt: null } : o;
    };
    const objectives = [
      { key: 'dragon', label: 'Dragón', ...resolve(dragon) },
      ...(elder ? [{ key: 'elder', label: 'Dragón Ancestral', ...resolve(elder) }] : []),
      { key: 'grubs', label: 'Larvas del vacío', ...resolve(grubs) },
      { key: 'herald', label: 'Heraldo', ...resolve(herald) },
      ...(T.atakhan ? [{ key: 'atakhan', label: 'Atakhan', ...resolve(atakhan) }] : []),
      { key: 'baron', label: 'Barón', ...resolve(baron) },
      ...Object.values(inhibs).filter(i => i.spawnAt > gameTime).map(i => ({
        key: `inhib_${i.owner}_${i.lane}`, label: `Inhibidor ${LANE_NAMES[i.lane]}`,
        detail: i.owner === 'ally' ? 'Vuestro' : 'Enemigo', state: 'respawning', spawnAt: i.spawnAt, team: i.owner,
      })),
    ].map(o => ({ detail: null, team: null, ...o }));
    if (objectives.find(o => o.key === (T.atakhan ? 'atakhan' : 'baron'))?.state !== 'pending') {
      const h = objectives.find(o => o.key === 'herald');
      if (h.state === 'alive') h.state = 'gone';
    }

    // ---- Aviso 90 s antes de que salga dragon, baron, larvas o heraldo (el overlay no muestra timers) ----
    let notify = null;
    const before = NOTIFY_BEFORE;
    if (cfg.overlay?.objectives !== false) {
      for (const o of objectives) {
        if (!NOTIFY_KEYS.includes(o.key) || o.spawnAt == null) continue;
        const left = o.spawnAt - gameTime;
        const id = `${o.key}@${Math.round(o.spawnAt)}`;
        if (left <= before && left > 0 && !this.warned.has(id)) {
          this.warned.add(id);
          // En las primeras vueltas no se avisa de lo que ya estaba a punto de salir
          if (left > before - 5) notify = { id: ++this.notifyId, text: `${o.label} en ${Math.round(left)} s`, kind: 'objective' };
        }
      }
    }

    // ---- Oro (valor de los objetos), CS, habilidad, objetos segun la composicion ----
    const items = this.champions.ddragon?.items || {};
    // Objetos por situacion de tu build, destacando los que pide el equipo enemigo segun lo que lleva
    let itemAdvice = null;
    if (this.build?.context?.length) {
      const enemyPlayers = players.filter(p => p.team !== myTeam);
      const { flags, reasons } = liveContext(enemyPlayers, this.champions, items, p => this.championIdOf(p));
      const owned = new Set((me?.items || []).map(i => i.itemID));
      const groups = this.build.context
        .map(g => ({ ...g, items: g.items.filter(id => !owned.has(id)), recommended: flags.includes(g.key) }))
        .filter(g => g.items.length)
        .sort((a, b) => b.recommended - a.recommended);
      itemAdvice = { groups, reasons };
    }
    const value = p => (p.items || []).reduce((s, it) => s + (items[it.itemID]?.gold ?? it.price ?? 0) * (it.count || 1), 0);
    const gold = { ally: 0, enemy: 0, diff: 0 };
    for (const p of players) gold[p.team === myTeam ? 'ally' : 'enemy'] += value(p);
    gold.diff = gold.ally - gold.enemy;

    // Oro por linea (valor de objetos) contra el rival de la misma posicion. Sin posicion (algunos
    // modos) se empareja por el orden de la lista; el overlay lo ensena al mantener Tab
    const ORDER_POS = ['TOP', 'JUNGLE', 'MIDDLE', 'BOTTOM', 'UTILITY'];
    const side = mine => players.filter(p => (p.team === myTeam) === mine);
    const allies = side(true), enemies = side(false);
    const usePos = [...allies, ...enemies].every(p => ORDER_POS.includes(p.position));
    const lanes = (usePos ? ORDER_POS : allies.map((_, i) => i)).map((pos, i) => {
      const a = usePos ? allies.find(p => p.position === pos) : allies[i];
      const e = usePos ? enemies.find(p => p.position === pos) : enemies[i];
      if (!a || !e) return null;
      const ag = value(a), eg = value(e);
      // El juego solo actualiza el CS de los demas de 10 en 10
      const ac = a.scores?.creepScore || 0, ec = e.scores?.creepScore || 0;
      return {
        position: usePos ? pos : '', isMe: a === me,
        // riotId: para cruzarlo con el scouting (maestria, posicion y premades en el Tab)
        ally: { championId: this.championIdOf(a), gold: ag, cs: ac, riotId: a.riotId || a.summonerName || '' },
        enemy: { championId: this.championIdOf(e), gold: eg, cs: ec, riotId: e.riotId || e.summonerName || '' },
        diff: ag - eg, csDiff: ac - ec,
      };
    }).filter(Boolean);

    const csTotal = me?.scores?.creepScore || 0;
    // Automatico (por defecto) si hay datos de U.GG; si no, el de Ajustes
    const auto = cfg.csAuto !== false && this.csAuto ? this.csAuto : null;
    const cs = {
      total: csTotal, perMin: gameTime > 60 ? Math.round(csTotal / (gameTime / 60) * 10) / 10 : 0,
      target: auto ? auto.perMin : cfg.csTarget || 7, auto,
    };

    const skillToLevel = LiveGame.nextSkill(active, this.build);

    // El aviso se mantiene unos segundos para que el overlay lo vea aunque se pierda una vuelta
    if (notify) this.lastNotifyAt = gameTime;
    else if (this.state.notify && gameTime - (this.lastNotifyAt || 0) < 6) notify = this.state.notify;

    return {
      active: true, gameTime, myChampionId,
      myTeam,   // 'ORDER' (azul) | 'CHAOS' (rojo)
      objectives, buffs: buffs.filter(b => b.endsAt > gameTime),
      gold, lanes, cs, skillToLevel, hudScale: this.hudScale ?? 1, itemAdvice,
      events: log.slice(-6),
      notify,
    };
  }

  // Datos de ejemplo para colocar el overlay ("Probar overlay")
  sample() {
    return {
      active: true, gameTime: 754, myChampionId: 35,
      objectives: [
        { key: 'dragon', label: 'Dragón', detail: null, state: 'respawning', spawnAt: 814, team: 'ally' },
        { key: 'grubs', label: 'Larvas del vacío', detail: null, state: 'gone', spawnAt: null, team: 'enemy' },
        { key: 'herald', label: 'Heraldo', detail: null, state: 'pending', spawnAt: 900, team: null },
        { key: 'baron', label: 'Barón', detail: null, state: 'pending', spawnAt: 1200, team: null },
      ],
      buffs: [],
      gold: { ally: 24300, enemy: 22100, diff: 2200 },
      lanes: [['TOP', 86, 5300, 122, 4650], ['JUNGLE', 35, 5100, 64, 5400], ['MIDDLE', 103, 5900, 157, 4800], ['BOTTOM', 222, 4400, 51, 4600], ['UTILITY', 412, 3600, 89, 2650]]
        .map(([position, a, ag, e, eg], i) => ({ position, isMe: position === 'JUNGLE', ally: { championId: a, gold: ag, cs: 90 + i * 10 }, enemy: { championId: e, gold: eg, cs: 85 + i * 12 }, diff: ag - eg, csDiff: 5 - i * 2 })),
      cs: { total: 98, perMin: 6.4, target: 6.6, auto: { perMin: 6.6, csPerGame: 185, minutes: 28, role: 'jungle', championId: 35 } },
      skillToLevel: 'E', hudScale: this.readHudScale(),
      events: [{ time: 720, text: 'Tu equipo ha matado al Dragón Infernal' }],
      notify: { id: ++this.notifyId, text: 'Dragón en 90 s', kind: 'objective' },
    };
  }
}

module.exports = { LiveGame };
