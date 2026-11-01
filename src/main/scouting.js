// Scouting en la pantalla de carga: rango, maestria y rachas de los 10 jugadores.
// Usa la API de espectador de Riot, que solo tiene la partida cuando ya ha empezado la carga.
const { EventEmitter } = require('events');
const { mapLimit } = require('./util');
const { log } = require('./log');

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
      };
      // Jugadores en modo anonimo: sin puuid no se puede consultar nada
      if (!p.puuid) return player;
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
      return player;
    });
    if (this.gameKey !== key) return;
    this.state = { active: true, loading: false, error: null, players };
    this.emitState();
  }
}

module.exports = { Scouting };
