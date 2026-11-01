// Seleccion de campeones: preselecciona, bloquea y banea segun la configuracion.
// Portado de lol-auto-accept, con sus apanos para las rarezas del cliente.
const { log } = require('./log');

class ChampSelect {
  constructor(lcu, config) {
    this.lcu = lcu;
    this.config = config;
    this.lobbyFirst = '';   // posicion principal vista en la sala (la apunta companion.refreshLobby)
    this.reset();
  }

  // Los ids de las acciones se repiten entre partidas, asi que se limpia todo al salir
  reset() {
    this.hoveredAction = null;
    this.bannedAction = null;
    this.confirm = {};
    this.lastTimerPhase = null;
    this.pickStatus = null;
    this.banStatus = null;
    this.firstPosition = undefined;   // posicion principal de esta seleccion (undefined = sin leer)
    this.skipLogged = false;
  }

  // El campeon preseleccionado solo vale para tu posicion principal (decision del usuario): si eliges
  // Draven con ADC y mid y te toca mid, no se marca. Sin posicion asignada (a ciegas, ARAM) vale siempre
  pickAllowed(position) {
    if (!position) return true;
    const first = this.firstPosition;
    if (!first || first === 'UNSELECTED') return true;   // no se sabe: como antes
    return first !== 'FILL' && position.toUpperCase() === first;
  }

  get statusLines() {
    return [this.banStatus, this.pickStatus].filter(Boolean);
  }

  // Devuelve la sesion y el rol asignado (vacio en partidas a ciegas)
  async tick() {
    const session = await this.lcu.request('GET', '/lol-champ-select/v1/session');
    // actions es una lista de fases, cada una con su lista de acciones
    const all = (session.actions || []).flat();
    const mine = all.filter(a => a.actorCellId === session.localPlayerCellId && !a.completed);
    const me = (session.myTeam || []).find(p => p.cellId === session.localPlayerCellId);
    const position = me?.assignedPosition || '';
    // Posicion principal elegida en la sala: se lee una vez por seleccion (la sala sigue existiendo
    // durante la seleccion); si no, la ultima vista en la sala
    if (this.firstPosition === undefined) {
      const l = await this.lcu.request('GET', '/lol-lobby/v2/lobby').catch(() => null);
      this.firstPosition = l?.localMember?.firstPositionPreference || this.lobbyFirst || '';
      log(`seleccion: posicion asignada=${position || '-'} principal=${this.firstPosition || '-'}`);
    }

    let msg = this.testConfirm('ban', all, 'baneado');
    if (msg) this.banStatus = msg;
    msg = this.testConfirm('pick', all, 'bloqueado');
    if (msg) this.pickStatus = msg;

    // Durante la planificacion (PLANNING) el cliente ya marca el ban como "en curso", pero
    // ignora cualquier ban o bloqueo hasta que empieza la fase real de bans y picks
    const phase = session.timer?.phase;
    if (phase !== 'BAN_PICK') {
      const pick = mine.find(a => a.type === 'pick');
      if (pick && !pick.isInProgress) {
        try { await this.doPick(pick, position); } catch (e) { this.pickStatus = `Error al preseleccionar: ${e.message}`; }
      }
      if (this.lastTimerPhase !== phase) log(`fase ${phase}: esperando a BAN_PICK`);
      this.lastTimerPhase = phase;
      return { session, position };
    }
    if (this.lastTimerPhase !== 'BAN_PICK') log('fase BAN_PICK');
    this.lastTimerPhase = 'BAN_PICK';

    const ban = mine.find(a => a.type === 'ban');
    if (ban) {
      try { await this.doBan(session, ban, all); } catch (e) {
        this.banStatus = `Error al banear: ${e.message}`;
        log(this.banStatus);
      }
    }
    const pick = mine.find(a => a.type === 'pick');
    if (pick) {
      try { await this.doPick(pick, position); } catch (e) {
        this.pickStatus = `Error al bloquear: ${e.message}`;
        log(this.pickStatus);
      }
    }
    return { session, position };
  }

  // Preselecciona (y opcionalmente bloquea) el campeon elegido en nuestro turno de pick
  async doPick(a, position = '') {
    const { pick, autoLock } = this.config.get();
    if (!pick?.id) return;
    if (!this.pickAllowed(position)) {
      const NAMES = { TOP: 'top', JUNGLE: 'jungla', MIDDLE: 'mid', BOTTOM: 'ADC', UTILITY: 'support', FILL: 'relleno' };
      this.pickStatus = `No preselecciono a ${pick.name}: te ha tocado ${NAMES[position.toUpperCase()] || position} y tu principal es ${NAMES[this.firstPosition] || this.firstPosition}`;
      if (!this.skipLogged) { this.skipLogged = true; log(this.pickStatus); }
      return;
    }

    // Solo una vez por accion: si luego cambias de campeon a mano, no lo pisamos
    if (a.championId === 0 && this.hoveredAction !== a.id) {
      this.hoveredAction = a.id;
      try {
        await this.lcu.request('PATCH', `/lol-champ-select/v1/session/actions/${a.id}`, { championId: pick.id });
        this.pickStatus = `${pick.name} preseleccionado`;
      } catch {
        this.pickStatus = `No se pudo preseleccionar a ${pick.name} (¿baneado o cogido?)`;
      }
      return;
    }
    // Bloquear solo si al empezar tu turno sigue marcado el nuestro
    if (autoLock && a.isInProgress && (this.confirm.pick || a.championId === pick.id)) {
      const msg = await this.stepConfirm('pick', a, pick.id, pick.name, 'Bloqueando', 'bloquear');
      if (msg) this.pickStatus = msg;
    }
  }

  // Banea el campeon elegido cuando llega nuestro turno de ban
  async doBan(session, a, all) {
    const { ban } = this.config.get();
    if (!ban?.id || !a.isInProgress || this.bannedAction === a.id) return;

    if (!this.confirm.ban) {
      // No banear lo que quiere jugar un companero ni lo que ya esta baneado
      const teamWants = (session.myTeam || [])
        .filter(p => p.cellId !== session.localPlayerCellId)
        .flatMap(p => [p.championPickIntent, p.championId]);
      if (teamWants.includes(ban.id)) {
        this.bannedAction = a.id;
        this.banStatus = `No baneo a ${ban.name}: lo quiere un compañero`;
        return;
      }
      const banned = [
        ...all.filter(x => x.type === 'ban' && x.completed).map(x => x.championId),
        ...(session.bans?.myTeamBans || []),
        ...(session.bans?.theirTeamBans || []),
      ];
      if (banned.includes(ban.id)) {
        this.bannedAction = a.id;
        this.banStatus = `${ban.name} ya está baneado`;
        return;
      }
    }
    const msg = await this.stepConfirm('ban', a, ban.id, ban.name, 'Baneando', 'banear');
    if (msg) this.banStatus = msg;
  }

  // El cliente responde OK a "confirmar" pero lo ignora si el campeon no se marco durante
  // el turno (el ban sale como -1 y el pick no se bloquea). Por eso, como un jugador:
  //   tick 1: marcar el campeon   tick 2: confirmar   tick 4: reintentar con POST complete
  // y se comprueba en testConfirm que el cliente lo registro de verdad.
  async stepConfirm(kind, a, champId, champ, doing, verb) {
    const job = this.confirm[kind];
    const url = `/lol-champ-select/v1/session/actions/${a.id}`;
    if (!job || job.action !== a.id) {
      // Marcar siempre una vez al empezar el turno (la intencion de la planificacion no vale)
      this.confirm[kind] = { action: a.id, champId, champ, verb, tries: 0, hovers: 1 };
      log(`${kind} accion=${a.id} campeon=${a.championId} -> marcar ${champId}`);
      await this.lcu.request('PATCH', url, { championId: champId });
      return `${doing} a ${champ}...`;
    }
    if (job.done) return null;
    log(`${kind} accion=${a.id} campeon=${a.championId} intento=${job.tries} marcados=${job.hovers}`);

    if (a.championId !== champId) {
      // Otro campeon elegido: lo has cambiado a mano, lo dejamos estar
      if (a.championId > 0) { job.done = true; return 'Cambiado a mano, no toco nada'; }
      // Sin campeon todavia: el cliente a veces ignora el primer intento al empezar el
      // turno, asi que seguimos intentandolo durante todo el turno (unos 30 s)
      if (job.hovers >= 30) { job.done = true; return `No se pudo ${verb} a ${champ}`; }
      job.hovers++;
      await this.lcu.request('PATCH', url, { championId: champId });
      return `${doing} a ${champ}...`;
    }

    job.tries++;
    // En el cliente real funciona el PATCH completed (con el campeon ya marcado); el POST
    // complete responde OK pero no hace nada, se deja solo como ultimo recurso
    if (job.tries === 1) {
      log('  confirmar (PATCH completed)');
      await this.lcu.request('PATCH', url, { championId: champId, completed: true });
    } else if (job.tries === 3) {
      log('  confirmar (POST complete)');
      await this.lcu.request('POST', `${url}/complete`);
    } else if (job.tries >= 5) {
      job.done = true;
      return `No se pudo ${verb} a ${champ}`;
    }
    return `${doing} a ${champ}...`;
  }

  // Cuando nuestra accion aparece completada, comprobar con que campeon quedo
  testConfirm(kind, all, doneText) {
    const job = this.confirm[kind];
    if (!job || job.checked) return null;
    const act = all.find(x => x.id === job.action && x.completed);
    if (!act) return null;
    job.checked = true;
    job.done = true;
    log(`${kind} accion=${job.action} completada con campeon=${act.championId}`);
    if (act.championId === job.champId) return `${job.champ} ${doneText}`;
    return `El cliente no registró el ${kind} de ${job.champ}`;
  }
}

module.exports = { ChampSelect };
