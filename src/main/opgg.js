// Servidor MCP publico de OP.GG (sin clave). Responde en un formato compacto:
//   class Data: summary,core_items        <- cabeceras con los nombres de los campos
//   Data(Summary(...),CoreItems([1,2],...)) <- valores posicionales
// parseCompact lo convierte en objetos normales. Las respuestas se guardan 12 h en disco.
const fs = require('fs');
const path = require('path');

const ENDPOINT = 'https://mcp-api.op.gg/mcp';
const TTL = 12 * 3600 * 1000;

let cacheDir = null;
const memory = new Map();

function initOpgg(dir) {
  cacheDir = path.join(dir, 'cache', 'opgg');
  fs.mkdirSync(cacheDir, { recursive: true });
}

function parseCompact(text) {
  const classes = {};
  const lines = text.split('\n');
  let i = 0;
  for (; i < lines.length; i++) {
    const m = /^class (\w+): (.*)$/.exec(lines[i]);
    if (m) classes[m[1]] = m[2].split(',').map(s => s.trim());
    else if (lines[i].trim()) break;
  }
  const src = lines.slice(i).join('\n');
  let p = 0;

  const skip = () => { while (p < src.length && /\s/.test(src[p])) p++; };
  const list = close => {
    const out = [];
    skip();
    if (src[p] === close) { p++; return out; }
    for (;;) {
      out.push(value());
      skip();
      if (src[p] === ',') { p++; continue; }
      if (src[p] === close) { p++; return out; }
      throw new Error(`OP.GG: formato inesperado en ${p}`);
    }
  };
  function value() {
    skip();
    const c = src[p];
    if (c === '"') {
      let j = p + 1;
      while (j < src.length && src[j] !== '"') j += src[j] === '\\' ? 2 : 1;
      const s = JSON.parse(src.slice(p, j + 1));
      p = j + 1;
      return s;
    }
    if (c === '[') { p++; return list(']'); }
    const num = /^-?\d+(\.\d+)?([eE][+-]?\d+)?/.exec(src.slice(p, p + 40));
    if (num) { p += num[0].length; return Number(num[0]); }
    const id = /^[A-Za-z_]\w*/.exec(src.slice(p, p + 80));
    if (!id) throw new Error(`OP.GG: formato inesperado en ${p}`);
    p += id[0].length;
    if (src[p] !== '(') return { true: true, false: false, null: null, None: null, True: true, False: false }[id[0]] ?? id[0];
    p++;
    const args = list(')');
    const fields = classes[id[0]] || [];
    const obj = {};
    args.forEach((v, k) => { obj[fields[k] ?? k] = v; });
    return obj;
  }
  return value();
}

async function callTool(name, args) {
  const key = name + JSON.stringify(args);
  const file = cacheDir && path.join(cacheDir, require('crypto').createHash('md5').update(key).digest('hex') + '.json');
  const hit = memory.get(key);
  if (hit && Date.now() - hit.t < TTL) return hit.data;
  if (file) {
    try {
      const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (Date.now() - saved.t < TTL) { memory.set(key, saved); return saved.data; }
    } catch { }
  }

  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }),
    signal: AbortSignal.timeout(30000),
  });
  let text = await res.text();
  // Puede responder como JSON normal o como stream SSE ("data: {...}")
  const sse = /^data: (.*)$/m.exec(text);
  if (sse) text = sse[1];
  const result = JSON.parse(text).result;
  if (!result || result.isError) throw new Error(result?.content?.[0]?.text || 'respuesta vacía');
  // Algunas herramientas (guia de enfrentamiento) responden en JSON normal en vez del formato compacto
  const body = String(result.content[0].text);
  const data = body.trimStart().startsWith('{') ? JSON.parse(body) : parseCompact(body);
  const entry = { t: Date.now(), data };
  memory.set(key, entry);
  if (file) try { fs.writeFileSync(file, JSON.stringify(entry)); } catch { }
  return data;
}

// Nombre de OP.GG a partir del id de Data Dragon / alias del cliente: MonkeyKing -> MONKEY_KING
function opggName(key) {
  return key.replace(/([a-z])([A-Z])/g, '$1_$2').toUpperCase();
}

const POSITIONS = ['top', 'jungle', 'mid', 'adc', 'support'];

// Estadisticas, counters, sinergias y build de un campeon en un rol
async function championAnalysis(key, position) {
  const fields = [
    'data.summary.average_stats.{win_rate,pick_rate,ban_rate,tier,rank}',
    'data.strong_counters[].{champion_id,champion_name,play,win_rate}',
    'data.weak_counters[].{champion_id,champion_name,play,my_win_rate,counter_win_rate}',
    'data.runes.{primary_page_id,primary_rune_ids[],secondary_page_id,secondary_rune_ids[],stat_mod_ids[],play,win}',
    'data.summoner_spells.{ids[],play,win}',
    'data.starter_items.{ids[],play,win}',
    'data.core_items.{ids[],play,win}',
    'data.boots.{ids[],play,win}',
    'data.fourth_items[].{ids[],play,win}',
    'data.fifth_items[].{ids[],play,win}',
    'data.skills.{order[],play,win}',
    'data.skill_masteries.builds[].{order[],play,win}',
    'data.damage_type',
    ...POSITIONS.map(p => `data.synergies.${p}[].{synergy_champion_id,play,win_rate}`),
  ];
  const res = await callTool('lol_get_champion_analysis', { game_mode: 'ranked', champion: opggName(key), position, desired_output_fields: fields });
  return res.data || {};
}

// Guia de enfrentamiento contra un rival: listas ordenadas por partidas de paginas de runas, objetos
// principales, hechizos y ordenes de habilidades (el analisis general solo da la mas jugada de cada)
async function matchupGuide(key, position, opponentKey) {
  const res = await callTool('lol_get_lane_matchup_guide', {
    my_champion: opggName(key), opponent_champion: opggName(opponentKey), position,
    desired_output_fields: [
      'data.runes[].{id,primary_page_id,primary_rune_ids[],secondary_page_id,secondary_rune_ids[],stat_mod_ids[],play,win}',
      'data.core_items[].{ids[],play,win}',
      'data.boots[].{ids[],play,win}',
      'data.last_items[].{ids[],play,win}',
    ],
  });
  return res.data || {};
}

// Rol principal de un campeon
async function mainPosition(key) {
  const res = await callTool('lol_get_champion_analysis', {
    game_mode: 'ranked', champion: opggName(key), position: 'mid',
    desired_output_fields: ['data.summary.positions[].name', 'data.summary.positions[].stats.{role_rate}'],
  });
  const positions = res.data?.summary?.positions || [];
  const best = positions.sort((a, b) => (b.stats?.role_rate || 0) - (a.stats?.role_rate || 0))[0];
  const map = { TOP: 'top', JUNGLE: 'jungle', MID: 'mid', MIDDLE: 'mid', ADC: 'adc', BOTTOM: 'adc', SUPPORT: 'support', UTILITY: 'support' };
  return map[best?.name] || null;
}

// Tier list de un rol: [{ champion (nombre en ingles), win_rate, pick_rate, ban_rate, tier, rank, role_rate }]
async function laneMeta(position) {
  const res = await callTool('lol_list_lane_meta_champions', {
    position, desired_output_fields: [`data.positions.${position}[].{champion,win_rate,pick_rate,ban_rate,tier,rank,role_rate}`],
  });
  return res.data?.positions?.[position] || [];
}

// Puntos de LP que OP.GG tiene guardados de una cuenta (Solo/Duo): [{ created_at, elo_point, tier_info }]
async function lpHistory(gameName, tagLine, region) {
  const res = await callTool('lol_get_summoner_profile', {
    game_name: gameName, tag_line: tagLine, region,
    desired_output_fields: ['data.summoner.lp_histories[].{created_at,elo_point}', 'data.summoner.lp_histories[].tier_info.{tier,division,lp}'],
  });
  return res.data?.summoner?.lp_histories || [];
}

module.exports = { lpHistory, initOpgg, parseCompact, callTool, championAnalysis, matchupGuide, mainPosition, laneMeta, opggName, POSITIONS };
