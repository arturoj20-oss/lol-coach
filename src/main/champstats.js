// Estadisticas de cualquier campeon en una linea (explorador de la vista Seleccion): win/pick/ban
// rate, tier, counters, sinergias, build mas jugada y una lista unica de builds completas: las de
// OP.GG contra el rival mas jugado de la linea y las de U.GG por piedra angular, sin repetir.
// OP.GG y U.GG (con su cache de 12 h): funciona sin el cliente de LoL
const opgg = require('./opgg');
const { buildFrom } = require('./draft');
const { coherentBuilds, MIN_GUIDE_GAMES, tagBuilds, mergeBuilds } = require('./buildsets');
const ugg = require('./ugg');

const ROLES = ['top', 'jungle', 'mid', 'adc', 'support'];
// Sinergias: con el aliado de cada una de las otras lineas
const SYNERGY_ROLES = ROLES;

class ChampStats {
  // otp: OtpBuilds (builds de OTP de Challenger y Gran Maestro), opcional
  constructor(champions, otp = null) {
    this.champions = champions;
    this.otp = otp;
  }

  // vsId: rival elegido a mano para comprobar el enfrentamiento (si no, el mas jugado de la linea)
  async get(championId, role, vsId = null) {
    const c = this.champions.get(championId);
    if (!c) throw new Error('Campeón desconocido');
    // Sin linea: la principal del campeon segun OP.GG
    if (!ROLES.includes(role)) role = await opgg.mainPosition(c.key).catch(() => null) || 'mid';
    const data = await opgg.championAnalysis(c.key, role);
    const avg = data.summary?.average_stats || {};

    const counter = list => (list || []).map(x => ({
      championId: x.champion_id, games: x.play,
      winRate: x.my_win_rate ?? x.win_rate ?? null,   // tu % de victorias contra el
    })).filter(x => this.champions.get(x.championId));

    const synergies = {};
    for (const r of SYNERGY_ROLES) {
      if (r === role) continue;
      synergies[r] = (data.synergies?.[r] || [])
        .map(x => ({ championId: x.synergy_champion_id, games: x.play, winRate: x.win_rate }))
        .filter(x => this.champions.get(x.championId));
    }

    const build = buildFrom(data, championId, role);
    // Builds completas y coherentes contra el rival elegido o el mas jugado de la linea (la guia de
    // OP.GG exige un rival)
    const manual = !!(vsId && vsId !== championId && this.champions.get(vsId));
    let guide = null, vs = manual ? vsId : null;
    try {
      if (!vs) {
        const meta = await opgg.laneMeta(role);
        vs = meta.map(m => ({ id: this.champions.idFromEnglish(m.champion), pick: m.pick_rate || 0 }))
          .filter(x => x.id && x.id !== championId).sort((a, b) => b.pick - a.pick)[0]?.id || null;
      }
      if (vs) guide = await opgg.matchupGuide(c.key, role, this.champions.get(vs).key);
    } catch { }
    const matchup = vs ? await this.matchup(championId, role, vs, data) : null;
    const uggData = await this.ugg(championId, role);
    // Una sola lista: primero las de OP.GG (contra el rival), despues las de U.GG y las de OTP que no
    // repitan piedra angular y nucleo. El campeon explorado pasa delante en la recopilacion OTP
    const items = this.champions.ddragon?.items || {};
    this.otp?.prioritize([championId], true);
    const otpOptions = this.otp ? tagBuilds(this.otp.options(championId, role, items), build, 'otp') : [];
    const options = mergeBuilds(tagBuilds(coherentBuilds(build, guide, items, MIN_GUIDE_GAMES), build, 'opgg'), uggData?.options || [], otpOptions);

    return {
      championId, role,
      stats: {
        winRate: avg.win_rate ?? null, pickRate: avg.pick_rate ?? null, banRate: avg.ban_rate ?? null,
        tier: avg.tier ?? null, rank: avg.rank ?? null,
      },
      damageType: data.damage_type || this.champions.get(championId)?.damage || null,
      counters: { strong: counter(data.strong_counters), weak: counter(data.weak_counters) },
      synergies, build, options, vs, vsManual: manual, matchup, ugg: uggData,
      otp: this.otp && this.otp.running ? this.otp.summary(championId, role) : null,
    };
  }

  // % de victorias contra el rival: U.GG (Esmeralda+, mundo) o, si no hay muestra, los counters de OP.GG
  async matchup(championId, role, vs, data) {
    try {
      const m = await ugg.laneMatchup(championId, role, [vs]);
      if (m) return { vs, winRate: m.winRate, games: m.games, source: 'U.GG' };
    } catch { }
    const x = [...(data.strong_counters || []), ...(data.weak_counters || [])].find(k => k.champion_id === vs);
    const wr = x?.my_win_rate ?? x?.win_rate;
    return wr != null ? { vs, winRate: wr, games: x.play || null, source: 'OP.GG' } : { vs, winRate: null, games: null, source: null };
  }

  // Segunda fuente: U.GG (mundo, Esmeralda+). Una build coherente por piedra angular jugada, para que
  // salgan tambien las que OP.GG no ve por poca muestra. Un fallo de U.GG no rompe el resto
  async ugg(championId, role) {
    try {
      return await ugg.uggBuilds(championId, role, this.champions.ddragon || {});
    } catch (e) {
      return null;
    }
  }
}

module.exports = { ChampStats, ROLES };
