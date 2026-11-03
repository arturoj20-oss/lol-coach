// Vista Inicio: perfil, rango, grafica de LP, resumen reciente, campeones y estado del cliente
'use strict';

// Periodos de la grafica de LP
const LP_RANGES = {
  week: { name: 'Semana', label: 'en la última semana', days: 7 },
  month: { name: 'Mes', label: 'en el último mes', days: 30 },
  year: { name: 'Año', label: 'en el último año', days: 365 },
};
// Rangos en la escala de valores de profile.lpValue (400 por rango; Maestro+ desde 2800)
const TIER_KEYS = ['iron', 'bronze', 'silver', 'gold', 'platinum', 'emerald', 'diamond', 'master'];
const TIER_BANDS = TIER_KEYS.map((k, i) => ({ from: i * 400, cls: `tier-${k}` }));
const tierClass = v => `tier-${TIER_KEYS[Math.min(7, Math.max(0, Math.floor(v / 400)))]}`;

App.register('home', {
  channels: ['state', 'config', 'profile', 'champions', 'recs'],
  lpQueue: 'RANKED_SOLO_5x5',
  lpRange: 'month',

  mount(el) {
    this.el = el;
    setHtml(el, html`<div class="home">
      <div class="home-left">
        <div class="card profile-card" id="homeProfile"></div>
        <div class="card client-card"><div id="homeClient"></div><div id="homeQuick"></div></div>
      </div>
      <div class="home-right">
        <div class="card lp-card" id="homeLp"></div>
        <div class="home-row">
          <div class="card" id="homeRecent"></div>
          <div class="card" id="homeChamps"></div>
        </div>
      </div>
    </div>`);

    el.addEventListener('click', e => {
      const a = e.target.closest('[data-act]');
      if (!a) return;
      if (a.dataset.act === 'settings') App.go('settings');
      if (a.dataset.act === 'refresh') window.api.action('refreshProfile').catch(err => App.toast(err.message, 'error'));
      if (a.dataset.act === 'queue') { this.lpQueue = a.dataset.q; this.renderLp(); }
      if (a.dataset.act === 'lpRange') { this.lpRange = a.dataset.r; this.renderLp(); }
      if (a.dataset.act === 'sort') { this.champSort = a.dataset.k; this.renderChamps(); }
      if (a.dataset.act === 'match') { App.go('history'); App.views.history?.openMatch?.(a.dataset.id); }
      if (a.dataset.act === 'counterBan') {
        const id = +a.dataset.id;
        window.api.setConfig({ ban: { id, name: Dd.champName(id) } });
        App.toast(`${Dd.champName(id)} será tu baneo`, 'ok');
      }
      if (a.dataset.act === 'champHistory') { App.views.history?.setFilter?.({ champ: +a.dataset.id }); App.go('history'); }
      if (a.dataset.act === 'invite' || a.dataset.act === 'search') {
        a.disabled = true;
        const call = a.dataset.act === 'invite'
          ? window.api.action('invitation', { id: a.dataset.id, accept: a.dataset.accept === '1' })
          : window.api.action('searchQueue', { start: a.dataset.start === '1' });
        call.catch(err => { App.toast(err.message || 'El cliente no lo ha permitido', 'error'); a.disabled = false; });
      }
      if (a.dataset.act === 'lobby') {
        a.disabled = true;
        window.api.action('createLobby', { queueId: +a.dataset.q })
          .catch(err => { App.toast(err.message || 'El cliente no ha dejado crear la sala', 'error'); a.disabled = false; });
      }
    });
    el.addEventListener('change', e => {
      if (e.target.id === 'homeAutoAccept') window.api.setConfig({ autoAccept: e.target.checked });
      const k = e.target.dataset.k;
      if (k === 'queuePick') { this.queuePick = +e.target.value; this.renderClient(); }
      if (k === 'pos1' || k === 'pos2') {
        const first = $('[data-k="pos1"]', this.el).value, second = $('[data-k="pos2"]', this.el).value;
        window.api.action('setPositions', { first, second }).catch(err => App.toast(err.message || 'El cliente no ha aceptado las posiciones', 'error'));
      }
    });
    this.buildQuick();
    this.renderAll();
  },

  update(channel) {
    if (channel === 'state') this.notifyInvites();
    if (channel === 'config' || channel === 'state') this.renderClient();
    if (channel === 'config') this.applyQuick();
    if (channel === 'recs') return this.renderCounterBans();
    if (channel === 'champions') { this.quick.pick.refresh(); this.quick.ban.refresh(); }
    if (channel !== 'config') { this.renderProfile(); this.renderLp(); this.renderRecent(); this.renderChamps(); }
  },

  renderAll() {
    this.renderProfile(); this.renderClient(); this.applyQuick(); this.renderLp(); this.renderRecent(); this.renderChamps();
  },

  // Pick, baneo y rol de la proxima seleccion (se construyen una vez para no perder el foco)
  buildQuick() {
    const box = $('#homeQuick');
    const owned = () => {
      const ids = new Set(App.data.champions?.owned || []);
      return (App.data.champions?.all || []).filter(c => ids.has(c.id));
    };
    const all = () => App.data.champions?.all || [];
    const pick = ChampPicker({ source: owned, label: 'Campeón preseleccionado', onChange: v => window.api.setConfig({ pick: v }) });
    const ban = ChampPicker({ source: all, label: 'Campeón a banear', onChange: v => window.api.setConfig({ ban: v }) });
    setHtml(box, html`<div class="sep"></div>
      <h3 class="quick-title">Próxima selección</h3>
      <div class="quick">
        <div class="field"><span class="label" data-tip="Solo se marca si te toca tu posición principal (o en colas sin posiciones, como ARAM)">Preseleccionar · solo en tu posición principal</span><div data-slot="pick"></div></div>
        <div class="counter-bans" id="homeCounterBans"></div>
        <label class="check"><input type="checkbox" data-k="autoLock"><span>Bloquear automáticamente</span></label>
        <div class="field"><span class="label">Banear</span><div data-slot="ban"></div></div>
        <div class="field"><span class="label">Rol</span>
          <select class="select" data-k="role" aria-label="Rol">
            ${['', 'top', 'jungle', 'mid', 'adc', 'support'].map(r => html`<option value="${r}">${r ? roleName(r) : 'Automático (el asignado)'}</option>`)}
          </select></div>
      </div>`);
    $('[data-slot="pick"]', box).replaceWith(pick.el);
    $('[data-slot="ban"]', box).replaceWith(ban.el);
    box.addEventListener('change', e => {
      const k = e.target.dataset.k;
      if (k === 'autoLock') window.api.setConfig({ autoLock: e.target.checked });
      if (k === 'role') window.api.setConfig({ role: e.target.value });
    });
    this.quick = { pick, ban, wrap: box };
  },

  applyQuick() {
    const c = App.data.config;
    if (!c || !this.quick) return;
    this.quick.pick.set(c.pick);
    this.quick.ban.set(c.ban);
    $('[data-k="autoLock"]', this.quick.wrap).checked = !!c.autoLock;
    $('[data-k="role"]', this.quick.wrap).value = c.role || '';
    this.renderCounterBans();
  },

  // Baneos que hacen counter a tu preseleccion (y a tus aliados en la seleccion); clic = banearlo
  renderCounterBans() {
    const box = $('#homeCounterBans');
    const row = App.data.recs?.counter;
    if (!box) return;
    if (!App.data.config?.pick?.id || !row) return setHtml(box, '');
    const ban = App.data.config?.ban?.id;
    setHtml(box, html`<div class="cb-title">Baneos que le hacen counter</div>
      ${row.items?.length ? html`<div class="cb-list">${row.items.map(i => html`
        <button type="button" class="cb-btn ${i.id === ban ? 'on' : ''}" data-act="counterBan" data-id="${i.id}" aria-pressed="${i.id === ban}"
          data-tip-title="${i.name}" data-tip="${i.tip || ''}\nClic para banearlo">
          ${icon('champ', i.id, { size: 32, tip: false })}<span class="cb-val num">${i.text}</span></button>`)}</div>
        <div class="cb-sub muted">${row.title.replace(/:$/, '')}</div>`
      : html`<div class="cb-sub muted">${row.empty}</div>`}`);
  },

  // Sin clave de Riot el perfil detallado no esta disponible
  needsKey() { return !App.data.state?.keys?.riot; },

  renderProfile() {
    const { profile, state } = App.data;
    const s = profile?.summoner || state?.summoner;
    const box = $('#homeProfile');
    if (!s) {
      return setHtml(box, html`<div class="card-head"><h2>Perfil</h2></div>
        ${emptyState({ glyph: 'plug', title: 'Sin invocador', text: 'Abre el cliente de League of Legends para ver tu perfil.' })}`);
    }
    const head = html`<div class="profile-head">
      <div class="avatar">${icon('profile', s.profileIconId, { size: 76, round: true, name: s.gameName, tip: false })}<span class="lvl num">${s.level}</span></div>
      <div class="profile-id">
        <div class="profile-name">${s.gameName}</div>
        <div class="muted">#${s.tagLine}</div>
        ${profile?.updatedAt ? html`<div class="profile-upd muted">Actualizado ${fmt.ago(profile.updatedAt)}</div>` : ''}
      </div>
      ${!this.needsKey() ? html`<button class="icon-btn" data-act="refresh" aria-label="Actualizar" data-tip="Recargar perfil e historial">${raw(SVG.refresh)}</button>` : ''}
    </div>`;

    let body;
    if (this.needsKey()) {
      body = html`<div class="notice warn">${raw(SVG.key.replace('viewBox="0 0 64 64"', 'viewBox="0 0 64 64" width="18" height="18"'))}
        <span class="grow">Añade tu clave de Riot para ver tu rango, LP e historial.</span>
        <button class="btn small" data-act="settings">Ajustes</button></div>`;
    } else if (profile?.loading && !profile.ranked) {
      body = html`<div class="rank-list">${[0, 1].map(() => html`<div class="rank-row"><span class="skel rank-skel"></span><span class="skel line-skel"></span></div>`)}</div>`;
    } else if (profile?.error) {
      body = html`<div class="notice error">${raw(SVG.warn)}<span class="grow">${profile.error}</span><button class="btn small" data-act="refresh">Reintentar</button></div>`;
    } else {
      const queues = ['RANKED_SOLO_5x5', 'RANKED_FLEX_SR'];
      body = html`<div class="rank-list">${queues.map(q => {
        const r = profile?.ranked?.find(x => x.queue === q);
        const games = r ? r.wins + r.losses : 0;
        return html`<div class="rank-row">
          <div class="emblem ${r ? '' : 'unranked'}">${r ? html`<img src="${Dd.emblem(r.tier)}" alt="" data-hide-on-error>` : ''}</div>
          <div class="rank-info">
            <div class="label">${QUEUE_NAMES[q]}</div>
            <div class="rank-name">${r ? rankName(r) : 'Sin clasificar'}${r?.hotStreak ? html` <span class="tag red" data-tip="Has ganado 3 o más seguidas">En racha</span>` : ''}</div>
            ${r ? html`<div class="rank-sub"><span class="gold num">${fmt.int(r.lp)} LP</span> · <span class="num">${r.wins}V ${r.losses}D</span> · <span class="${r.wins / games >= .5 ? 'win' : 'loss'} num">${fmt.pct(r.wins / games)}</span></div>` : html`<div class="rank-sub muted">Juega partidas para obtener rango</div>`}
          </div>
        </div>`;
      })}</div>`;
    }
    setHtml(box, html`${head}<div class="sep-diamond"></div>${body}`);
  },

  renderClient() {
    const { state, config } = App.data;
    const box = $('#homeClient');
    if (!state || !config) return;
    const conn = state.connected;
    const lines = (state.status?.text || '').split('\n');
    setHtml(box, html`<div class="card-head"><h2>Cliente</h2><span class="spacer"></span>
        <span class="conn ${conn ? state.status?.color || 'gray' : 'gray'}"><i></i>${conn ? 'Conectado' : 'Cerrado'}</span></div>
      <div class="client-status ${conn ? state.status?.color || 'gray' : 'gray'}">
        ${conn ? html`<div class="cs-main">${lines[0]}</div>${lines.slice(1).map(l => html`<div class="cs-sub">${l}</div>`)}`
               : html`<div class="cs-main">Esperando al cliente de LoL...</div><div class="cs-sub">Ábrelo y LoL Coach se conectará solo.</div>`}
      </div>
      ${conn ? this.lobbyBlock(state) : ''}
      <div class="sep"></div>
      <label class="switch"><input type="checkbox" id="homeAutoAccept" ${config.autoAccept ? 'checked' : ''}><span>Aceptar partida automáticamente</span></label>
      <div class="client-foot muted">
        <span>${config.acceptDelay ? `Retraso de ${config.acceptDelay} s` : 'Sin retraso'}</span>
        <span class="num">Colas aceptadas hoy: <b class="hi">${state.acceptedCount || 0}</b></span>
      </div>`);
  },

  // Aviso al llegar una invitacion nueva si estas en otra pestaña
  notifyInvites() {
    const invs = App.data.state?.lobby?.invitations || [];
    this.seenInvites ||= new Set();
    for (const inv of invs) {
      if (this.seenInvites.has(inv.id)) continue;
      this.seenInvites.add(inv.id);
      if (App.current !== 'home') App.toast(`Invitación de ${inv.from} (${inv.queue}): acéptala en Inicio`, 'ok');
    }
  },

  // Invitaciones a salas (ventana emergente con Aceptar/Rechazar) y buscar/cancelar cola
  lobbyBlock(state) {
    const lobby = state.lobby;
    if (!lobby) return '';
    const invites = (lobby.invitations || []).map(inv => html`<div class="invite-pop">
      <div class="invite-txt"><span class="label">Invitación</span><b class="hi">${inv.from}</b><span class="muted small">${inv.queue}</span></div>
      <div class="invite-btns">
        <button class="btn btn-primary small" data-act="invite" data-id="${inv.id}" data-accept="1">Aceptar</button>
        <button class="btn small" data-act="invite" data-id="${inv.id}" data-accept="0">Rechazar</button>
      </div></div>`);
    let queue = '';
    // Elegir cola: crea la sala (sin sala) o cambia la de la sala (si eres el lider)
    const queues = lobby.queues || [];
    let picker = '';
    if (!lobby.searching && queues.length && ['None', 'Lobby'].includes(state.phase)) {
      const inLobby = state.phase === 'Lobby';
      const sel = queues.some(q => q.id === this.queuePick) ? this.queuePick : inLobby && lobby.queueId ? lobby.queueId : queues[0].id;
      const groups = [...new Set(queues.map(q => q.group))];
      const same = inLobby && sel === lobby.queueId;
      const locked = inLobby && !lobby.isLeader;
      picker = html`<div class="queue-row queue-pick">
        <select class="select grow" data-k="queuePick" aria-label="Cola">
          ${groups.map(g => html`<optgroup label="${g}">${queues.filter(q => q.group === g).map(q => html`<option value="${q.id}" ${q.id === sel ? 'selected' : ''}>${q.name}</option>`)}</optgroup>`)}
        </select>
        <span ${locked ? raw('data-tip="Solo el líder de la sala puede cambiar la cola"') : ''}><button class="btn small ${inLobby ? '' : 'btn-primary'}" data-act="lobby" data-q="${sel}" ${same || locked ? 'disabled' : ''}>${inLobby ? 'Cambiar cola' : 'Crear sala'}</button></span>
      </div>`;
    }
    // Posiciones (clasificatorias y reclutamiento)
    let positions = '';
    if (state.phase === 'Lobby' && lobby.positions && !lobby.searching) {
      const POS = [['TOP', 'Top'], ['JUNGLE', 'Jungla'], ['MIDDLE', 'Mid'], ['BOTTOM', 'ADC'], ['UTILITY', 'Support'], ['FILL', 'Relleno']];
      const opt = (cur, none) => html`${none ? html`<option value="UNSELECTED" ${cur === 'UNSELECTED' ? 'selected' : ''}>Sin elegir</option>` : ''}${POS.map(([v, l]) => html`<option value="${v}" ${v === cur ? 'selected' : ''}>${l}</option>`)}`;
      const p = lobby.positions;
      positions = html`<div class="queue-row queue-pos">
        <label class="field grow"><span class="label">Principal</span><select class="select" data-k="pos1" aria-label="Posición principal">${opt(p.first, true)}</select></label>
        <label class="field grow"><span class="label">Secundaria</span><select class="select" data-k="pos2" aria-label="Posición secundaria" ${p.first === 'FILL' ? 'disabled' : ''}>${opt(p.second, true)}</select></label>
      </div>`;
    }
    if (lobby.searching) {
      const s = lobby.searching;
      queue = html`<div class="queue-row"><span class="spinner small"></span><span class="grow">Buscando: <b class="num">${fmt.clock(s.time)}</b>${s.estimated ? html` <span class="muted">(estimado ${fmt.clock(s.estimated)})</span>` : ''}</span>
        <button class="btn small" data-act="search" data-start="0">Cancelar búsqueda</button></div>`;
    } else if (state.phase === 'Lobby') {
      const why = lobby.isLeader === false ? 'Solo el líder de la sala puede buscar partida'
        : lobby.positions && (lobby.positions.first === 'UNSELECTED' || (lobby.positions.first !== 'FILL' && lobby.positions.second === 'UNSELECTED')) ? 'Elige tus dos posiciones'
        : 'El cliente aún no deja buscar partida';
      queue = html`<div class="queue-row"><span class="grow muted">${lobby.queue || 'En la sala'}${lobby.members > 1 ? html` · ${lobby.members} jugadores` : ''}</span>
        <span ${lobby.canSearch ? '' : raw(`data-tip="${why}"`)}><button class="btn btn-primary small" data-act="search" data-start="1" ${lobby.canSearch ? '' : 'disabled'}>Buscar partida</button></span></div>`;
    }
    return html`${invites}${picker}${positions}${queue}`;
  },

  renderLp() {
    const { profile } = App.data;
    const box = $('#homeLp');
    const head = html`<div class="card-head"><h2>Evolución de LP</h2><span class="spacer"></span>
      <div class="seg" role="group" aria-label="Periodo">
        ${Object.entries(LP_RANGES).map(([k, r]) => html`<button class="${this.lpRange === k ? 'on' : ''}" data-act="lpRange" data-r="${k}">${r.name}</button>`)}
      </div>
      <div class="seg" role="group" aria-label="Cola">
        <button class="${this.lpQueue === 'RANKED_SOLO_5x5' ? 'on' : ''}" data-act="queue" data-q="RANKED_SOLO_5x5">Solo/Dúo</button>
        <button class="${this.lpQueue === 'RANKED_FLEX_SR' ? 'on' : ''}" data-act="queue" data-q="RANKED_FLEX_SR">Flexible</button>
      </div></div>`;
    if (this.needsKey()) return setHtml(box, html`${head}<div class="chart-empty">${emptyState({ glyph: 'key', title: 'Gráfica no disponible', text: 'Necesita la clave de Riot.', action: html`<button class="btn small" data-act="settings">Ir a Ajustes</button>` })}</div>`);
    if (profile?.loading && !profile.lpHistory) return setHtml(box, html`${head}<div class="chart-box skel"></div>`);
    const all = (profile?.lpHistory || []).filter(p => p.queue === this.lpQueue);
    if (all.length < 2) return setHtml(box, html`${head}<div class="chart-empty">${emptyState({ glyph: 'crown', title: 'Aún sin datos', text: 'La gráfica aparecerá cuando juegues algunas clasificatorias en esta cola.' })}</div>`);
    // Periodo: los puntos dentro y, como punto de partida, el ultimo de antes (el rango con el que empezaste)
    const range = LP_RANGES[this.lpRange];
    const since = Date.now() - range.days * 864e5;
    const inside = all.filter(p => p.t >= since);
    const before = [...all].reverse().find(p => p.t < since);
    const pts = before ? [before, ...inside] : inside;
    const games = before ? inside.length : inside.length - 1;
    if (!inside.length || pts.length < 2) return setHtml(box, html`${head}<div class="chart-empty">${emptyState({ glyph: 'crown', title: `Sin partidas ${range.label}`, text: 'Prueba con un periodo más largo.' })}</div>`);
    const first = pts[0].value, last = pts[pts.length - 1].value;
    const delta = last - first;
    // Lineas de division deducidas de los propios puntos (value - LP = inicio de la division)
    const bases = new Map();
    for (const p of pts) {
      const r = parseRankLabel(p.label);
      if (r) bases.set(p.value - r.lp, r.short);
    }
    const grid = [...bases].map(([v, label]) => ({ v, label })).sort((a, b) => a.v - b.v);
    const now = parseRankLabel(pts[pts.length - 1].label);
    const nice = p => { const r = parseRankLabel(p.label); return r ? `${r.name} · ${r.lp} LP` : p.label; };
    // Los puntos estimados salen de tus resultados (victoria/derrota), no de los LP reales
    const estimated = pts.some(p => p.estimated);
    setHtml(box, html`${head}
      <div class="lp-summary"><span class="lp-now">${now ? now.name : pts[pts.length - 1].label}</span>${now ? html`<span class="lp-lp num">${now.lp} LP</span>` : ''}
        <span class="tag ${delta >= 0 ? 'green' : 'red'} num" data-tip="Cambio ${range.label}">${fmt.signed(delta)} LP</span>
        <span class="muted">${games} ${games === 1 ? 'partida' : 'partidas'}</span>
        ${estimated ? html`<span class="tag" data-tip="Calculado a partir de tus victorias y derrotas, no de los LP reales">Estimado</span>` : ''}</div>
      <div class="chart-box" id="lpChart"></div>`);
    lineChart($('#lpChart'), pts.map(p => ({ y: p.value, cls: tierClass(p.value), xLabel: fmt.date(p.t), title: nice(p) + (p.estimated ? ' (estimado)' : ''), text: fmt.dateTime(p.t) })), { grid, padLeft: 64, bands: TIER_BANDS });
  },

  renderRecent() {
    const { profile } = App.data;
    const box = $('#homeRecent');
    const head = html`<div class="card-head"><h2>Últimas partidas</h2><span class="spacer"></span>${profile?.recent ? html`<span class="sub">${profile.recent.games} partidas</span>` : ''}</div>`;
    if (this.needsKey()) return setHtml(box, html`${head}<p class="muted pad">Disponible con la clave de Riot.</p>`);
    if (!profile?.recent) return setHtml(box, html`${head}${profile?.loading ? skeletonRows(3) : html`<p class="muted pad">Sin partidas recientes.</p>`}`);
    const r = profile.recent;
    const losses = r.games - r.wins;
    const streak = (profile.matches || []).slice(0, 20).reverse();
    setHtml(box, html`${head}
      <div class="recent">
        <div class="recent-ring">${ring(r.wins / r.games, 84, 'Porcentaje de victorias')}<div class="num"><span class="win">${r.wins}V</span> <span class="loss">${losses}D</span></div></div>
        <div class="stat-grid">
          <div class="stat"><span class="stat-v num">${fmt.dec(r.kda, 2)}</span><span class="stat-l">KDA</span></div>
          <div class="stat"><span class="stat-v num">${fmt.dec(r.csPerMin)}</span><span class="stat-l">CS/min</span></div>
          <div class="stat"><span class="stat-v num">${fmt.dec(r.visionPerMin)}</span><span class="stat-l">Visión/min</span></div>
          <div class="stat" data-tip="Participación en asesinatos"><span class="stat-v num">${fmt.pct(r.killParticipation)}</span><span class="stat-l">Participación</span></div>
        </div>
      </div>
      <div class="streak" aria-label="Resultados recientes">${streak.map(m => html`<button class="${m.remake ? 'remake' : m.win ? 'w' : 'l'}" data-act="match" data-id="${m.matchId}" aria-label="Abrir partida" data-tip="${Dd.champName(m.championId)} · ${m.remake ? 'Repetición' : m.win ? 'Victoria' : 'Derrota'}\n${m.kills}/${m.deaths}/${m.assists} · ${fmt.ago(m.endedAt)}"></button>`)}</div>
      ${profile.roles?.length ? html`<div class="roles">${profile.roles.slice(0, 3).map(ro => html`<div class="role-row"><span>${roleName(ro.role)}</span><span class="bar"><i data-vars="--w:${(ro.games / r.games * 100).toFixed(0)}%"></i></span><span class="num muted">${ro.games} · ${fmt.pct(ro.wins / ro.games)}</span></div>`)}</div>` : ''}`);
  },

  // Orden de la lista de campeones: partidas, % de victorias o KDA
  champSort: 'games',

  renderChamps() {
    const { profile } = App.data;
    const box = $('#homeChamps');
    const sorts = { games: 'Partidas', wr: '% Vict.', kda: 'KDA' };
    const head = html`<div class="card-head"><h2>Tus campeones</h2><span class="spacer"></span>
      ${profile?.champions?.length > 1 ? html`<div class="seg seg-sm" role="group" aria-label="Ordenar campeones">${Object.entries(sorts).map(([k, l]) => html`<button class="${this.champSort === k ? 'on' : ''}" data-act="sort" data-k="${k}" aria-pressed="${this.champSort === k}">${l}</button>`)}</div>` : ''}</div>`;
    if (this.needsKey()) return setHtml(box, html`${head}<p class="muted pad">Disponible con la clave de Riot.</p>`);
    const key = { games: c => c.games, wr: c => c.wins / c.games, kda: c => c.kda };
    const list = [...(profile?.champions || [])].sort((a, b) => key[this.champSort](b) - key[this.champSort](a) || b.games - a.games).slice(0, 5);
    if (!list.length) return setHtml(box, html`${head}${profile?.loading ? skeletonRows(4) : html`<p class="muted pad">Sin datos todavía.</p>`}`);
    const matches = profile?.matches || [];
    setHtml(box, html`${head}<div class="champ-list">${list.map(c => {
      const wr = c.wins / c.games;
      const games = matches.filter(m => m.championId === c.championId).slice(0, 5);
      const k = `champ-${c.championId}`;
      return html`<div class="xp champ-xp ${xpOpen(k)}">
        <button class="xp-head champ-row" data-expand="${k}" aria-expanded="${xpExpanded(k)}">
          ${icon('champ', c.championId, { size: 36, tip: false })}
          <span class="champ-main"><span class="hi">${Dd.champName(c.championId)}</span><span class="muted num">${c.games} ${c.games === 1 ? 'partida' : 'partidas'}</span></span>
          <span class="champ-wr"><span class="${wr >= .5 ? 'win' : 'loss'} num">${fmt.pct(wr)}</span><span class="bar"><i class="${wr >= .5 ? 'w' : 'l'}" data-vars="--w:${(wr * 100).toFixed(0)}%"></i></span></span>
          <span class="champ-stat num"><span class="hi">${fmt.dec(c.kda, 2)}</span><span class="muted">KDA</span></span>
          <span class="champ-stat num"><span class="hi">${fmt.dec(c.csPerMin)}</span><span class="muted">CS/min</span></span>
          <span class="xp-chev">${raw(SVG.chevron)}</span>
        </button>
        <div class="xp-body"><div><div class="champ-games">
          ${games.map(m => html`<button class="mini-match ${m.remake ? 'remake' : m.win ? 'w' : 'l'}" data-act="match" data-id="${m.matchId}" data-tip="${m.remake ? 'Repetición' : m.win ? 'Victoria' : 'Derrota'} · ${fmt.ago(m.endedAt)}\nAbrir el análisis"><b class="num">${m.kills}/${m.deaths}/${m.assists}</b><span class="muted num">${m.cs} CS</span></button>`)}
          <button class="btn ghost small" data-act="champHistory" data-id="${c.championId}">Ver en el historial ${raw(SVG.arrow)}</button>
        </div></div></div>
      </div>`;
    })}</div>`);
  },
});
