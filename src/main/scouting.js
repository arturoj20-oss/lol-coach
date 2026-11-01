// Scouting en la pantalla de carga: rango, maestria y rachas de los 10 jugadores.
// Usa la API de espectador de Riot, que solo tiene la partida cuando ya ha empezado la carga.
const { EventEmitter } = require('events');
const { mapLimit } = require('./util');
const { log } = require('./log');
const opgg = require('./opgg');

// Region de OP.GG segun el servidor de la API de Riot
const OPGG_REGION = { euw1: 'euw', eun1: 'eune', na1: 'na', kr: 'kr', br1: 'br', la1: 'lan', la2: 'las', oc1: 'oce', tr1: 'tr', ru: 'ru', jp1: 'jp', me1: 'me' };
// Posiciones de OP.GG -> las de la Live Client Data API
const OPGG_POS = { TOP: 'TOP', JUNGLE: 'JUNGLE', MID: 'MIDDLE', MIDDLE: 'MIDDLE', ADC: 'BOTTOM', BOTTOM: 'BOTTOM', SUPPORT: 'UTILITY', UTILITY: 'UTILITY' };
// Partidas recientes compartidas en el mismo equipo para considerarlos premade
const PREMADE_SHARED = 2;

// Posiciones de las ultimas 20 partidas de un jugador en OP.GG (no gasta la clave de Riot):
// { counts: { TOP: 3, ... }, games } o null
async function recentPositions(riotId, platform) {
  const [gameName, tagLine] = String(riotId || '').split('#');
  const region = OPGG_REGION[platform];
  if (!gameName || !tagLine || !region) return null;
  const res = await opgg.callTool('lol_list_summoner_matches', {
    game_name: gameName, tag_line: tagLine, region, limit: 20,
    desired_output_fields: ['data.game_history[].participants[].position'],
  });
  const counts = {};
  let games = 0;
  for (const g of res?.data?.game_history || []) {
    const pos = OPGG_POS[String(g.participants?.[0]?.position || '').toUpperCase()];
    if (!pos) continue;   // ARAM, Arena...
    counts[pos] = (counts[pos] || 0) + 1;
    games++;
  }
  return games ? { counts, games } : null;
}

// Grupos de premades por equipo: dos jugadores van juntos si comparten PREMADE_SHARED partidas
// recientes (ids de Riot). Asigna player.group = 1, 2... (por equipo) a los que van en grupo
function markPremades(players) {
  for (const team of ['ally', 'enemy']) {
    const list = players.filter(p => p.team === team && p.recentIds?.length);
    const parent = new Map(list.map(p => [p, p]));
    const root = p => { while (parent.get(p) !== p) p = parent.get(p); return p; };
    for (let i = 0; i < list.length; i++) {
      const ids = new Set(list[i].recentIds);
      for (let j = i + 1; j < list.length; j++) {
        const shared = list[j].recentIds.filter(id => ids.has(id)).length;
        if (shared >= PREMADE_SHARED) parent.set(root(list[j]), root(list[i]));
      }
    }
    const groups = new Map();
    for (const p of list) {
      const r = root(p);
      if (!groups.has(r)) groups.set(r, []);
      groups.get(r).push(p);
    }
    let n = 0;
    for (const members of groups.values()) {
      if (members.length < 2) continue;
      n++;
      for (const p of members) { p.group = n; p.groupSize = members.length; }
    }
  }
  for (const p of players) delete p.recentIds;
}

function emptyState() {
  return { active: false, loading: false, error: null, players: [] };
}

class Scouting extends EventEmitter {
  constructor(riot) {
    super();
    this.riot = riot;
    this.state = emptyState();
    this.gameKey = null;
  }

  emitState() {
    this.emit('change', this.state);
  }

  stop() {
    this.gameKey = null;
    if (this.state.active) {
      this.state = emptyState();
      this.emitState();
    }
  }

  async start(puuid) {
    if (!this.riot.hasKey() || !puuid) {
      this.state = { ...emptyState(), active: true, error: 'Añade tu clave de Riot en Ajustes para ver el scouting' };
      return this.emitState();
    }
    const key = Symbol('game');
    this.gameKey = key;
    this.state = { ...emptyState(), active: true, loading: true };
    this.emitState();

    // La partida tarda unos segundos en aparecer en la API de espectador
    let game = null;
    for (let i = 0; i < 12 && this.gameKey === key; i++) {
      try { game = await this.riot.activeGame(puuid); } catch (e) { log(`espectador: ${e.message}`); }
      if (game) break;
      await new Promise(r => setTimeout(r, 10000));
    }
    if (this.gameKey !== key) return;
    if (!game) {
      this.state = { ...this.state, loading: false, error: 'La partida no aparece en la API de espectador' };
      return this.emitState();
    }

    const meTeam = game.participants.find(p => p.puuid === puuid)?.teamId;
    const ordered = [...game.participants].sort((a, b) => (a.teamId === meTeam ? 0 : 1) - (b.teamId === meTeam ? 0 : 1));
    const players = await mapLimit(ordered, 3, async p => {
      const player = {
        team: p.teamId === meTeam ? 'ally' : 'enemy', isMe: p.puuid === puuid,
        riotId: p.riotId || '', championId: p.championId, spells: [p.spell1Id, p.spell2Id],
        rank: null, hotStreak: false, mastery: null, tags: [],
        hidden: !p.puuid,     // modo anonimo
        positions: null,      // posiciones de sus ultimas partidas (OP.GG)
        group: null, groupSize: 0,   // premade (markPremades)
      };
      // Jugadores en modo anonimo: sin puuid no se puede consultar nada
      if (!p.puuid) return player;
      // Posiciones (OP.GG) y partidas recientes (premades) en paralelo con lo demas; si fallan, sin dato
      const extra = Promise.all([
        recentPositions(p.riotId, this.riot.platform).catch(e => { log(`scouting ${p.riotId}: posiciones: ${e.message}`); return null; }),
        this.riot.matchIds(p.puuid, 20).catch(() => null),
      ]).then(([positions, ids]) => { player.positions = positions; player.recentIds = ids || []; });
      try {
        const [entries, mastery, top] = await Promise.all([
          this.riot.league(p.puuid), this.riot.mastery(p.puuid, p.championId), this.riot.topMasteries(p.puuid, 2),
        ]);
        const solo = (entries || []).find(e => e.queueType === 'RANKED_SOLO_5x5');
        if (solo) {
          player.rank = { tier: solo.tier, division: solo.rank, lp: solo.leaguePoints, wins: solo.wins, losses: solo.losses };
          player.hotStreak = solo.hotStreak;
        }
        if (mastery) player.mastery = { level: mastery.championLevel, points: mastery.championPoints };
        // Etiquetas cortas
        const points = mastery?.championPoints || 0;
        if (top?.[0]?.championId === p.championId && points > 2 * (top[1]?.championPoints || 0) && points > 100000) player.tags.push('OTP');
        if (solo?.hotStreak) player.tags.push('En racha');
        if (points < 10000) player.tags.push('Primera vez con el campeón');
        if (solo) {
          const total = solo.wins + solo.losses;
          if (total >= 20 && solo.wins / total >= 0.6) player.tags.push(`${Math.round(solo.wins / total * 100)}% de victorias`);
          if (total < 20) player.tags.push('Pocas clasificatorias');
        }
      } catch (e) {
        log(`scouting ${p.riotId}: ${e.message}`);
      }
      await extra;
      return player;
    });
    if (this.gameKey !== key) return;
    markPremades(players);
    this.state = { active: true, loading: false, error: null, players };
    this.emitState();
  }
}

// Scouting de ejemplo para «Probar overlay», con los campeones de LiveGame.sample (lanes)
function sampleScouting(lanes = []) {
  const pos = (main, n = 17) => ({ counts: { [main]: n, TOP: 20 - n }, games: 20 });
  const ally = [[312000, 38, pos('TOP')], [1200000, 104, pos('JUNGLE', 18)], [8400, 2, pos('MIDDLE')], [96000, 12, pos('MIDDLE')], [180000, 21, pos('UTILITY')]];
  const enemy = [[48000, 9, pos('UTILITY')], [650000, 71, pos('JUNGLE')], [205000, 25, pos('MIDDLE')], [402000, 45, pos('BOTTOM')], null];
  const players = [];
  lanes.forEach((l, i) => {
    const mk = (team, championId, d, group) => ({
      team, isMe: team === 'ally' && l.isMe, riotId: '', championId, hidden: !d,
      mastery: d ? { points: d[0], level: d[1] } : null, positions: d ? d[2] : null, group, groupSize: group ? 2 : 0, tags: [],
    });
    players.push(mk('ally', l.ally.championId, ally[i], i === 1 || i === 4 ? 1 : null));
    players.push(mk('enemy', l.enemy.championId, enemy[i], i === 0 || i === 1 ? 1 : null));
  });
  return { active: true, loading: false, error: null, players };
}

module.exports = { Scouting, markPremades, recentPositions, sampleScouting };
