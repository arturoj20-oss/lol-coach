// Notas del ultimo parche (web oficial en espanol), extraidas de forma estructurada y SIN IA.
// La lista de notas esta en /es-es/news/tags/patch-notes/ y cada nota trae el HTML en el JSON
// __NEXT_DATA__ (page.blades[].richText.body). Version 26.x de las notas = 16.x de Data Dragon.
// El HTML se convierte en secciones (h2) > entradas (campeon, objeto, runa...) > grupos (habilidad o
// apartado) > cambios ("Daño: 50/60 ⇒ 70/80"). El veredicto (mejora/empeora/ajuste) sale de comparar
// las cifras de antes y despues con el sentido de cada estadistica.
// Cache en %APPDATA%\LoL Coach\cache\patch-<version>.json con el HTML original (formato 2). Se
// interpreta en cada llamada para que los ids de campeones y objetos salgan siempre al dia.
const fs = require('fs');
const path = require('path');
const { ROLE_NAMES } = require('./util');

const BASE = 'https://www.leagueoflegends.com';
const LIST = `${BASE}/es-es/news/tags/patch-notes/`;
const FORMAT = 2;

async function getText(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(20000) });
  if (!res.ok) throw new Error(`${res.status} en ${url}`);
  return res.text();
}

// ---------- HTML -> arbol ----------
const ENT = {
  nbsp: ' ', amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', ndash: '–', mdash: '—', hellip: '…',
  laquo: '«', raquo: '»', iexcl: '¡', iquest: '¿', rArr: '⇒', rarr: '→', middot: '·', ordm: 'º', ordf: 'ª',
  aacute: 'á', eacute: 'é', iacute: 'í', oacute: 'ó', uacute: 'ú', ntilde: 'ñ', uuml: 'ü',
  Aacute: 'Á', Eacute: 'É', Iacute: 'Í', Oacute: 'Ó', Uacute: 'Ú', Ntilde: 'Ñ', Uuml: 'Ü',
};
const decode = s => s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
  if (e[0] === '#') {
    const n = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
    return Number.isFinite(n) && n > 0 ? String.fromCodePoint(n === 160 ? 32 : n) : m;
  }
  return ENT[e] ?? m;
});
const VOID = new Set(['img', 'br', 'hr', 'input', 'meta', 'link', 'source', 'wbr', 'col', 'area']);

function attrsOf(s) {
  const out = {};
  for (const m of s.matchAll(/([\w:-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g)) {
    out[m[1].toLowerCase()] = decode(m[2] ?? m[3] ?? m[4] ?? '');
  }
  return out;
}

// Parser minimo y tolerante: nodos { tag, attrs, children } o { text }
function parseHtml(src) {
  const root = { tag: '#root', attrs: {}, children: [] };
  const stack = [root];
  const re = /<!--[\s\S]*?-->|<(\/?)([a-zA-Z][\w-]*)((?:[^>"']|"[^"]*"|'[^']*')*?)(\/?)>|([^<]+|<)/g;
  let m;
  while ((m = re.exec(src))) {
    const top = stack[stack.length - 1];
    if (m[5] !== undefined) { top.children.push({ text: decode(m[5]) }); continue; }
    if (!m[2]) continue;
    const tag = m[2].toLowerCase();
    if (m[1]) {
      // Cierre: si no casa con el ultimo abierto, cierra hasta el que corresponda
      let i = stack.length - 1;
      while (i > 0 && stack[i].tag !== tag) i--;
      if (i > 0) stack.length = i;
      continue;
    }
    const node = { tag, attrs: attrsOf(m[3]), children: [] };
    top.children.push(node);
    if (!VOID.has(tag) && !m[4]) stack.push(node);
  }
  return root;
}

const classes = n => (n.attrs?.class || '').split(/\s+/);
const LIST_TAGS = new Set(['ul', 'ol']);

function textOf(n, { skipLists = false } = {}) {
  if (n.text !== undefined) return n.text;
  if (n.tag === 'br') return '\n';
  if (skipLists && LIST_TAGS.has(n.tag)) return '';
  const inner = n.children.map(c => textOf(c, { skipLists })).join('');
  return n.tag === 'p' || n.tag === 'li' || n.tag === 'div' ? `${inner}\n` : inner;
}

// Espacios normalizados; conserva los saltos de parrafo
const clean = s => String(s || '').replace(/ /g, ' ').split('\n').map(l => l.replace(/\s+/g, ' ').trim())
  .filter(Boolean).join('\n');
const oneLine = s => clean(s).replace(/\n/g, ' ');

function findAll(n, pred, out = []) {
  for (const c of n.children || []) {
    if (c.tag && pred(c)) out.push(c);
    if (c.children) findAll(c, pred, out);
  }
  return out;
}

// Las imagenes de la web van por un proxy: ...akamaihd.net/image?f=<url de Data Dragon>
function unwrapImg(src) {
  if (!src) return null;
  const m = /[?&]f=([^&]+)/.exec(src);
  return m ? decodeURIComponent(m[1]) : src;
}
// Solo Data Dragon: la CSP de la interfaz no deja cargar otras imagenes
const ddIcon = src => (/^https:\/\/ddragon\.leagueoflegends\.com\//.test(src || '') ? src : null);

// ---------- Cambios y veredictos ----------
const ARROW = /\s*(?:⇒|→|=>|➔|➜|⟶)\s*/;
const MARK = /^(nuev[oa]s?|novedad|eliminad[oa]s?|actualizad[oa]s?|cambiad[oa]s?|mejorad[oa]s?|retirad[oa]s?)$/i;
const ABILITY = /^(pasiva|[QWER])(\s*[-–:]|\s*$)|^(pasiva|habilidad|definitiva)\b|^estad[ií]sticas b[aá]sicas/i;
const CATEGORY = /^(campeones|objetos|runas|sistemas?|aumentos|corrección de errores|correcciones de errores|cambios( generales)?|mapas?|modos?|misiones|recompensas|hechizos de invocador|invitados de honor|cabezas de cartel|nuev[oa]s? .+|.+ nuev[oa]s|.+ eliminad[oa]s|actualizaci[oó]n(es)? .+|ajustes? .+)$/i;
// Estadisticas en las que mas es peor (enfriamiento, coste...) salvo que sea su reduccion o recuperacion
const LOWER_BETTER = /^(enfriamientos?|coste|costo|precio|tiempo de (lanzamiento|carga|canalizaci|preparaci|reaparici|espera|reutilizaci|recarga|activaci)|retardo|retraso|demora|da[ñn]o (recibido|sufrido)|penalizaci|consumo|requisito)/i;
const OVERRIDE = /reducci[oó]n|recuperaci[oó]n|reembolso|devoluci[oó]n|reinicio|velocidad de habilidad|aceleraci[oó]n|bonificaci[oó]n/i;
// Pistas del texto del disenador (solo para desempatar)
const BUFF_WORDS = /\b(mejor(a|as|ar|amos|aremos|ando|arle|arla|arlo)|potenci(ar|amos|aremos|arlo|arla)|empuj[oó]n(cito)?|reforz(ar|amos|aremos)|compensar(lo|la|emos)?|darle m[aá]s)\b/i;
const NERF_WORDS = /\b(debilit\w*|nerf\w*|rebaj(ar|amos|aremos)\w*|quitarle|bajarle|en vereda|reducir su poder|bajar los humos|recortar)\b/i;

function nums(s) {
  // Miles (1.200 y 12 600) fuera; "por cada 5 %" es el divisor de una relacion: no cuenta como cifra
  s = String(s || '').replace(/(\d)[. ](?=\d{3}(?!\d))/g, '$1').replace(/por cada \d+(?:,\d+)?/gi, 'por cada');
  const out = (s.match(/\d+(?:,\d+)?/g) || []).map(x => parseFloat(x.replace(',', '.')));
  if (!out.length && /infinit/i.test(s)) out.push(Infinity);
  return out;
}

// 1 sube, -1 baja, 0 igual, NaN mixto o sin cifras
function compareNums(a, b) {
  if (!a.length || !b.length) return NaN;
  if (a.length === b.length) {
    let up = 0, down = 0;
    a.forEach((x, i) => { if (b[i] > x) up++; else if (b[i] < x) down++; });
    return up && down ? NaN : up ? 1 : down ? -1 : 0;
  }
  const mean = v => v.reduce((s, x) => s + x, 0) / v.length;
  const d = mean(b) - mean(a);
  return d > 0 ? 1 : d < 0 ? -1 : 0;
}

// La parte principal va antes del primer parentesis (las relaciones van entre parentesis)
const primary = s => { const i = s.indexOf('('); return i > 0 && nums(s.slice(0, i)).length ? s.slice(0, i) : s; };

// Estadisticas sin sentido de mejora (receta, nombre...)
const NEUTRAL = /^(receta|nombre|descripci[oó]n|correcci[oó]n|rareza|sustituci[oó]n|comportamiento|actualizaci[oó]n)/i;

function direction(before, after) {
  // Descripciones largas con distinto numero de cifras: no se comparan
  if ((before.length > 60 || after.length > 60) && nums(before).length !== nums(after).length) return null;
  let c = compareNums(nums(primary(before)), nums(primary(after)));
  if (c === 0 || Number.isNaN(c)) {
    const full = compareNums(nums(before), nums(after));
    if (c === 0 || !Number.isNaN(full)) c = full;
  }
  return c > 0 ? 'up' : c < 0 ? 'down' : null;
}

function parseChange(li) {
  // Trozos de texto marcando los que van en negrita
  const parts = [];
  const walk = (n, bold) => {
    if (n.text !== undefined) return parts.push({ t: n.text, bold });
    if (LIST_TAGS.has(n.tag)) return;
    if (n.tag === 'br') return parts.push({ t: ' ', bold });
    for (const c of n.children) walk(c, bold || n.tag === 'strong' || n.tag === 'b');
  };
  walk(li, false);
  let marker = null;
  const kept = parts.filter(p => {
    const t = oneLine(p.t);
    if (p.bold && MARK.test(t)) { marker = /elimin|retirad/i.test(t) ? 'removed' : /nuev|novedad/i.test(t) ? 'new' : marker; return false; }
    return true;
  });
  const full = oneLine(kept.map(p => p.t).join(''));
  if (!full) return null;
  let stat = null, rest = full;
  const first = kept.find(p => oneLine(p.t));
  const firstText = first && oneLine(first.t);
  if (first?.bold && !ARROW.test(firstText) && firstText.length < 120) {
    stat = firstText.replace(/[:\s]+$/, '');
    rest = oneLine(full.slice(full.indexOf(firstText) + firstText.length)).replace(/^[:\s]+/, '');
  } else {
    const m = /^([^:⇒→]{2,90}?):\s+(.+)$/.exec(full);
    if (m) { stat = m[1]; rest = m[2]; }
  }
  if (stat && MARK.test(stat)) { marker = /elimin|retirad/i.test(stat) ? 'removed' : 'new'; stat = null; }
  const change = { stat: stat || null, before: null, after: null, text: full, dir: 'change', good: null };
  const arrow = ARROW.exec(rest);
  if (arrow) {
    change.before = rest.slice(0, arrow.index).trim();
    change.after = rest.slice(arrow.index + arrow[0].length).trim().replace(/\.$/, '');
    if (/\(eliminad[oa]\)|^eliminad[oa]/i.test(change.after)) marker = 'removed';
    const dir = NEUTRAL.test(stat || '') ? null : direction(change.before, change.after);
    if (dir) {
      change.dir = dir;
      const what = stat || change.before.replace(/[\d,.%\s/+-]+/g, ' ');
      const lower = LOWER_BETTER.test(what) && !OVERRIDE.test(what);
      change.good = (dir === 'up') !== lower;
    }
  } else if (!stat && /^(eliminad[oa]|se ha(n)? eliminado)/i.test(rest)) {
    marker = 'removed';
  } else if (!stat && /^\(?nuev[oa]\)?\b/i.test(rest)) {
    marker = 'new';
  }
  if (marker && change.dir === 'change') change.dir = marker;
  else if (marker) change.mark = marker;
  return change;
}

// Veredicto de una entrada: mayoria clara de cambios a favor o en contra; si no, el texto del disenador
// solo desempata cuando habla en un unico sentido; si no, ajuste
function verdictOf(entry) {
  if (entry.isNew) return 'new';
  let up = 0, down = 0;
  for (const g of entry.groups) for (const c of g.changes) { if (c.good === true) up++; else if (c.good === false) down++; }
  if (up && !down) return 'buff';
  if (down && !up) return 'nerf';
  if (up >= 2 * down && up - down >= 2) return 'buff';
  if (down >= 2 * up && down - up >= 2) return 'nerf';
  // Cambios mezclados o sin cifras comparables: decide el texto del disenador solo si apunta a un unico lado
  const ctx = (entry.context || '').replace(/mejoras? de (la )?calidad( de vida)?/gi, '');
  const buff = BUFF_WORDS.test(ctx), nerf = NERF_WORDS.test(ctx);
  if (buff !== nerf) return buff ? 'buff' : 'nerf';
  return 'adjust';
}

function sectionKind(id, title) {
  const s = `${id} ${title}`.toLowerCase();
  if (/skins|chromas|aspectos/.test(s)) return 'skins';
  if (/highlights|platos fuertes/.test(s)) return 'highlights';
  if (/aram|arena|classic|urf|swarm|mayhem|caos|doom|bots|nexus|swiftplay|modo r[aá]pido|one-for-all|uno para todos|clash|ascenso|tft|enjambre/.test(s)) return 'modes';
  if (id === 'champions' || /^campeones$/i.test(title)) return 'champions';
  if (/items|^objetos/.test(id) || /^objetos/i.test(title)) return 'items';
  if (id === 'runes' || /^runas/i.test(title)) return 'runes';
  if (/(^|-)systems\b|jungl|objectiv|turret|minion|vision|omnivamp|summoner-spell|role-quest/.test(id) || /^(sistemas|ajustes|torretas|s[uú]bditos|misiones)/i.test(title)) return 'systems';
  return 'other';
}

// ---------- HTML de las notas -> secciones ----------
class NotesParser {
  constructor() {
    this.sections = [];
    this.section = null;
    this.entry = null;
    this.group = null;
    this.icon = null;          // imagen del bloque, para la siguiente entrada
    this.category = null;      // subapartado actual ("Nuevos aumentos", "Campeones" en Arena...)
    this.intro = [];
    this.authors = [];
    this.highlights = { image: null, text: [] };
  }

  parse(html) {
    this.walk(parseHtml(html));
    this.closeEntry();
    return this;
  }

  walk(n) {
    for (const c of n.children) {
      if (c.text !== undefined) { const t = clean(c.text); if (t) this.paragraph(t); } else this.node(c);
    }
  }

  node(n) {
    const k = classes(n);
    if (this.section?.kind === 'skins' && n.tag !== 'h2' && n.tag !== 'header') return;
    switch (n.tag) {
      case 'h1': case 'h2': return this.newSection(n);
      case 'h3': return k.includes('change-title') ? this.newEntry(oneLine(textOf(n)), { fromH3: true, img: this.takeIcon(n), href: n.children.find(c => c.tag === 'a')?.attrs.href }) : this.heading(n, true);
      case 'h4': case 'h5': return this.heading(n, false);
      case 'blockquote': return this.context(clean(textOf(n)));
      case 'ul': case 'ol': return this.list(n);
      case 'p': return this.para(n);
      case 'strong': case 'b': return this.strong(n);
      case 'table': return this.table(n);
      case 'img': return this.image(n);
      case 'br': case 'hr': case 'script': case 'style': return;
      default:
        if (k.includes('context-designer')) { const a = oneLine(textOf(n)); if (a) this.authors.push(a); return; }
        if (k.includes('context-designers')) return this.walk(n);
        return this.walk(n);
    }
  }

  takeIcon(n) {
    const img = findAll(n, c => c.tag === 'img')[0];
    const src = img ? unwrapImg(img.attrs.src) : this.icon;
    this.icon = null;
    return src;
  }

  newSection(n) {
    this.closeEntry();
    const title = oneLine(textOf(n));
    this.entry = this.group = null;
    this.category = null;
    this.icon = null;
    if (!title) { this.section = null; return; }   // "patch-top" vacio: lo que sigue es la entradilla
    let id = String(n.attrs.id || '').replace(/^patch-/, '').replace(/[^\w-]+/g, '-').replace(/^-+|-+$/g, '') || `s${this.sections.length}`;
    while (this.sections.some(s => s.id === id)) id += '-2';
    this.section = { id, title, kind: sectionKind(id, title), context: '', entries: [] };
    this.sections.push(this.section);
  }

  ensureSection() {
    if (!this.section) {
      this.section = { id: `s${this.sections.length}`, title: 'General', kind: 'other', context: '', entries: [] };
      this.sections.push(this.section);
    }
  }

  newEntry(name, o = {}) {
    this.closeEntry();
    this.ensureSection();
    let isNew = !!o.isNew;
    if (/^\(nuev[oa]\)\s*/i.test(name)) { isNew = true; name = name.replace(/^\(nuev[oa]\)\s*/i, ''); }
    name = name.replace(/^[-–:\s]+|[-–:\s]+$/g, '');
    const cat = this.category || '';
    const e = {
      name, img: o.img ?? this.icon, href: o.href || null, context: '', groups: [],
      isNew: isNew || (/nuev|novedad/i.test(cat) && !o.isCategory),
      removed: !!o.removed || (/eliminad/i.test(cat) && !o.isCategory),
      category: o.isCategory ? null : (this.category || null),
      fromH3: !!o.fromH3, isCategory: !!o.isCategory, implicit: !!o.implicit,
    };
    this.icon = null;
    this.section.entries.push(e);
    this.entry = e;
    this.group = null;
    return e;
  }

  // Al cerrar: los titulos de apartado sin cambios propios pasan a ser la categoria de lo que sigue
  closeEntry() {
    const e = this.entry;
    this.entry = this.group = null;
    if (!e || e.groups.some(g => g.changes.length)) return;
    if (!e.isCategory && e.context) return;
    const list = this.section.entries;
    list.splice(list.indexOf(e), 1);
    if (e.isCategory) {
      this.category = e.name;
      if (e.context) this.section.context = [this.section.context, e.context].filter(Boolean).join('\n');
    }
  }

  newGroup(title, img) {
    if (!this.entry) this.newEntry(this.category || this.section?.title || 'General', { implicit: true });
    const g = { title: title.replace(/[:\s]+$/, ''), icon: ddIcon(unwrapImg(img)), changes: [] };
    this.entry.groups.push(g);
    this.group = g;
  }

  // h3 sin clase de entrada y h4: entrada nueva, habilidad de la entrada actual o subapartado
  heading(n, h3) {
    const t = oneLine(textOf(n));
    if (!t) return;
    const imgNode = findAll(n, c => c.tag === 'img')[0];
    const img = imgNode ? unwrapImg(imgNode.attrs.src) : null;
    const flags = this.flags(t);
    if (/\/img\/(champion|item)\//.test(img || '')) return this.newEntry(flags.name, { img, ...flags });
    if (/\/img\/(spell|passive)\//.test(img || '') || (ABILITY.test(flags.name) && this.entry)) return this.newGroup(flags.name, img);
    if (h3) return this.newEntry(flags.name, { isCategory: true });
    if (this.entry?.fromH3) return this.newGroup(flags.name, img);
    if (CATEGORY.test(flags.name)) return this.newEntry(flags.name, { isCategory: true });
    return this.newEntry(flags.name, { img, ...flags });
  }

  flags(t) {
    const isNew = /\b(NOVEDAD|NUEVO|NUEVA)\b/.test(t) || /^\(nuev[oa]\)/i.test(t);
    const removed = /\bELIMINAD[OA]\b/.test(t);
    const name = t.replace(/\b(NOVEDAD|NUEVO|NUEVA|ELIMINAD[OA])\b/g, '').replace(/^[-–:\s]+|[:\s]+$/g, '').trim();
    return { name, isNew, removed };
  }

  // Parrafo o elemento con solo negrita: nombre de entrada (Arena, ARAM...) o de habilidad
  strong(n) {
    const t = oneLine(textOf(n));
    if (!t) return;
    const f = this.flags(t);
    if (!f.name) return;
    if (this.entry && (ABILITY.test(f.name) || this.entry.fromH3)) return this.newGroup(f.name);
    if (CATEGORY.test(f.name) && !f.isNew) return this.newEntry(f.name, { isCategory: true });
    this.newEntry(f.name, f);
  }

  para(p) {
    const imgs = findAll(p, c => c.tag === 'img');
    for (const img of imgs) this.image(img, p);
    const all = oneLine(textOf(p));
    if (!all) return;
    // Solo negrita (y separadores): es un titulo
    const plain = [];
    const walk = n => {
      if (n.text !== undefined) return plain.push(n.text);
      if (n.tag === 'strong' || n.tag === 'b') return;
      if (n.tag === 'span' && /NOVEDAD|NUEVO|ELIMINAD/.test(textOf(n))) return;
      n.children?.forEach(walk);
    };
    p.children.forEach(walk);
    if (!plain.join('').replace(/[\s :–-]+/g, '') && findAll(p, c => c.tag === 'strong' || c.tag === 'b').length) return this.strong(p);
    this.paragraph(clean(textOf(p)));
  }

  image(img, parent) {
    const src = unwrapImg(img.attrs.src);
    if (!src) return;
    const big = +img.attrs.width >= 400 || /-(\d{3,4})x(\d{3,4})\.(png|jpe?g)/.test(src) && +/-(\d{3,4})x/.exec(src)[1] >= 800;
    if (this.section?.kind === 'highlights' && big) { this.highlights.image ||= src; return; }
    if (!big) this.icon = src;
    void parent;
  }

  paragraph(t) {
    if (!this.section) return void this.intro.push(t);
    if (this.section.kind === 'highlights') return void this.highlights.text.push(t);
    if (this.entry) {
      if (!this.group) this.newGroup('');
      this.group.changes.push({ stat: null, before: null, after: null, text: oneLine(t), dir: 'change', good: null });
      return;
    }
    this.section.context = [this.section.context, t].filter(Boolean).join('\n');
  }

  context(t) {
    if (!t) return;
    if (!this.section) return void this.intro.push(t);
    if (this.section.kind === 'highlights') return void this.highlights.text.push(t);
    const e = this.entry;
    if (e && !e.groups.some(g => g.changes.length)) { e.context = [e.context, t].filter(Boolean).join('\n'); return; }
    this.section.context = [this.section.context, t].filter(Boolean).join('\n');
  }

  list(ul) {
    if (this.section?.kind === 'highlights') {
      for (const li of findAll(ul, c => c.tag === 'li')) this.highlights.text.push(oneLine(textOf(li, { skipLists: true })));
      return;
    }
    for (const li of ul.children.filter(c => c.tag === 'li')) {
      const ch = parseChange(li);
      if (ch) {
        if (!this.entry) this.newEntry(this.category || this.section?.title || 'General', { implicit: true, isCategory: false });
        if (!this.group) this.newGroup('');
        this.group.changes.push(ch);
      }
      for (const sub of li.children.filter(c => LIST_TAGS.has(c.tag))) this.list(sub);
    }
  }

  table(t) {
    for (const tr of findAll(t, c => c.tag === 'tr')) {
      const cells = tr.children.filter(c => c.tag === 'td' || c.tag === 'th').map(c => oneLine(textOf(c))).filter(Boolean);
      if (cells.length) this.paragraph(cells.join(' · '));
    }
  }
}

// "Q - Pacificadora de Piltover" -> "Q"
const shortGroup = t => { const m = /^(pasiva|[QWER])\b/i.exec(t || ''); return m ? (m[1].length > 1 ? 'Pasiva' : m[1].toUpperCase()) : ''; };

function summaryOf(entry) {
  const out = [];
  for (const g of entry.groups) {
    for (const c of g.changes) {
      if (out.length >= 2) break;
      const k = shortGroup(g.title);
      if (c.before != null) out.push(`${k ? k + ' · ' : ''}${c.stat ? c.stat + ': ' : ''}${c.before} → ${c.after}`);
      else if (!out.length) out.push(`${k ? k + ' · ' : ''}${c.text}`);
    }
  }
  const s = out.join(' · ');
  return s.length > 160 ? `${s.slice(0, 157)}…` : s;
}

class PatchNotes {
  constructor(dir, champions) {
    this.dir = path.join(dir, 'cache');
    this.champions = champions;
  }

  file(version) {
    return path.join(this.dir, `patch-${version}.json`);
  }

  // URL y version de las notas mas recientes
  async latestUrl() {
    const html = await getText(LIST);
    const links = [...html.matchAll(/\/es-es\/news\/game-updates\/(?:league-of-legends-)?patch-(\d+)-(\d+)-notes\/?/g)]
      .map(m => ({ url: BASE + m[0], major: +m[1], minor: +m[2] }))
      .sort((a, b) => b.major - a.major || b.minor - a.minor);
    if (!links.length) throw new Error('No se encuentran notas del parche en la web de LoL');
    const top = links[0];
    return { url: top.url, version: `${top.major}.${top.minor}` };
  }

  // Descarga la pagina de las notas y se queda con la cabecera y el HTML del contenido
  async fetchNotes(url, version) {
    const html = await getText(url);
    const raw = /<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/.exec(html)?.[1];
    if (!raw) throw new Error('La página de notas no tiene el formato esperado');
    const page = JSON.parse(raw).props?.pageProps?.page || {};
    const blades = page.blades || [];
    const body = blades.find(b => b.richText?.body)?.richText?.body || '';
    if (!body) throw new Error('No se encuentra el texto de las notas');
    const head = blades.find(b => b.publishDate) || {};
    return {
      format: FORMAT, version, url,
      title: page.title || `Notas de la versión ${version}`,
      date: head.publishDate || null,
      description: page.description || '',
      html: body,
      at: Date.now(),
    };
  }

  readCache(version) {
    try {
      const c = JSON.parse(fs.readFileSync(this.file(version), 'utf8'));
      return c?.format === FORMAT && c.html ? c : null;   // las de formato viejo (con resumen de IA) no valen
    } catch { return null; }
  }

  writeCache(version, data) {
    try {
      fs.mkdirSync(this.dir, { recursive: true });
      fs.writeFileSync(this.file(version), JSON.stringify(data));
    } catch { }
  }

  // Nombre de objeto/runa -> id (Data Dragon en espanol)
  lookups() {
    const dd = this.champions.ddragon;
    if (this.lk?.dd === dd) return this.lk;
    const items = new Map(), runes = new Map();
    const norm = s => String(s || '').toLowerCase().trim();
    // Entre objetos con el mismo nombre, el de la Grieta que se compra
    const score = it => (it.sr ? 2 : 0) + (it.buy ? 1 : 0);
    for (const [id, it] of Object.entries(dd?.items || {})) {
      const k = norm(it.name), prev = items.get(k);
      if (!prev || score(it) > score(dd.items[prev])) items.set(k, id);
    }
    for (const [id, r] of Object.entries(dd?.runes || {})) if (r.style) runes.set(norm(r.name), Number(id));
    this.lk = { dd, items, runes, norm };
    return this.lk;
  }

  // Ids de campeon, objeto o runa a partir de la imagen, el enlace o el nombre
  resolve(e, kind) {
    const { items, runes, norm } = this.lookups();
    const src = e.img || '';
    const out = {};
    const champKey = /\/img\/champion\/(\w+)\.png/.exec(src)?.[1];
    const itemId = /\/img\/item\/(\d+)\.png/.exec(src)?.[1];
    const slug = /\/champions\/([\w-]+)\/?$/.exec(e.href || '')?.[1];
    const champ = () => this.champions.idFromKey(champKey) || (slug && this.champions.idFromKey(slug.replace(/-/g, ''))) || this.champions.find(e.name)?.id;
    if (kind === 'items') {
      out.itemId = Number(itemId) || Number(items.get(norm(e.name))) || null;
    } else if (kind === 'runes') {
      out.runeId = runes.get(norm(e.name)) || null;
    } else {
      out.championId = champ() || null;
      if (!out.championId) out.itemId = Number(itemId) || (kind !== 'modes' ? Number(items.get(norm(e.name))) || null : null);
      if (!out.championId && !out.itemId && kind !== 'modes') out.runeId = runes.get(norm(e.name)) || null;
    }
    for (const k of Object.keys(out)) if (!out[k]) delete out[k];
    return out;
  }

  // HTML -> estructura para la interfaz
  build(cache) {
    const p = new NotesParser().parse(cache.html);
    const sections = [];
    for (const s of p.sections) {
      if (s.kind === 'skins' || s.kind === 'highlights') continue;
      const entries = s.entries.map((e, i) => {
        const ids = this.resolve(e, s.kind);
        const groups = e.groups.filter(g => g.changes.length);
        const out = {
          id: `${s.id}-${i}`, name: e.name, ...ids,
          icon: ddIcon(e.img), category: e.category, context: e.context || '',
          groups, verdict: null, summary: '',
        };
        out.verdict = verdictOf({ ...e, groups });
        out.summary = summaryOf(out);
        return out;
      }).filter(e => e.groups.length || e.context);
      if (!entries.length && !s.context) continue;
      let kind = s.kind;
      // Secciones sin tipo claro (mitad de version...): por lo que contienen
      if (kind === 'other' && entries.length) {
        const champs = entries.filter(e => e.championId).length;
        const its = entries.filter(e => e.itemId).length;
        if (champs * 2 >= entries.length) kind = 'champions';
        else if (its * 2 >= entries.length) kind = 'items';
        else if (!/bugfix|errores/i.test(`${s.id} ${s.title}`) && entries.some(e => e.groups.some(g => g.changes.some(c => c.before != null)))) kind = 'systems';
      }
      sections.push({ id: s.id, title: s.title, kind, context: s.context || '', entries });
    }
    const intro = p.intro.join('\n').split('\n').filter(t => !/wiki de nuestra comunidad|notas de (la )?versi[oó]n (de TFT|que busca)|ten[eé]is las notas|^¡?aqu[ií]\b/i.test(t));
    return {
      version: cache.version, url: cache.url, title: cache.title, date: cache.date,
      description: cache.description || '',
      intro: clean(intro.join('\n')),
      authors: p.authors,
      highlights: p.highlights.text.length || p.highlights.image ? p.highlights : null,
      sections,
    };
  }

  // Campeones de tu pool con cambios (sin IA): pool = [{ championId, games, wins }]
  forYou(sections, role, pool) {
    const champs = [];
    for (const c of pool) {
      const refs = [];
      for (const s of sections) {
        if (s.kind === 'modes') continue;
        for (const e of s.entries) if (e.championId === c.championId) refs.push({ sectionId: s.id, entryId: e.id, verdict: e.verdict });
      }
      champs.push({
        championId: c.championId, name: this.champions.name(c.championId) || String(c.championId),
        games: c.games || 0, winRate: c.games ? (c.wins || 0) / c.games : null,
        changed: refs.length > 0, verdict: refs[refs.length - 1]?.verdict || null, refs,
      });
    }
    for (const s of sections) for (const e of s.entries) if (e.championId && pool.some(c => c.championId === e.championId) && s.kind !== 'modes') e.mine = true;
    return { role: role || '', roleName: ROLE_NAMES[role] || role || '', champions: champs };
  }

  // Notas estructuradas. role y pool son del jugador, solo para destacar sus campeones
  async get({ refresh = false, role = '', pool = [] } = {}) {
    let latest;
    try {
      latest = await this.latestUrl();
    } catch (e) {
      // Sin conexion: la ultima nota guardada con el formato actual
      const saved = fs.existsSync(this.dir) ? fs.readdirSync(this.dir).filter(f => /^patch-[\d.]+\.json$/.test(f))
        .map(f => f.slice(6, -5)).sort((a, b) => b.localeCompare(a, undefined, { numeric: true })) : [];
      const version = saved.find(v => this.readCache(v));
      if (!version) throw e;
      latest = { url: this.readCache(version).url, version, offline: true };
    }
    const { url, version } = latest;
    let cache = refresh && !latest.offline ? null : this.readCache(version);
    if (!cache) {
      cache = await this.fetchNotes(url, version);
      this.writeCache(version, cache);
    }
    const data = this.build(cache);
    data.forYou = this.forYou(data.sections, role, pool);
    data.updatedAt = cache.at || null;
    data.offline = !!latest.offline;
    return data;
  }
}

module.exports = { PatchNotes, NotesParser, parseHtml, parseChange, verdictOf };
