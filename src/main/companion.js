// Bucle principal: cada segundo mira en que fase esta el cliente y coordina el resto
// (aceptar la cola, seleccion, scouting, partida en directo, post-partida)
const { EventEmitter } = require('events');
const { Lcu } = require('./lcu');
const { DataDragon } = require('./ddragon');
const { Champions } = require('./champions');
const { ChampSelect } = require('./champselect');
const { Recommender } = require('./recommend');
const { Draft } = require('./draft');
const { LiveGame } = require('./live');
const { Scouting } = require('./scouting');
const { RiotApi } = require('./riot');
const { Profile } = require('./profile');
const { Coach } = require('./coach');
const { OtpBuilds } = require('./otp');
const { ROLE_FROM_POSITION } = require('./util');
const { log } = require('./log');

const PHASES = {
  None: 'En el menú',
  Lobby: 'En la sala',
  Matchmaking: 'Buscando partida...',
  ReadyCheck: '¡Partida encontrada!',
  ChampSelect: 'Selección de campeones',
  GameStart: 'Cargando partida',
  InProgress: 'En partida',
  WaitingForStats: 'Esperando estadísticas',
  PreEndOfGame: 'Fin de partida',
  EndOfGame: 'Fin de partida',
  Reconnect: 'Reconectar',
};
const IN_GAME = ['GameStart', 'InProgress', 'Reconnect'];
const QUEUE_NAMES = {
  420: 'Clasificatoria Solo/Dúo', 440: 'Clasificatoria Flexible', 400: 'Normal (reclutamiento)',
  430: 'Normal (selección a ciegas)', 480: 'Partida rápida', 490: 'Partida rápida', 450: 'ARAM', 1700: 'Arena',
  1750: 'Arena', 2400: 'ARAM: Caos', 710: 'Clasificatorias de 5',
  4310: 'Grieta Classic (clasificatoria)', 4320: 'Grieta Classic contra la IA',
};
// Orden de las colas en Inicio (las demas, despues, por la prioridad del cliente)
const QUEUE_ORDER = [420, 440, 400, 480, 450, 2400, 1700, 1750];
const POSITIONS = ['TOP', 'JUNGLE', 'MIDDLE', 'BOTTOM', 'UTILITY', 'FILL', 'UNSELECTED'];

class Companion extends EventEmitter {
  constructor(config, dir) {
    super();
    this.config = config;
    this.dir = dir;
    this.lcu = new Lcu();
    this.ddragon = new DataDragon(dir);
    this.champions = new Champions();
    this.riot = new RiotApi(dir);
    this.coach = new Coach(dir, this.champions, config);
    this.champSelect = new ChampSelect(this.lcu, config);
    this.recommender = new Recommender(this.lcu, this.champions);
    this.draft = new Draft(this.lcu, this.champions, config);
    this.otp = new OtpBuilds(this.riot, dir);
    this.otp.champions = this.champions;
    this.draft.otp = this.otp;
    // Partidas OTP nuevas: la build de la seleccion y el explorador se actualizan si son de ese campeon
    this.otp.on('update', championId => {
      this.draft.refreshOtp(championId);
      this.emit('otp', { championId, status: this.otp.status() });
    });
    this.live = new LiveGame(this.champions, config);
    this.scouting = new Scouting(this.riot);
    this.profile = new Profile(this.riot, dir);

    this.recommender.on('change', rows => this.emit('recs', rows));
    this.draft.on('change', s => { this.emit('draft', s); this.refreshCounterBans(); });
    this.live.on('change', s => this.emit('live', s));
    this.scouting.on('change', s => this.emit('scouting', s));
    this.profile.on('change', s => {
      this.emit('profile', s);
      this.otp.prioritize((s?.champions || []).slice(0, 10).map(c => c.championId));
    });
    this.profile.on('postgame', s => this.emit('postgame', s));

    this.authRetry = 0;
    this.clientOpen = false;
    this.phase = 'None';
    this.inGame = false;
    this.readySince = null;
    this.acceptedCount = 0;
    this.assignedPosition = '';
    this.prewarmed = false;
    this.status = { text: 'Esperando al cliente de LoL...', color: 'gray' };
    this.busy = false;

    // Sin cliente abierto se usa la ultima cuenta conocida para el perfil
    const identity = config.get().identity;
    if (identity) {
      this.profile.setIdentity(identity);
      if (identity.region) this.riot.setRegion(identity.region);
    }
  }

  async start() {
    try {
      this.champions.setDataDragon(await this.ddragon.load());
    } catch (e) {
      log(`Data Dragon: ${e.message}`);
    }
    this.emit('champions', this.champions.snapshot());
    this.refreshRecs();
    if (this.profile.identity) this.profile.refresh();
    this.syncOtp();
    this.timer = setInterval(async () => {
      // Si una vuelta tarda mas de 1 s, no solapar la siguiente
      if (this.busy) return;
      this.busy = true;
      try {
        await this.tick();
      } catch (e) {
        this.setStatus(`Error: ${e.message}`, 'red');
      } finally {
        this.busy = false;
      }
    }, 1000);
  }

  stop() {
    clearInterval(this.timer);
    this.live.stop();
    this.otp.stop();
  }

  // Recopilacion de builds OTP en segundo plano (Ajustes > Builds de OTP)
  syncOtp() {
    if (this.config.get().otpBuilds) {
      // Primero tu preseleccion y tus campeones del perfil (funciona sin el cliente abierto)
      this.otp.prioritize([this.config.get().pick?.id, ...(this.profile.state?.champions || []).slice(0, 10).map(c => c.championId)]);
      this.otp.start();
    } else this.otp.stop();
  }

  setStatus(text, color) {
    this.status = { text, color };
    this.emit('state', this.state());
  }

  state() {
    const id = this.profile.identity;
    return {
      connected: this.clientOpen,
      phase: this.phase,
      status: this.status,
      acceptedCount: this.acceptedCount,
      summoner: id ? { gameName: id.gameName, tagLine: id.tagLine, profileIconId: id.profileIconId, level: id.level } : null,
      keys: { riot: this.riot.hasKey(), anthropic: this.coach.hasKey() },
      ai: this.coach.status(),
      campTimers: this.campTimers ?? null,   // opcion del juego activada (null: cliente sin conectar)
      otp: this.otp.status(),                // recopilacion de builds OTP
      lobby: this.lobby || null,             // invitaciones y cola (Inicio > Cliente)
      // Version y actualizacion automatica (updater.js); sin empaquetar, solo la version
      update: this.update ? { ...this.update } : { version: require('../../package.json').version, state: 'dev', next: null },
    };
  }

  // Objetivo de CS/min automatico para tu campeon y posicion: CS medio por partida en U.GG (Esmeralda+)
  // entre la duracion media de tus partidas (de tu historial; 28 min si no hay). null = usar el manual
  async csTarget(championId, role) {
    role = ROLE_FROM_POSITION[role] || role;
    const ugg = require('./ugg');
    const avg = await ugg.championCs(championId, role).catch(() => null);
    if (!avg) return null;
    const games = (this.profile.state?.matches || []).filter(m => !m.remake && m.durationSec >= 900);
    const minutes = games.length >= 5 ? games.reduce((s, m) => s + m.durationSec, 0) / games.length / 60 : 28;
    const perMin = Math.round(Math.min(12, Math.max(0.5, avg.csPerGame / minutes)) * 10) / 10;
    return { perMin, csPerGame: Math.round(avg.csPerGame), minutes: Math.round(minutes), role, championId };
  }

  // Invitaciones pendientes y estado de la cola, para aceptarlas y buscar/cancelar desde Inicio
  async refreshLobby(phase) {
    const lobby = { invitations: [], canSearch: false, searching: null };
    try {
      const invs = await this.lcu.request('GET', '/lol-lobby/v2/received-invitations').catch(() => []);
      for (const inv of (invs || []).filter(i => i.state === 'Pending')) {
        lobby.invitations.push({
          id: inv.invitationId,
          from: await this.inviterName(inv),
          queue: QUEUE_NAMES[inv.gameConfig?.queueId] || inv.gameConfig?.gameMode || 'Partida',
        });
      }
      if (phase === 'None' || phase === 'Lobby') lobby.queues = await this.queueList();
      if (phase === 'Lobby') {
        const l = await this.lcu.request('GET', '/lol-lobby/v2/lobby').catch(() => null);
        const qid = l?.gameConfig?.queueId;
        lobby.isLeader = !!l?.localMember?.isLeader;
        lobby.canSearch = !!(lobby.isLeader && l?.canStartActivity);
        lobby.queueId = qid ?? null;
        lobby.queue = QUEUE_NAMES[qid] || lobby.queues?.find(q => q.id === qid)?.name || null;
        lobby.members = l?.members?.length || 1;
        // Colas con eleccion de posiciones (clasificatorias, reclutamiento)
        lobby.positions = l?.gameConfig?.showPositionSelector
          ? { first: l.localMember?.firstPositionPreference || 'UNSELECTED', second: l.localMember?.secondPositionPreference || 'UNSELECTED' }
          : null;
        // Para la seleccion: el preseleccionado solo vale en la posicion principal
        this.champSelect.lobbyFirst = lobby.positions?.first || '';
      }
      if (phase === 'Matchmaking') {
        // El tiempo en cola esta en /lol-matchmaking/v1/search (search-state de la sala no lo trae).
        // Si el cliente no lo da, se cuenta desde que la app vio empezar la busqueda
        const s = await this.lcu.request('GET', '/lol-matchmaking/v1/search').catch(() => null);
        this.searchSince ||= Date.now();
        const own = (Date.now() - this.searchSince) / 1000;
        lobby.searching = { time: Math.round(s?.timeInQueue ?? own), estimated: Math.round(s?.estimatedQueueTime || 0) };
      } else {
        this.searchSince = null;
      }
    } catch (e) {
      log(`sala: ${e.message}`);
    }
    this.lobby = lobby;
  }

  // Colas de LoL disponibles ahora en el cliente (sin TFT, personalizadas ni tutoriales), para crear
  // una sala desde Inicio. Se piden cada 10 min: cambian con los modos rotativos
  async queueList() {
    if (this.queuesCache && Date.now() - this.queuesCache.t < 10 * 60e3) return this.queuesCache.list;
    const all = await this.lcu.request('GET', '/lol-game-queues/v1/queues', undefined, 5000).catch(() => null);
    if (!Array.isArray(all)) return this.queuesCache?.list || [];
    const rank = q => { const i = QUEUE_ORDER.indexOf(q.id); return i >= 0 ? i : 100 - (q.gameSelectPriority || 0) / 100; };
    const list = all
      .filter(q => q.queueAvailability === 'Available' && q.isVisible && !q.isCustom && q.gameMode !== 'TFT'
        && ['kPvP', 'kVersusAI'].includes(q.gameSelectCategory) && !/^TUTORIAL/.test(q.gameMode || ''))
      .map(q => ({
        id: q.id,
        name: QUEUE_NAMES[q.id] || (q.mapId === 453 ? `Grieta Classic: ${q.description || q.name}` : q.description || q.name) || `Cola ${q.id}`,
        group: q.isRanked ? 'Clasificatorias' : q.gameSelectCategory === 'kVersusAI' ? 'Contra la IA' : 'Normales y modos',
        rank: rank(q),
      }))
      .filter(q => q.name)
      .sort((a, b) => a.rank - b.rank)
      .map(({ rank, ...q }) => q);
    this.queuesCache = { t: Date.now(), list };
    return list;
  }

  // Riot ID de quien invita (el nombre puede venir vacio en la invitacion)
  async inviterName(inv) {
    this.names ||= new Map();
    if (inv.fromSummonerName) return inv.fromSummonerName;
    const id = inv.fromSummonerId;
    if (!this.names.has(id)) {
      const s = await this.lcu.request('GET', `/lol-summoner/v1/summoners/${id}`).catch(() => null);
      this.names.set(id, s?.gameName ? `${s.gameName}#${s.tagLine}` : 'Un amigo');
    }
    return this.names.get(id);
  }

  // Rol para las recomendaciones de baneo: el elegido a mano, el asignado en la seleccion o ''
  recRole() {
    return this.config.get().role || ROLE_FROM_POSITION[this.assignedPosition] || '';
  }

  refreshRecs() {
    const ready = this.champions.loaded && !!this.lcu.auth;
    this.recommender.update(this.config.get().pick, this.recRole(), ready);
    this.refreshCounterBans();
  }

  // Baneos contra tu pick y tu equipo: en la seleccion, tu campeon (o intencion) y los aliados con
  // campeon; fuera, tu preseleccion
  refreshCounterBans() {
    // Basta Data Dragon (U.GG no necesita el cliente)
    if (!this.champions.ddragon) return;
    const d = this.draft.state;
    if (d.active) {
      const pick = d.myChampionId ? { id: d.myChampionId } : this.config.get().pick;
      const allies = d.allies.filter(a => !a.isMe).map(a => ({ championId: a.championId, position: a.position }));
      this.recommender.updateCounter(pick, d.role || this.recRole(), allies, [...d.bans.ally, ...d.bans.enemy]);
    } else {
      this.recommender.updateCounter(this.config.get().pick, this.recRole());
    }
  }

  async onConnected() {
    if (this.lcu.auth?.installDir) this.installDir = this.live.installDir = this.lcu.auth.installDir;
    if (await this.champions.load(this.lcu)) {
      this.emit('champions', this.champions.snapshot());
      this.refreshRecs();
    }
    // Cuenta y region del cliente
    try {
      const s = await this.lcu.request('GET', '/lol-summoner/v1/current-summoner');
      const region = (await this.lcu.request('GET', '/riotclient/region-locale').catch(() => null))?.region || 'EUW';
      this.riot.setRegion(region);
      const identity = { puuid: s.puuid, gameName: s.gameName || s.displayName, tagLine: s.tagLine || '', profileIconId: s.profileIconId, level: s.summonerLevel, region };
      const changed = this.profile.identity?.puuid !== identity.puuid;
      this.profile.setIdentity(identity);
      this.config.set({ identity });
      if (changed || !this.profile.state.updatedAt) this.profile.refresh();
    } catch (e) {
      log(`cuenta: ${e.message}`);
    }
    if (!this.prewarmed && this.champions.loaded) {
      this.prewarmed = true;
      this.draft.prewarm(this.config.get().role);
      // Los OTP de tus campeones van primero
      this.draft.personalStats().then(stats => this.otp.prioritize(
        [...stats.entries()].sort((a, b) => b[1].games - a[1].games).slice(0, 10).map(([id]) => id))).catch(() => {});
    }
    await this.syncCampTimers();
  }

  // Opcion del juego que muestra siempre los timers de los campamentos en el minimapa
  // (HUD.MinimapEnableAllTimers). Se cambia por la API del cliente, igual que desde Opciones, asi que
  // se guarda en la cuenta. Con config.gameCampTimers activo se enciende al conectar; si el usuario
  // lo desactiva en la app, no se toca el cliente
  async syncCampTimers() {
    if (!this.lcu.auth) return;
    try {
      const settings = await this.lcu.request('GET', '/lol-game-settings/v1/game-settings');
      let on = !!settings?.HUD?.MinimapEnableAllTimers;
      if (!on && this.config.get().gameCampTimers) {
        await this.lcu.request('PATCH', '/lol-game-settings/v1/game-settings', { HUD: { MinimapEnableAllTimers: true } });
        await this.lcu.request('POST', '/lol-game-settings/v1/save').catch(() => null);
        on = true;
        log('timers de campamentos del juego activados');
      }
      if (on !== this.campTimers) {
        this.campTimers = on;
        this.emit('state', this.state());
      }
    } catch (e) {
      log(`timers de campamentos: ${e.message}`);
    }
  }

  async onPhaseChange(prev, phase) {
    // La recopilacion OTP para cuando la API hace falta para otra cosa (scouting y post-partida)
    this.otp.paused = ['GameStart', 'WaitingForStats', 'PreEndOfGame', 'EndOfGame'].includes(phase);
    if (phase === 'ChampSelect') this.draft.start();
    else if (prev === 'ChampSelect') this.draft.stop();

    if (IN_GAME.includes(phase) && !this.inGame) {
      this.inGame = true;
      this.matchBefore = this.profile.latestMatchId();
      const role = this.draft.state.role;
      this.live.start(championId => this.draft.buildFor(championId, role), (championId, position) => this.csTarget(championId, position || role));
      this.profile.apiPuuid().catch(() => null).then(puuid => this.scouting.start(puuid));
    } else if (!IN_GAME.includes(phase) && this.inGame) {
      this.inGame = false;
      this.live.stop();
      this.scouting.stop();
      this.draft.clearPersonal();
      this.recommender.clearPersonal();
      this.refreshRecs();
      this.profile.afterGame(this.matchBefore);
    }
  }

  async tick() {
    if (!this.lcu.auth) {
      // Buscar el proceso es lento, asi que solo lo intentamos cada 3 s
      if (this.authRetry-- > 0) return;
      this.authRetry = 3;
      if (!(await this.lcu.connect())) return this.setStatus('Esperando al cliente de LoL...', 'gray');
    }

    let phase;
    try {
      phase = String(await this.lcu.request('GET', '/lol-gameflow/v1/gameflow-phase'));
    } catch {
      this.lcu.disconnect();
      this.champions.loaded = false;
      this.recommender.reset();
      if (this.clientOpen) {
        this.clientOpen = false;
        this.emit('client-closed');
      }
      if (this.phase !== 'None') {
        const prev = this.phase;
        this.phase = 'None';
        await this.onPhaseChange(prev, 'None');
      }
      return this.setStatus('Esperando al cliente de LoL...', 'gray');
    }

    if (!this.clientOpen) {
      this.clientOpen = true;
      this.emit('client-opened');
      await this.onConnected();
    }
    if (!this.champions.loaded) {
      try { await this.onConnected(); } catch { }
    }
    if (phase !== this.phase) {
      const prev = this.phase;
      this.phase = phase;
      await this.onPhaseChange(prev, phase);
    }

    const name = PHASES[phase] || phase;

    if (phase === 'ChampSelect') {
      const { session, position } = await this.champSelect.tick();
      if (position !== this.assignedPosition) {
        this.assignedPosition = position;
        this.refreshRecs();
      }
      await this.draft.update(session, this.config.get().role);
      return this.setStatus([name, ...this.champSelect.statusLines].join('\n'), 'blue');
    }
    // Fuera de la seleccion ya no hay rol asignado
    if (this.assignedPosition) {
      this.assignedPosition = '';
      this.refreshRecs();
    }
    this.champSelect.reset();

    if (phase !== 'ReadyCheck') {
      this.readySince = null;
      if (['None', 'Lobby', 'Matchmaking'].includes(phase)) await this.refreshLobby(phase);
      else { this.lobby = null; this.searchSince = null; }
      return this.setStatus(name, 'blue');
    }

    const { autoAccept, acceptDelay } = this.config.get();
    if (!autoAccept) return this.setStatus(`${name} (auto-aceptar desactivado)`, 'red');

    const check = await this.lcu.request('GET', '/lol-matchmaking/v1/ready-check');
    // Si ya se acepto o el jugador la rechazo a mano, no tocamos nada
    if (check.playerResponse !== 'None') return this.setStatus(`Cola: ${check.playerResponse}`, 'green');

    if (!this.readySince) this.readySince = Date.now();
    const remaining = acceptDelay - (Date.now() - this.readySince) / 1000;
    if (remaining > 0) return this.setStatus(`${name} Aceptando en ${Math.ceil(remaining)} s`, 'green');

    await this.lcu.request('POST', '/lol-matchmaking/v1/ready-check/accept');
    this.acceptedCount++;
    this.setStatus('¡Cola aceptada!', 'green');
    this.emit('accepted');
  }

  // ---- Acciones de la interfaz ----
  async action(name, args = {}) {
    switch (name) {
      case 'refreshProfile':
        return this.profile.refresh();
      case 'getMatch':
        return this.profile.analyze(args.matchId);
      case 'askCoach':
        return this.coach.analyze(await this.profile.analyze(args.matchId));
      case 'askDraftCoach':
        return this.coach.draftAdvice(this.draft.state, this.recommender.rows, await this.draft.pool(this.draft.state.role));
      case 'patchNotes': {
        // Notas del ultimo parche extraidas sin IA; tu rol y tus campeones mas jugados solo sirven para destacarlos
        const { PatchNotes } = require('./patchnotes');
        this.patchNotes ||= new PatchNotes(this.dir, this.champions);
        const p = this.profile.state || {};
        const role = p.roles?.[0]?.role || this.config.get().role || '';
        const pool = (p.champions || []).filter(c => c.games > 0).slice(0, 8)
          .map(c => ({ championId: c.championId, games: c.games, wins: c.wins }));
        return this.patchNotes.get({ refresh: !!args.refresh, role, pool });
      }
      case 'championStats': {
        // Explorador de campeon de la vista Seleccion (solo OP.GG, funciona sin cliente)
        const { ChampStats } = require('./champstats');
        this.champStats ||= new ChampStats(this.champions, this.otp);
        return this.champStats.get(Number(args.championId), args.role || '', Number(args.vs) || null);
      }
      case 'invitation':
        await this.lcu.request('POST', `/lol-lobby/v2/received-invitations/${encodeURIComponent(args.id)}/${args.accept ? 'accept' : 'decline'}`);
        return true;
      case 'searchQueue':
        await this.lcu.request(args.start ? 'POST' : 'DELETE', '/lol-lobby/v2/lobby/matchmaking/search');
        return true;
      case 'createLobby': {
        // Crea la sala de esa cola (o cambia la cola de la sala actual, si eres el lider)
        const queueId = Number(args.queueId);
        if (!(await this.queueList()).some(q => q.id === queueId)) throw new Error('Esa cola no está disponible ahora');
        await this.lcu.request('POST', '/lol-lobby/v2/lobby', { queueId }, 5000);
        await this.refreshLobby('Lobby');
        this.emit('state', this.state());
        return true;
      }
      case 'setPositions': {
        const first = POSITIONS.includes(args.first) ? args.first : 'UNSELECTED';
        // Con Relleno de principal no hay secundaria
        const second = first === 'FILL' ? 'UNSELECTED' : POSITIONS.includes(args.second) && args.second !== first ? args.second : 'UNSELECTED';
        await this.lcu.request('PUT', '/lol-lobby/v2/lobby/members/localMember/position-preferences', { firstPreference: first, secondPreference: second }, 5000);
        return true;
      }
      case 'chooseBuild':
        return this.draft.choose(Number(args.index) || 0);
      case 'hoverChampion':
        return this.draft.hover(args.championId);
      case 'lockChampion':
        return this.draft.lock(Number(args.championId));
      case 'importBuild':
        return this.draft.importBuild();
      case 'importItems':
        return this.draft.importBuild({ items: true });
      case 'testOverlay':
        this.emit('test-overlay', this.live.sample());
        return true;
      case 'testMatchup': {
        // Prueba de "Tu enfrentamiento" fuera de la seleccion, con datos reales (explorador)
        const { matchupCheck } = require('./matchup');
        const ugg = require('./ugg');
        const me = Number(args.championId), vs = Number(args.vs), role = String(args.role || '');
        if (!me || !vs || !role) throw new Error('Elige campeón, línea y rival');
        const u = await ugg.laneMatchup(me, role, [vs]).catch(() => null);
        this.otp.prioritize([me], true);
        const check = await matchupCheck(this.champions, me, vs, role, u, this.otp);
        if (!check) throw new Error('No hay datos de este enfrentamiento');
        return check;
      }
      default:
        throw new Error(`Acción desconocida: ${name}`);
    }
  }

  async setSecret(name, value) {
    value = String(value || '').trim();
    try {
      if (name === 'riot') {
        if (!/^RGAPI-/.test(value)) throw new Error('La clave de Riot empieza por RGAPI-');
        await this.riot.validate(value);
        this.riot.saveKey(value);
        this.profile.refresh();
      } else if (name === 'anthropic') {
        if (!value.startsWith('sk-ant-')) throw new Error('La clave de Anthropic empieza por sk-ant-');
        await this.coach.saveKey(value);
      } else {
        throw new Error('Clave desconocida');
      }
      this.emit('state', this.state());
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  }

  snapshot() {
    return {
      config: this.config.get(),
      state: this.state(),
      champions: this.champions.snapshot(),
      recs: this.recommender.rows,
      draft: this.draft.state,
      scouting: this.scouting.state,
      live: this.live.state,
      profile: this.profile.state,
      postgame: this.profile.postgame,
    };
  }
}

module.exports = { Companion };
