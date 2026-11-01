// Vista Historial: lista de partidas y analisis detallado (graficas, comparacion, consejos, muertes, IA)
'use strict';

// Markdown sencillo (titulos, listas, negrita, cursiva) a HTML escapado
function miniMarkdown(text) {
  const inline = s => esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/(^|\W)\*(.+?)\*(?=\W|$)/g, '$1<i>$2</i>').replace(/`(.+?)`/g, '<code>$1</code>');
  let out = '', list = null;
  const closeList = () => { if (list) { out += `</${list}>`; list = null; } };
  for (const line of String(text || '').split(/\r?\n/)) {
    const l = line.trim();
    let m;
    if (!l) { closeList(); continue; }
    if ((m = l.match(/^#{1,4}\s+(.*)/))) { closeList(); out += `<h4>${inline(m[1])}</h4>`; }
    else if ((m = l.match(/^[-*•]\s+(.*)/))) { if (list !== 'ul') { closeList(); out += '<ul>'; list = 'ul'; } out += `<li>${inline(m[1])}</li>`; }
    else if ((m = l.match(/^\d+[.)]\s+(.*)/))) { if (list !== 'ol') { closeList(); out += '<ol>'; list = 'ol'; } out += `<li>${inline(m[1])}</li>`; }
    else { closeList(); out += `<p>${inline(l)}</p>`; }
  }
  closeList();
  return raw(out);
}

// "Clasificatoria Solo/Dúo" -> "Solo/Dúo" para que quepa en la lista
const shortQueue = q => String(q || '').replace(/^Clasificatoria\s+/i, '');

App.register('history', {
  channels: ['profile', 'postgame', 'state', 'champions'],
  selected: null,
  cache: new Map(),      // matchId -> MatchAnalysis
  loadingId: null,
  errors: new Map(),
  ai: new Map(),         // matchId -> { loading, text, error }
  chartKind: 'gold',
  filter: { result: 'all', champ: 0 },   // filtros de la lista: resultado y campeon
  tipsSeen: new Set(),

  mount(el) {
    this.el = el;
    setHtml(el, html`<div class="history">
      <div class="card hist-list-card"><div class="card-head"><h2>Historial</h2><span class="sub num" id="histCount"></span><span class="spacer"></span>
        <button class="icon-btn" data-act="refresh" aria-label="Recargar" data-tip="Recargar historial">${raw(SVG.refresh)}</button></div>
        <div class="hist-filters" id="histFilters"></div>
        <div class="hist-list" id="histList" role="listbox" aria-label="Partidas"></div></div>
      <div class="hist-detail" id="histDetail"></div>
    </div>`);
    el.addEventListener('change', e => {
      if (e.target.id === 'histChamp') this.setFilter({ champ: +e.target.value });
    });
    el.addEventListener('click', e => {
      const t = e.target.closest('[data-act]');
      if (!t || t.disabled) return;
      const act = t.dataset.act;
      if (act === 'open') this.openMatch(t.dataset.id);
      else if (act === 'result') this.setFilter({ result: t.dataset.r });
      else if (act === 'clearFilter') this.setFilter({ result: 'all', champ: 0 });
      else if (act === 'refresh') window.api.action('refreshProfile').catch(err => App.toast(err.message, 'error'));
      else if (act === 'settings') App.go('settings');
      else if (act === 'chart') { this.chartKind = t.dataset.k; this.renderDetail(); }
      else if (act === 'ai') this.askCoach(this.selected);
      else if (act === 'retry') { this.errors.delete(this.selected); this.openMatch(this.selected); }
    });
    // Navegar la lista con flechas
    el.addEventListener('keydown', e => {
      if (!e.target.closest('.hist-list') || !['ArrowDown', 'ArrowUp'].includes(e.key)) return;
      e.preventDefault();
      const rows = $$('.match', el);
      const i = rows.indexOf(e.target.closest('.match'));
      const next = rows[i + (e.key === 'ArrowDown' ? 1 : -1)];
      if (next) { next.focus(); this.openMatch(next.dataset.id); }
    });
    this.seedPostgame();
    this.renderList();
    this.renderDetail();
  },

  update(channel) {
    if (channel === 'postgame') this.seedPostgame();
    this.renderList();
    if (channel !== 'profile' || !this.selected) this.renderDetail();
  },

  show() {
    // Al entrar sin nada abierto, abrir la ultima partida
    const first = App.data.profile?.matches?.[0]?.matchId || App.data.postgame?.analysis?.matchId;
    if (!this.selected && first) this.openMatch(first);
  },

  seedPostgame() {
    const a = App.data.postgame?.analysis;
    if (a) this.cache.set(a.matchId, a);
  },

  matches() {
    const list = [...(App.data.profile?.matches || [])];
    const a = App.data.postgame?.analysis;
    // La ultima partida puede llegar antes de que se recargue el perfil
    if (a && !list.some(m => m.matchId === a.matchId)) list.unshift(a.summary);
    return list;
  },

  openMatch(matchId, analysis) {
    if (!matchId) return;
    if (analysis) this.cache.set(matchId, analysis);
    this.selected = matchId;
    this.renderList();
    if (!this.cache.has(matchId) && this.loadingId !== matchId) {
      this.loadingId = matchId;
      window.api.action('getMatch', { matchId })
        .then(a => { this.cache.set(matchId, a); })
        .catch(err => { this.errors.set(matchId, err?.message || 'No se pudo cargar la partida'); })
        .finally(() => { if (this.loadingId === matchId) this.loadingId = null; if (this.selected === matchId) this.renderDetail(); });
    }
    this.renderDetail();
  },

  // Cambia los filtros de la lista (lo usa tambien Inicio: "Ver en el historial")
  setFilter(f) {
    Object.assign(this.filter, f);
    if (!this.el) return;
    this.renderList();
    // Si la partida abierta queda fuera del filtro, se abre la primera visible
    const vis = this.visible();
    if (vis.length && !vis.some(m => m.matchId === this.selected)) this.openMatch(vis[0].matchId);
  },

  visible() {
    const { result, champ } = this.filter;
    return this.matches().filter(m => (!champ || m.championId === champ)
      && (result === 'all' || (result === 'w' ? m.win && !m.remake : !m.win && !m.remake)));
  },

  renderFilters(all) {
    const box = $('#histFilters');
    if (!all.length) return setHtml(box, '');
    const champs = [...new Map(all.map(m => [m.championId, Dd.champName(m.championId)]))].sort((a, b) => a[1].localeCompare(b[1], 'es'));
    const f = this.filter;
    const opts = { all: 'Todas', w: 'Victorias', l: 'Derrotas' };
    setHtml(box, html`<div class="seg seg-sm" role="group" aria-label="Filtrar por resultado">${Object.entries(opts).map(([k, l]) => html`<button class="${f.result === k ? 'on' : ''}" data-act="result" data-r="${k}" aria-pressed="${f.result === k}">${l}</button>`)}</div>
      <select class="select hist-champ" id="histChamp" aria-label="Filtrar por campeón">
        <option value="0">Campeón</option>
        ${champs.map(([id, name]) => html`<option value="${id}" ${f.champ === id ? raw('selected') : ''}>${name}</option>`)}
      </select>`);
  },

  renderList() {
    const box = $('#histList');
    const { profile, state } = App.data;
    const all = this.matches();
    const list = this.visible();
    this.renderFilters(all);
    $('#histCount').textContent = all.length ? (list.length === all.length ? `${all.length}` : `${list.length} de ${all.length}`) : '';
    if (all.length && !list.length) {
      return setHtml(box, emptyState({ glyph: 'scroll', title: 'Ninguna partida', text: 'No hay partidas con estos filtros.', action: html`<button class="btn small" data-act="clearFilter">Quitar filtros</button>` }));
    }
    if (!state?.keys?.riot && !list.length) {
      return setHtml(box, emptyState({ glyph: 'key', title: 'Sin clave de Riot', text: 'El historial necesita una clave de la API de Riot.', action: html`<button class="btn small" data-act="settings">Ir a Ajustes</button>` }));
    }
    if (profile?.loading && !list.length) return setHtml(box, skeletonRows(6));
    if (profile?.error && !list.length) return setHtml(box, emptyState({ glyph: 'warn', title: 'Error', text: profile.error, error: true, action: html`<button class="btn small" data-act="refresh">Reintentar</button>` }));
    if (!list.length) return setHtml(box, emptyState({ glyph: 'scroll', title: 'Sin partidas', text: 'Tus partidas recientes aparecerán aquí.' }));
    const scroll = box.scrollTop;
    setHtml(box, list.map(m => {
      const res = m.remake ? 'remake' : m.win ? 'w' : 'l';
      return html`<button class="match ${res} ${m.matchId === this.selected ? 'sel' : ''}" data-act="open" data-id="${m.matchId}" role="option" aria-selected="${m.matchId === this.selected}" data-tip="${m.queue} · ${fmt.clock(m.durationSec)} · ${fmt.dateTime(m.endedAt)}">
        ${icon('champ', m.championId, { size: 40, tip: false })}
        <span class="match-main">
          <span class="match-res">${m.remake ? 'Repetición' : m.win ? 'Victoria' : 'Derrota'}<span class="muted"> · ${shortQueue(m.queue)}</span></span>
          <span class="match-kda num"><b>${m.kills}</b> / <b class="loss-soft">${m.deaths}</b> / <b>${m.assists}</b> <span class="muted">· ${fmt.kda(m.kills, m.deaths, m.assists)}</span></span>
        </span>
        <span class="match-side num"><span>${m.cs} CS</span><span class="muted">${fmt.ago(m.endedAt)}</span></span>
      </button>`;
    }));
    box.scrollTop = scroll;
  },

  renderDetail() {
    const box = $('#histDetail');
    const id = this.selected;
    if (!id) {
      return setHtml(box, html`<div class="card center-fill">${emptyState({ glyph: 'scroll', title: 'Elige una partida', text: 'Abre una partida de la lista para ver su análisis: diferencia de oro, experiencia y farmeo con tu rival, comparación con tu media, consejos y mapa de muertes.' })}</div>`);
    }
    const a = this.cache.get(id);
    if (!a) {
      if (this.errors.has(id)) return setHtml(box, html`<div class="card center-fill">${emptyState({ glyph: 'warn', title: 'No se pudo cargar', text: this.errors.get(id), error: true, action: html`<button class="btn" data-act="retry">Reintentar</button>` })}</div>`);
      return setHtml(box, html`<div class="card center-fill">${loadingState('Analizando la partida...')}</div>`);
    }
    const s = a.summary;
    const res = s.remake ? 'remake' : s.win ? 'w' : 'l';
    const tl = a.timeline;
    const kinds = { gold: ['Oro', tl?.goldDiff], xp: ['Experiencia', tl?.xpDiff], cs: ['CS', tl?.csDiff] };
    const scroll = box.scrollTop;
    // El primer consejo sale abierto la primera vez que se ve la partida
    if (a.tips?.length && !this.tipsSeen.has(id)) { this.tipsSeen.add(id); Expand.open.add(`${id}-tip-0`); }
    const at = (label, d) => d ? html`<div class="at-block"><div class="label">${label}</div>
      <div class="at-stats num"><span><b class="hi">${d.cs}</b> CS</span><span class="${d.goldDiff >= 0 ? 'win' : 'loss'}"><b>${fmt.signed(d.goldDiff)}</b> oro</span><span class="${d.xpDiff >= 0 ? 'win' : 'loss'}"><b>${fmt.signed(d.xpDiff)}</b> XP</span></div></div>` : '';
    const aiState = this.ai.get(id);
    const ai = App.data.state?.ai || {};
    const hasKey = !!ai.ready;
    const noAi = ai.mode === 'api' ? 'Para usar el análisis con IA añade tu clave de Anthropic en Ajustes.' : 'No se encuentra Claude Code en este equipo: instálalo o cambia a la API de Anthropic en Ajustes.';

    setHtml(box, html`
      <div class="card match-head ${res}">
        <div class="mh-result">
          <div class="mh-title">${s.remake ? 'Repetición' : s.win ? 'Victoria' : 'Derrota'}</div>
          <div class="muted">${s.queue} · ${fmt.duration(s.durationSec)}</div>
          <div class="muted">${fmt.dateTime(s.endedAt)}</div>
        </div>
        <div class="mh-champ">
          ${icon('champ', s.championId, { size: 60 })}
          <div class="mh-loadout">${(s.spells || []).map(id => icon('spell', id, { size: 28 }))}${icon('rune', s.keystone, { size: 28, round: true, cls: 'rune' })}${icon('rune', s.subStyle, { size: 28, round: true, cls: 'rune style' })}</div>
        </div>
        <div class="mh-kda">
          <div class="mh-k num">${s.kills} / <span class="loss">${s.deaths}</span> / ${s.assists}</div>
          <div class="muted num">${fmt.kda(s.kills, s.deaths, s.assists)} KDA · ${fmt.pct(s.killParticipation)} particip.</div>
          <div class="muted num">${s.cs} CS (${fmt.dec(s.csPerMin)}/min) · visión ${s.visionScore} · ${fmt.int(s.damage)} daño</div>
        </div>
        <div class="mh-items">${(s.items || []).map((it, i) => icon('item', it, { size: 30, cls: i === 6 ? 'trinket' : '' }))}</div>
        ${a.opponent ? html`<div class="mh-vs"><span class="label">Rival</span>${icon('champ', a.opponent.championId, { size: 30 })}<span><span class="hi">${Dd.champName(a.opponent.championId)}</span><br><span class="muted">${a.opponent.riotId || ''}</span></span></div>` : ''}
      </div>

      ${a.at10 || a.at15 ? html`<div class="at-row">${at('Minuto 10', a.at10)}${at('Minuto 15', a.at15)}</div>` : ''}

      <div class="card">
        <div class="card-head"><h2>Contra tu rival de línea</h2><span class="sub">${a.opponent ? `vs ${Dd.champName(a.opponent.championId)}` : ''}</span><span class="spacer"></span>
          <div class="seg">${Object.entries(kinds).map(([k, [label]]) => html`<button class="${this.chartKind === k ? 'on' : ''}" data-act="chart" data-k="${k}">${label}</button>`)}</div></div>
        ${tl?.minutes?.length ? html`<div class="chart-box diff" id="diffChart"></div>` : html`<p class="muted">Sin línea temporal para esta partida.</p>`}
      </div>

      <div class="hist-grid">
        <div class="card">
          <div class="card-head"><h2>Comparado con tu media</h2></div>
          ${a.comparison?.length ? html`<div class="cmp-list">${a.comparison.map(compareBar)}</div>` : html`<p class="muted">Sin datos.</p>`}
        </div>
        <div class="card">
          <div class="card-head"><h2>Mapa de muertes</h2><span class="spacer"></span><span class="sub num">${a.deaths?.length || 0} ${a.deaths?.length === 1 ? 'muerte' : 'muertes'}</span></div>
          ${a.deaths?.length ? html`<div class="map-box">${deathMap(a.deaths)}</div>` : html`<div class="map-box empty">${emptyState({ glyph: 'crown', title: 'Sin muertes', text: '¡Partida perfecta!' })}</div>`}
        </div>
      </div>

      <div class="card">
        <div class="card-head"><h2>Consejos</h2>${a.tips?.length ? html`<span class="sub">Pulsa para ver el detalle</span>` : ''}</div>
        ${a.tips?.length ? html`<div class="tips">${a.tips.map((t, i) => {
          const k = `${id}-tip-${i}`;
          return html`<div class="xp tip ${t.severity} ${xpOpen(k)}">
            <button class="xp-head tip-head" data-expand="${k}" aria-expanded="${xpExpanded(k)}"><span class="tag tip-sev">${t.severity === 'high' ? 'Importante' : t.severity === 'mid' ? 'A mejorar' : 'Detalle'}</span><span class="tip-title">${t.title}</span><span class="xp-chev">${raw(SVG.chevron)}</span></button>
            <div class="xp-body"><div><div class="tip-detail">${t.detail}</div></div></div></div>`;
        })}</div>` : html`<p class="muted">Nada que destacar: buena partida.</p>`}
      </div>

      <div class="card ai-card">
        <div class="card-head"><h2>Entrenador IA</h2><span class="spacer"></span>
          <span ${!hasKey ? raw(`data-tip="${noAi}"`) : ''}><button class="btn btn-primary" data-act="ai" ${!hasKey || aiState?.loading ? 'disabled' : ''}>${raw(SVG.spark)}${aiState?.text ? 'Volver a analizar' : 'Analizar con IA'}</button></span></div>
        ${aiState?.loading ? html`<div class="ai-loading"><span class="spinner small"></span><span>El entrenador está revisando la partida...</span></div>`
          : aiState?.error ? html`<div class="notice error">${raw(SVG.warn)}<span class="grow">${aiState.error}</span></div>`
          : aiState?.text ? html`<div class="ai-text">${miniMarkdown(aiState.text)}</div>`
          : html`<p class="muted">${hasKey ? 'Pide un análisis personalizado de esta partida.' : noAi}${!hasKey ? html` <button class="link" data-act="settings">Ir a Ajustes</button>` : ''}</p>`}
      </div>`);
    box.scrollTop = scroll;

    const chartEl = $('#diffChart');
    if (chartEl) {
      const [name, ys] = kinds[this.chartKind];
      diffChart(chartEl, tl.minutes, ys || [], { name, format: v => this.chartKind === 'cs' ? fmt.signed(v) : fmt.k(v, true) });
    }
  },

  askCoach(matchId) {
    if (!matchId) return;
    this.ai.set(matchId, { loading: true });
    this.renderDetail();
    window.api.action('askCoach', { matchId })
      .then(r => this.ai.set(matchId, { text: r.text }))
      .catch(err => this.ai.set(matchId, { error: err?.message || 'No se pudo completar el análisis' }))
      .finally(() => { if (this.selected === matchId) this.renderDetail(); });
  },
});
