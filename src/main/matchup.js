// Chequeo de tu enfrentamiento en la seleccion (sin IA): comparativa de tu campeon y tu rival de linea y
// consejos para ese enfrentamiento.
// - OP.GG (guia de enfrentamiento, en las dos direcciones): % de victorias del enfrentamiento, quien
//   suele ganar la linea y los asesinatos en solitario, estilo recomendado, % de victorias segun la
//   duracion de la partida y el consejo de OP.GG contra el rival (viene en ingles)
// - Data Dragon (en espanol): consejos oficiales de Riot para jugar contra el rival y con tu campeon, y
//   perfil (ataque, defensa, magia, dificultad)
// Es informacion de la seleccion: no da ordenes durante la partida
const fs = require('fs');
const path = require('path');
const opgg = require('./opgg');
const { log } = require('./log');

const CDN = 'https://ddragon.leagueoflegends.com';
let cacheDir = process.env.APPDATA ? path.join(process.env.APPDATA, 'LoL Coach', 'cache', 'ddragon') : null;

// Tramos de duracion de OP.GG: el valor es el minuto en que empieza cada uno
const LENGTH_LABELS = { 0: '<25', 25: '25-30', 30: '30-35', 35: '35-40', 40: '40+' };
const STYLES = { aggressive: 'agresivo', defensive: 'defensivo', even: 'igualado' };
const POSITION_NAMES = { top: ['TOP'], jungle: ['JUNGLE'], mid: ['MID', 'MIDDLE'], adc: ['ADC', 'BOTTOM'], support: ['SUPPORT', 'UTILITY'] };

// Consejos y perfil de Data Dragon de un campeon (archivo individual, en cache por version)
async function championTips(key, version) {
  const file = cacheDir && path.join(cacheDir, `${version}-tips-${key}.json`);
  if (file) try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { }
  const res = await fetch(`${CDN}/cdn/${version}/data/es_ES/champion/${key}.json`, { signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`Data Dragon ${res.status}`);
  const c = Object.values((await res.json()).data)[0];
  const clean = list => (list || []).map(t => String(t).replace(/<[^>]+>/g, '').trim()).filter(Boolean);
  const out = { ally: clean(c.allytips), enemy: clean(c.enemytips), info: c.info, tags: c.tags };
  if (file) try { fs.writeFileSync(file, JSON.stringify(out)); } catch { }
  return out;
}

// Guia completa de OP.GG de un lado del enfrentamiento (solo lo que se usa aqui)
async function guideSide(key, role, vsKey) {
  const g = await opgg.callTool('lol_get_lane_matchup_guide', { my_champion: opgg.opggName(key), opponent_champion: opgg.opggName(vsKey), position: role, lang: 'es_ES' });
  const d = g?.data || {};
  const side = name => (!name || name === 'EVEN' ? 'even' : name === g.my_champion ? 'me' : name === g.opponent_champion ? 'vs' : 'even');
  const names = POSITION_NAMES[role] || [];
  const pos = (d.summary?.positions || []).find(p => names.includes(p.name)) || d.summary?.positions?.[0];
  return {
    lane: side(d.lane_advantage_champion), soloKill: side(d.lane_solo_kill_advantage_champion),
    style: d.recommended_play_style || null, tip: d.opponent_champion_tip || null,
    counters: d.counters || [],
    lengths: (d.game_lengths || []).map(x => ({ from: x.game_length, label: LENGTH_LABELS[x.game_length] || `${x.game_length}+`, rate: x.rate })),
    winRate: pos?.stats?.win_rate ?? d.summary?.average_stats?.win_rate ?? null,
    tier: pos?.stats?.tier_data?.tier ?? d.summary?.average_stats?.tier ?? null,
  };
}

// Diferencia entre el % de victorias en partidas largas (35+) y cortas (<30)
function scaling(lengths) {
  const avg = list => (list.length ? list.reduce((s, x) => s + x.rate, 0) / list.length : null);
  const early = avg(lengths.filter(x => x.from < 30)), late = avg(lengths.filter(x => x.from >= 35));
  return early == null || late == null ? null : late - early;
}

// Consejos que salen de los datos (frases cortas para la seleccion)
function dataTips(me, vs, a, b, matchup, damageVs) {
  const tips = [];
  if (matchup && matchup.games >= 200) {
    if (matchup.winRate < 0.48) tips.push(`Enfrentamiento difícil (${Math.round(matchup.winRate * 100)} %): juega para tu equipo más que para ganar el duelo.`);
    else if (matchup.winRate > 0.52) tips.push(`Enfrentamiento favorable (${Math.round(matchup.winRate * 100)} %): puedes buscar ventaja pronto.`);
  }
  if (a.lane === 'vs') tips.push(`Al principio suele ir mejor ${vs}: evita los duelos igualados hasta tener ventaja de nivel u objeto.`);
  if (a.lane === 'me') tips.push(`Al principio sueles ir mejor tú: aprovecha los primeros niveles para presionar.`);
  if (a.soloKill === 'vs') tips.push(`${vs} consigue más asesinatos en solitario: cuidado con quedarte a poca vida a su alcance.`);
  if (a.soloKill === 'me') tips.push(`Consigues más asesinatos en solitario que ${vs}: castiga sus errores de posición.`);
  const sa = scaling(a.lengths), sb = scaling(b.lengths);
  if (sa != null && sb != null && Math.abs(sa - sb) >= 0.02) {
    tips.push(sa > sb
      ? `Escalas mejor que ${vs}: si la partida se alarga, tus opciones suben.`
      : `${vs} escala mejor: intenta decidir la partida antes de los 30 minutos.`);
  }
  if (damageVs === 'AP') tips.push(`${vs} hace sobre todo daño mágico: tenlo en cuenta en tus fragmentos y primeros objetos defensivos.`);
  return tips;
}

// Chequeo completo. champions: Champions (con ddragon); matchup: { vs, winRate, games } de U.GG si lo hay;
// otp: OtpBuilds (los mains de tu campeon contra ese rival en toda la season), opcional
async function matchupCheck(champions, myId, vsId, role, matchup = null, otp = null) {
  const me = champions.get(myId), vs = champions.get(vsId);
  if (!me || !vs || !role) return null;
  const version = champions.ddragon?.version;
  const [a, b, tMe, tVs] = await Promise.all([
    guideSide(me.key, role, vs.key).catch(e => { log(`enfrentamiento OP.GG: ${e.message}`); return null; }),
    guideSide(vs.key, role, me.key).catch(() => null),
    version ? championTips(me.key, version).catch(() => null) : null,
    version ? championTips(vs.key, version).catch(() => null) : null,
  ]);
  if (!a && !tVs) return null;
  // % del enfrentamiento: U.GG (Esmeralda+) si lo hay; si no, la fila del rival en OP.GG
  const row = a?.counters.find(c => c.champion_id === vsId);
  // win: victorias de tu campeon (coincide con U.GG una vez corregido el sentido de sus matchups)
  const opggWr = row?.play ? { winRate: row.win / row.play, games: row.play, source: 'OP.GG' } : null;
  const wr = matchup?.vs === vsId ? { winRate: matchup.winRate, games: matchup.games, source: 'U.GG' } : opggWr;
  const nameMe = champions.name(myId), nameVs = champions.name(vsId);
  const mains = otp ? otp.matchup(myId, role, vsId) : null;
  const tips = a && b ? dataTips(nameMe, nameVs, a, b, wr, vs.damage) : [];
  if (mains?.games >= 15) {
    tips.unshift(`Los mains de ${nameMe} ganan el ${Math.round(mains.winRate * 100)} % contra ${nameVs} (${mains.games} partidas esta season).`);
  }
  return {
    me: myId, vs: vsId, role,
    matchup: wr, opgg: opggWr, mains,
    lane: a?.lane || 'even', soloKill: a?.soloKill || 'even',
    style: a?.style ? STYLES[a.style] || a.style : null,
    // Comparativa: % general en el rol, tier, curva por duracion y perfil de Data Dragon
    compare: {
      me: { winRate: a?.winRate ?? null, tier: a?.tier ?? null, lengths: a?.lengths || [], info: tMe?.info || null, scaling: a ? scaling(a.lengths) : null },
      vs: { winRate: b?.winRate ?? null, tier: b?.tier ?? null, lengths: b?.lengths || [], info: tVs?.info || null, scaling: b ? scaling(b.lengths) : null },
    },
    tips: {
      data: tips,
      opgg: a?.tip || null,            // en ingles
      against: tVs?.enemy || [],       // Riot: como jugar contra el rival
      mine: tMe?.ally || [],           // Riot: como jugar tu campeon
    },
  };
}

module.exports = { matchupCheck, championTips, scaling, dataTips };
