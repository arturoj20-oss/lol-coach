// Builds de U.GG (segunda fuente, con mas muestra que OP.GG para campeones nuevos). Usa los JSON
// publicos de stats2.u.gg (los mismos que carga su web). Solo se guarda en disco el subarbol que se
// usa (mundo, Esmeralda+, todas las lineas) por parche y campeon, durante 12 h.
// Formato de builds 1.5.0, data[region][rango][rol] = 7 bloques:
//   [0] grupos por piedra angular [keystone, arbolSecundario, victorias, partidas, arbolPrincipal,
//       [[arbolP, arbolS, [6 runas], victorias, partidas], ...]]
//   [1] hechizos, [2] inicial, [4] habilidades: [[ids], victorias, partidas]
//   [3] tres primeras compras (con botas), [6] nucleos legendarios (sin botas): [[ids], victorias, partidas]
//   [5] botas: [id, victorias, partidas]
// overview: [0] runas principales, [2] inicial, [4] orden de habilidades, [5] objetos 4.º/5.º/6.º,
//   [6] [victorias, partidas] totales, [8] [partidas, victorias, [fragmentos]]
const fs = require('fs');
const path = require('path');
const { log } = require('./log');

const VERSIONS = 'https://static.bigbrain.gg/assets/lol/riot_patch_update/prod/ugg/ugg-api-versions.json';
const STATS = 'https://stats2.u.gg/lol/1.5';
const REGION = '12';        // todas las regiones
const RANK = '17';          // Esmeralda+
const ROLE_IDS = { jungle: '1', support: '2', adc: '3', top: '4', mid: '5' };
const TTL = 12 * 3600 * 1000;

// Por defecto, la carpeta de datos de la app (initUgg permite cambiarla)
let cacheDir = process.env.APPDATA ? path.join(process.env.APPDATA, 'LoL Coach', 'cache', 'ugg') : null;
try { if (cacheDir) fs.mkdirSync(cacheDir, { recursive: true }); } catch { cacheDir = null; }
let versions = null;   // { at, patch, builds, overview }

function initUgg(dir) {
  cacheDir = path.join(dir, 'cache', 'ugg');
  fs.mkdirSync(cacheDir, { recursive: true });
}

async function getJson(url, timeout = 30000) {
  const res = await fetch(url, { signal: AbortSignal.timeout(timeout) });
  if (!res.ok) throw new Error(`U.GG ${res.status}`);
  return res.json();
}

// Ultimo parche con datos ("16_21") y version de cada endpoint
async function latest() {
  if (versions && Date.now() - versions.at < TTL) return versions;
  const v = await getJson(VERSIONS);
  const num = k => k.split('_').map(Number);
  const patch = Object.keys(v).filter(k => /^\d+_\d+$/.test(k) && v[k].builds && v[k].overview)
    .sort((a, b) => { const [a1, a2] = num(a), [b1, b2] = num(b); return a1 - b1 || a2 - b2; }).pop();
  versions = { at: Date.now(), patch, builds: v[patch].builds, overview: v[patch].overview };
  return versions;
}

// Subarbol de un campeon (mundo, Esmeralda+), con cache en disco
async function championData(championId) {
  const { patch, builds, overview } = await latest();
  const file = cacheDir && path.join(cacheDir, `${patch}-${championId}.json`);
  if (file) {
    try {
      const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (Date.now() - saved.at < TTL) return saved;
    } catch { }
  }
  const base = `ranked_solo_5x5/${championId}`;
  const [b, o] = await Promise.all([
    getJson(`${STATS}/builds/${patch}/${base}/${builds}.json`, 60000),
    getJson(`${STATS}/overview/${patch}/${base}/${overview}.json`),
  ]);
  const data = { at: Date.now(), patch, builds: b?.[REGION]?.[RANK] || {}, overview: o?.[REGION]?.[RANK] || {} };
  if (file) try { fs.writeFileSync(file, JSON.stringify(data)); } catch (e) { log(`U.GG cache: ${e.message}`); }
  return data;
}

// Enfrentamientos de un campeon (mundo, Esmeralda+): por rol, { rival: [tus victorias, partidas] }.
// En cada rol, el rival es el de la misma linea (en jungla, el jungla enemigo).
// En el JSON de U.GG cada fila es [rival, victorias DEL RIVAL, partidas, ...]: la media ponderada de
// todas las filas da 1 - el % general del campeon (comprobado con 10 campeones el 29/10/2026)
async function matchups(championId) {
  const v = await latest();
  const file = cacheDir && path.join(cacheDir, `${v.patch}-${championId}-matchups-v2.json`);
  if (file) {
    try {
      const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (Date.now() - saved.at < TTL) return saved;
    } catch { }
  }
  if (!versions.matchups) {
    const all = await getJson(VERSIONS);
    versions.matchups = all[v.patch]?.matchups || '1.5.0';
  }
  const raw = await getJson(`${STATS}/matchups/${v.patch}/ranked_solo_5x5/${championId}/${versions.matchups}.json`, 60000);
  const roles = {};
  for (const [role, id] of Object.entries(ROLE_IDS)) {
    const list = raw?.[REGION]?.[RANK]?.[id]?.[0] || [];
    roles[role] = Object.fromEntries(list.map(x => [x[0], [x[2] - x[1], x[2]]]));
  }
  const data = { at: Date.now(), patch: v.patch, roles };
  if (file) try { fs.writeFileSync(file, JSON.stringify(data)); } catch { }
  return data;
}

// Tu enfrentamiento en la seleccion: de los enemigos visibles, el rival de tu linea es el que mas
// partidas tiene contra tu campeon en ese rol. Devuelve { vs, winRate, games, patch } o null
async function laneMatchup(championId, role, enemyIds) {
  if (!championId || !ROLE_IDS[role] || !enemyIds?.length) return null;
  const m = await matchups(championId);
  const list = m.roles[role] || {};
  const best = enemyIds.map(id => ({ id, s: list[id] })).filter(x => x.s && x.s[1] > 0).sort((a, b) => b.s[1] - a.s[1])[0];
  // Con muy pocas partidas en ese rol, no es su rival de linea (p. ej. un apoyo frente a tu jungla)
  if (!best || best.s[1] < 30) return null;
  return { vs: best.id, winRate: best.s[0] / best.s[1], games: best.s[1], patch: m.patch };
}

const byGames = (a, b) => b.games - a.games;
const entry = x => ({ ids: x[0], win: x[1], play: x[2] });

// Separa las 6 runas de U.GG en principales (con la piedra angular) y secundarias, en orden de fila
function splitPerks(perks, primaryStyle, keystone, runes) {
  const slot = id => runes[id]?.slot ?? 9;
  const prim = perks.filter(id => runes[id]?.style === primaryStyle && id !== keystone).sort((a, b) => slot(a) - slot(b));
  const sec = perks.filter(id => id !== keystone && runes[id]?.style !== primaryStyle).sort((a, b) => slot(a) - slot(b));
  return { primary: [keystone, ...prim].slice(0, 4), secondary: sec.slice(0, 2) };
}

// Datos de U.GG de un campeon en una linea, con la forma de la guia de OP.GG (para coherentBuilds) y
// la build base (forma de buildFrom). runes: mapa de runas de Data Dragon (con style y slot)
async function championBuilds(championId, role, runes) {
  const roleId = ROLE_IDS[role];
  if (!roleId) throw new Error('Línea desconocida');
  const data = await championData(championId);
  const b = data.builds?.[roleId];
  const o = data.overview?.[roleId]?.[0];
  if (!Array.isArray(b) || !Array.isArray(o)) return null;

  const shards = (o[8]?.[2] || []).map(Number);
  // Paginas: la mas jugada de cada grupo (piedra angular + arbol secundario)
  const groups = (b[0] || []).map(g => ({ keystone: g[0], subStyle: g[1], wins: g[2], games: g[3], primaryStyle: g[4], pages: g[5] || [] }))
    .filter(g => g.games > 0).sort(byGames);
  const pages = groups.map(g => {
    const best = [...g.pages].sort((x, y) => y[4] - x[4])[0];
    if (!best) return null;
    const { primary, secondary } = splitPerks(best[2], g.primaryStyle, g.keystone, runes);
    if (primary.length < 4 || secondary.length < 2) return null;
    return {
      id: g.keystone, primary_page_id: g.primaryStyle, primary_rune_ids: primary,
      secondary_page_id: g.subStyle, secondary_rune_ids: secondary, stat_mod_ids: shards,
      play: g.games, win: g.wins,
    };
  }).filter(Boolean);

  const guide = {
    runes: pages,
    core_items: (b[6] || []).map(entry).filter(x => x.ids?.length).sort((x, y) => y.play - x.play),
    boots: (b[5] || []).filter(x => x[0] > 0).map(x => ({ ids: [x[0]], win: x[1], play: x[2] })).sort((x, y) => y.play - x.play),
  };
  const top = list => [...(list || [])].sort((x, y) => y[2] - x[2])[0]?.[0] || [];

  // Build base (forma de buildFrom de draft.js), desde el overview
  const r0 = o[0];
  const main = r0 ? splitPerks(r0[4], r0[2], r0[4].find(id => runes[id]?.style === r0[2] && runes[id]?.slot === 0), runes) : null;
  const order = o[4]?.[2] || [];
  const situationalAll = [...new Set((o[5] || []).flat().map(x => x?.[0]).filter(Boolean))];
  const base = {
    runes: main ? { primaryStyle: r0[2], subStyle: r0[3], perks: [...main.primary, ...main.secondary, ...shards] } : null,
    spells: top(b[1]), starter: top(b[2]),
    core: guide.core_items[0]?.ids || o[3]?.[2] || [],
    boots: guide.boots[0]?.ids || [],
    skillOrder: order,
    skillPriority: (o[4]?.[3] || '').split('').filter(k => 'QWE'.includes(k)),
    situationalAll, situational: situationalAll.slice(0, 6),
    games: o[6]?.[1] ?? null, winRate: o[6]?.[1] ? o[6][0] / o[6][1] : null,
  };
  const keystones = groups.slice(0, 5).map(g => ({ keystone: g.keystone, subStyle: g.subStyle, games: g.games, winRate: g.games ? g.wins / g.games : null }));
  return { patch: data.patch, guide, base, keystones };
}

// Builds completas de U.GG (una por piedra angular jugada con nucleo compatible), ya con hechizos,
// inicial y habilidades de U.GG y la fuente marcada. dd: { runes, items } de Data Dragon.
// Devuelve { patch, games, winRate, keystones, options, spells, starter, skillOrder, skillPriority } o null
async function uggBuilds(championId, role, dd = {}) {
  const { buildsByKeystone, tagBuilds } = require('./buildsets');
  const u = await championBuilds(championId, role, dd.runes || {});
  if (!u) return null;
  const base = { ...u.base, championId, role };
  return {
    patch: u.patch, games: u.base.games, winRate: u.base.winRate, keystones: u.keystones,
    options: tagBuilds(buildsByKeystone(base, u.guide, dd.items || {}), base, 'ugg'),
    spells: u.base.spells, starter: u.base.starter, skillOrder: u.base.skillOrder, skillPriority: u.base.skillPriority,
  };
}

// CS medio por partida de un campeon en un rol (mundo, Esmeralda+), del endpoint rankings:
// data[region][rango][rol] = [victorias, partidas, puesto, total, dano, oro, asesinatos, asistencias,
// muertes, CS (incluye monstruos), ...] en totales. Devuelve { csPerGame, games } o null
async function championCs(championId, role) {
  const roleId = ROLE_IDS[role];
  if (!roleId) return null;
  const v = await latest();
  const file = cacheDir && path.join(cacheDir, `${v.patch}-${championId}-rankings.json`);
  let data = null;
  if (file) {
    try {
      const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (Date.now() - saved.at < TTL) data = saved;
    } catch { }
  }
  if (!data) {
    if (!versions.rankings) {
      const all = await getJson(VERSIONS);
      versions.rankings = all[v.patch]?.rankings || '1.5.0';
    }
    const raw = await getJson(`${STATS}/rankings/${v.patch}/ranked_solo_5x5/${championId}/${versions.rankings}.json`);
    const roles = {};
    for (const [r, id] of Object.entries(ROLE_IDS)) {
      const a = raw?.[REGION]?.[RANK]?.[id];
      if (Array.isArray(a) && a[1] > 0) roles[r] = { games: a[1], cs: a[9] };
    }
    data = { at: Date.now(), roles };
    if (file) try { fs.writeFileSync(file, JSON.stringify(data)); } catch { }
  }
  const r = data.roles[role];
  // Con muy pocas partidas en ese rol la media no es fiable
  if (!r || r.games < 200 || !r.cs) return null;
  return { csPerGame: r.cs / r.games, games: r.games };
}

module.exports = { initUgg, championBuilds, uggBuilds, matchups, laneMatchup, championCs, latest, ROLE_IDS };
