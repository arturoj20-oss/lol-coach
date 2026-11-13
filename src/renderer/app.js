// Ventana principal: estado global, barra superior, navegacion y cambio automatico de vista
'use strict';

const PHASE_NAMES = {
  None: 'Sin actividad', Lobby: 'En la sala', Matchmaking: 'Buscando partida', CheckedIntoTournament: 'Clash',
  ReadyCheck: 'Partida encontrada', ChampSelect: 'Selección de campeones', GameStart: 'Cargando partida',
  InProgress: 'En partida', Reconnect: 'Reconectar', WaitingForStats: 'Esperando estadísticas',
  PreEndOfGame: 'Fin de la partida', EndOfGame: 'Fin de la partida', FailedToLaunch: 'Error al iniciar',
};

const VIEWS = [
  { id: 'home', label: 'Inicio' },
  { id: 'select', label: 'Campeones' },
  { id: 'history', label: 'Historial' },
  { id: 'patch', label: 'Parche' },
  { id: 'settings', label: 'Ajustes' },
];

const App = {
  data: {},
  views: {},
  current: null,
  lastPhase: null,
  lastPostgameId: null,

  // Cada vista se registra con { channels, mount(el), update(channel) }
  register(id, view) { this.views[id] = view; },

  async start() {
    Tip.init();
    Seg.init();
    Expand.init();
    this.buildTopbar();
    let snap;
    try {
      snap = await window.api.init();
    } catch (err) {
      setHtml($('#views'), emptyState({ glyph: 'plug', title: 'No se pudo iniciar', text: String(err?.message || err), error: true }));
      return;
    }
    Object.assign(this.data, snap);
    Theme.set(snap.config?.theme);
    Dd.set(snap.champions);

    for (const v of VIEWS) {
      const el = $(`#view-${v.id}`);
      this.views[v.id]?.mount(el);
    }

    // Vista inicial segun la fase
    const phase = snap.state?.phase;
    this.lastPhase = phase;
    this.lastPostgameId = snap.postgame?.analysis?.matchId || null;
    // Sin vista de partida (decision del usuario: esa informacion ya se ve en el juego y en el overlay)
    if (phase === 'ChampSelect') this.go('select');
    else this.go('home');

    this.paintTopbar();
    for (const ch of ['config', 'state', 'champions', 'recs', 'draft', 'scouting', 'live', 'profile', 'postgame', 'otp']) {
      window.api.on(ch, data => this.set(ch, data));
    }
  },

  set(channel, data) {
    const prev = this.data[channel];
    this.data[channel] = data;
    if (channel === 'champions') Dd.set(data);
    if (channel === 'config') Theme.set(data?.theme);
    if (channel === 'draft') this.easterEggs(prev, data);
    for (const v of Object.values(this.views)) {
      if (v.channels.includes(channel)) {
        try { v.update(channel, prev); } catch (err) { console.error(`[${channel}]`, err); }
      }
    }
    this.autoNavigate(channel, data);
    if (['state', 'draft', 'live', 'scouting', 'postgame'].includes(channel)) this.paintTopbar();
  },

  // Easter eggs de la seleccion: al bloquear Tryndamere (id 23) suena su audio una vez
  easterEggs(prev, draft) {
    const tryn = d => !!(d?.locked && d.myChampionId === 23);
    if (tryn(draft) && !tryn(prev)) new Audio('sounds/tryndamere.mp3').play().catch(() => {});
  },

  // Cambia de vista sola en los momentos clave; despues el usuario puede moverse libremente
  autoNavigate(channel, data) {
    if (channel === 'state' && data.phase !== this.lastPhase) {
      this.lastPhase = data.phase;
      if (data.phase === 'ChampSelect') this.go('select');
    }
    if (channel === 'postgame' && data.analysis && data.analysis.matchId !== this.lastPostgameId) {
      this.lastPostgameId = data.analysis.matchId;
      this.go('history');
      this.views.history?.openMatch?.(data.analysis.matchId, data.analysis);
      this.newPostgame = this.current !== 'history';
    }
  },

  go(id) {
    if (!this.views[id] && !VIEWS.some(v => v.id === id)) return;
    const changed = this.current !== id;
    this.current = id;
    for (const v of VIEWS) {
      const el = $(`#view-${v.id}`);
      el.hidden = v.id !== id;
      const tab = $(`.tab[data-view="${v.id}"]`);
      tab.classList.toggle('active', v.id === id);
      tab.setAttribute('aria-selected', v.id === id);
      tab.tabIndex = v.id === id ? 0 : -1;
    }
    const view = $(`#view-${id}`);
    if (changed) {
      // Entrada suave de la vista
      view.classList.remove('entering');
      void view.offsetWidth;
      view.classList.add('entering');
    }
    if (id === 'history') this.newPostgame = false;
    this.views[id]?.show?.();
    // Los controles segmentados de una vista oculta no tenian tamano: se recolocan al mostrarla
    Seg.syncAll(view);
    this.moveTabInd();
    Tip.hide();
    this.paintTopbar();
  },

  // Indicador de la pestaña activa que se desliza entre pestañas
  moveTabInd(animate = true) {
    const ind = $('.tab-ind');
    const tab = $('.tab.active');
    if (!ind || !tab) return;
    ind.classList.toggle('no-anim', !animate || !ind.dataset.ready);
    ind.style.setProperty('--tab-x', tab.offsetLeft + 'px');
    ind.style.setProperty('--tab-w', tab.offsetWidth + 'px');
    ind.dataset.ready = '1';
  },

  buildTopbar() {
    setHtml($('#topbar'), html`
      <div class="brand">${raw(SVG.logo)}<span>LoL Coach</span></div>
      <nav class="tabs" role="tablist" aria-label="Secciones">
        ${VIEWS.map((v, i) => html`<button class="tab" role="tab" data-view="${v.id}" aria-controls="view-${v.id}" data-tip="${v.label} · Ctrl+${i + 1}"><span>${v.label}</span><i class="tab-dot"></i></button>`)}
        <span class="tab-ind no-anim" aria-hidden="true"></span>
      </nav>
      <div class="drag-fill"></div>
      <div class="top-status" id="topStatus"></div>
      <div class="winctl">
        <button class="icon-btn" data-win="minimize" aria-label="Minimizar" data-tip="Minimizar">${raw(SVG.minimize)}</button>
        <button class="icon-btn close" data-win="close" aria-label="Cerrar" data-tip="Cerrar (sigue en la bandeja)">${raw(SVG.close)}</button>
      </div>`);
    $('#topbar').addEventListener('click', e => {
      const tab = e.target.closest('.tab');
      if (tab) return this.go(tab.dataset.view);
      const w = e.target.closest('[data-win]');
      if (w) window.api.window(w.dataset.win);
    });
    document.addEventListener('keydown', e => {
      if (e.ctrlKey && !e.altKey && e.key >= '1' && e.key <= String(VIEWS.length)) { e.preventDefault(); this.go(VIEWS[+e.key - 1].id); }
    });
    // Flechas izquierda/derecha entre pestañas (patron tablist)
    $('.tabs').addEventListener('keydown', e => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
      e.preventDefault();
      const i = VIEWS.findIndex(v => v.id === this.current);
      const n = e.key === 'Home' ? 0 : e.key === 'End' ? VIEWS.length - 1 : (i + (e.key === 'ArrowRight' ? 1 : -1) + VIEWS.length) % VIEWS.length;
      this.go(VIEWS[n].id);
      $(`.tab[data-view="${VIEWS[n].id}"]`).focus();
    });
    window.addEventListener('resize', () => this.moveTabInd(false));
    document.fonts?.ready.then(() => this.moveTabInd(false));
  },

  paintTopbar() {
    const { state, draft } = this.data;
    const dots = {
      select: !!draft?.active,
      history: !!this.newPostgame,
    };
    for (const v of VIEWS) $(`.tab[data-view="${v.id}"]`)?.classList.toggle('live', !!dots[v.id]);
    if (!state) return;
    this.paintUpdate(state);
    const color = !state.connected ? 'gray' : state.status?.color || 'gray';
    const phase = state.connected ? (PHASE_NAMES[state.phase] || state.phase || 'Conectado') : 'Cliente cerrado';
    const s = state.summoner;
    setHtml($('#topStatus'), html`
      <span class="conn ${color}" data-tip="${state.status?.text || phase}"><i></i>${phase}</span>
      ${s ? html`<span class="top-me">${icon('profile', s.profileIconId, { size: 28, round: true, name: s.gameName, tip: `${s.gameName}#${s.tagLine} · nivel ${s.level}` })}<span class="me-name">${s.gameName}<span class="muted">#${s.tagLine}</span></span></span>` : ''}`);
  },

  // Barra de actualizacion (state.update, de updater.js): descargando o lista con «Instalar y reiniciar».
  // Al abrir, un aviso breve si estas al dia
  paintUpdate(state) {
    const u = state.update;
    const bar = $('#updateBar');
    if (!u || !bar) return;
    if (u.state === 'latest' && !this.updateToastShown) {
      this.updateToastShown = true;
      this.toast(`LoL Coach está al día (versión ${u.version})`, 'ok');
    }
    const show = (u.state === 'downloading' || u.state === 'ready') && this.updateDismissed !== `${u.next}:${u.state}`;
    if (!show) { bar.hidden = true; return; }
    bar.hidden = false;
    const busy = ['ChampSelect', 'GameStart', 'InProgress', 'Reconnect'].includes(state.phase);
    setHtml(bar, u.state === 'downloading'
      ? html`<span class="spinner small"></span><span class="grow">Hay una versión nueva: <b class="hi">${u.next}</b> · descargando <b class="num">${u.percent ?? 0} %</b></span>
          <button class="btn ghost small" data-upd="later">Ocultar</button>`
      : html`${raw(SVG.arrow)}<span class="grow">La versión <b class="hi">${u.next}</b> está lista para instalar <span class="muted">(tienes la ${u.version})</span></span>
          <button class="btn ghost small" data-upd="later" data-tip="Se instalará sola al cerrar la app o con el cliente de LoL cerrado">Más tarde</button>
          <span ${busy ? raw('data-tip="Cuando termine la selección o la partida"') : ''}><button class="btn btn-primary small" data-upd="install" ${busy ? 'disabled' : ''}>Instalar y reiniciar</button></span>`);
    if (!bar.dataset.bound) {
      bar.dataset.bound = '1';
      bar.addEventListener('click', e => {
        const b = e.target.closest('[data-upd]');
        if (!b || b.disabled) return;
        const cur = this.data.state?.update;
        if (b.dataset.upd === 'later') { this.updateDismissed = `${cur?.next}:${cur?.state}`; bar.hidden = true; return; }
        b.disabled = true;
        window.api.action('installUpdate').catch(err => { this.toast(err.message || 'No se pudo instalar', 'error'); b.disabled = false; });
      });
    }
  },

  // Avisos breves dentro de la ventana
  toast(text, kind = 'info') {
    const box = $('#toasts');
    const t = document.createElement('div');
    t.className = `toast ${kind}`;
    setHtml(t, html`${raw(kind === 'error' ? SVG.warn : kind === 'ok' ? SVG.check : SVG.info)}<span>${text}</span>`);
    box.appendChild(t);
    requestAnimationFrame(() => t.classList.add('show'));
    setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 300); }, 3800);
  },
};

window.addEventListener('DOMContentLoaded', () => App.start());
