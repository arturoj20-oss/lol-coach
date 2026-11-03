// Componentes de la ventana principal: tooltip, selector de campeon, graficas SVG y estados vacios
'use strict';

// ---------- Tooltip global ----------
// data-tip="texto" (admite \n), data-tip-title="titulo", data-tip-list="linea1\nlinea2" (lista con vinetas)
// Sale con un pequeno retraso (salvo si ya habia uno visible) para no parpadear al cruzar la ventana
const Tip = {
  el: null,
  target: null,
  timer: null,
  init() {
    this.el = document.createElement('div');
    this.el.id = 'tooltip';
    this.el.setAttribute('role', 'tooltip');
    document.body.appendChild(this.el);
    const show = e => {
      const t = e.target.closest?.('[data-tip],[data-tip-list]');
      if (t === this.target) return;
      if (!t) return this.hide();
      const visible = this.el.classList.contains('show');
      this.target = t;
      clearTimeout(this.timer);
      const open = () => {
        if (this.target !== t || !t.isConnected) return;
        this.render(t.dataset.tipTitle, t.dataset.tip, t.dataset.tipList);
        this.place(t.getBoundingClientRect());
      };
      if (visible || e.type === 'focusin') open(); else this.timer = setTimeout(open, 220);
    };
    document.addEventListener('mouseover', show);
    document.addEventListener('focusin', show);
    document.addEventListener('mouseleave', () => this.hide());
    document.addEventListener('scroll', () => this.hide(), true);
    document.addEventListener('mousedown', () => this.hide());
  },
  render(title, text, list) {
    let content = '';
    if (title) content += html`<span class="tt-title">${title}</span>`;
    if (text) content += esc(text);
    if (list) content += html`<ul>${list.split('\n').filter(Boolean).map(l => html`<li>${l}</li>`)}</ul>`;
    this.el.innerHTML = content;
  },
  place(r) {
    const tt = this.el;
    tt.classList.add('show');
    const w = tt.offsetWidth, h = tt.offsetHeight;
    let x = r.left + r.width / 2 - w / 2;
    let y = r.bottom + 8;
    if (y + h > innerHeight - 6) y = r.top - h - 8;
    x = Math.max(6, Math.min(innerWidth - w - 6, x));
    y = Math.max(6, y);
    tt.style.left = x + 'px';
    tt.style.top = y + 'px';
  },
  // Para graficas: mostrar en un punto concreto
  showAt(x, y, title, text) {
    this.target = null;
    clearTimeout(this.timer);
    this.render(title, text);
    this.place({ left: x, right: x, top: y - 6, bottom: y + 6, width: 0 });
  },
  hide() {
    this.target = null;
    clearTimeout(this.timer);
    this.el?.classList.remove('show');
  },
};

// ---------- Tema (oscuro por defecto, claro o el del sistema) ----------
// Theme.set(config.theme) pone <html data-theme="dark|light">; los tokens de theme.css hacen el resto
const Theme = {
  pref: 'dark',
  mq: window.matchMedia('(prefers-color-scheme: dark)'),
  set(pref) {
    this.pref = ['light', 'dark', 'system'].includes(pref) ? pref : 'dark';
    this.apply();
  },
  current() { return this.pref === 'light' || (this.pref === 'system' && !this.mq.matches) ? 'light' : 'dark'; },
  apply() {
    const root = document.documentElement;
    const t = this.current();
    if (root.dataset.theme === t) return;
    // Transicion de color breve solo durante el cambio
    root.classList.add('theme-anim');
    root.dataset.theme = t;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => root.classList.remove('theme-anim'), 260);
  },
};
Theme.mq.addEventListener('change', () => Theme.apply());

// ---------- Controles segmentados con indicador deslizante ----------
// Cualquier .seg con un boton .on recibe un .seg-ind que se mueve al cambiar .on. Funciona solo
// (MutationObserver) aunque la vista vuelva a pintar el control: recuerda la ultima posicion.
const Seg = {
  last: new Map(),
  key(seg) { return seg.getAttribute('aria-label') || $$(':scope > button', seg).map(b => b.textContent.trim()).join('|'); },
  sync(seg, animate = true) {
    const on = seg.querySelector(':scope > button.on');
    let ind = seg.querySelector(':scope > .seg-ind');
    const key = this.key(seg);
    if (!ind) {
      if (!on) return;
      ind = document.createElement('span');
      ind.className = 'seg-ind no-anim';
      ind.setAttribute('aria-hidden', 'true');
      seg.prepend(ind);
      seg.classList.add('has-ind');
      // Si ya existia un control igual (se ha vuelto a pintar), sale de donde estaba
      const prev = this.last.get(key);
      if (prev && animate) { this.place(ind, prev); void ind.offsetWidth; } else animate = false;
    }
    if (!on || !on.offsetWidth) { ind.classList.add('hidden'); return; }
    const pos = { x: on.offsetLeft, y: on.offsetTop, w: on.offsetWidth, h: on.offsetHeight };
    ind.classList.toggle('no-anim', !animate);
    ind.classList.remove('hidden');
    this.place(ind, pos);
    this.last.set(key, pos);
  },
  place(ind, p) {
    ind.style.setProperty('--seg-x', p.x + 'px');
    ind.style.setProperty('--seg-y', p.y + 'px');
    ind.style.setProperty('--seg-w', p.w + 'px');
    ind.style.setProperty('--seg-h', p.h + 'px');
  },
  syncAll(root = document, animate = false) { for (const s of $$('.seg', root)) this.sync(s, animate); },
  init() {
    const pending = new Set();
    let raf = 0;
    const flush = () => { raf = 0; for (const s of pending) if (s.isConnected) this.sync(s, true); pending.clear(); };
    new MutationObserver(list => {
      for (const m of list) {
        if (m.target.classList?.contains('seg-ind')) continue;
        if (m.type === 'attributes') {
          if (m.target.parentElement?.classList.contains('seg')) pending.add(m.target.parentElement);
        } else {
          for (const n of m.addedNodes) {
            if (n.nodeType !== 1 || n.classList.contains('seg-ind')) continue;
            if (n.classList.contains('seg')) pending.add(n);
            for (const s of n.querySelectorAll('.seg')) pending.add(s);
          }
        }
      }
      if (pending.size && !raf) raf = requestAnimationFrame(flush);
    }).observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['class'] });
    window.addEventListener('resize', () => this.syncAll());
    document.fonts?.ready.then(() => this.syncAll());
  },
};

// ---------- Bloques desplegables ----------
// <div class="xp ${xpOpen('k')}"><button class="xp-head" data-expand="k" aria-expanded="...">...</button>
// <div class="xp-body"><div>...</div></div></div>. El estado abierto se recuerda por clave entre repintados.
const Expand = {
  open: new Set(),
  init() {
    document.addEventListener('click', e => {
      const h = e.target.closest('[data-expand]');
      if (!h || e.target.closest('[data-act]:not([data-expand])')) return;
      const xp = h.closest('.xp');
      if (!xp) return;
      const open = xp.classList.toggle('open');
      h.setAttribute('aria-expanded', String(open));
      const k = h.dataset.expand;
      if (k) { if (open) this.open.add(k); else this.open.delete(k); }
    });
  },
};
const xpOpen = key => Expand.open.has(String(key)) ? 'open' : '';
const xpExpanded = key => String(Expand.open.has(String(key)));

// Filas de esqueleto mientras carga una lista
function skeletonRows(n = 4, icon = true) {
  return html`<div class="skel-list">${Array.from({ length: n }, () => html`<div class="skel-row">${icon ? html`<span class="skel ico-skel"></span>` : ''}<span class="skel-lines"><span class="skel line-skel"></span><span class="skel line-skel short"></span></span></div>`)}</div>`;
}

// ---------- Estados vacios ----------
function emptyState({ glyph = 'scroll', title, text, action, error = false }) {
  return html`<div class="empty-state ${error ? 'error' : ''}">
    <span class="glyph">${raw(SVG[glyph] || SVG.scroll)}</span>
    <h3>${title}</h3>
    ${text ? html`<p>${text}</p>` : ''}
    ${action || ''}
  </div>`;
}

function loadingState(text = 'Cargando...') {
  return html`<div class="empty-state"><div class="spinner"></div><p>${text}</p></div>`;
}

// ---------- Selector de campeon con busqueda ----------
const normalize = s => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/gi, '').toLowerCase();

function ChampPicker({ source, placeholder = '(Ninguno)', onChange, label }) {
  const el = document.createElement('div');
  el.className = 'picker';
  setHtml(el, html`<span class="picker-ico"></span>
    <input class="input" type="text" placeholder="${placeholder}" autocomplete="off" spellcheck="false" aria-label="${label || placeholder}" role="combobox" aria-expanded="false">
    <button class="icon-btn picker-clear" type="button" aria-label="Quitar" data-tip="Quitar">${raw(SVG.close)}</button>
    <div class="picker-list" role="listbox"></div>`);
  const input = $('input', el);
  const list = $('.picker-list', el);
  const ico = $('.picker-ico', el);
  let value = null;
  let options = [];
  let active = 0;

  const paintValue = () => {
    if (document.activeElement !== input) input.value = value?.name || '';
    setHtml(ico, icon('champ', value?.id, { size: 22, tip: false }));
    el.classList.toggle('has-value', !!value);
  };

  const open = () => {
    const q = normalize(input.value === value?.name ? '' : input.value);
    options = source().filter(c => !q || normalize(c.name).includes(q))
      .sort((a, b) => (normalize(a.name).startsWith(q) ? 0 : 1) - (normalize(b.name).startsWith(q) ? 0 : 1) || a.name.localeCompare(b.name, 'es'))
      .slice(0, 60);
    active = 0;
    setHtml(list, options.length
      ? options.map((c, i) => html`<div class="picker-opt ${i === 0 ? 'active' : ''}" role="option" data-i="${i}">${icon('champ', c.id, { size: 24, tip: false })}<span>${c.name}</span></div>`)
      : html`<div class="picker-none">Sin resultados</div>`);
    el.classList.add('open');
    input.setAttribute('aria-expanded', 'true');
  };
  const close = () => { el.classList.remove('open'); input.setAttribute('aria-expanded', 'false'); };
  const choose = c => {
    value = c ? { id: c.id, name: c.name } : null;
    close();
    input.value = value?.name || '';
    paintValue();
    onChange?.(value);
  };
  const highlight = i => {
    const opts = $$('.picker-opt', list);
    if (!opts.length) return;
    active = (i + opts.length) % opts.length;
    opts.forEach((o, j) => o.classList.toggle('active', j === active));
    opts[active].scrollIntoView({ block: 'nearest' });
  };

  input.addEventListener('focus', () => { input.select(); open(); });
  input.addEventListener('input', open);
  input.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown') { e.preventDefault(); if (!el.classList.contains('open')) open(); else highlight(active + 1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); highlight(active - 1); }
    else if (e.key === 'Enter') { e.preventDefault(); if (options[active]) choose(options[active]); input.blur(); }
    else if (e.key === 'Escape') { input.value = value?.name || ''; close(); input.blur(); }
  });
  input.addEventListener('blur', () => {
    setTimeout(() => {
      if (el.contains(document.activeElement)) return;
      const text = normalize(input.value);
      if (!text) { if (value) choose(null); else close(); return; }
      const exact = source().find(c => normalize(c.name) === text);
      if (exact && exact.id !== value?.id) choose(exact);
      else { input.value = value?.name || ''; close(); }
    }, 120);
  });
  list.addEventListener('mousedown', e => {
    const opt = e.target.closest('.picker-opt');
    if (!opt) return;
    e.preventDefault();
    choose(options[+opt.dataset.i]);
    input.blur();
  });
  $('.picker-clear', el).addEventListener('click', () => choose(null));

  paintValue();
  return {
    el,
    set(v) { value = v ? { id: v.id, name: v.name || Dd.champName(v.id) } : null; paintValue(); },
    refresh: paintValue,
  };
}

// ---------- Graficas SVG ----------
// Se redibujan solas al cambiar de tamano (ResizeObserver)
const chartObserver = new ResizeObserver(entries => {
  for (const e of entries) {
    const el = e.target;
    const w = Math.round(e.contentRect.width), h = Math.round(e.contentRect.height);
    if (!w || !h || (el._w === w && el._h === h)) continue;
    el._w = w; el._h = h;
    el._draw?.(w, h);
  }
});
// Mismos datos en el mismo elemento ya dibujado: no se redibuja (el estado llega cada segundo y
// recrear el SVG hacia parpadear la grafica y perder la guia del raton)
function sameChart(el, data) {
  const sig = JSON.stringify(data);
  if (el._sig === sig && el.querySelector('svg')) return true;
  el._sig = sig;
  return false;
}

function mountChart(el, draw) {
  el._draw = draw;
  el._w = 0;
  chartObserver.observe(el);
  if (el.clientWidth && el.clientHeight) { el._w = el.clientWidth; el._h = el.clientHeight; draw(el.clientWidth, el.clientHeight); }
}

function niceStep(range, target) {
  const raw0 = range / target;
  const mag = Math.pow(10, Math.floor(Math.log10(raw0)));
  const n = raw0 / mag;
  return (n < 1.5 ? 1 : n < 3 ? 2 : n < 7 ? 5 : 10) * mag;
}

// Grafica de linea (LP). points: [{ x, y, title, text }]
function lineChart(el, points, opts = {}) {
  if (sameChart(el, [points, opts])) return;
  mountChart(el, (W, H) => {
    if (!points.length) return setHtml(el, '');
    const pad = { l: opts.padLeft ?? 64, r: 14, t: 12, b: 24 };
    const ys = points.map(p => p.y);
    let min = Math.min(...ys), max = Math.max(...ys);
    // Lineas de referencia: las que vengan (p. ej. divisiones) o automaticas
    let lines = opts.grid;
    if (lines?.length) {
      const gv = lines.map(g => g.v);
      min = Math.min(min, ...gv);
      max = Math.max(max, ...gv);
      const padY = Math.max(10, (max - min) * .08);
      min -= padY; max += padY;
    } else {
      const step = niceStep(Math.max(max - min, 50), 4);
      min = Math.floor((min - step * .2) / step) * step;
      max = Math.ceil((max + step * .2) / step) * step;
      lines = [];
      for (let v = min; v <= max + 1e-6; v += step) lines.push({ v, label: fmt.int(v) });
    }
    const n = points.length;
    const X = i => pad.l + (n === 1 ? (W - pad.l - pad.r) / 2 : i * (W - pad.l - pad.r) / (n - 1));
    const Y = v => pad.t + (1 - (v - min) / (max - min || 1)) * (H - pad.t - pad.b);
    let grid = '';
    for (const g of lines) {
      grid += `<line x1="${pad.l}" x2="${W - pad.r}" y1="${Y(g.v)}" y2="${Y(g.v)}" class="grid"/>`;
      grid += `<text x="${pad.l - 8}" y="${Y(g.v) + 4}" text-anchor="end" class="axis">${esc(g.label)}</text>`;
    }
    // Etiquetas de x: primera, ultima y alguna intermedia
    let xl = '';
    const every = Math.max(1, Math.ceil(n / 6));
    points.forEach((p, i) => {
      if (p.xLabel && (i % every === 0 || i === n - 1)) xl += `<text x="${X(i)}" y="${H - 6}" text-anchor="middle" class="axis">${esc(p.xLabel)}</text>`;
    });
    const line = points.map((p, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)},${Y(p.y).toFixed(1)}`).join('');
    const area = `${line}L${X(n - 1)},${H - pad.b}L${X(0)},${H - pad.b}Z`;
    const dots = points.map((p, i) => `<circle cx="${X(i)}" cy="${Y(p.y)}" r="${i === n - 1 ? 4 : 2.5}" class="${i === n - 1 ? 'dot last' : 'dot'} ${p.cls || ''}"/>`).join('');
    const id = 'c' + Math.random().toString(36).slice(2, 8);
    // Bandas (p. ej. rangos): la linea y el relleno cambian de color segun la altura, con cortes
    // limpios en cada limite. bands = [{ from, cls }] (cls da stop-color en CSS)
    let defs, lineAttr, areaFill;
    if (opts.bands?.length) {
      const bands = [...opts.bands].sort((a, b) => b.from - a.from);
      const off = v => Math.min(1, Math.max(0, Y(v) / H)).toFixed(4);
      let stops = '', top = 0;
      for (const b of bands) {
        const o = Math.max(top, +off(b.from));
        stops += `<stop offset="${top}" class="${b.cls}"/><stop offset="${o}" class="${b.cls}"/>`;
        top = o;
        if (top >= 1) break;
      }
      // Lo que quede por debajo de la ultima banda, con su color
      if (top < 1) stops += `<stop offset="${top}" class="${bands[bands.length - 1].cls}"/><stop offset="1" class="${bands[bands.length - 1].cls}"/>`;
      defs = `<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2="${H}">${stops}</linearGradient>`;
      lineAttr = `class="line" stroke="url(#${id})"`;
      areaFill = `fill="url(#${id})" fill-opacity=".12"`;
    } else {
      defs = `<linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" class="fill-stop" stop-opacity=".3"/><stop offset="1" class="fill-stop" stop-opacity="0"/></linearGradient>`;
      lineAttr = 'class="line gold"';
      areaFill = `fill="url(#${id})"`;
    }
    el.innerHTML = `<svg width="${W}" height="${H}" class="chart">
      <defs>${defs}</defs>
      ${grid}${xl}<path d="${area}" ${areaFill}/><path d="${line}" ${lineAttr}/>${dots}
      <line class="guide" y1="${pad.t}" y2="${H - pad.b}" x1="-10" x2="-10"/><rect class="hit" x="${pad.l}" y="0" width="${W - pad.l - pad.r}" height="${H}"/></svg>`;
    hoverGuide(el, n, X, i => points[i]);
  });
}

// Grafica de diferencia (tu - rival): verde/azul por encima de 0, rojo por debajo
function diffChart(el, xs, ys, opts = {}) {
  if (sameChart(el, [xs, ys, opts.name])) return;
  mountChart(el, (W, H) => {
    if (!ys?.length) return setHtml(el, '');
    const pad = { l: 52, r: 12, t: 12, b: 24 };
    let max = Math.max(1, ...ys.map(Math.abs));
    const step = niceStep(max * 2, 4);
    max = Math.ceil(max / step) * step;
    const n = ys.length;
    const X = i => pad.l + i * (W - pad.l - pad.r) / Math.max(1, n - 1);
    const Y = v => pad.t + (1 - (v + max) / (2 * max)) * (H - pad.t - pad.b);
    let grid = '';
    for (let v = -max; v <= max + 1e-6; v += step) {
      grid += `<line x1="${pad.l}" x2="${W - pad.r}" y1="${Y(v)}" y2="${Y(v)}" class="${v === 0 ? 'zero' : 'grid'}"/>`;
      grid += `<text x="${pad.l - 8}" y="${Y(v) + 4}" text-anchor="end" class="axis">${esc(opts.format ? opts.format(v) : fmt.signed(v))}</text>`;
    }
    let xl = '';
    const every = n > 30 ? 10 : 5;
    xs.forEach((m, i) => { if (m % every === 0) xl += `<text x="${X(i)}" y="${H - 6}" text-anchor="middle" class="axis">${m}'</text>`; });
    const line = ys.map((v, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join('');
    const area = `${line}L${X(n - 1)},${Y(0)}L${X(0)},${Y(0)}Z`;
    const id = 'c' + Math.random().toString(36).slice(2, 8);
    el.innerHTML = `<svg width="${W}" height="${H}" class="chart">
      <defs>
        <clipPath id="${id}a"><rect x="0" y="0" width="${W}" height="${Y(0)}"/></clipPath>
        <clipPath id="${id}b"><rect x="0" y="${Y(0)}" width="${W}" height="${H}"/></clipPath>
      </defs>
      ${grid}${xl}
      <path d="${area}" class="area pos" clip-path="url(#${id}a)"/>
      <path d="${area}" class="area neg" clip-path="url(#${id}b)"/>
      <path d="${line}" class="line pos" clip-path="url(#${id}a)"/>
      <path d="${line}" class="line neg" clip-path="url(#${id}b)"/>
      <line class="guide" y1="${pad.t}" y2="${H - pad.b}" x1="-10" x2="-10"/><rect class="hit" x="${pad.l}" y="0" width="${W - pad.l - pad.r}" height="${H}"/></svg>`;
    hoverGuide(el, n, X, i => ({ title: `Minuto ${xs[i]}`, text: `${opts.name || 'Diferencia'}: ${opts.format ? opts.format(ys[i]) : fmt.signed(ys[i])}` }));
  });
}

// Linea vertical + tooltip al pasar el raton por una grafica
function hoverGuide(el, n, X, info) {
  const svg = el.querySelector('svg');
  const guide = svg.querySelector('.guide');
  const hit = svg.querySelector('.hit');
  hit.addEventListener('mousemove', e => {
    const r = svg.getBoundingClientRect();
    const mx = e.clientX - r.left;
    let best = 0;
    for (let i = 1; i < n; i++) if (Math.abs(X(i) - mx) < Math.abs(X(best) - mx)) best = i;
    guide.setAttribute('x1', X(best));
    guide.setAttribute('x2', X(best));
    const p = info(best);
    Tip.showAt(r.left + X(best), r.top + 20, p.title, p.text);
  });
  hit.addEventListener('mouseleave', () => { guide.setAttribute('x1', -10); guide.setAttribute('x2', -10); Tip.hide(); });
}

// Anillo de porcentaje (victorias)
function ring(value, size = 72, label = '') {
  const r = size / 2 - 5;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(1, value || 0));
  return raw(`<svg class="ring" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" aria-label="${esc(label)}">
    <circle cx="${size / 2}" cy="${size / 2}" r="${r}" class="ring-bg"/>
    <circle cx="${size / 2}" cy="${size / 2}" r="${r}" class="ring-loss" stroke-dasharray="${c}" stroke-dashoffset="0"/>
    <circle cx="${size / 2}" cy="${size / 2}" r="${r}" class="ring-win" stroke-dasharray="${c * v} ${c}" transform="rotate(-90 ${size / 2} ${size / 2})"/>
    <text x="50%" y="50%" dy=".36em" text-anchor="middle" class="ring-text">${esc(fmt.pct(v))}</text></svg>`);
}

// Mapa de muertes sobre la Grieta (coordenadas 0..14870, y hacia arriba)
function deathMap(deaths, size = 280) {
  const S = 14870;
  const pts = deaths.map((d, i) => {
    const x = d.x / S * size, y = (1 - d.y / S) * size;
    const tip = `Muerte ${i + 1} · min ${fmt.clock(d.t)}\nAsesino: ${Dd.champName(d.killerChampionId)}`;
    return `<g class="death" transform="translate(${x.toFixed(1)},${y.toFixed(1)})" data-tip="${esc(tip)}">
      <circle r="9" class="death-halo"/><circle r="5.5" class="death-dot"/><path d="M-2.5-2.5l5 5M2.5-2.5l-5 5" class="death-x"/></g>`;
  }).join('');
  return raw(`<svg class="deathmap" viewBox="0 0 ${size} ${size}" width="100%" height="100%">
    <rect width="${size}" height="${size}" class="dm-bg"/>
    <image href="${Dd.map()}" width="${size}" height="${size}" class="dm-map"/>
    <rect width="${size}" height="${size}" class="dm-frame"/>${pts}</svg>`);
}

// Barra de comparacion con la media
function compareBar(c) {
  const f = v => c.format === 'percent' ? fmt.pct(v) : c.format === 'integer' ? fmt.int(v) : fmt.dec(v, 1);
  const max = Math.max(c.value, c.avg) * 1.15 || 1;
  return html`<div class="cmp ${c.better ? 'better' : 'worse'}">
    <div class="cmp-head"><span class="cmp-label">${c.label}</span><span class="cmp-val num">${f(c.value)} <span class="muted">/ media ${f(c.avg)}</span></span></div>
    <div class="cmp-track"><span class="cmp-fill" data-vars="--w:${(c.value / max * 100).toFixed(1)}%"></span><span class="cmp-avg" data-vars="--x:${(c.avg / max * 100).toFixed(1)}%" data-tip="Tu media: ${f(c.avg)}"></span></div>
  </div>`;
}
