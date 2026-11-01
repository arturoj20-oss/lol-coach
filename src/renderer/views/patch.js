// Vista Parche: notas oficiales de la ultima version, extraidas sin IA, con buscador, filtros y tarjetas plegables
'use strict';

const PATCH_VERDICT = {
  buff: { label: 'Mejora', plural: 'Mejoras', cls: 'green' },
  nerf: { label: 'Empeora', plural: 'Empeoras', cls: 'red' },
  adjust: { label: 'Ajuste', plural: 'Ajustes', cls: 'gold' },
  new: { label: 'Nuevo', plural: 'Nuevos', cls: 'blue' },
};
const PATCH_KINDS = {
  champions: 'Campeones', items: 'Objetos', runes: 'Runas', systems: 'Sistemas', modes: 'Modos de juego', other: 'Otros',
};
const PATCH_KIND_SHORT = { champions: 'Campeones', items: 'Objetos', runes: 'Runas', systems: 'Sistemas', modes: 'Modos', other: 'Otros' };
// Secciones que empiezan plegadas (largas y poco relevantes para la Grieta)
const PATCH_FOLDED = new Set(['modes', 'other']);

const patchNorm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

App.register('patch', {
  channels: [],
  data: null,
  loading: false,
  error: null,
  filters: { q: '', kind: 'all', verdict: 'all', mine: false },
  folded: new Set(),

  mount(el) {
    this.el = el;
    el.addEventListener('click', e => this.onClick(e));
    el.addEventListener('input', e => {
      if (e.target.matches('[data-filter="q"]')) { this.filters.q = e.target.value; this.renderList(); }
    });
    el.addEventListener('change', e => {
      if (e.target.matches('[data-filter="mine"]')) { this.filters.mine = e.target.checked; this.renderList(); }
    });
    el.addEventListener('keydown', e => {
      if (e.key === 'Escape' && e.target.matches('[data-filter="q"]') && e.target.value) {
        e.target.value = ''; this.filters.q = ''; this.renderList();
      }
    });
    this.render();
  },

  update() { },

  // Se carga la primera vez que se abre la pestana
  show() {
    if (!this.data && !this.loading) this.load(false);
  },

  load(refresh) {
    this.loading = true;
    this.error = null;
    this.render();
    window.api.action('patchNotes', { refresh })
      .then(d => {
        const first = !this.data || this.data.version !== d.version;
        this.data = d;
        if (first) this.folded = new Set((d.sections || []).filter(s => PATCH_FOLDED.has(s.kind)).map(s => s.id));
      })
      .catch(err => { this.error = err?.message || 'No se pudieron cargar las notas del parche'; })
      .finally(() => { this.loading = false; this.render(); });
  },

  onClick(e) {
    const t = e.target.closest('[data-act]');
    if (!t || t.disabled) return;
    const a = t.dataset.act;
    if (a === 'refresh') this.load(true);
    else if (a === 'retry') this.load(false);
    else if (a === 'kind' || a === 'verdict') {
      this.filters[a] = t.dataset.v;
      this.renderToolbar();
      this.renderList();
    } else if (a === 'stat') {
      // Clic en una cifra del resumen: filtra por ese tipo y veredicto
      Object.assign(this.filters, { kind: t.dataset.kind, verdict: t.dataset.v || 'all', mine: false });
      this.renderToolbar();
      this.renderList();
      this.jump(this.data.sections.find(s => s.kind === t.dataset.kind)?.id);
    } else if (a === 'sec') {
      const id = t.dataset.id;
      if (this.folded.has(id)) this.folded.delete(id); else this.folded.add(id);
      const sec = t.closest('.pn-sec');
      sec?.classList.toggle('folded', this.folded.has(id));
      t.setAttribute('aria-expanded', String(!this.folded.has(id)));
    } else if (a === 'jump') {
      this.jump(t.dataset.id);
    } else if (a === 'goto') {
      this.gotoEntry(t.dataset.entry);
    } else if (a === 'clear') {
      this.filters = { q: '', kind: 'all', verdict: 'all', mine: false };
      this.render();
    } else if (a === 'expand-all' || a === 'collapse-all') {
      const open = a === 'expand-all';
      for (const xp of this.el.querySelectorAll('.pn-entry.xp')) {
        const k = xp.querySelector('[data-expand]')?.dataset.expand;
        xp.classList.toggle('open', open);
        if (k) { if (open) Expand.open.add(k); else Expand.open.delete(k); }
      }
    }
  },

  // Desplaza la vista hasta una seccion (y la despliega)
  jump(id) {
    if (!id) return;
    if (this.folded.has(id)) {
      this.folded.delete(id);
      const sec = this.el.querySelector(`.pn-sec[data-sec="${CSS.escape(id)}"]`);
      sec?.classList.remove('folded');
    }
    const target = this.el.querySelector(`.pn-sec[data-sec="${CSS.escape(id)}"]`);
    if (target) this.scrollTo(target);
  },

  // Abre una entrada concreta (desde "Tus campeones"), quitando los filtros que la oculten
  gotoEntry(entryId) {
    const sec = this.data?.sections.find(s => s.entries.some(e => e.id === entryId));
    if (!sec) return;
    const e = sec.entries.find(x => x.id === entryId);
    if (!this.matches(sec, e)) { this.filters = { q: '', kind: 'all', verdict: 'all', mine: false }; this.renderToolbar(); }
    this.folded.delete(sec.id);
    Expand.open.add(`patch:${entryId}`);
    this.renderList();
    const el = this.el.querySelector(`[data-entry-id="${CSS.escape(entryId)}"]`);
    if (!el) return;
    this.scrollTo(el);
    el.classList.remove('flash');
    void el.offsetWidth;
    el.classList.add('flash');
  },

  scrollTo(el) {
    const bar = this.el.querySelector('.pn-toolbar');
    const top = el.getBoundingClientRect().top - this.el.getBoundingClientRect().top + this.el.scrollTop - (bar?.offsetHeight || 0) - 12;
    this.el.scrollTo({ top, behavior: 'smooth' });
  },

  // ---------- Filtros ----------
  matches(sec, e) {
    const f = this.filters;
    if (f.kind !== 'all' && sec.kind !== f.kind) return false;
    if (f.verdict !== 'all' && e.verdict !== f.verdict) return false;
    if (f.mine && !e.mine) return false;
    if (f.q) {
      const q = patchNorm(f.q);
      const hay = patchNorm([e.name, e.category, sec.title, ...e.groups.flatMap(g => [g.title, ...g.changes.map(c => c.text)])].join(' '));
      if (!hay.includes(q)) return false;
    }
    return true;
  },

  visibleSections() {
    return (this.data?.sections || []).map(s => ({ ...s, shown: s.entries.filter(e => this.matches(s, e)) }))
      .filter(s => s.shown.length || (!s.entries.length && s.context && this.filters.kind === 'all' && this.filters.verdict === 'all' && !this.filters.mine && !this.filters.q));
  },

  // ---------- Pintado ----------
  head() {
    const d = this.data;
    const date = d?.date ? new Date(d.date).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' }) : '';
    return html`<div class="view-head pn-head">
      <h1 class="title">${d ? `Parche ${d.version}` : 'Notas del parche'}</h1>
      ${date ? html`<span class="pn-date">Publicado el ${date}</span>` : ''}
      <span class="spacer"></span>
      ${d?.url ? html`<a class="btn small" href="${d.url}" target="_blank" rel="noopener">Notas oficiales ${raw(SVG.arrow)}</a>` : ''}
      <button class="btn small" data-act="refresh" ${this.loading ? 'disabled' : ''} data-tip="Vuelve a descargar las notas de la web de League of Legends">${raw(SVG.refresh)}Actualizar</button>
    </div>`;
  },

  render() {
    const d = this.data;
    if (this.loading && !d) {
      return setHtml(this.el, html`<div class="view-pad patch">${this.head()}<div class="card pn-center">${loadingState('Descargando las notas del parche...')}</div></div>`);
    }
    if (!d) {
      return setHtml(this.el, html`<div class="view-pad patch">${this.head()}<div class="card pn-center">${emptyState({
        glyph: 'scroll', error: !!this.error, title: this.error ? 'No se pudieron cargar las notas' : 'Notas del parche',
        text: this.error || 'Abre esta pestaña para ver los cambios de la última versión.',
        action: html`<button class="btn" data-act="retry">Reintentar</button>`,
      })}</div></div>`);
    }
    setHtml(this.el, html`<div class="view-pad patch">
      ${this.head()}
      ${this.error ? html`<div class="notice error">${raw(SVG.warn)}<span class="grow">No se pudieron actualizar: ${this.error}. Se muestran las notas que ya tenías.</span></div>` : ''}
      ${d.offline ? html`<div class="notice warn">${raw(SVG.warn)}<span class="grow">Sin conexión: se muestran las últimas notas guardadas.</span></div>` : ''}
      ${this.overview()}
      <div class="pn-toolbar"></div>
      <div class="pn-layout">
        <nav class="pn-index" aria-label="Secciones"></nav>
        <div class="pn-list"></div>
      </div>
    </div>`);
    this.renderToolbar();
    this.renderList();
  },

  // Resumen rapido: recuentos por tipo y veredicto, y tus campeones
  overview() {
    const d = this.data;
    const kinds = ['champions', 'items', 'runes', 'systems'];
    const stats = kinds.map(k => {
      const entries = d.sections.filter(s => s.kind === k).flatMap(s => s.entries);
      const c = v => entries.filter(e => e.verdict === v).length;
      return { k, total: entries.length, buff: c('buff'), nerf: c('nerf'), adjust: c('adjust') + c('new') };
    }).filter(s => s.total);
    const fy = d.forYou || { champions: [] };
    const changed = fy.champions.filter(c => c.changed);
    const same = fy.champions.filter(c => !c.changed);
    return html`<section class="card pn-overview">
      <div class="pn-ov-grid">
      <div class="pn-stats">
        ${stats.map(s => html`<div class="pn-stat">
          <button class="pn-stat-name" data-act="stat" data-kind="${s.k}">${PATCH_KINDS[s.k]} <b class="num">${s.total}</b></button>
          <div class="pn-stat-row">
            ${s.buff ? html`<button class="pn-count up" data-act="stat" data-kind="${s.k}" data-v="buff"><b class="num">${s.buff}</b> ${s.buff === 1 ? 'mejora' : 'mejoras'}</button>` : ''}
            ${s.nerf ? html`<button class="pn-count down" data-act="stat" data-kind="${s.k}" data-v="nerf"><b class="num">${s.nerf}</b> ${s.nerf === 1 ? 'empeora' : 'empeoran'}</button>` : ''}
            ${s.adjust ? html`<button class="pn-count" data-act="stat" data-kind="${s.k}" data-v="adjust"><b class="num">${s.adjust}</b> ${s.adjust === 1 ? 'ajuste' : 'ajustes'}</button>` : ''}
          </div>
        </div>`)}
      </div>
      ${fy.champions.length ? html`<div class="pn-mine">
        <div class="pn-mine-title">Tus campeones${fy.roleName ? html` <span class="pn-sub">· juegas sobre todo ${fy.roleName}</span>` : ''}</div>
        ${changed.length ? html`<div class="pn-mine-list">${changed.map(c => {
          const v = PATCH_VERDICT[c.verdict] || PATCH_VERDICT.adjust;
          return html`<button class="pn-mine-chip" data-act="goto" data-entry="${c.refs[c.refs.length - 1].entryId}" data-tip="Ver sus cambios">
            ${icon('champ', c.championId, { size: 26, tip: false })}<span class="hi">${c.name}</span><span class="tag ${v.cls}">${v.label}</span></button>`;
        })}</div>` : html`<p class="pn-text">Ninguno de tus campeones más jugados cambia en esta versión.</p>`}
        ${same.length && changed.length ? html`<p class="pn-text pn-same">Sin cambios: ${same.map(c => c.name).join(', ')}.</p>` : ''}
      </div>` : ''}
      </div>
      ${d.intro ? html`<div class="xp pn-intro ${xpOpen('patch:intro')}">
        <button class="xp-head pn-intro-head" data-expand="patch:intro" aria-expanded="${xpExpanded('patch:intro')}">
          <span>Qué dicen los diseñadores</span><span class="xp-chev">${raw(SVG.chevron)}</span></button>
        <div class="xp-body"><div><p class="pn-quote">${d.intro}</p>${d.authors?.length ? html`<p class="pn-authors">${d.authors.join(' · ')}</p>` : ''}</div></div>
      </div>` : ''}
    </section>`;
  },

  renderToolbar() {
    const bar = this.el.querySelector('.pn-toolbar');
    if (!bar) return;
    const d = this.data, f = this.filters;
    const present = Object.keys(PATCH_KINDS).filter(k => d.sections.some(s => s.kind === k && s.entries.length));
    const hasMine = d.sections.some(s => s.entries.some(e => e.mine));
    const focused = document.activeElement?.matches?.('[data-filter="q"]');
    setHtml(bar, html`
      <label class="search pn-search">${raw(SVG.search)}<input class="input" type="search" data-filter="q" placeholder="Buscar campeón, objeto o cambio" value="${f.q}" aria-label="Buscar en las notas"></label>
      <div class="seg seg-sm" aria-label="Tipo">
        <button data-act="kind" data-v="all" class="${f.kind === 'all' ? 'on' : ''}">Todo</button>
        ${present.map(k => html`<button data-act="kind" data-v="${k}" class="${f.kind === k ? 'on' : ''}">${PATCH_KIND_SHORT[k]}</button>`)}
      </div>
      <div class="seg seg-sm" aria-label="Veredicto">
        <button data-act="verdict" data-v="all" class="${f.verdict === 'all' ? 'on' : ''}">Todos</button>
        ${['buff', 'nerf', 'adjust'].map(v => html`<button data-act="verdict" data-v="${v}" class="${f.verdict === v ? 'on' : ''}">${PATCH_VERDICT[v].plural}</button>`)}
      </div>
      <label class="switch pn-switch ${hasMine ? '' : 'off'}" data-tip="${hasMine ? 'Muestra solo los cambios de tus campeones más jugados' : 'Ninguno de tus campeones más jugados cambia en esta versión'}">
        <input type="checkbox" data-filter="mine" ${f.mine ? 'checked' : ''} ${hasMine ? '' : 'disabled'}><span>Solo mis campeones</span></label>`);
    if (focused) {
      const inp = bar.querySelector('[data-filter="q"]');
      inp.focus();
      inp.setSelectionRange(inp.value.length, inp.value.length);
    }
  },

  renderList() {
    const list = this.el.querySelector('.pn-list');
    const nav = this.el.querySelector('.pn-index');
    if (!list || !this.data) return;
    const secs = this.visibleSections();
    setHtml(nav, html`<div class="pn-index-title">Secciones</div>
      ${secs.map(s => html`<button class="pn-index-link" data-act="jump" data-id="${s.id}">
        <span class="pn-index-name">${s.title}</span>${s.shown.length ? html`<span class="pn-index-n num">${s.shown.length}</span>` : ''}</button>`)}
      ${secs.length ? html`<div class="pn-index-tools">
        <button class="btn ghost small" data-act="expand-all">Abrir todas</button>
        <button class="btn ghost small" data-act="collapse-all">Cerrar todas</button></div>` : ''}`);
    if (!secs.length) {
      return setHtml(list, html`<div class="card">${emptyState({
        glyph: 'scroll', title: 'Nada que mostrar',
        text: this.filters.mine ? 'Ninguno de tus campeones tiene cambios con estos filtros.' : 'Ningún cambio coincide con la búsqueda o los filtros.',
        action: html`<button class="btn" data-act="clear">Quitar filtros</button>`,
      })}</div>`);
    }
    // Con busqueda o filtros, las secciones se despliegan para ver los resultados
    const filtering = !!(this.filters.q || this.filters.mine || this.filters.verdict !== 'all' || this.filters.kind !== 'all');
    setHtml(list, secs.map(s => this.section(s, filtering)));
  },

  section(s, filtering) {
    const folded = !filtering && this.folded.has(s.id);
    const counts = ['buff', 'nerf'].map(v => [v, s.shown.filter(e => e.verdict === v).length]).filter(([, n]) => n);
    // En los modos de juego las entradas van agrupadas por subapartado ("Campeones", "Aumentos"...)
    let lastCat = null;
    const rows = s.shown.map(e => {
      const cat = s.kind === 'champions' || s.kind === 'items' || s.kind === 'runes' ? null : e.category;
      const head = cat && cat !== lastCat ? html`<div class="pn-cat">${cat}</div>` : '';
      lastCat = cat;
      return html`${head}${this.entry(e, s)}`;
    });
    return html`<section class="pn-sec ${folded ? 'folded' : ''}" data-sec="${s.id}">
      <button class="pn-sec-head" data-act="sec" data-id="${s.id}" aria-expanded="${String(!folded)}">
        <span class="pn-sec-title" role="heading" aria-level="2">${s.title}</span>
        <span class="pn-sec-meta">${s.shown.length ? html`<span class="num">${s.shown.length}</span> ${s.shown.length === 1 ? 'cambio' : 'cambios'}` : ''}
          ${counts.map(([v, n]) => html`<span class="pn-dot ${v === 'buff' ? 'up' : 'down'}"><b class="num">${n}</b> ${v === 'buff' ? '▲' : '▼'}</span>`)}</span>
        <span class="spacer"></span><span class="pn-sec-kind">${PATCH_KINDS[s.kind] || ''}</span>
        <span class="xp-chev">${raw(SVG.chevron)}</span>
      </button>
      <div class="pn-sec-body">
        ${s.context ? this.sectionContext(s) : ''}
        ${rows.length ? html`<div class="pn-entries">${rows}</div>` : ''}
      </div>
    </section>`;
  },

  sectionContext(s) {
    const text = s.context;
    if (text.length < 320) return html`<p class="pn-sec-ctx">${text}</p>`;
    const k = `patch-sctx:${s.id}`;
    return html`<div class="xp pn-ctx ${xpOpen(k)}">
      <button class="xp-head pn-ctx-head" data-expand="${k}" aria-expanded="${xpExpanded(k)}"><span>${text.slice(0, 160).replace(/\s+\S*$/, '')}…</span><span class="pn-more">Leer más</span><span class="xp-chev">${raw(SVG.chevron)}</span></button>
      <div class="xp-body"><div><p class="pn-sec-ctx">${text}</p></div></div>
    </div>`;
  },

  entryIcon(e, s) {
    if (e.championId) return icon('champ', e.championId, { size: 40, tip: false });
    if (e.itemId) return icon('item', e.itemId, { size: 40, tip: false });
    if (e.runeId) return icon('rune', e.runeId, { size: 40, tip: false, round: true });
    if (e.icon) return html`<span class="ico" data-vars="--s:40px"><img src="${e.icon}" alt="" data-fb="${initials(e.name)}"></span>`;
    return html`<span class="pn-glyph">${s.kind === 'items' ? '◆' : s.kind === 'runes' ? '◈' : (initials(e.name) || '•')}</span>`;
  },

  entry(e, s) {
    const k = `patch:${e.id}`;
    const v = PATCH_VERDICT[e.verdict] || PATCH_VERDICT.adjust;
    const n = e.groups.reduce((a, g) => a + g.changes.length, 0);
    const line = e.summary || (e.context ? e.context.split('\n')[0] : '');
    return html`<article class="pn-entry xp ${xpOpen(k)} ${e.mine ? 'mine' : ''}" data-entry-id="${e.id}">
      <button class="xp-head pn-entry-head" data-expand="${k}" aria-expanded="${xpExpanded(k)}">
        ${this.entryIcon(e, s)}
        <span class="pn-entry-main">
          <span class="pn-entry-title"><span class="pn-name">${e.name}</span>
            <span class="tag ${v.cls}">${v.label}</span>${e.mine ? html`<span class="tag blue">Tu campeón</span>` : ''}</span>
          ${line ? html`<span class="pn-line">${line}</span>` : ''}
        </span>
        ${n ? html`<span class="pn-n num">${n} ${n === 1 ? 'cambio' : 'cambios'}</span>` : ''}
        <span class="xp-chev">${raw(SVG.chevron)}</span>
      </button>
      <div class="xp-body"><div><div class="pn-entry-body">
        ${e.context ? this.designer(e) : ''}
        ${e.groups.map(g => this.group(g))}
      </div></div></div>
    </article>`;
  },

  designer(e) {
    const k = `patch-why:${e.id}`;
    return html`<div class="xp pn-why ${xpOpen(k)}">
      <button class="xp-head pn-why-head" data-expand="${k}" aria-expanded="${xpExpanded(k)}"><span>Por qué lo cambian</span><span class="xp-chev">${raw(SVG.chevron)}</span></button>
      <div class="xp-body"><div><p class="pn-quote">${e.context}</p></div></div>
    </div>`;
  },

  group(g) {
    return html`<div class="pn-group">
      ${g.title ? html`<div class="pn-group-title">${g.icon ? html`<span class="ico" data-vars="--s:24px"><img src="${g.icon}" alt="" data-hide-on-error></span>` : ''}<span>${g.title}</span></div>` : ''}
      <div class="pn-changes">${g.changes.map(c => this.change(c))}</div>
    </div>`;
  },

  change(c) {
    const cls = c.good === true ? 'up' : c.good === false ? 'down' : 'neutral';
    const mark = c.dir === 'new' || c.mark === 'new' ? html`<span class="tag blue">Nuevo</span>`
      : c.dir === 'removed' || c.mark === 'removed' ? html`<span class="tag red">Eliminado</span>` : '';
    if (c.before == null) {
      const text = c.stat && c.text.startsWith(c.stat) ? c.text.slice(c.stat.length).replace(/^[:\s]+/, '') : c.text;
      return html`<div class="pn-change text">
        <span class="pn-stat">${mark}${c.stat || ''}</span>
        <span class="pn-desc">${text}</span>
      </div>`;
    }
    const arrow = c.dir === 'up' ? '▲' : c.dir === 'down' ? '▼' : '→';
    const tip = c.good === true ? 'Mejora' : c.good === false ? 'Empeora' : 'Cambio sin dirección clara';
    return html`<div class="pn-change ${cls}">
      <span class="pn-stat">${mark}${c.stat || ''}</span>
      <span class="pn-before">${c.before}</span>
      <span class="pn-arrow" data-tip="${tip}">${arrow}</span>
      <span class="pn-after">${c.after}</span>
    </div>`;
  },
});
