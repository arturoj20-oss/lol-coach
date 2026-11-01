// Perfil, historial y analisis de partidas con la API de Riot. El historial de LP se guarda
// en %APPDATA%\LoL Coach\lp-history.json cada vez que cambia.
const fs = require('fs');
const path = require('path');
const { EventEmitter } = require('events');
const { log } = require('./log');
const { ROLE_FROM_POSITION } = require('./util');
const opgg = require('./opgg');

const QUEUES = {
  400: 'Normal (reclutamiento)', 420: 'Clasificatoria Solo/Duo', 430: 'Normal (a ciegas)', 440: 'Clasificatoria Flexible',
  450: 'ARAM', 480: 'Partida rápida', 490: 'Partida rápida', 700: 'Clash', 900: 'URF', 1700: 'Arena', 1900: 'URF',
  1300: 'Nexus Blitz', 2400: 'ARAM: Caos',
};
const TIERS = ['IRON', 'BRONZE', 'SILVER', 'GOLD', 'PLATINUM', 'EMERALD', 'DIAMOND', 'MASTER', 'GRANDMASTER', 'CHALLENGER'];
const DIVISIONS = { IV: 0, III: 1, II: 2, I: 3 };
const RIFT = [400, 420, 430, 440, 480, 490, 700];

// Puntos absolutos para graficar el LP: 400 por tier y 100 por division (Master+ sin divisiones)
function lpValue(e) {
  const t = TIERS.indexOf(e.tier);
  if (t >= 7) return 7 * 400 + e.leaguePoints;
  return t * 400 + (DIVISIONS[e.rank] ?? 0) * 100 + e.leaguePoints;
}

// Etiqueta a partir de los puntos absolutos (inverso de lpValue)
function lpLabel(value) {
  const v = Math.max(0, Math.round(value));
  if (v >= 2800) return `MASTER ${v - 2800} LP`;
  const t = Math.floor(v / 400);
  const div = Math.floor((v - t * 400) / 100);
  return `${TIERS[t]} ${['IV', 'III', 'II', 'I'][div]} ${v - t * 400 - div * 100} LP`;
}

const RANKED_QUEUES = { RANKED_SOLO_5x5: 420, RANKED_FLEX_SR: 440 };
const DEFAULT_LP_PER_GAME = 22;
const ROMAN = { 1: 'I', 2: 'II', 3: 'III', 4: 'IV' };

const round = (v, d = 1) => Math.round(v * 10 ** d) / 10 ** d;

function summarize(match, puuid) {
  const info = match.info;
  const p = info.participants.find(x => x.puuid === puuid);
  if (!p) return null;
  const mins = info.gameDuration / 60;
  const teamKills = info.participants.filter(x => x.teamId === p.teamId).reduce((s, x) => s + x.kills, 0);
  const cs = p.totalMinionsKilled + p.neutralMinionsKilled;
  return {
    matchId: match.metadata.matchId,
    queueId: info.queueId,
    queue: QUEUES[info.queueId] || info.gameMode,
    championId: p.championId,
    role: ROLE_FROM_POSITION[p.teamPosition] || '',
    win: p.win,
    kills: p.kills, deaths: p.deaths, assists: p.assists,
    cs, csPerMin: round(cs / mins),
    durationSec: info.gameDuration,
    endedAt: info.gameEndTimestamp || (info.gameStartTimestamp + info.gameDuration * 1000),
    items: [p.item0, p.item1, p.item2, p.item3, p.item4, p.item5, p.item6],
    spells: [p.summoner1Id, p.summoner2Id],
    keystone: p.perks?.styles?.[0]?.selections?.[0]?.perk || null,
    subStyle: p.perks?.styles?.[1]?.style || null,
    visionScore: p.visionScore,
    killParticipation: teamKills ? round((p.kills + p.assists) / teamKills, 2) : 0,
    damage: p.totalDamageDealtToChampions,
    remake: !!p.gameEndedInEarlySurrender,
  };
}

class Profile extends EventEmitter {
  constructor(riot, dir) {
    super();
    this.riot = riot;
    this.lpFile = path.join(dir, 'lp-history.json');
    this.identity = null;    // { puuid, gameName, tagLine, profileIconId, level }
    this.state = { loading: false, error: null, updatedAt: null, summoner: null, ranked: [], lpHistory: this.loadLp(), recent: null, champions: [], roles: [], matches: [] };
    this.postgame = { loading: false, error: null, analysis: null };
    this.refreshing = null;
  }

  loadLp() {
    try { return JSON.parse(fs.readFileSync(this.lpFile, 'utf8')); } catch { return []; }
  }

  setIdentity(identity) {
    if (this.identity?.puuid !== identity.puuid) this.apiPuuidCache = null;
    this.identity = identity;
  }

  // El puuid del cliente no vale para la API de Riot (cada clave tiene los suyos cifrados):
  // se obtiene buscando la cuenta por su Riot ID
  async apiPuuid() {
    if (this.apiPuuidCache) return this.apiPuuidCache;
    const { gameName, tagLine } = this.identity || {};
    if (!gameName || !tagLine) throw new Error('Abre el cliente de LoL para identificar tu cuenta');
    const account = await this.riot.account(gameName, tagLine);
    if (!account) throw new Error(`No se encuentra la cuenta ${gameName}#${tagLine}`);
    this.apiPuuidCache = account.puuid;
    return account.puuid;
  }

  emitState() {
    this.emit('change', this.state);
  }

  refresh() {
    // Una sola actualizacion a la vez
    if (!this.refreshing) this.refreshing = this.doRefresh().finally(() => { this.refreshing = null; });
    return this.refreshing;
  }

  async doRefresh() {
    if (!this.riot.hasKey()) {
      this.state = { ...this.state, loading: false, error: 'Añade tu clave de Riot en Ajustes para ver tu perfil' };
      return this.emitState();
    }
    if (!this.identity?.puuid) {
      this.state = { ...this.state, loading: false, error: 'Abre el cliente de LoL para identificar tu cuenta' };
      return this.emitState();
    }
    this.state = { ...this.state, loading: true, error: null };
    this.emitState();
    try {
      const puuid = await this.apiPuuid();
      const [entries, ids] = await Promise.all([this.riot.league(puuid), this.riot.matchIds(puuid, 20)]);
      const ranked = (entries || [])
        .filter(e => e.queueType === 'RANKED_SOLO_5x5' || e.queueType === 'RANKED_FLEX_SR')
        .map(e => ({ queue: e.queueType, tier: e.tier, division: e.rank, lp: e.leaguePoints, wins: e.wins, losses: e.losses, hotStreak: e.hotStreak }));
      this.recordLp(entries || []);

      const matches = [];
      for (const id of ids || []) {
        try {
          const m = await this.riot.match(id);
          const s = m && summarize(m, puuid);
          if (s) matches.push(s);
        } catch (e) {
          log(`partida ${id}: ${e.message}`);
        }
      }
      this.state = {
        loading: false, error: null, updatedAt: Date.now(),
        summoner: { gameName: this.identity.gameName, tagLine: this.identity.tagLine, level: this.identity.level, profileIconId: this.identity.profileIconId },
        ranked, lpHistory: this.mergeLp(this.loadLp(), this.lpEstimated), matches,
        ...Profile.aggregate(matches),
      };
      this.emitState();
      // La curva estimada descarga mas partidas: va despues, sin bloquear el resto del perfil
      this.lpEstimated = await this.estimateLp(puuid, entries || []);
      this.state = { ...this.state, lpHistory: this.mergeLp(this.loadLp(), this.lpEstimated) };
    } catch (e) {
      this.state = { ...this.state, loading: false, error: e.message };
    }
    this.emitState();
  }

  // Curva de LP reconstruida hacia atras desde un punto real: cada victoria suma y cada derrota
  // resta una cantidad media de LP, calibrada con puntos reales anteriores (OP.GG o guardados)
  // cuando los hay. Los puntos llevan estimated: true.
  async estimateLp(puuid, entries) {
    const saved = this.loadLp();
    let opggPoints = [];
    try {
      const { gameName, tagLine, region } = this.identity;
      opggPoints = (await opgg.lpHistory(gameName, tagLine, region || 'EUW')).map(h => {
        const value = lpValue({ tier: h.tier_info.tier, rank: ROMAN[h.tier_info.division], leaguePoints: h.tier_info.lp });
        return { t: Date.parse(h.created_at), queue: 'RANKED_SOLO_5x5', value };
      });
    } catch (e) {
      log(`LP de OP.GG: ${e.message}`);
    }

    const out = [];
    for (const entry of entries) {
      const queueId = RANKED_QUEUES[entry.queueType];
      if (!queueId) continue;
      try {
        const ids = await this.riot.matchIds(puuid, 40, 0, queueId) || [];
        const games = [];
        for (const id of ids) {
          const s = summarize(await this.riot.match(id), puuid);
          if (s && !s.remake) games.push({ t: s.endedAt, win: s.win });
        }
        if (!games.length) continue;
        games.sort((a, b) => a.t - b.t);

        // Punto real desde el que se reconstruye: el primero guardado por la app o el actual
        const real = saved.filter(h => h.queue === entry.queueType).sort((a, b) => a.t - b.t);
        const end = real[0] || { t: Date.now(), value: lpValue(entry) };

        // Calibrar LP por partida con el punto real mas antiguo que deje mas partidas en medio
        let perGame = DEFAULT_LP_PER_GAME;
        let best = 0;
        for (const a of [...opggPoints, ...real].filter(p => p.queue === entry.queueType && p.t < end.t)) {
          const between = games.filter(g => g.t > a.t && g.t <= end.t);
          const diff = between.filter(g => g.win).length - between.filter(g => !g.win).length;
          const candidate = diff ? (end.value - a.value) / diff : 0;
          if (Math.abs(diff) >= 3 && candidate >= 12 && candidate <= 35 && Math.abs(diff) > best) {
            best = Math.abs(diff);
            perGame = candidate;
          }
        }

        let value = end.value;
        const points = [];
        for (const g of games.filter(g => g.t <= end.t).reverse()) {
          points.push({ t: g.t, value });
          value -= g.win ? perGame : -perGame;
        }
        const first = games.find(g => g.t <= end.t);
        if (first) points.push({ t: first.t - 60000, value });
        for (const p of points.reverse()) {
          const v = Math.max(0, Math.round(p.value));
          out.push({ t: p.t, queue: entry.queueType, value: v, label: lpLabel(v), estimated: true });
        }
      } catch (e) {
        log(`LP estimado ${entry.queueType}: ${e.message}`);
      }
    }
    return out;
  }

  // Puntos reales guardados + estimados anteriores a ellos
  mergeLp(saved, estimated) {
    const firstReal = {};
    for (const h of saved) firstReal[h.queue] = Math.min(firstReal[h.queue] ?? Infinity, h.t);
    const est = (estimated || []).filter(p => p.t < (firstReal[p.queue] ?? Infinity));
    return [...est, ...saved.map(h => ({ ...h, estimated: false }))].sort((a, b) => a.t - b.t);
  }

  recordLp(entries) {
    const history = this.loadLp();
    let changed = false;
    for (const e of entries) {
      if (e.queueType !== 'RANKED_SOLO_5x5' && e.queueType !== 'RANKED_FLEX_SR') continue;
      const value = lpValue(e);
      const last = [...history].reverse().find(h => h.queue === e.queueType);
      if (last && last.value === value) continue;
      history.push({ t: Date.now(), queue: e.queueType, value, label: `${e.tier} ${TIERS.indexOf(e.tier) >= 7 ? '' : e.rank + ' '}${e.leaguePoints} LP` });
      changed = true;
    }
    if (changed) try { fs.writeFileSync(this.lpFile, JSON.stringify(history.slice(-500))); } catch { }
  }

  static aggregate(matches) {
    const games = matches.filter(m => !m.remake && RIFT.includes(m.queueId));
    if (!games.length) return { recent: null, champions: [], roles: [] };
    const sum = f => games.reduce((s, m) => s + f(m), 0);
    const kda = (k, d, a) => round((k + a) / Math.max(1, d), 2);
    const recent = {
      games: games.length, wins: sum(m => m.win ? 1 : 0),
      kda: kda(sum(m => m.kills), sum(m => m.deaths), sum(m => m.assists)),
      csPerMin: round(sum(m => m.cs) / (sum(m => m.durationSec) / 60)),
      visionPerMin: round(sum(m => m.visionScore) / (sum(m => m.durationSec) / 60), 2),
      killParticipation: round(sum(m => m.killParticipation) / games.length, 2),
    };
    const byChamp = new Map();
    const byRole = new Map();
    for (const m of games) {
      const c = byChamp.get(m.championId) || { championId: m.championId, games: 0, wins: 0, k: 0, d: 0, a: 0, cs: 0, sec: 0 };
      c.games++; c.wins += m.win ? 1 : 0; c.k += m.kills; c.d += m.deaths; c.a += m.assists; c.cs += m.cs; c.sec += m.durationSec;
      byChamp.set(m.championId, c);
      if (m.role) {
        const r = byRole.get(m.role) || { role: m.role, games: 0, wins: 0 };
        r.games++; r.wins += m.win ? 1 : 0;
        byRole.set(m.role, r);
      }
    }
    const champions = [...byChamp.values()].sort((a, b) => b.games - a.games)
      .map(c => ({ championId: c.championId, games: c.games, wins: c.wins, kda: kda(c.k, c.d, c.a), csPerMin: round(c.cs / (c.sec / 60)) }));
    return { recent, champions, roles: [...byRole.values()].sort((a, b) => b.games - a.games) };
  }

  // Tras una partida: esperar a que la API de Riot tenga la partida nueva (tarda un poco)
  async afterGame(knownLatest) {
    if (!this.riot.hasKey() || !this.identity?.puuid) return;
    this.postgame = { loading: true, error: null, analysis: this.postgame.analysis };
    this.emit('postgame', this.postgame);
    for (let i = 0; i < 20; i++) {
      await new Promise(r => setTimeout(r, i === 0 ? 15000 : 20000));
      try {
        const [latest] = await this.riot.matchIds(await this.apiPuuid(), 1) || [];
        if (latest && latest !== knownLatest) {
          await this.refresh();
          const analysis = await this.analyze(latest);
          this.postgame = { loading: false, error: null, analysis };
          this.emit('postgame', this.postgame);
          return;
        }
      } catch (e) {
        log(`post-partida: ${e.message}`);
      }
    }
    this.postgame = { loading: false, error: 'La partida todavía no está disponible en la API de Riot', analysis: this.postgame.analysis };
    this.emit('postgame', this.postgame);
  }

  latestMatchId() {
    return this.state.matches[0]?.matchId || null;
  }

  async analyze(matchId) {
    const puuid = await this.apiPuuid();
    const [match, timeline] = await Promise.all([this.riot.match(matchId), this.riot.timeline(matchId)]);
    if (!match) throw new Error('Partida no encontrada');
    const summary = summarize(match, puuid);
    const parts = match.info.participants;
    const me = parts.find(p => p.puuid === puuid);
    const opp = parts.find(p => p.teamId !== me.teamId && p.teamPosition && p.teamPosition === me.teamPosition);
    const pid = me.participantId;
    const oid = opp?.participantId;

    const frames = timeline?.info?.frames || [];
    const csOf = f => f ? f.minionsKilled + f.jungleMinionsKilled : 0;
    const series = { minutes: [], goldDiff: [], xpDiff: [], csDiff: [] };
    frames.forEach((fr, i) => {
      const a = fr.participantFrames?.[pid];
      const b = oid ? fr.participantFrames?.[oid] : null;
      if (!a) return;
      series.minutes.push(i);
      series.goldDiff.push(b ? a.totalGold - b.totalGold : 0);
      series.xpDiff.push(b ? a.xp - b.xp : 0);
      series.csDiff.push(b ? csOf(a) - csOf(b) : 0);
    });
    const at = min => {
      const fr = frames[min];
      const a = fr?.participantFrames?.[pid];
      if (!a) return null;
      const b = oid ? fr.participantFrames[oid] : null;
      return { cs: csOf(a), goldDiff: b ? a.totalGold - b.totalGold : 0, xpDiff: b ? a.xp - b.xp : 0 };
    };

    const deaths = [];
    for (const fr of frames) {
      for (const ev of fr.events || []) {
        if (ev.type === 'CHAMPION_KILL' && ev.victimId === pid) {
          deaths.push({
            t: Math.round(ev.timestamp / 1000), x: ev.position?.x ?? 0, y: ev.position?.y ?? 0,
            killerChampionId: parts.find(p => p.participantId === ev.killerId)?.championId || null,
          });
        }
      }
    }

    // Comparacion con tu media en las ultimas partidas del mismo rol (o todas si hay pocas)
    const pool = this.state.matches.filter(m => !m.remake && m.matchId !== matchId && RIFT.includes(m.queueId));
    const sameRole = pool.filter(m => m.role === summary.role);
    const base = sameRole.length >= 5 ? sameRole : pool;
    const avg = f => base.length ? base.reduce((s, m) => s + f(m), 0) / base.length : null;
    const mins = summary.durationSec / 60;
    const kdaOf = m => (m.kills + m.assists) / Math.max(1, m.deaths);
    const rows = [
      ['CS/min', summary.csPerMin, avg(m => m.csPerMin), true, 'number'],
      ['KDA', round(kdaOf(summary), 2), avg(kdaOf), true, 'number'],
      ['Muertes', summary.deaths, avg(m => m.deaths), false, 'integer'],
      ['Participación en asesinatos', summary.killParticipation, avg(m => m.killParticipation), true, 'percent'],
      ['Visión/min', round(summary.visionScore / mins, 2), avg(m => m.visionScore / (m.durationSec / 60)), true, 'number'],
      ['Daño/min', Math.round(summary.damage / mins), avg(m => m.damage / (m.durationSec / 60)), true, 'integer'],
    ];
    const comparison = rows.map(([label, value, a, higherIsBetter, format]) => ({
      label, value, avg: a == null ? null : round(a, 2), format,
      better: a == null ? null : higherIsBetter ? value >= a : value <= a,
    }));

    return {
      matchId, summary,
      opponent: opp ? { championId: opp.championId, riotId: `${opp.riotIdGameName}#${opp.riotIdTagline}` } : null,
      timeline: series, at10: at(10), at15: at(15), deaths, comparison,
      tips: Profile.tips(summary, me, at(10), at(15), deaths, comparison),
    };
  }

  // Consejos con reglas sencillas sobre la partida
  static tips(s, p, at10, at15, deaths, comparison) {
    const tips = [];
    const mins = s.durationSec / 60;
    const cmp = label => comparison.find(c => c.label === label);
    const early = deaths.filter(d => d.t < 600).length;
    if (early >= 2) tips.push({ severity: 'high', title: 'Mueres pronto', detail: `${early} muertes antes del minuto 10. Juega más seguro en la fase de líneas y vigila al jungla rival.` });
    if (s.deaths >= 8) tips.push({ severity: 'high', title: 'Demasiadas muertes', detail: `${s.deaths} muertes. Cada muerte da oro y tiempo al rival: revisa en el mapa de muertes dónde te pillan.` });
    if (at15 && at15.goldDiff <= -1000) tips.push({ severity: 'high', title: 'Pierdes la línea', detail: `Vas ${Math.abs(at15.goldDiff)} de oro por detrás de tu rival al minuto 15.` });
    else if (at15 && at15.goldDiff >= 1000) tips.push({ severity: 'low', title: 'Ganas la línea', detail: `+${at15.goldDiff} de oro al minuto 15. Convierte la ventaja en objetivos.` });
    const csRow = cmp('CS/min');
    if (s.role !== 'support' && csRow?.avg && s.csPerMin < csRow.avg * 0.85) tips.push({ severity: 'mid', title: 'Farmeo por debajo de tu media', detail: `${s.csPerMin} CS/min frente a tu media de ${csRow.avg}.` });
    const vision = s.visionScore / mins;
    if ((s.role === 'support' && vision < 1.5) || (s.role !== 'support' && vision < 0.6)) {
      const wards = p.visionWardsBoughtInGame ?? 0;
      tips.push({ severity: 'mid', title: 'Poca visión', detail: `${s.visionScore} de visión (${round(vision, 2)}/min) y ${wards} guardianes de control comprados.` });
    }
    if (s.killParticipation < 0.4 && mins > 15) tips.push({ severity: 'mid', title: 'Poca participación en peleas', detail: `Participaste en el ${Math.round(s.killParticipation * 100)}% de los asesinatos de tu equipo.` });
    if (s.role === 'jungle' && at10 && at10.cs < 50) tips.push({ severity: 'mid', title: 'Ritmo de jungla lento', detail: `${at10.cs} CS al minuto 10. Un buen ritmo de limpieza ronda los 60-70.` });
    if (!tips.some(t => t.severity !== 'low')) tips.push({ severity: 'low', title: 'Buena partida', detail: 'Sin fallos claros en las estadísticas. Mira la gráfica de oro para ver en qué momento se decidió.' });
    return tips;
  }
}

module.exports = { Profile, summarize };
