// Overlay en partida, minimo: aviso breve 90 s antes de cada objetivo, flecha encima de la habilidad
// a subir y, solo mientras se mantiene Tab, oro y CS de cada linea contra su rival y tu CS/min
'use strict';

const POS_LABEL = { TOP: 'Top', JUNGLE: 'Jungla', MIDDLE: 'Medio', BOTTOM: 'Tirador', UTILITY: 'Apoyo' };

// Barra de habilidades del juego. El HUD de LoL va anclado al centro inferior de la pantalla y su
// escala (GlobalScale de game.cfg, 0..1) solo cambia el tamano, asi que vale para cualquier HUD:
//   unidad = (alto de pantalla / 1080) * (MIN + (1 - MIN) * escala)
//   centro de la habilidad i (Q=0..R=3) = (ancho/2 + (Q_X + i * GAP) * unidad, alto - TOP_Y * unidad)
// Medido en una partida real a 2560x1440 con dos escalas (botones de "subir" de Q..R):
//   escala 0,42: centro de Q a -216,5 px del centro, separacion 71 px, borde superior a 197 px del suelo
//   escala 1,00: centro de Q a -269,5 px, separacion 88,6 px, borde superior a 246 px
// Las tres medidas crecen el mismo factor (1,247), asi que el HUD escala uniforme desde el centro inferior
// y MIN = 0,6585. Valores a 1080 de alto y escala 1; la punta de la flecha entra 6 unidades en el boton
// (por encima pisaba el texto "¡Sube de nivel!" del juego)
const SKILL_BAR = { MIN: 0.6585, Q_X: -202.1, GAP: 66.45, TOP_Y: 178.5 };
const SKILL_INDEX = { Q: 0, W: 1, E: 2, R: 3 };

// Marcador del juego (Tab), centrado en pantalla: tu equipo en una mitad y los rivales en la otra,
// una fila por jugador en el orden de las lineas. Valores a 1080 de alto y escala de HUD 1, con la
// misma unidad que SKILL_BAR. ESTIMADOS (sin medir en una captura): se ajustan en Ajustes con
// overlay.scoutX / scoutY / scoutRow (px)
//   borde exterior de cada mitad = centro +- HALF_W * unidad; fila i centrada en
//   alto/2 + (ROW0_Y + i * ROW_H) * unidad
const SCOREBOARD = { HALF_W: 500, ROW0_Y: -150, ROW_H: 68 };
const SCOUT_POS = { TOP: 'top', JUNGLE: 'jungla', MIDDLE: 'mid', BOTTOM: 'ADC', UTILITY: 'support' };
// Colores de los grupos de premades (1, 2) por equipo
const GROUP_COLORS = { ally: ['#C8AA6E', '#7FC8F0'], enemy: ['#B48CF0', '#F08CB4'] };
const FIRST_TIME = 10000;   // menos puntos: «Primera vez»
const ROLE_SHARE = 0.3;     // si juega esa posicion en al menos el 30 % de sus partidas, esta en su linea

const Overlay = {
  config: null,
  live: null,
  liveAt: 0,           // performance.now() del ultimo dato de 'live'
  lastNotifyId: null,
  toastTimer: null,
  audio: null,
  tabDown: false,      // Tab pulsado en el juego (lo manda el proceso principal)
  scouting: null,      // jugadores de la partida (scouting.js): maestria, posiciones, premades

  async start() {
    let snap = {};
    try { snap = await window.api.init(); } catch (err) { console.error('[overlay] init', err); }
    Dd.set(snap.champions);
    this.config = snap.config || null;
    // El aviso que ya estuviera al arrancar no se repite
    this.lastNotifyId = snap.live?.notify?.id ?? null;
    this.setLive(snap.live, false);

    window.api.on('live', live => this.setLive(live, true));
    window.api.on('config', cfg => { this.config = cfg; this.render(); });
    window.api.on('champions', ch => { Dd.set(ch); this.render(); });
    this.scouting = snap.scouting || null;
    window.api.on('scouting', s => { this.scouting = s; this.renderScout(); });
    window.api.on('tab', down => { this.tabDown = !!down; this.renderTab(); });
  },

  opts() {
    return this.config?.overlay || { enabled: true, objectives: true, goldDiff: true, skillOrder: true, cs: true, sound: true, side: 'right', scale: 1 };
  },

  setLive(live, withNotify) {
    this.live = live || { active: false };
    this.liveAt = performance.now();
    this.render();
    const n = this.live.notify;
    if (withNotify && n && n.id !== this.lastNotifyId) {
      this.lastNotifyId = n.id;
      if (this.visible()) this.showToast(n);
    }
  },

  visible() {
    return !!(this.live?.active && this.opts().enabled);
  },

  // gameTime estimado ahora mismo (como mucho 10 s por delante del ultimo dato)
  now() {
    if (!this.live?.active) return 0;
    return (this.live.gameTime || 0) + Math.min(10, (performance.now() - this.liveAt) / 1000);
  },

  render() {
    const hud = $('#hud');
    const o = this.opts();
    hud.hidden = !this.visible();
    hud.classList.toggle('left', o.side === 'left');
    hud.classList.toggle('right', o.side !== 'left');
    hud.style.setProperty('--scale', Math.min(1.4, Math.max(0.8, Number(o.scale) || 1)));
    this.renderSkill();
    if (hud.hidden) { this.hideToast(true); this.renderTab(); return; }
    this.renderTab();
  },

  // Flecha semitransparente encima de la habilidad que toca subir
  renderSkill() {
    const box = $('#skill');
    const key = this.visible() && this.opts().skillOrder !== false ? this.live.skillToLevel : null;
    box.hidden = !key;
    if (!key) return;
    const s = Math.min(1, Math.max(0, Number(this.live.hudScale ?? 1)));
    const u = window.innerHeight / 1080 * (SKILL_BAR.MIN + (1 - SKILL_BAR.MIN) * s);
    const x = window.innerWidth / 2 + (SKILL_BAR.Q_X + SKILL_INDEX[key] * SKILL_BAR.GAP) * u;
    const y = window.innerHeight - SKILL_BAR.TOP_Y * u;
    box.style.setProperty('--x', `${x}px`);
    box.style.setProperty('--y', `${y}px`);
    box.style.setProperty('--u', u);
    box.className = `ov-skill key-${key}`;
  },

  // Etiquetas a los lados del marcador, solo con Tab pulsado: maestria con su campeon, si esta en su
  // posicion habitual y si va en grupo. Con overlay.scoutCalibrate, etiquetas de ejemplo para cuadrarlas
  renderScout() {
    const box = $('#tabscout');
    const o = this.opts();
    const calibrate = !!o.scoutCalibrate;
    const players = this.scouting?.players || [];
    const lanes = this.live?.lanes || [];
    const show = this.tabDown && this.visible() && o.scoutTab !== false && (calibrate || (players.length && lanes.length));
    box.hidden = !show;
    if (!show) return;

    const s = Math.min(1, Math.max(0, Number(this.live.hudScale ?? 1)));
    const u = window.innerHeight / 1080 * (SKILL_BAR.MIN + (1 - SKILL_BAR.MIN) * s);
    const cx = window.innerWidth / 2;
    const edge = SCOREBOARD.HALF_W * u + (Number(o.scoutX) || 0);
    const rowH = SCOREBOARD.ROW_H * u + (Number(o.scoutRow) || 0);
    const y0 = window.innerHeight / 2 + SCOREBOARD.ROW0_Y * u + (Number(o.scoutY) || 0);
    // Tu equipo a la izquierda salvo que se intercambien los lados en Ajustes
    const allyLeft = !o.scoutSwap;
    box.style.setProperty('--u', u);

    const rows = calibrate && !(players.length && lanes.length)
      ? [0, 1, 2, 3, 4].map(i => ({ isMe: i === 1, ally: { sample: true }, enemy: { sample: true } }))
      : lanes;
    const tag = (who, team, lane, i) => {
      const left = (team === 'ally') === allyLeft;
      const y = y0 + i * rowH;
      const pos = left ? `right: ${window.innerWidth - (cx - edge)}px` : `left: ${cx + edge}px`;
      const info = who.sample ? { pts: '123 k', lvl: 20, line: 'Ejemplo (calibración)', cls: 'muted' } : this.scoutInfo(who, team, lane.position);
      const link = info.groupColor
        ? html`<svg class="ov-scout-link" viewBox="0 0 16 16" role="img" aria-label="Va en grupo" data-vars="--c:${info.groupColor}"><path d="M6.5 9.5l3-3M5 7.5l-1.5 1.5a2.5 2.5 0 003.5 3.5L8.5 11M11 8.5l1.5-1.5a2.5 2.5 0 00-3.5-3.5L7.5 5"/></svg>` : '';
      const lvl = html`<span class="ov-scout-lvl">Nv. ${info.lvl}</span>`;
      return html`<div class="ov-scout-tag ${left ? 'l' : 'r'} ${lane.isMe && team === 'ally' ? 'me' : ''}" data-vars="${pos};--y:${y}px">
        <span class="ov-scout-top">${left ? html`${link}${lvl}<b>${info.pts}</b>` : html`<b>${info.pts}</b>${lvl}${link}`}</span>
        ${info.line ? html`<span class="ov-scout-pos ${info.cls}">${info.line}</span>` : ''}
      </div>`;
    };
    setHtml(box, html`${rows.map((l, i) => html`${tag(l.ally, 'ally', l, i)}${tag(l.enemy, 'enemy', l, i)}`)}`);
  },

  // Datos de un jugador de una linea: lo cruza con el scouting por Riot ID (o por campeon)
  scoutInfo(who, team, position) {
    const norm = s => String(s || '').toLowerCase().replace(/\s+/g, '');
    const players = this.scouting?.players || [];
    const p = players.find(x => x.riotId && norm(x.riotId) === norm(who.riotId))
      || players.find(x => x.team === team && x.championId === who.championId);
    if (!p) return { pts: '—', lvl: '—', line: '', cls: 'muted' };
    const groupColor = p.group ? GROUP_COLORS[team][(p.group - 1) % 2] : null;
    if (p.hidden) return { pts: '—', lvl: '—', line: 'Perfil oculto', cls: 'muted', groupColor };
    const points = p.mastery?.points || 0;
    const pts = points >= 1e6 ? `${fmt.dec(points / 1e6, 1)} M` : points >= 1000 ? `${Math.round(points / 1000)} k` : String(points);
    const lvl = p.mastery?.level ?? 0;
    if (points < FIRST_TIME) return { pts, lvl, line: '✕ Primera vez', cls: 'loss', groupColor };
    const pos = p.positions;
    if (!pos?.games) return { pts, lvl, line: '', cls: 'muted', groupColor };
    const usual = Object.entries(pos.counts).sort((a, b) => b[1] - a[1])[0][0];
    // Sin posicion asignada (a ciegas, ARAM): solo la habitual
    if (!position) return { pts, lvl, line: `Suele ir de ${SCOUT_POS[usual]}`, cls: 'muted', groupColor };
    const inRole = usual === position || (pos.counts[position] || 0) / pos.games >= ROLE_SHARE;
    return inRole
      ? { pts, lvl, line: '✓ En su línea', cls: 'win', groupColor }
      : { pts, lvl, line: `⚠ Suele ir de ${SCOUT_POS[usual]}`, cls: 'warn', groupColor };
  },

  // Oro de cada linea contra su rival, solo con Tab pulsado (encima del marcador del juego)
  renderTab() {
    this.renderScout();
    const box = $('#tabgold');
    const o = this.opts();
    const lanes = this.live?.lanes || [];
    const show = this.tabDown && this.visible() && o.goldDiff !== false && lanes.length > 0;
    box.hidden = !show;
    if (!show) return;
    box.style.setProperty('--tab-y', `${Number(o.tabOffsetY) || 0}px`);
    box.className = `ov-tab ${o.side === 'left' ? 'left' : 'right'}`;
    const diff = d => html`<b class="${d >= 0 ? 'win' : 'loss'}">${fmt.k(d, true)}</b>`;
    const csDiff = d => html`<small class="${d >= 0 ? 'win' : 'loss'}">${fmt.signed(d)} CS</small>`;
    const g = this.live.gold;
    const cs = o.cs !== false && this.live.cs;
    setHtml(box, html`<div class="ov-tab-totals">
      ${g ? html`<div class="ov-tab-total"><span class="ov-label">Equipo</span>${diff(g.diff)}</div>` : ''}
      ${cs ? html`<div class="ov-tab-total"><span class="ov-label">Tu CS</span><b class="${cs.perMin >= cs.target ? 'win' : 'loss'}">${fmt.dec(cs.perMin)}<small>/min</small></b></div>` : ''}
      </div>
      ${lanes.map(l => html`<div class="ov-lane ${l.isMe ? 'me' : ''}" data-tip="${POS_LABEL[l.position] || ''}">
        ${icon('champ', l.ally.championId, { size: 30, tip: false })}<span class="ov-lane-d">${diff(l.diff)}${l.csDiff != null ? csDiff(l.csDiff) : ''}</span>${icon('champ', l.enemy.championId, { size: 30, tip: false, cls: 'enemy' })}
      </div>`)}`);
  },

  // ---------- Avisos ----------
  showToast(n) {
    const box = $('#toast');
    const glyph = n.kind === 'objective' ? objIcon(this.guessObjective(n.text))
      : n.kind === 'item' ? raw(SVG.spark) : raw(SVG.info);
    box.className = `ov-toast ${n.kind || ''}`;
    setHtml(box, html`${glyph}<span>${n.text}</span>`);
    // Reiniciar la animacion de entrada
    void box.offsetWidth;
    box.classList.add('show');
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => this.hideToast(), 5000);
    if (this.opts().sound) this.chime(n.kind);
  },

  hideToast(now = false) {
    const box = $('#toast');
    clearTimeout(this.toastTimer);
    box.classList.remove('show');
    if (now) { setHtml(box, ''); return; }
    this.toastTimer = setTimeout(() => setHtml(box, ''), 300);
  },

  guessObjective(text) {
    const s = normalizeText(text);
    if (s.includes('ancestral') || s.includes('elder')) return 'elder';
    if (s.includes('dragon')) return 'dragon';
    if (s.includes('baron')) return 'baron';
    if (s.includes('heraldo')) return 'herald';
    if (s.includes('larva')) return 'grubs';
    if (s.includes('atakhan')) return 'atakhan';
    if (s.includes('inhib')) return 'inhib';
    return 'tower';
  },

  // Sonido corto con WebAudio: dos notas suaves (mas agudas para objetivos)
  chime(kind) {
    try {
      this.audio ||= new AudioContext();
      const ctx = this.audio;
      if (ctx.state === 'suspended') ctx.resume();
      const notes = kind === 'objective' ? [784, 1175] : [659, 880];
      const t0 = ctx.currentTime + 0.01;
      notes.forEach((f, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.value = f;
        const start = t0 + i * 0.12;
        gain.gain.setValueAtTime(0, start);
        gain.gain.linearRampToValueAtTime(0.16, start + 0.015);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.35);
        osc.connect(gain).connect(ctx.destination);
        osc.start(start);
        osc.stop(start + 0.4);
      });
    } catch (err) {
      console.warn('[overlay] sin sonido', err);
    }
  },
};

const normalizeText = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

window.addEventListener('DOMContentLoaded', () => Overlay.start());
