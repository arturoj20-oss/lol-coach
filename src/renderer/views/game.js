// Vista Partida: scouting en la pantalla de carga y panel en directo durante la partida
'use strict';

// El proceso principal puede anteponer el minuto al texto ("12:00 Tu equipo..."): se quita para no repetirlo
const eventText = ev => String(ev.text || '').replace(/^\d{1,2}:\d{2}\s+/, '');
const SOON = 90;          // s: el objetivo se marca como inminente (igual que el aviso del overlay)
const OBJ_WINDOW = 300;   // s: la barra de cada objetivo cuenta los ultimos 5 min antes de salir

// Pinta solo si cambia el HTML: los datos llegan cada 2 s y repintar igual corta el hover y las animaciones
function gamePaint(el, content) {
  if (!el) return el;
  const s = toHtml(content);
  if (el._html === s) return el;
  el._html = s;
  el.innerHTML = s;
  return hydrate(el);
}

// Rango medio de un equipo (para la cabecera del scouting)
function teamRank(players) {
  const vals = players.map(p => p.rank).filter(r => r && TIERS.includes(r.tier))
    .map(r => TIERS.indexOf(r.tier) * 4 + (isApex(r.tier) ? 3 : Math.max(0, DIVS.indexOf(r.division))));
  if (!vals.length) return null;
  const v = Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
  const tier = TIERS[Math.floor(v / 4)];
  return isApex(tier) ? TIER_NAMES[tier] : `${TIER_NAMES[tier]} ${DIVS[v % 4]}`;
}

App.register('game', {
  channels: ['live', 'scouting', 'state', 'config', 'champions'],
  liveAt: 0,

  mount(el) {
    this.el = el;
    this.objSort = (() => { try { return localStorage.getItem('lolcoach.objSort') || 'time'; } catch { return 'time'; } })();
    this.itemsAll = false;
    this.seenEvents = new Set();
    el.addEventListener('click', e => {
      const t = e.target.closest('[data-act]');
      if (!t) return;
      const act = t.dataset.act;
      if (act === 'settings') App.go('settings');
      else if (act === 'objSort') {
        this.objSort = t.dataset.sort;
        try { localStorage.setItem('lolcoach.objSort', this.objSort); } catch { }
        this.renderLive();
      } else if (act === 'itemsAll') {
        this.itemsAll = t.dataset.all === '1';
        this.renderLive();
      }
    });
    // Las cuentas atras se interpolan entre actualizaciones del proceso principal
    setInterval(() => this.tick(), 250);
    this.render();
  },

  update(channel) {
    if (channel === 'live') this.liveAt = performance.now();
    if (channel === 'config') return;
    this.render();
  },

  // gameTime estimado ahora mismo (como mucho 10 s por delante del ultimo dato)
  now() {
    const live = App.data.live;
    if (!live) return 0;
    return live.gameTime + Math.min(10, (performance.now() - (this.liveAt || performance.now())) / 1000);
  },

  // Cambia el esqueleto de la vista solo al cambiar de modo (vacio, scouting, en directo)
  setMode(mode, skeleton) {
    if (this.mode === mode) return false;
    this.mode = mode;
    this.el._html = null;
    setHtml(this.el, skeleton);
    return true;
  },

  render() {
    const { live, scouting, state } = App.data;
    if (live?.active) return this.renderLive();
    if (scouting?.active) return this.renderScouting();
    this.seenEvents.clear();
    const phase = state?.phase;
    let title = 'No estás en partida', text = 'Aquí verás a los 10 jugadores durante la pantalla de carga y, ya en partida, los objetivos, el oro y tu farmeo.';
    if (!state?.connected) { title = 'Cliente cerrado'; text = 'Abre League of Legends para empezar.'; }
    else if (phase === 'ChampSelect') { title = 'En selección de campeones'; text = 'El scouting aparecerá en cuanto empiece la pantalla de carga.'; }
    else if (phase === 'EndOfGame' || phase === 'WaitingForStats' || phase === 'PreEndOfGame') { title = 'Partida terminada'; text = 'Revisa el análisis en el Historial.'; }
    this.mode = 'empty';
    gamePaint(this.el, html`<div class="view-pad center-fill">${emptyState({ glyph: state?.connected ? 'swords' : 'plug', title, text })}</div>`);
  },

  // ---------- Scouting ----------
  renderScouting() {
    const sc = App.data.scouting;
    const keys = App.data.state?.keys;
    this.mode = 'scouting';
    let body;
    if (!keys?.riot) {
      body = emptyState({ glyph: 'key', title: 'Scouting no disponible', text: 'Para ver el rango y la maestría de los jugadores necesitas una clave de la API de Riot.', action: html`<button class="btn" data-act="settings">Añadir clave</button>` });
    } else if (sc.error) {
      body = emptyState({ glyph: 'warn', title: 'No se pudo cargar el scouting', text: sc.error, error: true });
    } else {
      const team = t => (sc.players || []).filter(p => p.team === t);
      const skel = () => [0, 1, 2, 3, 4].map(() => html`<div class="scout-card loading"><div class="scout-art skel"></div><div class="scout-body"><span class="skel line-skel"></span><span class="skel line-skel short"></span></div></div>`);
      const row = (t, label) => {
        const avg = teamRank(team(t));
        return html`<section class="scout-team ${t}">
          <div class="scout-label"><h2>${label}</h2>${avg ? html`<span class="scout-avg" data-tip="Media de los rangos de Solo/Dúo del equipo">Media: <b>${avg}</b></span>` : ''}</div>
          <div class="scout-row">${sc.loading && !sc.players?.length ? skel() : team(t).map(p => this.scoutCard(p))}</div>
        </section>`;
      };
      body = html`${row('ally', 'Tu equipo')}${row('enemy', 'Equipo enemigo')}`;
    }
    gamePaint(this.el, html`<div class="view-pad scouting">
      <div class="view-head"><h1 class="title">Pantalla de carga</h1><span class="game-sub">Rango y maestría de los 10 jugadores</span>
        ${sc.loading ? html`<span class="spinner small"></span>` : ''}</div>
      ${body}
    </div>`);
  },

  scoutCard(p) {
    const r = p.rank;
    const games = r ? r.wins + r.losses : 0;
    const wr = games ? r.wins / games : null;
    const [name, tag] = (p.riotId || 'Desconocido#').split('#');
    const champ = Dd.champName(p.championId);
    return html`<div class="scout-card ${p.isMe ? 'me' : ''}">
      <div class="scout-art">
        <img src="${Dd.champLoading(p.championId)}" alt="" data-hide-on-error>
        <div class="scout-champ">${champ}</div>
        <div class="scout-spells">${(p.spells || []).map(id => icon('spell', id, { size: 22 }))}</div>
      </div>
      <div class="scout-body">
        <div class="scout-name" data-tip="${p.riotId}">${name}<span class="scout-tagline">#${tag || ''}</span></div>
        <div class="scout-rank" ${r ? raw(`data-tip="${esc(`${fmt.int(r.wins)} victorias y ${fmt.int(r.losses)} derrotas en Solo/Dúo`)}"`) : ''}>
          ${r ? html`<img class="mini-emblem" src="${Dd.emblem(r.tier)}" alt="" data-hide-on-error>` : ''}
          <div><div class="scout-tier">${rankName(r)}</div>
            ${r ? html`<div class="scout-lp num">${fmt.int(r.lp)} LP · <b class="${wr >= .5 ? 'win' : 'loss'}">${fmt.pct(wr)}</b> en ${fmt.int(games)}</div>` : html`<div class="scout-lp">Sin partidas en Solo/Dúo</div>`}</div>
        </div>
        <div class="scout-mastery num" data-tip="Maestría con ${champ}">
          ${p.mastery ? html`<span class="mastery-lvl">M${p.mastery.level}</span><span>${fmt.int(p.mastery.points)} puntos</span>` : html`<span class="scout-lp">Sin maestría con ${champ}</span>`}
        </div>
        <div class="scout-tags">${p.isMe ? html`<span class="tag blue">Tú</span>` : ''}${p.hotStreak && !p.tags?.includes('En racha') ? html`<span class="tag red">En racha</span>` : ''}${(p.tags || []).map(t => html`<span class="tag ${t === 'En racha' ? 'red' : t === 'OTP' ? 'blue' : ''}">${t}</span>`)}</div>
      </div>
    </div>`;
  },

  // ---------- En partida ----------
  renderLive() {
    const live = App.data.live;
    this.setMode('live', html`<div class="view-pad live-view">
      <div class="live-head" id="gHead"></div>
      <div class="card live-obj" id="gObj"></div>
      <div class="live-mid">
        <div class="card" id="gGold"></div>
        <div class="card" id="gCs"></div>
        <div class="card skill-card" id="gSkill"></div>
      </div>
      <div class="card live-items" id="gItems"></div>
      <div class="card live-events" id="gEvents"></div>
    </div>`);
    const $g = id => $(`#${id}`, this.el);
    const g = live.gold;
    const cs = live.cs;
    const objectives = live.objectives || [];

    // Cabecera: lo mas importante de un vistazo (siguiente objetivo, oro y farmeo)
    const next = objectives.filter(o => (o.state === 'pending' || o.state === 'respawning') && o.spawnAt != null).sort((a, b) => a.spawnAt - b.spawnAt)[0];
    const alive = objectives.filter(o => o.state === 'alive');
    gamePaint($g('gHead'), html`
      ${icon('champ', live.myChampionId, { size: 48 })}
      <div class="live-who"><div class="live-label">En partida</div><div class="live-champ">${Dd.champName(live.myChampionId)}</div></div>
      <div class="live-chips">
        ${next ? html`<span class="live-chip next" data-tip="Siguiente objetivo (cuenta atrás estimada)">${objIcon(next.key)}<span>${next.label}</span><b class="num" data-spawn="${next.spawnAt}"></b></span>` : ''}
        ${alive.length ? html`<span class="live-chip alive" data-tip="${alive.map(o => o.label).join(', ')}">${objIcon(alive[0].key)}<span>${alive.length === 1 ? `${alive[0].label} disponible` : `${alive.length} objetivos disponibles`}</span></span>` : ''}
        ${g ? html`<span class="live-chip" data-tip="Diferencia de oro (valor de los objetos de cada equipo)">Oro <b class="num ${g.diff >= 0 ? 'win' : 'loss'}">${fmt.k(g.diff, true)}</b></span>` : ''}
        ${cs ? html`<span class="live-chip" data-tip="Tu objetivo: ${fmt.dec(cs.target)} CS/min">CS/min <b class="num ${cs.perMin >= cs.target ? 'win' : 'loss'}">${fmt.dec(cs.perMin)}</b></span>` : ''}
      </div>
      <div class="live-clock num" data-clock aria-label="Tiempo de partida"></div>`);

    // Objetivos: proximos primero (o en orden fijo); la cuenta atras la rellena tick()
    const rank = o => (o.state === 'alive' ? -1 : o.state === 'gone' ? 1e9 : o.spawnAt ?? 1e8);
    const list = this.objSort === 'time' ? [...objectives].sort((a, b) => rank(a) - rank(b)) : objectives;
    gamePaint($g('gObj'), html`<div class="card-head"><h2>Objetivos</h2><span class="spacer"></span>
        <div class="seg obj-sort" role="group" aria-label="Orden de los objetivos">
          <button type="button" class="${this.objSort === 'time' ? 'on' : ''}" data-act="objSort" data-sort="time" data-tip="Los que salen antes, primero">Próximos primero</button><button type="button" class="${this.objSort === 'fixed' ? 'on' : ''}" data-act="objSort" data-sort="fixed" data-tip="Siempre en el mismo orden">Orden fijo</button>
        </div></div>
      ${objectives.length ? html`<div class="obj-grid">${list.map(o => this.objTile(o))}</div>` : html`<p class="game-sub">Sin objetivos todavía.</p>`}
      ${live.buffs?.length ? html`<div class="buffs">${live.buffs.map(b => html`
        <div class="buff ${b.team}" data-tip="${b.team === 'ally' ? 'Mejora de tu equipo' : 'Mejora del equipo enemigo'}">${objIcon(b.key)}<span>${b.label}</span><span class="buff-team">${b.team === 'ally' ? 'aliado' : 'enemigo'}</span><b class="num" data-ends="${b.endsAt}"></b></div>`)}</div>` : ''}`);

    const share = g ? g.ally / Math.max(1, g.ally + g.enemy) : .5;
    gamePaint($g('gGold'), html`<div class="card-head"><h2>Oro del equipo</h2><span class="spacer"></span>
        ${g ? html`<span class="gold-diff ${g.diff >= 0 ? 'win' : 'loss'} num">${fmt.k(g.diff, true)}</span>` : ''}</div>
      ${g ? html`<div class="gold-bar" data-tip="Aliados ${fmt.k(g.ally)} · Enemigos ${fmt.k(g.enemy)}"><i data-vars="--w:${(share * 100).toFixed(1)}%"></i></div>
        <div class="gold-legend num"><span>Aliados <b class="win">${fmt.k(g.ally)}</b></span><span><b class="loss">${fmt.k(g.enemy)}</b> Enemigos</span></div>
        <p class="game-note">Valor de los objetos de cada equipo.</p>` : html`<p class="game-sub">Sin datos.</p>`}`);

    const csRatio = cs ? Math.min(1, cs.perMin / Math.max(1, cs.target)) : 0;
    gamePaint($g('gCs'), html`<div class="card-head"><h2>Farmeo</h2></div>
      ${cs ? html`<div class="cs-big"><span class="num cs-total">${cs.total}</span><span class="cs-unit">CS</span>
          <span class="num cs-rate ${cs.perMin >= cs.target ? 'win' : 'loss'}">${fmt.dec(cs.perMin)}/min</span></div>
        <div class="cs-bar ${cs.perMin >= cs.target ? 'ok' : ''}" data-tip="${cs.perMin >= cs.target ? 'Vas por encima de tu objetivo' : `Te faltan ${fmt.dec(Math.max(0, cs.target - cs.perMin))} CS/min para tu objetivo`}"><i data-vars="--w:${(csRatio * 100).toFixed(0)}%"></i></div>
        <p class="game-note">${cs.auto
          ? html`Objetivo: ${fmt.dec(cs.target)} CS/min, la media de ${Dd.champName(cs.auto.championId)} en ${roleName(cs.auto.role).toLowerCase()} (U.GG, Esmeralda+: ${fmt.int(cs.auto.csPerGame)} CS en partidas de ~${cs.auto.minutes} min).`
          : html`Objetivo: ${fmt.dec(cs.target)} CS/min (manual, en Ajustes).`}</p>` : html`<p class="game-sub">Sin datos.</p>`}`);

    gamePaint($g('gSkill'), html`<div class="card-head"><h2>Subir habilidad</h2></div>
      ${live.skillToLevel ? html`<div class="skill-up"><span class="skill-key key-${live.skillToLevel}">${live.skillToLevel}</span><span>Tienes un punto libre: sube <b>${live.skillToLevel}</b>.</span></div>` : html`<p class="game-sub">Nada pendiente.</p>`}`);

    gamePaint($g('gItems'), this.itemAdviceCard(live.itemAdvice));
    $g('gItems').hidden = !live.itemAdvice?.groups?.length;

    // Eventos: los nuevos entran con una animacion breve
    const evs = [...(live.events || [])].sort((a, b) => b.time - a.time);
    const isNew = ev => !this.seenEvents.has(`${ev.time}|${ev.text}`);
    const first = !this.seenEvents.size;
    gamePaint($g('gEvents'), html`<div class="card-head"><h2>Eventos</h2></div>
      ${evs.length ? html`<ol class="events">${evs.map((ev, i) => html`<li class="${i === 0 ? 'latest' : ''} ${!first && isNew(ev) ? 'new' : ''}"><span class="num ev-time">${fmt.clock(ev.time)}</span><span>${eventText(ev)}</span></li>`)}</ol>` : html`<p class="game-sub">Todavía no ha pasado nada.</p>`}`);
    for (const ev of evs) this.seenEvents.add(`${ev.time}|${ev.text}`);
    this.tick();
  },

  // Objetos de tu build para cada situacion; primero (y destacados) los que pide el equipo enemigo
  // segun lo que llevan. Sin los que ya tienes
  itemAdviceCard(advice) {
    if (!advice?.groups?.length) return '';
    const rec = advice.groups.filter(g => g.recommended);
    const showAll = this.itemsAll || !rec.length;
    const groups = showAll ? advice.groups : rec;
    return html`<div class="card-head"><h2>Objetos según la composición</h2><span class="spacer"></span>
        ${rec.length && rec.length < advice.groups.length ? html`<div class="seg items-filter" role="group" aria-label="Qué objetos mostrar">
          <button type="button" class="${showAll ? '' : 'on'}" data-act="itemsAll" data-all="0">Recomendados (${rec.length})</button><button type="button" class="${showAll ? 'on' : ''}" data-act="itemsAll" data-all="1">Todos</button></div>` : ''}</div>
      <p class="game-note">${advice.reasons?.length ? `${advice.reasons.join(' · ')}.` : 'Nada destacable en el equipo enemigo por ahora: elige según cómo vaya la partida.'} También están en la tienda, en el set «LoL Coach».</p>
      <div class="ctx-list">${groups.map(g => html`<div class="ctx-row ${g.recommended ? 'hot' : ''}">
        <span class="ctx-label">${g.label}${g.recommended ? html` <span class="tag blue" data-tip="Lo pide lo que llevan los enemigos">Recomendado</span>` : ''}</span>
        <span class="item-row">${g.items.map(id => icon('item', id, { size: 34 }))}</span>
      </div>`)}</div>`;
  },

  objTile(o) {
    const st = o.state;
    let status;
    if (st === 'alive') status = html`<b class="obj-alive">Disponible</b>`;
    else if (st === 'gone') status = html`<span class="obj-gone">No volverá</span>`;
    else if (o.spawnAt != null) status = html`<b class="num obj-timer" data-spawn="${o.spawnAt}"></b>`;
    else status = html`<span class="obj-gone">—</span>`;
    const timed = (st === 'pending' || st === 'respawning') && o.spawnAt != null;
    const detail = o.detail || (o.team ? (o.team === 'ally' ? 'Último: tu equipo' : 'Último: enemigo') : (st === 'pending' ? 'Aún no ha salido' : ''));
    return html`<div class="obj ${st} obj-${objKind(o.key)}" data-tip="${timed ? `Sale en el minuto ${fmt.clock(o.spawnAt)}` : ''}">
      <span class="obj-glyph">${objIcon(o.key)}</span>
      <div class="obj-txt"><div class="obj-label">${o.label}</div><div class="obj-detail">${detail}</div></div>
      <div class="obj-status">${status}</div>
      ${o.team ? html`<i class="obj-team ${o.team}" data-tip="${o.team === 'ally' ? 'Lo mató tu equipo' : 'Lo mató el enemigo'}"></i>` : ''}
      ${timed ? html`<i class="obj-prog" data-prog="${o.spawnAt}"></i>` : ''}
    </div>`;
  },

  tick() {
    if (!App.data.live?.active || App.current !== 'game') return;
    const t = this.now();
    const clock = $('[data-clock]', this.el);
    if (clock) clock.textContent = fmt.clock(t);
    for (const el of $$('[data-spawn]', this.el)) {
      const remain = +el.dataset.spawn - t;
      el.textContent = fmt.clock(remain);
      el.closest('.obj, .live-chip')?.classList.toggle('soon', remain > 0 && remain <= SOON);
    }
    for (const el of $$('[data-ends]', this.el)) el.textContent = fmt.clock(+el.dataset.ends - t);
    // Barra de cada objetivo: se llena en los ultimos 5 min antes de salir
    for (const el of $$('[data-prog]', this.el)) {
      const p = 1 - Math.max(0, Math.min(1, (+el.dataset.prog - t) / OBJ_WINDOW));
      el.style.setProperty('--p', p.toFixed(3));
    }
  },
});
