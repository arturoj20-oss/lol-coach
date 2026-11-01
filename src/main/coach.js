// Coach con IA (Claude): analisis post-partida y consejo de picks/baneos en la seleccion.
// Dos formas de llamarlo (config.ai):
// - 'local': Claude Code instalado en el equipo, con la suscripcion del usuario (por defecto)
// - 'api': API de Anthropic con la clave de %APPDATA%\LoL Coach\anthropic-key.txt
// Sin ninguna de las dos el resto de la app funciona igual.
const fs = require('fs');
const path = require('path');
const Anthropic = require('@anthropic-ai/sdk');
const { LocalClaude } = require('./localclaude');
const { ROLE_NAMES } = require('./util');

const MODEL = 'claude-opus-5-5';

const SYSTEM = `Eres un entrenador de League of Legends que analiza partidas de un jugador de nivel Esmeralda.
Recibes en JSON las estadísticas de una partida suya: resumen, rival de línea, diferencias de oro/XP/CS
minuto a minuto contra ese rival, muertes con minuto y posición en el mapa (coordenadas 0-14870; la base azul
está abajo a la izquierda), comparación con su media y avisos ya detectados.

Responde en español de España, en markdown sencillo (títulos con ##, listas con -), con:
## Resumen
Dos o tres frases sobre cómo fue la partida y en qué momento se decidió.
## Qué mejorar
Tres puntos concretos y accionables, apoyados en los datos (cita minutos y cifras).
## Qué mantener
Uno o dos puntos positivos.
Sé directo y no repitas los datos sin interpretarlos. No inventes información que no esté en los datos.`;

const DRAFT_SYSTEM = `Eres un entrenador de League of Legends que ayuda en la selección de campeones a un jugador
de nivel Esmeralda. Recibes en JSON el estado de la selección: la fase (baneos o picks y si es su turno), su rol,
los campeones aliados con su rol, los enemigos ya visibles, los baneos, su pool de campeones con partidas y
porcentaje de victorias, los picks que recomienda la app (puntuación y motivos basados en OP.GG y su historial)
y los baneos recomendados.

Lo va a leer en unos segundos durante la selección: sé muy breve. Responde en español de España, en markdown
sencillo (títulos con ##, listas con -), con estas secciones:
## Baneo
Solo si la fase es de baneos: un campeón y por qué en una línea, y una alternativa. Si ya pasaron los baneos, omite la sección.
## Pick
Los dos mejores campeones para ESTA partida (pueden coincidir o no con los de la app), una línea cada uno con el
motivo concreto: rivales, composición, tipo de daño, su soltura con el campeón. Si ya ha bloqueado, valora su pick.
## Plan
Dos o tres puntos sobre cómo jugar la composición: condición de victoria, qué rival vigilar, fuerza en la partida
temprana o tardía.
Usa solo las cifras que vengan en los datos; lo demás, razónalo con conocimiento general del juego sin inventar
porcentajes. Si faltan enemigos por revelar, dilo y céntrate en lo que hay.`;

class Coach {
  constructor(dir, champions, config) {
    this.keyFile = path.join(dir, 'anthropic-key.txt');
    this.champions = champions;
    this.config = config;
    this.local = new LocalClaude(path.join(dir, 'claude'));
  }

  key() {
    try { return fs.readFileSync(this.keyFile, 'utf8').trim(); } catch { return ''; }
  }

  hasKey() {
    return this.key().startsWith('sk-ant-');
  }

  // Comprueba la clave con una peticion minima antes de guardarla
  async saveKey(value) {
    const client = new Anthropic({ apiKey: value.trim() });
    await client.models.retrieve(MODEL);
    fs.writeFileSync(this.keyFile, value.trim(), 'utf8');
  }

  status() {
    const mode = this.config.get().ai === 'api' ? 'api' : 'local';
    const local = this.local.available();
    const api = this.hasKey();
    return { mode, local, api, ready: mode === 'local' ? local : api };
  }

  // Llama a Claude por la via elegida y devuelve el texto
  async run({ system, input, model, effort, timeoutMs }) {
    const { mode, ready } = this.status();
    if (mode === 'local') {
      if (!ready) throw new Error('No se encuentra Claude Code en este equipo. Instálalo o usa una clave de Anthropic en Ajustes');
      return this.local.ask({ system, prompt: JSON.stringify(input), model, effort, timeoutMs });
    }
    if (!ready) throw new Error('Añade tu clave de Anthropic en Ajustes para usar el coach con IA');
    const client = new Anthropic({ apiKey: this.key() });
    let response;
    try {
      response = await client.beta.messages.create({
        model: MODEL,
        max_tokens: 16000,
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        output_config: { effort },
        system,
        messages: [{ role: 'user', content: JSON.stringify(input) }],
      });
    } catch (error) {
      if (error instanceof Anthropic.AuthenticationError) throw new Error('La clave de Anthropic no es válida');
      if (error instanceof Anthropic.RateLimitError) throw new Error('Demasiadas peticiones a la IA, prueba en un rato');
      if (error instanceof Anthropic.APIError) throw new Error(`Error de la IA (${error.status}): ${error.message}`);
      throw error;
    }
    if (response.stop_reason === 'refusal') throw new Error('La IA no ha podido responder a esto');
    const text = response.content.filter(b => b.type === 'text').map(b => b.text).join('\n').trim();
    if (!text) throw new Error('La IA no ha devuelto ninguna respuesta');
    return text;
  }

  async analyze(analysis) {
    const name = id => this.champions.name(id) || String(id);
    const s = analysis.summary;
    const input = {
      partida: {
        cola: s.queue, campeon: name(s.championId), rol: s.role, resultado: s.win ? 'victoria' : 'derrota',
        duracion_min: Math.round(s.durationSec / 60), kda: `${s.kills}/${s.deaths}/${s.assists}`,
        cs: s.cs, cs_min: s.csPerMin, vision: s.visionScore, participacion: s.killParticipation, dano: s.damage,
        objetos: s.items.filter(Boolean).map(id => this.champions.ddragon?.items?.[id]?.name || id),
      },
      rival_de_linea: analysis.opponent ? name(analysis.opponent.championId) : null,
      al_minuto_10: analysis.at10, al_minuto_15: analysis.at15,
      diferencias_por_minuto: analysis.timeline,
      muertes: analysis.deaths.map(d => ({ minuto: Math.round(d.t / 6) / 10, x: d.x, y: d.y, asesino: d.killerChampionId ? name(d.killerChampionId) : 'torre/súbdito' })),
      comparacion_con_tu_media: analysis.comparison,
      avisos: analysis.tips,
    };
    return { text: await this.run({ system: SYSTEM, input, model: 'opus', effort: 'medium' }) };
  }

  // Consejo de baneo y pick con el estado de la seleccion. Solo campeones y roles: nunca nombres de jugadores
  async draftAdvice(draft, recs, pool) {
    if (!draft?.active) throw new Error('No estás en la selección de campeones');
    const name = id => (id > 0 ? this.champions.name(id) || String(id) : null);
    const role = r => ROLE_NAMES[r] || r || 'desconocido';
    const input = {
      fase: draft.turn === 'ban' ? 'baneos (te toca banear)' : draft.turn === 'pick' ? 'picks (te toca elegir)' : draft.phase || 'selección',
      tu_rol: role(draft.role),
      tu_campeon: name(draft.myChampionId), bloqueado: draft.locked,
      tu_enfrentamiento: draft.matchup ? { rival: name(draft.matchup.vs), victorias: `${Math.round(draft.matchup.winRate * 1000) / 10}%`, partidas: draft.matchup.games, fuente: 'U.GG Esmeralda+' } : null,
      aliados: draft.allies.filter(a => !a.isMe).map(a => ({ rol: a.position ? role(a.position) : 'sin asignar', campeon: name(a.championId) || 'eligiendo' })),
      enemigos: draft.enemies.map(e => name(e.championId) || 'sin revelar'),
      baneos: { aliados: draft.bans.ally.map(name), enemigos: draft.bans.enemy.map(name) },
      tu_pool_en_el_rol: pool.map(p => ({ campeon: name(p.championId), partidas: p.games, victorias: `${Math.round(p.wins / p.games * 100)}%` })),
      picks_recomendados_por_la_app: draft.picks.map(p => ({
        campeon: name(p.championId), puntuacion: p.score, tier: p.metaTier,
        victorias_meta: p.metaWinRate != null ? `${Math.round(p.metaWinRate * 1000) / 10}%` : null, motivos: p.reasons,
      })),
      baneos_recomendados: recs ? {
        global: (recs.global?.items || []).map(i => `${i.name} (${i.text})`),
        para_ti: (recs.mine?.items || []).map(i => `${i.name} (${i.text})`),
      } : null,
    };
    return { text: await this.run({ system: DRAFT_SYSTEM, input, model: 'sonnet', effort: 'low', timeoutMs: 60000 }) };
  }
}

module.exports = { Coach };
