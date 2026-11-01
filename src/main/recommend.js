// Recomendaciones de baneo para el campeon que vas a jugar:
//   global: los 3 campeones con mas winrate contra el tuyo en ese rol (OP.GG)
//   para ti: contra que rivales de tu linea pierdes mas con el (tus ultimas 100 partidas)
//   counter: los que mas castigan a tu campeon y a los aliados que ya tienen campeon (U.GG)
const { EventEmitter } = require('events');
const opgg = require('./opgg');
const ugg = require('./ugg');

const ROLE_NAMES = { top: 'top', jungle: 'jungla', mid: 'mid', adc: 'ADC', support: 'support' };
const COUNTER_TITLE = 'Contra tu pick y tu equipo:';
const MIN_GAMES = 150;   // partidas minimas de un enfrentamiento en U.GG para tenerlo en cuenta
const GLOBAL_TITLE = 'Baneo recomendado (winrate global):';
const MINE_TITLE = 'Baneo recomendado para ti:';

// Grieta del Invocador: reclutamiento, clasificatorias, a ciegas, partida rapida
const RIFT_QUEUES = [400, 420, 430, 440, 480, 490];

class Recommender extends EventEmitter {
  constructor(lcu, champions) {
    super();
    this.lcu = lcu;
    this.champions = champions;
    this.key = null;
    this.globalCache = new Map();    // "id|rol" -> Promise
    this.personalCache = new Map();  // id -> Promise
    this.counterKey = null;
    this.rows = {
      counter: { title: COUNTER_TITLE, items: [], empty: 'Elige tu campeón arriba' },
      global: { title: GLOBAL_TITLE, items: [], empty: 'Elige tu campeón arriba' },
      mine: { title: MINE_TITLE, items: [], empty: 'Elige tu campeón arriba' },
    };
  }

  // Baneos contra tu pick y tu equipo (U.GG, Esmeralda+, mundo; no necesita el cliente). Para cada
  // rival X: perdida esperada de % de victorias = suma, para tu campeon (peso 1) y cada aliado con
  // campeon y rol (peso 0,5), de (probabilidad de cruzarte con X en esa linea) x (50 % - tu % contra X).
  // allies: [{ championId, position }] sin ti; exclude: ids ya baneados o elegidos
  async updateCounter(pick, role, allies = [], exclude = []) {
    const champId = pick?.id || 0;
    const team = allies.filter(a => a.championId > 0 && ROLE_NAMES[a.position]);
    const key = JSON.stringify([champId, role, team.map(a => [a.championId, a.position]), [...exclude].sort()]);
    if (key === this.counterKey) return;
    this.counterKey = key;
    if (!champId) return this.setRow('counter', COUNTER_TITLE, null, 'Elige tu campeón arriba');
    this.setRow('counter', COUNTER_TITLE, null, 'Consultando U.GG...');
    try {
      if (!ROLE_NAMES[role]) role = await opgg.mainPosition(this.champions.get(champId)?.key).catch(() => '') || '';
      if (!ROLE_NAMES[role]) throw new Error('no se sabe tu rol');
      const members = [{ id: champId, role, w: 1, me: true }, ...team.map(a => ({ id: a.championId, role: a.position, w: 0.5 }))];
      const lists = await Promise.all(members.map(m => ugg.matchups(m.id).then(x => x.roles[m.role] || {}).catch(() => ({}))));
      const skip = new Set([champId, ...team.map(a => a.championId), ...exclude]);
      const threats = new Map();
      members.forEach((m, i) => {
        const list = lists[i];
        const total = Object.values(list).reduce((n, s) => n + s[1], 0);
        if (!total) return;
        for (const [id, [wins, games]] of Object.entries(list)) {
          const x = Number(id);
          if (skip.has(x) || games < MIN_GAMES || !this.champions.get(x)) continue;
          const wr = wins / games;
          let t = threats.get(x);
          if (!t) threats.set(x, t = { id: x, score: 0, hits: [] });
          t.score += m.w * (games / total) * (0.5 - wr);
          if (wr < 0.49) t.hits.push({ name: this.champions.name(m.id), me: m.me, wr, games });
        }
      });
      const top = [...threats.values()].filter(t => t.score > 0 && t.hits.length).sort((a, b) => b.score - a.score).slice(0, 4);
      const items = top.map(t => ({
        id: t.id, name: this.champions.name(t.id),
        // % de derrotas en el peor enfrentamiento (tuyo o de un aliado), como la fila global de OP.GG;
        // el detalle va en el tooltip
        text: `${Math.round((1 - Math.min(...t.hits.map(h => h.wr))) * 100)}%`,
        tip: t.hits.sort((a, b) => b.me - a.me || a.wr - b.wr)
          .map(h => `${h.name} gana el ${(h.wr * 100).toFixed(1)}% contra ${this.champions.name(t.id)} (${h.games} partidas)`).join('\n'),
      }));
      if (this.counterKey !== key) return;
      const who = team.length ? `${this.champions.name(champId)} y tu equipo` : this.champions.name(champId);
      this.setRow('counter', `Contra ${who} (${ROLE_NAMES[role]}, % de derrotas, U.GG):`, items, 'Sin counters claros en U.GG');
    } catch (e) {
      if (this.counterKey !== key) return;
      this.counterKey = null;
      this.setRow('counter', COUNTER_TITLE, null, `U.GG: ${e.message}`);
    }
  }

  // Al cerrarse el cliente, repetir la consulta cuando vuelva
  reset() {
    this.key = null;
  }

  // Tras jugar una partida, volver a leer el historial
  clearPersonal() {
    this.personalCache.clear();
    this.key = null;
  }

  setRow(which, title, items, empty) {
    this.rows[which] = { title, items: items || [], empty };
    this.emit('change', this.rows);
  }

  // Lanza (si hace falta) las consultas para el campeon y rol; pinta cuando llegan
  async update(pick, role, ready) {
    const champId = pick?.id || 0;
    const key = `${champId}|${role}`;
    if (key === this.key) return;
    this.key = key;
    if (!champId) {
      this.setRow('global', GLOBAL_TITLE, null, 'Elige tu campeón arriba');
      this.setRow('mine', MINE_TITLE, null, 'Elige tu campeón arriba');
      return;
    }
    if (!ready) {
      this.setRow('global', GLOBAL_TITLE, null, 'Esperando al cliente de LoL...');
      this.setRow('mine', MINE_TITLE, null, 'Esperando al cliente de LoL...');
      this.key = null;
      return;
    }

    if (!this.personalCache.has(champId)) {
      this.setRow('mine', MINE_TITLE, null, 'Leyendo tu historial...');
      this.personalCache.set(champId, this.personal(champId));
    }
    this.setRow('global', GLOBAL_TITLE, null, 'Consultando OP.GG...');
    const minePromise = this.personalCache.get(champId);

    minePromise.then(mine => {
      if (this.key !== key) return;
      if (mine.error) return this.setRow('mine', MINE_TITLE, null, mine.error);
      const items = mine.top.map(t => ({
        id: t.id, name: this.champions.name(t.id), text: `${t.losses}/${t.games}`,
        tip: `Con ${pick.name} has perdido ${t.losses} de ${t.games} partidas contra ${this.champions.name(t.id)}`,
      }));
      this.setRow('mine', `Para ti (derrotas/partidas, ${mine.played} partidas con él):`, items, 'Pocas partidas para recomendar');
    });

    // Sin rol elegido ni asignado: el que mas juegas con el campeon (de tu historial) y,
    // si no hay, el principal del campeon en OP.GG
    let position = role;
    if (!position) {
      const mine = await minePromise;
      if (this.key !== key) return;
      position = mine.position || '';
    }
    const gkey = `${champId}|${position}`;
    if (!this.globalCache.has(gkey)) this.globalCache.set(gkey, this.global(champId, position));
    const res = await this.globalCache.get(gkey);
    if (this.key !== key) return;
    if (res.error) {
      this.globalCache.delete(gkey);   // reintentar la proxima vez
      return this.setRow('global', GLOBAL_TITLE, null, res.error);
    }
    const items = res.top.map(t => ({
      id: t.id, name: this.champions.name(t.id), text: `${Math.round(t.wr * 100)}%`,
      // wr es el winrate del rival contra tu campeon, es decir, cuanto pierdes tu
      tip: `${pick.name} pierde el ${(t.wr * 100).toFixed(1)}% de sus partidas contra ${this.champions.name(t.id)} (${t.games} partidas en OP.GG)`,
    }));
    this.setRow('global', `Global (${ROLE_NAMES[res.position]}, % de derrotas, OP.GG):`, items, 'Sin datos suficientes en OP.GG');
  }

  async global(champId, position) {
    const key = this.champions.get(champId)?.key;
    if (!key) return { error: 'Campeón desconocido' };
    try {
      if (!position) position = await opgg.mainPosition(key);
      if (!position) return { error: 'OP.GG no tiene datos de este campeón' };
      const data = await opgg.championAnalysis(key, position);
      // counter_win_rate es el winrate del rival contra tu campeon
      const list = (data.weak_counters || [])
        .map(c => ({ id: c.champion_id, games: c.play, wr: c.counter_win_rate }));
      return { position, top: list.sort((a, b) => b.wr - a.wr).slice(0, 3) };
    } catch (e) {
      return { error: `OP.GG: ${e.message}` };
    }
  }

  async personal(champId) {
    try {
      const list = await this.lcu.request('GET',
        '/lol-match-history/v1/products/lol/current-summoner/matches?begIndex=0&endIndex=100', undefined, 20000);
      const games = (list?.games?.games || []).filter(g =>
        g.participants?.[0]?.championId === champId && RIFT_QUEUES.includes(g.queueId) && g.gameDuration >= 300);
      const stats = new Map();
      const positions = {};
      for (const g of games) {
        const d = await this.lcu.request('GET', `/lol-match-history/v1/games/${g.gameId}`, undefined, 20000);
        const me = d.participants.find(p => p.championId === champId);
        if (!me) continue;
        const lane = me.timeline?.lane;
        const pos = { TOP: 'top', JUNGLE: 'jungle', MIDDLE: 'mid' }[lane] ||
          (lane === 'BOTTOM' ? (['DUO_SUPPORT', 'SUPPORT'].includes(me.timeline.role) ? 'support' : 'adc') : '');
        // Solo el rival de tu linea; si el cliente no registro bien las lineas, se ignora
        if (!pos) continue;
        positions[pos] = (positions[pos] || 0) + 1;
        const rivals = d.participants.filter(p => p.teamId !== me.teamId && p.timeline?.lane === lane);
        for (const e of rivals) {
          let s = stats.get(e.championId);
          if (!s) stats.set(e.championId, s = { id: e.championId, games: 0, losses: 0 });
          s.games++;
          if (!me.stats.win) s.losses++;
        }
      }
      // Proporcion de derrotas suavizada para que 1 de 1 no gane a 4 de 5
      const score = s => (s.losses + 1) / (s.games + 2);
      const top = [...stats.values()]
        .filter(s => s.games >= 2 && s.losses >= 1)
        .sort((a, b) => score(b) - score(a) || b.games - a.games)
        .slice(0, 3);
      const mainPos = Object.entries(positions).sort((a, b) => b[1] - a[1])[0];
      return { played: games.length, top, position: mainPos ? mainPos[0] : '' };
    } catch (e) {
      return { error: `Historial: ${e.message}` };
    }
  }
}

module.exports = { Recommender };
