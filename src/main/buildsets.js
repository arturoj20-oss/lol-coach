// Builds completas y coherentes a partir de OP.GG. OP.GG da por separado la runa, el nucleo de
// objetos, las botas, etc. mas jugados, sin emparejar: juntarlos sin mas da mezclas como Lluvia de
// cuchillas (dano fisico) con Antorcha de fuego negro (dano magico). Aqui cada build sale de un
// nucleo de objetos, y se le anaden las runas, botas y situacionales mas jugadas de su mismo tipo.

// Tipo de dano de cada piedra angular: 'ap', 'ad', 'tank' o 'any' (vale para cualquiera)
const KEYSTONE_KIND = {
  8005: 'ad', 8008: 'ad', 8021: 'ad', 8010: 'ad', 9923: 'ad',     // Precision + Lluvia de cuchillas
  8112: 'any', 8128: 'any', 8124: 'ad',                             // Electrocutar, Cosecha oscura, Depredador
  8214: 'ap', 8229: 'ap',                                           // Aery, Cometa arcano
  8230: 'any',                                                      // Tension del saqueador de tormentas (antes Irrupcion de fase)
  8437: 'tank', 8439: 'tank', 8465: 'tank',                         // Garras, Replica, Guardian
  8351: 'any', 8360: 'any', 8369: 'any',                            // Inspiracion
};
const NAMES = { ap: 'Daño mágico', ad: 'Daño físico', tank: 'Tanque' };

// Tipo de un objeto segun sus etiquetas de Data Dragon
function itemKind(item) {
  const tags = item?.tags || [];
  if (tags.includes('SpellDamage')) return 'ap';
  // Sin AttackSpeed: algunos objetos de apoyo (Bandlemusa) la llevan en las etiquetas
  if (tags.some(t => ['Damage', 'CriticalStrike', 'ArmorPenetration', 'LifeSteal'].includes(t))) return 'ad';
  if (tags.some(t => ['Health', 'Armor', 'SpellBlock'].includes(t))) return 'tank';
  return null;
}

// Tipo de un nucleo: el que mas se repite entre sus objetos
function coreKind(ids, items) {
  const count = {};
  for (const id of ids) {
    const k = itemKind(items[id]);
    if (k) count[k] = (count[k] || 0) + 1;
  }
  return Object.entries(count).sort((a, b) => b[1] - a[1])[0]?.[0] || null;
}

const fits = (runeKind, kind) => !kind || runeKind === 'any' || runeKind === kind || (kind === 'tank' && runeKind === 'ad');
const rate = x => (x?.play ? x.win / x.play : null);
const runesOf = r => ({ primaryStyle: r.primary_page_id, subStyle: r.secondary_page_id, perks: [...r.primary_rune_ids, ...r.secondary_rune_ids, ...r.stat_mod_ids] });

// Objetos situacionales por contexto de la partida. Cada grupo se detecta con las etiquetas y la
// descripcion de Data Dragon (en espanol), asi sirve en cualquier parche
const CONTEXTS = [
  { key: 'mr', label: 'Si te hacen mucho daño mágico', defensive: true, test: x => x.tags.includes('SpellBlock') },
  { key: 'armor', label: 'Si te hacen mucho daño físico', defensive: true, test: x => x.tags.includes('Armor') },
  { key: 'antiheal', label: 'Contra curaciones', test: x => /\bheridas\b/i.test(x.desc) },
  // Penetracion, o dano segun la vida del objetivo (no curaciones que mencionan la vida maxima)
  { key: 'antitank', label: 'Contra tanques', test: x => x.tags.includes('ArmorPenetration') || x.tags.includes('MagicPenetration') || /da[ñn]o[^.]{0,80}vida (máxima|adicional)/i.test(x.desc) },
  { key: 'survive', label: 'Para sobrevivir (burst y control)', defensive: true, test: x => /Estasis|revive|resucit|debilitaciones de control|escudo de hechizos|Escudo de hechizos/i.test(x.desc) },
];

// Objeto legendario comprable en la Grieta (sin variantes de otros modos ni componentes)
const isFinal = (id, x) => +id < 10000 && x.sr && x.buy && x.gold >= 2200 && !(x.into || []).length && !x.tags.includes('Boots');

// Objeto de apoyo (mision): el que se compra al empezar (Atlas mundial) y sus mejoras finales
// (Tejesuenos, Tonada sanguina...). Se detectan por etiquetas para que sirva en otros parches
const isSupportItem = (id, x) => +id < 10000 && x?.sr && x.buy && (x.tags || []).includes('Lane') && (x.tags || []).includes('GoldPer');
function supportStarter(items = {}) {
  return +(Object.entries(items).find(([id, x]) => isSupportItem(id, x) && !(x.from || []).length)?.[0] || 3865);
}
// Mejoras finales, la mas jugada con este campeon primero (popularity: Map(id -> partidas))
function supportUpgrades(items = {}, popularity = new Map()) {
  return Object.entries(items).filter(([id, x]) => isSupportItem(id, x) && (x.from || []).length).map(([id]) => +id)
    .sort((a, b) => (popularity.get(b) || 0) - (popularity.get(a) || 0) || a - b);
}
const supportTopOf = (items, popularity) => supportUpgrades(items, popularity).find(id => popularity.get(id)) || null;

// kind: tipo de la build; popularity: Map(id -> partidas con este campeon); exclude: ids ya en la build
function contextItems(kind, items, popularity, exclude = []) {
  // Objetos de critico solo si la build ya es de critico (a un luchador no le sirve la Cimitarra mercurial)
  const crit = exclude.some(id => items[id]?.tags?.includes('CriticalStrike'));
  const finals = Object.entries(items).filter(([id, x]) => isFinal(id, x) && !exclude.includes(+id) && (crit || !x.tags.includes('CriticalStrike')));
  const score = id => (popularity.get(+id) || 0) * 1e6 + (items[id].gold || 0);
  return CONTEXTS.map(ctx => {
    const match = finals.filter(([, x]) => ctx.test(x));
    // Primero los de tu tipo de dano (hibridos: p. ej. Zhonya para magos, Danza de la muerte para AD);
    // en los defensivos, si faltan, objetos de tanque
    const own = match.filter(([, x]) => !kind || itemKind(x) === kind);
    const tanky = ctx.defensive && kind !== 'tank' ? match.filter(([, x]) => itemKind(x) === 'tank') : [];
    const pick = [...own.sort((a, b) => score(b[0]) - score(a[0])), ...tanky.sort((a, b) => score(b[0]) - score(a[0]))]
      .slice(0, 3).map(([id]) => +id);
    return { key: ctx.key, label: ctx.label, items: pick };
  }).filter(g => g.items.length);
}

// Partidas de cada objeto con este campeon (analisis general y guia de OP.GG)
function popularityOf(base, guide) {
  const pop = new Map();
  const add = (list, n) => { for (const x of list || []) for (const id of x.ids || []) pop.set(id, (pop.get(id) || 0) + (x.play || n)); };
  add(guide?.last_items, 1);
  add(guide?.core_items, 1);
  for (const id of base.situationalAll || []) pop.set(id, (pop.get(id) || 0) + 1);
  return pop;
}

// base: build de buildFrom (analisis general); guide: guia de enfrentamiento (puede faltar);
// items: objetos de Data Dragon (con tags); minGames: partidas minimas de un nucleo o pagina de la guia
// (la guia de OP.GG contra un rival puede traer nucleos de 1 o 2 partidas, con 100 %). Si ningun nucleo
// llega, se usa el del analisis general (general: true). Devuelve hasta 2 builds ordenadas por partidas
function coherentBuilds(base, guide, items, minGames = 0) {
  const cores = [];
  for (const c of guide?.core_items || []) {
    if (!c.ids?.length || (c.play || 0) < minGames || cores.some(o => [...o.ids].sort().join() === [...c.ids].sort().join())) continue;
    cores.push({ ids: c.ids, play: c.play, win: c.win, kind: coreKind(c.ids, items) });
  }
  const general = !cores.length;
  if (general && base.core?.length) cores.push({ ids: base.core, play: base.corePlay ?? null, win: base.coreWin ?? null, kind: coreKind(base.core, items) });
  if (!cores.length) return [];

  // Build 1: el nucleo mas jugado. Build 2: el mas jugado de otro tipo (si tiene al menos el 15 % de
  // partidas de la primera); si no lo hay, el segundo nucleo mas jugado
  const first = cores[0];
  const other = cores.find(c => c.kind && c.kind !== first.kind && (!first.play || c.play >= first.play * 0.15)) || cores[1];
  const picked = [first, other].filter(Boolean);

  const runePages = (guide?.runes || []).filter(r => r.primary_rune_ids?.length && (r.play || 0) >= minGames);
  const bootsList = (guide?.boots || []).filter(b => (b.play || 0) >= minGames);
  const popularity = popularityOf(base, guide);
  return picked.map(core => {
    const kind = core.kind;
    // Runas: la pagina mas jugada compatible con el tipo de dano; si no, la del analisis general
    const page = runePages.find(r => fits(KEYSTONE_KIND[r.id] || 'any', kind));
    const runes = page ? runesOf(page) : base.runes;
    // Botas y situacionales del mismo tipo (o neutros)
    const boots = bootsList.map(b => b.ids).find(ids => ids?.length && ids.every(id => { const k = itemKind(items[id]); return !k || !kind || k === kind; })) || base.boots;
    const situational = (base.situationalAll || base.situational || [])
      .filter(id => !core.ids.includes(id))
      .filter(id => { const k = itemKind(items[id]); return !kind || !k || k === kind || k === 'tank'; })
      .slice(0, 6);
    return {
      kind, label: `${NAMES[kind] || 'Build'}`,
      keystone: runes?.perks?.[0] ?? null, runes,
      core: core.ids, boots, situational, starter: base.starter,
      context: contextItems(kind, items, popularity, core.ids),
      // Solo se usa en support (itemSetFor); supportTop: la mejora mas jugada, si hay datos
      support: supportUpgrades(items, popularity), supportTop: supportTopOf(items, popularity),
      games: core.play, winRate: rate(core), general,
      runeGames: page?.play ?? null, runeWinRate: page ? rate(page) : null,
    };
  });
}

// Que grupos de contexto pide el equipo enemigo (para destacarlos en la seleccion)
function enemyContext(enemyIds, champions) {
  const list = enemyIds.map(id => champions.get(id)).filter(Boolean);
  const ap = list.filter(c => c.damage === 'AP').length;
  const ad = list.length - ap;
  const tanks = list.filter(c => (c.tags || []).includes('Tank')).length;
  const flags = [];
  if (ap >= 3 || (ap >= 2 && ap > ad)) flags.push('mr');
  if (ad >= 3 || (ad >= 2 && ad > ap)) flags.push('armor');
  if (tanks >= 2) flags.push('antitank');
  return flags;
}

// En partida: que grupos pide el equipo enemigo segun los objetos que llevan de verdad (si aun no
// tienen, segun su campeon). enemies: jugadores de la Live Client Data API. Devuelve flags y motivos
function liveContext(enemies, champions, items, championIdOf) {
  let ap = 0, ad = 0, tanks = 0, healers = 0;
  for (const p of enemies) {
    const gold = { ap: 0, ad: 0, tank: 0, heal: 0 };
    for (const it of p.items || []) {
      const x = items[it.itemID];
      if (!x || x.gold < 900) continue;
      const k = itemKind(x);
      if (k) gold[k] += x.gold;
      if (x.tags.includes('LifeSteal') || x.tags.includes('SpellVamp')) gold.heal += x.gold;
    }
    const c = champions.get(championIdOf(p));
    if (gold.ap + gold.ad > 1500) gold.ap >= gold.ad ? ap++ : ad++;
    else c?.damage === 'AP' ? ap++ : ad++;
    if (gold.tank >= 2500 || (gold.tank + gold.ap + gold.ad < 1500 && (c?.tags || []).includes('Tank'))) tanks++;
    if (gold.heal >= 2000) healers++;
  }
  const flags = [], reasons = [];
  if (ap >= 3 || (ap >= 2 && ap > ad)) { flags.push('mr'); reasons.push(`${ap} enemigos hacen sobre todo daño mágico`); }
  if (ad >= 3 || (ad >= 2 && ad > ap)) { flags.push('armor'); reasons.push(`${ad} enemigos hacen sobre todo daño físico`); }
  if (tanks >= 2) { flags.push('antitank'); reasons.push(`${tanks} enemigos van de tanque`); }
  if (healers >= 2) { flags.push('antiheal'); reasons.push(`${healers} enemigos se curan con robo de vida u omnivampirismo`); }
  return { flags, reasons };
}

// Partidas minimas de un nucleo, pagina o botas de la guia de OP.GG contra un rival
const MIN_GUIDE_GAMES = 20;

// Una build por piedra angular (para fuentes con muchas paginas, como U.GG): para cada una de las
// piedras angulares mas jugadas (con al menos el 5 % de partidas de la primera), el nucleo mas jugado
// compatible con ella; el resto (botas, situacionales, contexto) igual que coherentBuilds
function buildsByKeystone(base, guide, items, max = 4) {
  const pages = [];
  for (const r of guide?.runes || []) {
    if (!r.primary_rune_ids?.length || pages.some(p => p.id === r.id)) continue;
    if (pages.length && r.play < pages[0].play * 0.05) break;
    pages.push(r);
    if (pages.length === max) break;
  }
  const cores = (guide?.core_items || []).filter(c => c.ids?.length);
  return pages.map(page => {
    const runeKind = KEYSTONE_KIND[page.id] || 'any';
    // Sin nucleo compatible (p. ej. Conquistador cuando todos los nucleos son AP) no hay build coherente
    const core = cores.find(c => fits(runeKind, coreKind(c.ids, items)));
    if (!core) return null;
    const [opt] = coherentBuilds(base, { ...guide, runes: [page], core_items: [core, ...cores.filter(c => c !== core)] }, items);
    return opt ? { ...opt, runeGames: page.play, runeWinRate: page.play ? page.win / page.play : null } : null;
  }).filter(Boolean);
}

// Firma de una build para detectar equivalentes entre fuentes: misma piedra angular y mismo nucleo
const buildSig = o => `${o.keystone}|${[...(o.core || [])].sort((a, b) => a - b).join(',')}`;

// Completa cada opcion con lo que no depende del nucleo (hechizos, inicial, habilidades) y su fuente
// ('opgg' | 'ugg'), para que se pueda importar entera sea de la fuente que sea
function tagBuilds(options, base, source) {
  return (options || []).map(o => ({
    ...o, source, sources: [source], key: `${source}:${buildSig(o)}`,
    spells: o.spells?.length ? o.spells : base?.spells || [],
    starter: o.starter?.length ? o.starter : base?.starter || [],
    skillOrder: o.skillOrder?.length ? o.skillOrder : base?.skillOrder || [],
    skillPriority: o.skillPriority?.length ? o.skillPriority : base?.skillPriority || [],
  }));
}

// Une las builds de varias fuentes (en orden de preferencia) sin repetir las equivalentes: la repetida
// no se anade, pero la que se queda apunta tambien esa fuente en sources
function mergeBuilds(...lists) {
  const out = [];
  for (const o of lists.flat()) {
    if (!o) continue;
    const same = out.find(x => buildSig(x) === buildSig(o));
    if (same) {
      if (!same.sources.includes(o.source)) same.sources = [...same.sources, o.source];
      // Una build OTP igual a otra: se queda la otra, pero con los OTP que la juegan
      if (o.otp && !same.otp) same.otp = o.otp;
      continue;
    }
    out.push(o);
  }
  return out;
}

// Distribucion de objetos al estilo Blitz (tienda del juego y vista Campeones):
// - order: orden de compra con los componentes directos de cada objeto antes de el; las botas, tras el
//   primer objeto del nucleo
// - final: build final de 6 (nucleo, botas y los situacionales mas comprados)
// - situational: el resto de situacionales; boots: opciones de botas
// La vista Campeones tiene una copia de esta logica (itemLayout en views/select.js): mantenerlas iguales
function itemLayout(build, items = {}) {
  const core = build.core || [], boots = build.boots || [], sit = build.situational || [];
  const parts = id => (items[id]?.from || []).filter(c => items[c]);
  const order = [];
  core.forEach((id, i) => {
    order.push(...parts(id), id);
    if (i === 0 && boots[0]) order.push(...parts(boots[0]), boots[0]);
  });
  if (!core.length && boots[0]) order.push(...parts(boots[0]), boots[0]);
  const final = [...new Set([...core, ...boots.slice(0, 1), ...sit])].slice(0, 6);
  return {
    starter: build.starter || [], order, final,
    situational: sit.filter(id => !final.includes(id)), boots,
  };
}

module.exports = { MIN_GUIDE_GAMES, NAMES, isFinal, itemLayout, supportStarter, supportUpgrades, supportTopOf, coherentBuilds, buildsByKeystone, tagBuilds, mergeBuilds, buildSig, contextItems, enemyContext, liveContext, itemKind, coreKind, KEYSTONE_KIND };
