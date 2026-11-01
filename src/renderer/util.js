// Utilidades compartidas por la ventana principal y el overlay: plantillas, formatos, Data Dragon e iconos
'use strict';

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

// ---------- Plantillas HTML con escape automatico ----------
// html`<b>${texto}</b>` escapa lo interpolado; los arrays se concatenan y raw() mete HTML de confianza.
class Raw { constructor(s) { this.s = s; } toString() { return this.s; } }
const raw = s => new Raw(s);

function esc(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function toHtml(v) {
  if (v === null || v === undefined || v === false) return '';
  if (v instanceof Raw) return v.s;
  if (Array.isArray(v)) return v.map(toHtml).join('');
  return esc(v);
}

function html(strings, ...vals) {
  let out = '';
  strings.forEach((s, i) => { out += s; if (i < vals.length) out += toHtml(vals[i]); });
  return new Raw(out);
}

// La CSP no deja atributos style en el HTML: los valores dinamicos van en data-vars="--p:40%;--c:red"
function hydrate(root) {
  for (const el of root.querySelectorAll('[data-vars]')) {
    for (const pair of el.dataset.vars.split(';')) {
      const i = pair.indexOf(':');
      if (i > 0) el.style.setProperty(pair.slice(0, i).trim(), pair.slice(i + 1).trim());
    }
    el.removeAttribute('data-vars');
  }
  return root;
}

// Si el HTML no ha cambiado no se toca el DOM: el estado llega cada segundo y repintar igual
// recreaba imagenes y relanzaba animaciones (parpadeo)
function setHtml(el, content) {
  if (!el) return el;
  const s = toHtml(content);
  if (el._html === s) return el;
  el._html = s;
  el.innerHTML = s;
  return hydrate(el);
}

// ---------- Formatos en espanol ----------
const NF0 = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 0 });
const NF1 = new Intl.NumberFormat('es-ES', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const NF2 = new Intl.NumberFormat('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const PF0 = new Intl.NumberFormat('es-ES', { style: 'percent', maximumFractionDigits: 0 });
const RTF = new Intl.RelativeTimeFormat('es-ES', { numeric: 'auto' });

const fmt = {
  int: n => (n === null || n === undefined || isNaN(n)) ? '—' : NF0.format(n),
  dec: (n, d = 1) => (n === null || n === undefined || isNaN(n)) ? '—' : (d === 2 ? NF2 : NF1).format(n),
  pct: n => (n === null || n === undefined || isNaN(n)) ? '—' : PF0.format(n),
  // 2200 -> "+2,2 k"
  k: (n, signed = false) => {
    if (n === null || n === undefined || isNaN(n)) return '—';
    const sign = signed && n > 0 ? '+' : n < 0 ? '−' : '';
    const a = Math.abs(n);
    return sign + (a >= 1000 ? NF1.format(a / 1000) + ' k' : NF0.format(a));
  },
  signed: (n, d = 0) => {
    if (n === null || n === undefined || isNaN(n)) return '—';
    const s = d ? fmt.dec(Math.abs(n), d) : NF0.format(Math.abs(n));
    return (n > 0 ? '+' : n < 0 ? '−' : '') + s;
  },
  // segundos -> "12:34"
  clock: sec => {
    if (sec === null || sec === undefined || isNaN(sec)) return '—';
    sec = Math.max(0, Math.floor(sec));
    return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
  },
  duration: sec => `${Math.floor(sec / 60)} min ${String(Math.floor(sec % 60)).padStart(2, '0')} s`,
  ago: ts => {
    const diff = (ts - Date.now()) / 1000;
    const a = Math.abs(diff);
    if (a < 60) return 'ahora mismo';
    if (a < 3600) return RTF.format(Math.round(diff / 60), 'minute');
    if (a < 86400) return RTF.format(Math.round(diff / 3600), 'hour');
    if (a < 86400 * 30) return RTF.format(Math.round(diff / 86400), 'day');
    return new Date(ts).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
  },
  date: ts => new Date(ts).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' }),
  dateTime: ts => new Date(ts).toLocaleString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }),
  kda: (k, d, a) => d === 0 ? 'Perfecto' : NF2.format((k + a) / d),
};

// ---------- Nombres ----------
const ROLE_NAMES = { '': 'Automático', top: 'Top', jungle: 'Jungla', mid: 'Medio', middle: 'Medio', adc: 'Tirador', bottom: 'Tirador', support: 'Apoyo', utility: 'Apoyo' };
const roleName = r => ROLE_NAMES[(r || '').toLowerCase()] ?? r;

const TIERS = ['IRON', 'BRONZE', 'SILVER', 'GOLD', 'PLATINUM', 'EMERALD', 'DIAMOND', 'MASTER', 'GRANDMASTER', 'CHALLENGER'];
const TIER_NAMES = { IRON: 'Hierro', BRONZE: 'Bronce', SILVER: 'Plata', GOLD: 'Oro', PLATINUM: 'Platino', EMERALD: 'Esmeralda', DIAMOND: 'Diamante', MASTER: 'Maestro', GRANDMASTER: 'Gran Maestro', CHALLENGER: 'Aspirante', UNRANKED: 'Sin clasificar' };
const TIER_SHORT = { IRON: 'H', BRONZE: 'B', SILVER: 'P', GOLD: 'O', PLATINUM: 'PT', EMERALD: 'E', DIAMOND: 'D', MASTER: 'M', GRANDMASTER: 'GM', CHALLENGER: 'A' };
const DIVS = ['IV', 'III', 'II', 'I'];
const isApex = t => ['MASTER', 'GRANDMASTER', 'CHALLENGER'].includes(t);
const rankName = r => r ? (isApex(r.tier) ? TIER_NAMES[r.tier] : `${TIER_NAMES[r.tier] || r.tier} ${r.division}`) : 'Sin clasificar';

// 'EMERALD II 93 LP' -> { tier, division, lp, name: 'Esmeralda II', short: 'Esm. II' }
function parseRankLabel(label) {
  const m = String(label || '').match(/^([A-Z]+)\s*(IV|III|II|I)?\s*(-?\d+)\s*LP/i);
  if (!m) return null;
  const tier = m[1].toUpperCase();
  const division = isApex(tier) ? '' : (m[2] || '').toUpperCase();
  const tname = TIER_NAMES[tier] || tier;
  return {
    tier, division, lp: +m[3],
    name: `${tname}${division ? ' ' + division : ''}`,
    short: `${tname.length > 6 ? tname.slice(0, 3) + '.' : tname}${division ? ' ' + division : ''}`,
  };
}

const QUEUE_NAMES = { RANKED_SOLO_5x5: 'Solo/Dúo', RANKED_FLEX_SR: 'Flexible' };

// ---------- Data Dragon ----------
const Dd = {
  version: '16.21.1',
  byId: new Map(),
  champions: null,
  set(champions) {
    if (!champions) return;
    this.champions = champions;
    if (champions.version) this.version = champions.version;
    this.byId = new Map((champions.all || []).map(c => [c.id, c]));
  },
  champ(id) { return this.byId.get(id) || null; },
  champName(id) { return this.champ(id)?.name || (id ? `Campeón ${id}` : '—'); },
  champIcon(id) { const c = this.champ(id); return c ? `https://ddragon.leagueoflegends.com/cdn/${this.version}/img/champion/${c.key}.png` : ''; },
  // Arte de la pantalla de carga (mismo dominio de Data Dragon)
  champLoading(id) { const c = this.champ(id); return c ? `https://ddragon.leagueoflegends.com/cdn/img/champion/loading/${c.key}_0.jpg` : ''; },
  item(id) { return id ? `https://ddragon.leagueoflegends.com/cdn/${this.version}/img/item/${id}.png` : ''; },
  itemName(id) { return this.champions?.items?.[id]?.name || `Objeto ${id}`; },
  spell(id) { const s = this.champions?.spells?.[id]; return s ? `https://ddragon.leagueoflegends.com/cdn/${this.version}/img/spell/${s.key}.png` : ''; },
  spellName(id) { return this.champions?.spells?.[id]?.name || `Hechizo ${id}`; },
  // Los fragmentos de estadisticas vienen con icon: null
  rune(id) { const r = this.champions?.runes?.[id]; return r?.icon ? `https://ddragon.leagueoflegends.com/cdn/img/${r.icon}` : ''; },
  runeName(id) { return this.champions?.runes?.[id]?.name || `Runa ${id}`; },
  profileIcon(id) { return id ? `https://ddragon.leagueoflegends.com/cdn/${this.version}/img/profileicon/${id}.png` : ''; },
  map() { return `https://ddragon.leagueoflegends.com/cdn/${this.version}/img/map/map11.png`; },
  emblem(tier) { return tier ? `https://raw.communitydragon.org/latest/plugins/rcp-fe-lol-static-assets/global/default/images/ranked-emblem/emblem-${tier.toLowerCase()}.png` : ''; },
};

const initials = name => (name || '?').replace(/[^A-Za-zÁÉÍÓÚÑáéíóúñ ]/g, '').split(' ').filter(Boolean).map(w => w[0]).join('').slice(0, 2).toUpperCase() || '?';

// Icono cuadrado con fallback. kind: champ | item | spell | rune | profile
function icon(kind, id, opts = {}) {
  const size = opts.size || 36;
  const cls = ['ico', opts.round ? 'round' : '', opts.zoom || kind === 'champ' ? 'zoom' : '', opts.cls || ''].join(' ');
  let src = '', name = '';
  if (kind === 'champ') { src = Dd.champIcon(id); name = Dd.champName(id); }
  else if (kind === 'item') { src = Dd.item(id); name = id ? Dd.itemName(id) : ''; }
  else if (kind === 'spell') { src = Dd.spell(id); name = Dd.spellName(id); }
  else if (kind === 'rune') { src = Dd.rune(id); name = Dd.runeName(id); }
  else if (kind === 'profile') { src = Dd.profileIcon(id); name = opts.name || ''; }
  const tip = opts.tip === false ? '' : (opts.tip || name);
  const vars = `--s:${size}px`;
  if (!id) return html`<span class="${cls} empty" data-vars="${vars}"></span>`;
  const fb = initials(name);
  // Runas sin icono (fragmentos de estadisticas): rombo con el color del fragmento
  const noIcon = kind === 'rune' && !src
    ? html`<span class="fb shard-fb">${raw(shardGlyph(name))}</span>`
    : html`<span class="fb">${fb}</span>`;
  return html`<span class="${cls}" data-vars="${vars}" ${tip ? raw(`data-tip="${esc(tip)}"`) : ''}>${src ? html`<img src="${src}" alt="" data-fb="${fb}">` : noIcon}</span>`;
}

// Color segun el tipo de fragmento (ataque, fuerza, vida...)
function shardGlyph(name) {
  const n = String(name || '').toLowerCase();
  const c = /vida|salud|health/.test(n) ? '#3ACF7A' : /ataque|attack/.test(n) ? '#E8A43C' : /velocidad|movim|haste|habilidad/.test(n) ? '#0AC8B9' : /tenacidad|resist|armadura/.test(n) ? '#A09B8C' : '#C89B3C';
  return `<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 2l8 8-8 8-8-8z" fill="${c}" fill-opacity=".25" stroke="${c}" stroke-width="1.5"/><path d="M10 6.5l3.5 3.5-3.5 3.5-3.5-3.5z" fill="${c}"/></svg>`;
}

// Las imagenes que fallan se sustituyen por las iniciales (los onerror en linea estan vetados por la CSP)
document.addEventListener('error', e => {
  const img = e.target;
  if (!(img instanceof HTMLImageElement)) return;
  if (img.dataset.fb !== undefined) {
    const fb = document.createElement('span');
    fb.className = 'fb';
    fb.textContent = img.dataset.fb;
    img.replaceWith(fb);
  } else if (img.dataset.hideOnError !== undefined) {
    img.remove();
  }
}, true);

// ---------- Iconos SVG ----------
const SVG = {
  minimize: '<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M1 6.5h10" stroke="currentColor" stroke-width="1.4"/></svg>',
  close: '<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M1.5 1.5l9 9M10.5 1.5l-9 9" stroke="currentColor" stroke-width="1.4"/></svg>',
  info: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 1l9 9-9 9-9-9z" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M10 8.5v5M10 6v.5" stroke="currentColor" stroke-width="1.8"/></svg>',
  warn: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 1.5l9 16H1z" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M10 7v5.5M10 14.5v.5" stroke="currentColor" stroke-width="1.8"/></svg>',
  key: '<svg viewBox="0 0 64 64" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2"><circle cx="22" cy="32" r="10"/><circle cx="22" cy="32" r="4"/><path d="M32 32h24M48 32v8M54 32v6"/><path d="M32 4l28 28-28 28L4 32z" opacity=".35"/></svg>',
  plug: '<svg viewBox="0 0 64 64" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2"><path d="M32 4l28 28-28 28L4 32z" opacity=".35"/><path d="M24 18v10M40 18v10M20 28h24v6a12 12 0 0 1-24 0zM32 46v8"/></svg>',
  swords: '<svg viewBox="0 0 64 64" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2"><path d="M32 4l28 28-28 28L4 32z" opacity=".35"/><path d="M18 18l22 22M40 40l4-4M40 40l-4 4M46 18L24 40M24 40l-4-4M24 40l4 4M17 47l5-5M47 47l-5-5"/></svg>',
  scroll: '<svg viewBox="0 0 64 64" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2"><path d="M32 4l28 28-28 28L4 32z" opacity=".35"/><path d="M22 18h20v28H22zM26 25h12M26 31h12M26 37h8"/></svg>',
  crown: '<svg viewBox="0 0 64 64" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2"><path d="M32 4l28 28-28 28L4 32z" opacity=".35"/><path d="M18 40l-2-16 9 7 7-11 7 11 9-7-2 16z"/></svg>',
  spark: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 1l2.2 6.8L19 10l-6.8 2.2L10 19l-2.2-6.8L1 10l6.8-2.2z" fill="currentColor"/></svg>',
  check: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M4 10.5l4 4 8-9" fill="none" stroke="currentColor" stroke-width="2"/></svg>',
  cross: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M5 5l10 10M15 5L5 15" fill="none" stroke="currentColor" stroke-width="2"/></svg>',
  refresh: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M16 10a6 6 0 1 1-1.8-4.3M16 3v4h-4" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>',
  // Logo: los colores salen de las clases .logo-a/b/c (app.css) para seguir el tema
  logo: '<svg viewBox="0 0 32 32" aria-hidden="true"><path class="logo-a" d="M16 1l15 15-15 15L1 16z" stroke-width="1.5"/><path class="logo-b" d="M16 6l10 10-10 10L6 16z"/><path class="logo-c" d="M16 11l5 5-5 5-5-5z"/></svg>',
  chevron: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M5 8l5 5 5-5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  search: '<svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="8.5" cy="8.5" r="5.5" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M13 13l4.5 4.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
  sort: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M6 4v12M6 16l-3-3M6 16l3-3M14 16V4M14 4l-3 3M14 4l3 3" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  sun: '<svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="3.6" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M10 1.5v2.2M10 16.3v2.2M1.5 10h2.2M16.3 10h2.2M4 4l1.6 1.6M14.4 14.4L16 16M4 16l1.6-1.6M14.4 5.6L16 4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
  moon: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M16.5 12.5A7 7 0 0 1 7.5 3.5a7 7 0 1 0 9 9z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>',
  monitor: '<svg viewBox="0 0 20 20" aria-hidden="true"><rect x="2" y="3" width="16" height="11" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M7 17.5h6M10 14v3.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
  arrow: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M4 10h11M11 5.5l4.5 4.5-4.5 4.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
};

// Glifos de objetivos dibujados a mano (color segun el objetivo)
const OBJ_COLORS = { dragon: '#E8833A', elder: '#9FE8F0', baron: '#A35BE0', herald: '#B56CE8', grubs: '#B56CE8', atakhan: '#E84057', inhib: '#0AC8B9', tower: '#C8AA6E' };
function objKind(key) {
  if (key.startsWith('inhib')) return 'inhib';
  if (key.startsWith('tower')) return 'tower';
  return key;
}
function objIcon(key) {
  const k = objKind(key);
  const c = OBJ_COLORS[k] || '#C8AA6E';
  const paths = {
    dragon: `<path d="M12 3c1 3 4 4 4 8a4 4 0 0 1-8 0c0-2 1-3 2-4 0 2 1 3 2 3 0-3-1-4 0-7z" fill="${c}"/>`,
    elder: `<path d="M12 3c1 3 4 4 4 8a4 4 0 0 1-8 0c0-2 1-3 2-4 0 2 1 3 2 3 0-3-1-4 0-7z" fill="none" stroke="${c}" stroke-width="1.6"/><circle cx="12" cy="13" r="1.6" fill="${c}"/>`,
    baron: `<path d="M5 17c0-6 3-11 7-11s7 5 7 11l-3-3-2 3-2-4-2 4-2-3z" fill="${c}"/><circle cx="10" cy="10" r="1" fill="#010A13"/><circle cx="14" cy="10" r="1" fill="#010A13"/>`,
    herald: `<path d="M3 12s4-6 9-6 9 6 9 6-4 6-9 6-9-6-9-6z" fill="none" stroke="${c}" stroke-width="1.6"/><circle cx="12" cy="12" r="3" fill="${c}"/>`,
    grubs: `<circle cx="7" cy="14" r="3" fill="${c}"/><circle cx="12" cy="9" r="3" fill="${c}"/><circle cx="17" cy="14" r="3" fill="${c}"/>`,
    atakhan: `<path d="M5 4l3 7h8l3-7-1 9-6 7-6-7z" fill="${c}"/>`,
    inhib: `<path d="M12 3l6 9-6 9-6-9z" fill="none" stroke="${c}" stroke-width="1.6"/><path d="M12 8l3 4-3 4-3-4z" fill="${c}"/>`,
    tower: `<path d="M8 20h8l-1-10h-6zM7 10h10l-1-4H8z" fill="${c}"/>`,
  };
  return raw(`<svg class="obj-ico" viewBox="0 0 24 24" aria-hidden="true">${paths[k] || paths.tower}</svg>`);
}
