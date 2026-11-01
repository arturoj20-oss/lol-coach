// Vista Seleccion: equipos, picks recomendados, builds (lista unificada OP.GG + U.GG con detalle al
// estilo maestro-detalle), baneos recomendados, ajustes rapidos y el explorador de cualquier campeon
'use strict';

const EXP_TABS = [
  { id: 'build', label: 'Build' }, { id: 'context', label: 'Objetos por situación' },
  { id: 'counters', label: 'Counters' }, { id: 'synergies', label: 'Sinergias' },
];
const ROLES = ['top', 'jungle', 'mid', 'adc', 'support'];
const SOURCES = { opgg: 'OP.GG', ugg: 'U.GG', otp: 'Mains' };
const SOURCE_TIPS = { opgg: 'OP.GG: partidas contra el rival de línea', ugg: 'U.GG: mundo, Esmeralda+', otp: 'Mains del campeón (los Master+ con más partidas en EUW, KR y NA): sus partidas de los últimos 30 días' };
const BUILD_SORTS = [
  { id: 'best', label: 'Mejor', tip: '% de victorias corregido por el número de partidas (las de poca muestra cuentan menos)' },
  { id: 'wr', label: '% victorias', tip: 'Ordenadas por % de victorias' },
  { id: 'games', label: 'Más jugada', tip: 'Ordenadas por número de partidas' },
];
const PICK_SORTS = [
  { id: 'score', label: 'Puntuación', tip: 'Puntos sobre la media: meta, tu historial, counters y sinergias' },
  { id: 'meta', label: 'Meta', tip: '% de victorias del campeón en esta línea (OP.GG)' },
  { id: 'mine', label: 'Tus partidas', tip: 'Los que más has jugado en este rol' },
];
const PICKS_SHOWN = 4;   // picks visibles sin desplegar la lista
const TAG_ORDER =['Counter', 'Tu pool', 'Meta', 'Sinergia', 'Riesgo'];
const TAG_INFO = {
  Counter: { cls: 'blue', tip: 'Gana a algún enemigo que ya se ve (OP.GG)' },
  'Tu pool': { cls: 'green', tip: 'Lo has jugado al menos 3 veces en este rol' },
  Meta: { cls: '', tip: 'Tier 1 o 2 en esta línea' },
  Sinergia: { cls: 'blue', tip: 'Buena sinergia con un aliado ya elegido' },
  Riesgo: { cls: 'red', tip: 'Sufre contra algún enemigo que ya se ve' },
};
// Filas de fragmentos de estadisticas (ataque, flexible, defensa)
const SHARD_ROWS = [[5008, 5005, 5007], [5008, 5010, 5001], [5011, 5013, 5001]];

const wrCls = v => (v == null ? '' : v >= .5 ? 'win' : 'loss');
const pctOr = v => (v == null ? '—' : fmt.pct(v));
// % de victorias con 50 partidas virtuales al 50 %: ordena "Mejor" sin premiar muestras pequenas
const smoothWr = o => (o.games ? ((o.winRate ?? .5) * o.games + 25) / (o.games + 50) : .5);
const lsGet = (k, def) => { try { return localStorage.getItem(k) || def; } catch { return def; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch { } };

// Pinta solo si cambia el HTML: el borrador llega cada segundo y repintar igual quita el foco,
// el hover y las animaciones
function selPaint(el, content) {
  if (!el) return el;
  const s = toHtml(content);
  if (el._html === s) return el;
  el._html = s;
  el.innerHTML = s;
  return hydrate(el);
}

// Arbol de runas por estilo y fila a partir de champions.runes (style/slot de Data Dragon); null si no hay
let runeTreeCache = { src: null, tree: null };
function runeTree() {
  const runes = Dd.champions?.runes;
  if (runeTreeCache.src === runes) return runeTreeCache.tree;
  let tree = null;
  for (const [id, r] of Object.entries(runes || {})) {
    if (r.style == null || r.slot == null) continue;
    tree ||= {};
    ((tree[r.style] ||= [])[r.slot] ||= []).push(+id);
  }
  if (tree) for (const rows of Object.values(tree)) rows.forEach(ids => ids?.sort((a, b) => a - b));
  runeTreeCache = { src: runes, tree };
  return tree;
}

// Runas: arbol completo con las elegidas a color (y anillo) y el resto atenuadas; sin datos del arbol,
// solo las elegidas
function runesView(r) {
  const perks = r?.perks || [];
  const tree = runeTree();
  const pri = tree?.[r?.primaryStyle], sec = tree?.[r?.subStyle];
  const head = (style, cls = '') => html`<div class="rt-head ${cls}">${icon('rune', style, { size: 20, round: true, cls: 'rune style' })}<span>${Dd.runeName(style)}</span></div>`;
  if (!pri || !sec) {
    const ico = (id, cls = '') => icon('rune', id, { size: cls === 'key' ? 40 : 28, round: true, cls: `rune ${cls}` });
    return html`<div class="rt-compact">
      <div class="rt-line">${head(r?.primaryStyle)}${ico(perks[0], 'key')}${perks.slice(1, 4).map(id => ico(id))}</div>
      <div class="rt-line">${head(r?.subStyle)}${perks.slice(4, 6).map(id => ico(id))}</div>
      <div class="rt-line">${perks.slice(6, 9).map(id => icon('rune', id, { size: 20, round: true, cls: 'rune shard' }))}</div></div>`;
  }
  const chosen = new Set(perks.slice(0, 6));
  const cell = (id, size) => html`<span class="rt-cell ${chosen.has(id) ? 'on' : ''}">${icon('rune', id, { size, round: true, cls: 'rune' })}</span>`;
  const shardRows = SHARD_ROWS.map((ids, row) => {
    const pick = perks[6 + row];
    const list = pick && !ids.includes(pick) ? [...ids, pick] : ids;
    return html`<div class="rt-row shards">${list.map(id => html`<span class="rt-cell shard ${id === pick ? 'on' : ''}">${icon('rune', id, { size: 20, round: true, cls: 'rune shard' })}</span>`)}</div>`;
  });
  return html`<div class="rt">
    <div class="rt-tree">${head(r.primaryStyle)}
      ${pri.map((ids, slot) => html`<div class="rt-row ${slot === 0 ? 'keys' : ''}">${(ids || []).map(id => cell(id, slot === 0 ? 38 : 28))}</div>`)}</div>
    <div class="rt-tree">${head(r.subStyle, 'sub')}
      ${sec.slice(1).map(ids => html`<div class="rt-row">${(ids || []).map(id => cell(id, 26))}</div>`)}
      <div class="rt-shards">${shardRows}</div></div>
  </div>`;
}

// Orden de habilidades: prioridad en chips (W > E > Q) y rejilla 1-18 con la letra en cada nivel
function skillsView(order = [], prio = []) {
  if (!order.length && !prio.length) return '';
  return html`<section class="bp-sec bp-skills"><h4 class="bp-h">Orden de habilidades</h4>
    ${prio.length ? html`<div class="sk-prio" data-tip="Orden en que se suben al máximo">${prio.map((k, i) => html`${i ? html`<span class="sk-arrow" aria-hidden="true">›</span>` : ''}<span class="sk-chip key-${k}">${k}</span>`)}</div>` : ''}
    ${order.length ? html`<div class="sk-grid" data-vars="--n:${order.length}" role="table" aria-label="Habilidad a subir en cada nivel">
      <span class="sk-corner"></span>${order.map((_, i) => html`<span class="sk-lvl num">${i + 1}</span>`)}
      ${['Q', 'W', 'E', 'R'].map(k => html`<span class="sk-key key-${k}">${k}</span>${order.map((o, i) => html`<span class="sk-cell ${o === k ? 'on key-' + k : ''}" ${o === k ? raw(`data-tip="Nivel ${i + 1}: ${k}"`) : ''}>${o === k ? k : ''}</span>`)}`)}
    </div>` : ''}
  </section>`;
}

// Bloque de objetos con titulo y el precio debajo de cada uno (como la tienda con el set de Blitz);
// done: precio resaltado en los objetos completos (los componentes van atenuados)
function itemsView(label, ids, size = 34, done = null) {
  if (!ids?.length) return '';
  const items = Dd.champions?.items || {};
  return html`<div class="bp-items"><div class="bp-sub">${label}</div>
    <div class="item-row priced">${ids.map(id => html`<span class="item-cell">${icon('item', id, { size })}<span class="item-gold num ${done && !done.has(id) ? 'part' : ''}">${items[id]?.gold || ''}</span></span>`)}</div></div>`;
}

// Copia de itemLayout (src/main/buildsets.js), que da los mismos bloques al set de la tienda
// Botones «Fijar campeón» (marcarlo en el cliente sin bloquear) y «Bloquear campeón» (solo en tu
// turno de pick). Fuera de la seleccion, «Fijar» lo deja preseleccionado para la proxima
function champButtons(id, d) {
  const name = Dd.champName(id);
  if (!d?.active) {
    const pinned = App.data.config?.pick?.id === id;
    return html`<button type="button" class="btn small btn-primary" data-act="pinNext" data-id="${id}" ${pinned ? 'disabled' : ''}
      data-tip="Se preselecciona en tu próxima selección, solo si te toca tu posición principal">${pinned ? 'Preseleccionado' : 'Fijar campeón'}</button>`;
  }
  if (d.locked) return '';
  const mine = d.myChampionId === id;
  const turn = d.turn === 'pick';
  return html`<button type="button" class="btn small" data-act="hover" data-id="${id}" ${mine ? 'disabled' : ''} data-tip="Marca a ${name} en el cliente sin bloquearlo">${mine ? 'Fijado' : 'Fijar campeón'}</button>
    <span ${turn ? '' : raw('data-tip="Se activa cuando llegue tu turno de pick"')}><button type="button" class="btn small btn-primary" data-act="lock" data-id="${id}" ${turn ? '' : 'disabled'}>Bloquear campeón</button></span>`;
}

function itemLayout(b) {
  const items = Dd.champions?.items || {};
  const core = b.core || [], boots = b.boots || [], sit = b.situational || [];
  const parts = id => (items[id]?.from || []).filter(c => items[c]);
  const order = [];
  core.forEach((id, i) => {
    order.push(...parts(id), id);
    if (i === 0 && boots[0]) order.push(...parts(boots[0]), boots[0]);
  });
  if (!core.length && boots[0]) order.push(...parts(boots[0]), boots[0]);
  const final = [...new Set([...core, ...boots.slice(0, 1), ...sit])].slice(0, 6);
  return { starter: b.starter || [], order, final, situational: sit.filter(id => !final.includes(id)), boots };
}

function itemsBlocks(b) {
  const l = itemLayout(b);
  const done = new Set([...(b.core || []), ...(b.boots || [])]);
  return html`${itemsView('Objetos iniciales', l.starter)}${itemsView('Orden de compra', l.order, 34, done)}${itemsView('Build final', l.final)}
    ${itemsView('Situacionales que también van bien', l.situational, 30)}${itemsView('Opciones de botas', l.boots, 30)}`;
}

// Objetos situacionales por contexto; flags: grupos que pide el equipo enemigo (se destacan y van primero)
function contextBlock(context, flags = [], title = 'Situacionales según la partida') {
  if (!context?.length) return '';
  const list = [...context].sort((a, b) => flags.includes(b.key) - flags.includes(a.key));
  return html`<section class="bp-sec ctx-block"><h4 class="bp-h">${title}</h4>
    <div class="ctx-list">${list.map(g => html`<div class="ctx-row ${flags.includes(g.key) ? 'hot' : ''}">
      <span class="ctx-label">${g.label}${flags.includes(g.key) ? html` <span class="tag blue" data-tip="Lo pide la composición del equipo enemigo">Recomendado</span>` : ''}</span>
      <span class="item-row">${g.items.map(id => icon('item', id, { size: 28 }))}</span>
    </div>`)}</div></section>`;
}

// Los mains de tu campeon contra este rival en toda la season (otp.matchup): partidas, % de victorias,
// la pagina de runas que mas usan en el enfrentamiento y sus ultimas partidas
function mainsBlock(c, me, vs) {
  const m = c.mains;
  if (!m) return html`<h4 class="bp-h">Mains de ${me} contra ${vs}</h4><p class="muted small mu-mains-none">Todavía no hay partidas de mains de ${me} contra ${vs}. Se van descargando en segundo plano (Ajustes › Mains).</p>`;
  const who = m.players.slice(0, 3).map(p => otpName(p)).join(', ') + (m.players.length > 3 ? ` y ${m.players.length - 3} más` : '');
  return html`<h4 class="bp-h">Mains de ${me} contra ${vs} <span class="muted">(esta season)</span></h4>
    <div class="mu-mains">
      <span class="mu-wr-item"><b class="num ${wrCls(m.winRate)}">${fmt.pct(m.winRate)}</b><span class="muted">${fmt.int(m.games)} ${m.games === 1 ? 'partida' : 'partidas'}${m.games < 15 ? ' · poca muestra' : ''}</span></span>
      <span class="muted small">${who}</span>
    </div>
    <div class="mu-mains-page"><span class="muted small">Runas que más usan contra ${vs} (${m.runeGames} de ${m.games} partidas, ${fmt.pct(m.runeWinRate)}):</span>
      <span class="otp-m-runes" data-tip-title="Página más usada" data-tip-list="${(m.runes.perks || []).map(id => Dd.runeName(id)).join('\n')}">${(m.runes.perks || []).slice(0, 6).map((id, k) => icon('rune', id, { size: k ? 20 : 26, round: true, cls: 'rune', tip: false }))}</span></div>
    ${otpMatches({ matches: m.matches, games: m.games }, `Partidas de los mains contra ${vs}`)}`;
}

// Tarjeta "Tu enfrentamiento" (comparativa y consejos de matchup.js). La usan Mi seleccion y el boton de
// prueba del explorador; extraHead: lo que va a la derecha del titulo (etiqueta de prueba, cerrar)
function matchupCard(c, extraHead = '') {
  const me = Dd.champName(c.me), vs = Dd.champName(c.vs);
  const side = (v, mine, theirs) => (v === 'me' ? mine : v === 'vs' ? theirs : 'Igualado');
  const pill = (label, value, cls) => html`<span class="mu-pill ${cls}"><span class="muted">${label}</span><b>${value}</b></span>`;
  const cls = v => (v === 'me' ? 'win' : v === 'vs' ? 'loss' : '');
  // % del enfrentamiento en cada fuente; si discrepan mucho, se avisa
  const wr = [c.matchup, c.opgg && c.matchup?.source !== 'OP.GG' ? c.opgg : null].filter(Boolean);
  const differ = wr.length === 2 && Math.abs(wr[0].winRate - wr[1].winRate) >= 0.03;
  const a = c.compare.me, b = c.compare.vs;
  // higher: true si mas es mejor, false si menos es mejor, null si no hay mejor (perfil de Riot)
  const row = (label, x, y, f, higher = true) => {
    const better = higher != null && x != null && y != null && x !== y ? ((x > y) === higher ? 'me' : 'vs') : '';
    return html`<tr><th scope="row">${label}</th><td class="num ${better === 'me' ? 'win' : ''}">${x == null ? '—' : f(x)}</td><td class="num ${better === 'vs' ? 'loss' : ''}">${y == null ? '—' : f(y)}</td></tr>`;
  };
  const lens = a.lengths.length ? a.lengths : b.lengths;
  const lenRow = (who, list, mine) => html`<tr><th scope="row">${who}</th>${lens.map(l => {
    const x = list.find(v => v.from === l.from)?.rate;
    return html`<td class="num ${x == null ? '' : x >= .5 ? (mine ? 'win' : 'loss') : ''}">${x == null ? '—' : fmt.pct(x)}</td>`;
  })}</tr>`;
  const tipList = list => html`<ul class="mu-tips">${list.map(t => html`<li>${t}</li>`)}</ul>`;
  return html`<div class="card-head"><h2>Tu enfrentamiento</h2>
      <span class="mu-head">${icon('champ', c.me, { size: 26, tip: false })}<span class="muted">vs</span>${icon('champ', c.vs, { size: 26, tip: false, cls: 'enemy' })}<b>${vs}</b>${extraHead}</span></div>
    <div class="mu-wr">${wr.length ? wr.map(w => html`<span class="mu-wr-item" data-tip="${w.source === 'U.GG' ? 'U.GG: Esmeralda+, todas las regiones' : 'OP.GG: Esmeralda+'}, ${fmt.int(w.games)} partidas">
        <b class="num ${wrCls(w.winRate)}">${fmt.pct(w.winRate)}</b><span class="muted">${w.source} · ${fmt.int(w.games)} partidas</span></span>`) : html`<span class="muted">Sin partidas suficientes de este enfrentamiento</span>`}
      ${differ ? html`<span class="tag" data-tip="Cada web filtra rangos y regiones a su manera: tómalo como orientación">Las fuentes no coinciden</span>` : ''}</div>
    <div class="mu-pills">
      ${pill('Inicio de partida', side(c.lane, 'Ventaja tuya', `Ventaja de ${vs}`), cls(c.lane))}
      ${pill('Asesinatos en solitario', side(c.soloKill, 'Más tú', `Más ${vs}`), cls(c.soloKill))}
      ${c.style ? pill('Estilo recomendado', c.style[0].toUpperCase() + c.style.slice(1), '') : ''}
    </div>
    <table class="mu-table"><thead><tr><th></th><th scope="col">${me}</th><th scope="col">${vs}</th></tr></thead><tbody>
      ${row(`% de victorias en ${roleName(c.role).toLowerCase()}`, a.winRate, b.winRate, fmt.pct)}
      ${row('Tier (OP.GG)', a.tier, b.tier, v => `T${v}`, false)}
      ${row('Ataque (Riot, 0-10)', a.info?.attack, b.info?.attack, v => v, null)}
      ${row('Defensa (Riot, 0-10)', a.info?.defense, b.info?.defense, v => v, null)}
      ${row('Magia (Riot, 0-10)', a.info?.magic, b.info?.magic, v => v, null)}
      ${row('Dificultad (Riot, 0-10)', a.info?.difficulty, b.info?.difficulty, v => v, null)}
    </tbody></table>
    ${mainsBlock(c, me, vs)}
    ${lens.length ? html`<h4 class="bp-h">% de victorias según la duración (minutos, OP.GG)</h4>
      <table class="mu-table mu-len"><thead><tr><th></th>${lens.map(l => html`<th scope="col">${l.label}</th>`)}</tr></thead>
        <tbody>${lenRow(me, a.lengths, true)}${lenRow(vs, b.lengths, false)}</tbody></table>` : ''}
    ${c.tips.data.length ? html`<h4 class="bp-h">Según los datos</h4>${tipList(c.tips.data)}` : ''}
    ${c.tips.against.length ? html`<h4 class="bp-h">Contra ${vs} (consejos de Riot)</h4>${tipList(c.tips.against)}` : ''}
    ${c.tips.opgg ? html`<h4 class="bp-h">Consejo de OP.GG <span class="muted">(en inglés)</span></h4><p class="mu-quote">${c.tips.opgg}</p>` : ''}
    ${c.tips.mine.length ? html`<details class="mu-more"><summary>Cómo jugar ${me} (consejos de Riot)</summary>${tipList(c.tips.mine)}</details>` : ''}`;
}

// Etiquetas de fuente de una build (OP.GG / U.GG / OTP)
const sourceTags = o => (o.sources || [o.source]).filter(Boolean).map(s => html`<span class="src src-${s}" data-tip="${SOURCE_TIPS[s] || ''}">${SOURCES[s] || s}</span>`);

// Panel maestro-detalle de builds: lista agrupada por fuente a la izquierda (orden Mejor / % / Mas
// jugada) y el detalle de la elegida a la derecha. Se usa en Mi seleccion (act 'choose', se importa)
// y en el explorador (act 'expChoose', solo lectura)
// Aviso de la descarga de mains cuando aun no hay builds de mains de este campeon (otp.summary)
function otpNote(info, champId) {
  if (!info) return '';
  const name = Dd.champName(champId);
  const who = (info.mains || []).map(m => m.name).filter(Boolean).join(', ');
  const done = (info.mains || []).reduce((n, m) => n + m.fetched, 0), total = (info.mains || []).reduce((n, m) => n + m.season, 0);
  const text = {
    waiting: `Mains de ${name}: en cola (puesto ${info.queuePos}). Se buscarán en los leaderboards de EUW, KR y NA.`,
    vetting: `Comprobando qué mains de ${name} siguen activos esta season…`,
    downloading: `Descargando la season de ${who}: ${fmt.int(done)} de ${fmt.int(total)} partidas (${fmt.int(info.seasonGames)} con ${name} en esta línea).`,
    ready: `Los mains de ${name} (${who}) no tienen ${info.minGames} partidas en esta línea en los últimos 30 días.`,
    none: `No hay mains de ${name} activos y con bastantes partidas esta season.`,
  }[info.state] || '';
  return text ? html`<div class="bp-group otp-note"><div class="bp-group-head"><span class="src src-otp">${SOURCES.otp}</span><span class="muted">${text}</span></div></div>` : '';
}

// OTP de los que sale una build: "Nombre#TAG", con la region si la etiqueta no la dice ("Hide#0001 (KR)");
// sin nombre todavia, "Jugador de EUW"
const otpName = n => {
  if (!n.name) return `Jugador de ${n.region || '?'}`;
  const tag = n.name.split('#')[1] || '';
  return n.region && !tag.toUpperCase().startsWith(n.region) ? `${n.name} (${n.region})` : n.name;
};
// Linea del detalle con los OTP de la build (como mucho 3; el resto en el tooltip)
function otpByline(otp) {
  const names = otp?.names || [];
  if (!names.length) return '';
  const all = names.map(n => `${otpName(n)}: ${n.games} ${n.games === 1 ? 'partida' : 'partidas'}, ${Math.round(n.wins / n.games * 100)} %`).join('\n');
  return html`<div class="otp-by" data-tip-title="Mains de esta build" data-tip-list="${all}">
    <span class="src src-otp">${SOURCES.otp}</span><span>Build de ${names.slice(0, 3).map((n, k) => html`${k ? ', ' : ''}<b>${otpName(n)}</b> <span class="muted num">(${n.games} ${n.games === 1 ? 'partida' : 'partidas'})</span>`)}${names.length > 3 ? html` <span class="muted">y ${names.length - 3} más</span>` : ''}</span>
  </div>`;
}

// Partidas concretas de una build OTP: rival de linea, resultado y la pagina de runas exacta de cada una
// (cada fila se despliega con el arbol completo, los hechizos y los objetos finales)
function otpMatches(otp, title = 'Partidas de esta build') {
  const list = otp?.matches || [];
  if (!list.length) return '';
  const day = t => new Date(t).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
  const perkNames = r => (r?.perks || []).map(id => Dd.runeName(id)).join('\n');
  const row = m => html`<details class="otp-m">
      <summary class="otp-m-row">
        <span class="otp-m-day muted num">${day(m.t)}</span>
        <span class="otp-m-who">${otpName(m)}</span>
        <span class="otp-m-vs">${m.vs ? html`<span class="muted">vs</span>${icon('champ', m.vs, { size: 22, tip: false, cls: 'enemy' })}<span>${Dd.champName(m.vs)}</span>` : html`<span class="muted">rival desconocido</span>`}</span>
        <span class="otp-m-res ${m.win ? 'win' : 'loss'}">${m.win ? 'Victoria' : 'Derrota'}</span>
        <span class="otp-m-runes" data-tip-title="Runas de esta partida" data-tip-list="${perkNames(m.runes)}">${(m.runes?.perks || []).slice(0, 6).map((id, k) => icon('rune', id, { size: k ? 18 : 24, round: true, cls: 'rune', tip: false }))}</span>
      </summary>
      <div class="otp-m-body">
        <section class="bp-sec bp-runes">${runesView(m.runes)}</section>
        <div class="bp-col">
          ${m.spells?.length ? html`<h4 class="bp-h">Hechizos</h4><div class="item-row">${m.spells.map(id => icon('spell', id, { size: 28 }))}</div>` : ''}
          ${m.items?.length ? html`<h4 class="bp-h">Objetos al acabar</h4><div class="item-row">${m.items.map(id => icon('item', id, { size: 28 }))}</div>` : ''}
        </div>
      </div>
    </details>`;
  return html`<details class="otp-matches"><summary>${title} <span class="muted num">(${list.length}${otp.games > list.length ? ` de ${otp.games}` : ''})</span>: enfrentamiento y runas de cada una</summary>
    <div class="otp-m-list">${list.map(row)}</div></details>`;
}

function buildPanel({ options = [], chosen = 0, act, base, vs, sort = 'best', flags = null, extraHead = '', otpInfo = null }) {
  const o = options[chosen] || null;
  const own = k => (o?.[k]?.length ? o[k] : base?.[k]);
  const b = o ? { ...base, runes: o.runes || base?.runes, core: o.core, boots: o.boots, situational: o.situational, context: o.context,
    starter: own('starter'), spells: own('spells'), skillOrder: own('skillOrder'), skillPriority: own('skillPriority') } : base;
  if (!b) return emptyState({ glyph: 'scroll', title: 'Sin build', text: 'No hay build para esta línea.' });

  const key = { best: smoothWr, wr: x => x.winRate ?? 0, games: x => x.games ?? 0 }[sort] || smoothWr;
  const groups = ['opgg', 'ugg', 'otp'].map(src => ({
    src, rows: options.map((x, i) => ({ x, i })).filter(r => (r.x.source || 'opgg') === src).sort((a, c) => key(c.x) - key(a.x)),
  })).filter(g => g.rows.length);
  const otpPlayers = Math.max(0, ...options.filter(x => x.source === 'otp').map(x => x.otp?.players || 0));
  const groupNote = { opgg: vs ? `contra ${Dd.champName(vs)}` : 'análisis general', ugg: 'Esmeralda+ · mundo',
    otp: `${otpPlayers} ${otpPlayers === 1 ? 'main' : 'mains'} · últimos 30 días` };
  const row = ({ x, i }) => html`<button type="button" class="bp-row ${i === chosen ? 'on' : ''}" data-act="${act}" data-index="${i}" aria-pressed="${i === chosen}"
      data-tip-title="${Dd.runeName(x.keystone)} · ${x.label}" data-tip-list="${[...x.core.map(id => Dd.itemName(id)), x.games ? `${fmt.int(x.games)} partidas (${SOURCES[x.source] || ''})` : '', ...(x.otp?.names || []).map(n => `Main: ${otpName(n)}, ${n.games} partidas`)].filter(Boolean).join('\n')}">
      ${icon('rune', x.keystone, { size: 30, round: true, cls: 'rune bp-row-key', tip: false })}
      <b class="bp-row-name">${Dd.runeName(x.keystone)}</b>
      <b class="bp-row-wr num ${wrCls(x.winRate)}">${pctOr(x.winRate)}</b>
      <span class="bp-row-sub">${x.source === 'otp' && x.otp?.names?.[0] ? otpName(x.otp.names[0]) + (x.otp.names.length > 1 ? ` +${x.otp.names.length - 1}` : '') : x.label}${x.games ? html` · <span class="num">${fmt.int(x.games)}</span>` : ''}</span>
      <span class="bp-row-icos">${x.core.slice(0, 3).map(id => icon('item', id, { size: 22, tip: false }))}</span>
    </button>`;

  // Variantes de runas: una por piedra angular de la lista (clic = la mejor build con esa runa). Solo si
  // hay builds que comparten runa; si no, repetirian la lista
  const byKey = new Map();
  for (const r of groups.flatMap(g => g.rows)) if (!byKey.has(r.x.keystone)) byKey.set(r.x.keystone, r);
  const variants = byKey.size > 1 && byKey.size < options.length ? html`<div class="rv-list" role="group" aria-label="Variantes de runas">${[...byKey.values()].map(({ x, i }) => html`
    <button type="button" class="rv ${x.keystone === o?.keystone ? 'on' : ''}" data-act="${act}" data-index="${i}" data-tip="${Dd.runeName(x.keystone)} (${SOURCES[x.source] || ''})">
      ${icon('rune', x.keystone, { size: 22, round: true, cls: 'rune', tip: false })}<span class="rv-txt"><b class="num ${wrCls(x.winRate)}">${pctOr(x.winRate)}</b><span class="num">${x.games ? fmt.int(x.games) : '—'}</span></span>
    </button>`)}</div>` : '';

  const list = options.length ? html`<div class="bp-list">
      <div class="seg bp-sort" role="group" aria-label="Ordenar builds">${BUILD_SORTS.map(s => html`<button type="button" class="${s.id === sort ? 'on' : ''}" data-act="buildSort" data-sort="${s.id}" data-tip="${s.tip}">${s.label}</button>`)}</div>
      ${groups.map(g => html`<div class="bp-group"><div class="bp-group-head"><span class="src src-${g.src}">${SOURCES[g.src]}</span><span class="muted">${groupNote[g.src]}</span></div>${g.rows.map(row)}</div>`)}
      ${groups.some(g => g.src === 'otp') ? '' : otpNote(otpInfo, base?.championId)}
      <p class="bp-foot muted">Las partidas de cada fuente no son comparables entre sí.</p>
    </div>` : '';

  return html`<div class="bp ${options.length ? '' : 'solo'}">
    ${list}
    <div class="bp-detail" aria-live="polite">
      <div class="bp-dhead">
        ${o ? html`${icon('rune', o.keystone, { size: 30, round: true, cls: 'rune key' })}<span class="bp-dtitle"><b>${Dd.runeName(o.keystone)}</b><span class="muted">${o.label}</span></span>${sourceTags(o)}`
          : html`<span class="bp-dtitle"><b>Build más jugada</b></span>`}
        <span class="spacer"></span>
        ${(o || b).games ? html`<span class="bp-dstat num"><b class="${wrCls((o || b).winRate)}">${pctOr((o || b).winRate)}</b> <span class="muted">· ${fmt.int((o || b).games)} partidas</span></span>` : ''}
        ${extraHead}
      </div>
      ${o ? otpByline(o.otp) : ''}
      ${o ? otpMatches(o.otp) : ''}
      ${variants}
      <div class="bp-grid">
        <section class="bp-sec bp-runes"><h4 class="bp-h">Runas</h4>${runesView(b.runes)}</section>
        <div class="bp-col">
          ${b.spells?.length ? html`<section class="bp-sec"><h4 class="bp-h">Hechizos</h4><div class="item-row">${b.spells.map(id => icon('spell', id, { size: 34 }))}</div></section>` : ''}
          <section class="bp-sec"><h4 class="bp-h">Objetos</h4>
            ${itemsBlocks(b)}
          </section>
        </div>
      </div>
      ${skillsView(b.skillOrder, b.skillPriority)}
      ${flags ? contextBlock(b.context, flags) : ''}
    </div>
  </div>`;
}

App.register('select', {
  channels: ['draft', 'recs', 'config', 'champions', 'state', 'otp'],

  mount(el) {
    this.el = el;
    this.pickSort = lsGet('lolcoach.pickSort', 'score');
    this.buildSort = lsGet('lolcoach.buildSort', 'best');
    this.pickTags = new Set();
    setHtml(el, html`<div class="draft-view">
      <aside class="sel-side">
        <div class="card team ally" id="selAllies"></div>
      </aside>
      <div class="sel-center" id="selCenter">
        <div class="sel-banner" id="selBanner"></div>
        <div class="seg sel-tabs" role="tablist" aria-label="Vista de la selección">
          <button type="button" role="tab" data-tab="mine">Mi selección</button><button type="button" role="tab" data-tab="explore">Explorar campeón</button>
        </div>
        <div class="sel-main">
          <div class="card picks-card" id="selPicks"></div>
          <div class="card build-card" id="selBuild"></div>
          <div class="card mu-card" id="selMatchup"></div>
          <div class="card ai-card" id="selAi"></div>
        </div>
        <div class="sel-explore-slot" id="selExploreSlot"></div>
      </div>
      <aside class="sel-side">
        <div class="card team enemy" id="selEnemies"></div>
        <div class="card" id="selRecs"></div>
      </aside>
      <div class="sel-idle" id="selIdle"><div class="sel-idle-note" id="selIdleNote"></div></div>
    </div>`);
    this.buildExplore();

    el.addEventListener('click', e => {
      const t = e.target.closest('[data-act]');
      if (!t || t.disabled) return;
      const act = t.dataset.act;
      if (act === 'hover') {
        window.api.action('hoverChampion', { championId: +t.dataset.id })
          .then(() => App.toast(`${Dd.champName(+t.dataset.id)} fijado`, 'ok'))
          .catch(err => App.toast(err.message || 'No se pudo fijar el campeón', 'error'));
      } else if (act === 'lock') {
        const id = +t.dataset.id;
        t.disabled = true;
        t.classList.add('busy');
        window.api.action('lockChampion', { championId: id })
          .then(() => App.toast(`${Dd.champName(id)} bloqueado`, 'ok'))
          .catch(err => App.toast(err.message || 'No se pudo bloquear el campeón', 'error'))
          .finally(() => { t.disabled = false; t.classList.remove('busy'); });
      } else if (act === 'pinNext') {
        const id = +t.dataset.id;
        window.api.setConfig({ pick: { id, name: Dd.champName(id) } });
        App.toast(`${Dd.champName(id)} preseleccionado para la próxima selección (si te toca tu posición principal)`, 'ok');
      } else if (act === 'import' || act === 'importItems') {
        t.disabled = true;
        t.classList.add('busy');
        window.api.action(act === 'import' ? 'importBuild' : 'importItems')
          .then(r => {
            if (act !== 'importItems') return;
            if (r?.items === 'ok') App.toast('Objetos en la tienda: búscalos en el desplegable de sets', 'ok');
            else App.toast(r?.message || 'No se pudieron importar los objetos', 'error');
          })
          .catch(err => App.toast(err.message || 'No se pudo importar', 'error'))
          .finally(() => { t.disabled = false; t.classList.remove('busy'); });
      } else if (act === 'choose') {
        // Respuesta inmediata en la lista; el detalle llega con el borrador
        $$('.bp-row', t.closest('.bp')).forEach(r => { r.classList.toggle('on', r.dataset.index === t.dataset.index); });
        window.api.action('chooseBuild', { index: +t.dataset.index })
          .then(() => { if (App.data.draft?.locked) App.toast('Build cambiada: runas y objetos reimportados', 'ok'); })
          .catch(err => App.toast(err.message || 'No se pudo cambiar la build', 'error'));
      } else if (act === 'buildSort') {
        this.buildSort = t.dataset.sort;
        lsSet('lolcoach.buildSort', this.buildSort);
        this.renderBuild();
        this.renderExplore();
      } else if (act === 'pickSort') {
        this.pickSort = t.dataset.sort;
        lsSet('lolcoach.pickSort', this.pickSort);
        this.renderPicks();
      } else if (act === 'picksAll') {
        this.picksAll = !this.picksAll;
        this.renderPicks();
      } else if (act === 'pickTag') {
        const tag = t.dataset.tag;
        if (this.pickTags.has(tag)) this.pickTags.delete(tag); else this.pickTags.add(tag);
        this.renderPicks();
      } else if (act === 'ban') {
        const id = +t.dataset.id;
        window.api.setConfig({ ban: { id, name: Dd.champName(id) } });
        App.toast(`${Dd.champName(id)} será tu baneo`, 'ok');
      } else if (act === 'aiDraft') {
        this.askCoach();
      } else if (act === 'settings') {
        App.go('settings');
      } else if (act === 'explore') {
        // Counter, sinergia o pick recomendado: abrirlo en el explorador (en su linea)
        this.tab = 'explore';
        this.loadExplore(+t.dataset.id, t.dataset.role || '', true);
        this.placeExplore();
      } else if (act === 'expRole') {
        if (this.exp.championId) this.loadExplore(this.exp.championId, t.dataset.role, true);
      } else if (act === 'expChoose') {
        this.expChoice = +t.dataset.index;
        this.renderExplore();
      } else if (act === 'testMatchup') {
        this.runMatchupTest();
      } else if (act === 'closeMatchupTest') {
        this.muTest = null;
        this.renderExplore();
      } else if (act === 'expTab') {
        this.expTab = t.dataset.tab;
        lsSet('lolcoach.expTab', this.expTab);
        this.renderExplore();
      }
    });
    $('.sel-tabs', el).addEventListener('click', e => {
      const b = e.target.closest('[data-tab]');
      if (!b) return;
      this.tab = b.dataset.tab;
      this.placeExplore();
    });
    this.renderAll();
  },

  update(channel) {
    if (channel === 'config') { this.renderExplore(); return this.applyBan(); }
    if (channel === 'recs') return this.renderRecs();
    if (channel === 'otp') {
      // Partidas OTP nuevas del campeon que estas explorando: se recarga sin perder la vista
      const id = App.data.otp?.championId;
      if (id && this.exp && id === this.exp.championId && !this.exp.loading) this.loadExplore(id, this.exp.role, this.exp.manual);
      return;
    }
    if (channel === 'state') {
      this.renderBanner();
      this.renderIdle();
      // El estado llega cada segundo: la tarjeta de IA solo se repinta si cambia su disponibilidad
      const ai = JSON.stringify(App.data.state?.ai);
      if (ai !== this.aiSig) { this.aiSig = ai; this.renderAi(); }
      return;
    }
    if (channel === 'champions') { this.exp.picker.refresh(); this.exp.vsPicker.refresh(); this.renderExplore(); }
    this.renderAll();
  },

  renderAll() {
    const d = App.data.draft;
    const active = !!d?.active;
    // Cada seleccion empieza sin consejo, en "Mi seleccion" y con el explorador siguiendo a tu campeon
    if (!active) this.ai = null;
    if (active && !this.wasActive) { this.tab = 'mine'; this.exp.manual = false; this.pickTags.clear(); this.picksAll = false; }
    this.wasActive = active;
    const view = this.el.querySelector('.draft-view');
    view.classList.toggle('idle', !active);
    // Con el campeon bloqueado lo importante es la build: va antes que los picks
    view.classList.toggle('locked', !!(active && d.locked));
    this.placeExplore();
    this.syncExplore();
    // Botones Fijar/Bloquear del explorador: dependen del turno y de tu campeon
    const lockSig = [active, d?.locked, d?.turn, d?.myChampionId].join();
    if (lockSig !== this.lockSig) { this.lockSig = lockSig; this.renderExplore(); }
    this.renderBanner();
    this.renderTeams();
    this.renderPicks();
    this.renderBuild();
    this.renderMatchup();
    this.renderRecs();
    this.renderAi();
    this.renderIdle();
    this.applyBan();
  },

  // ---------- Tu enfrentamiento: comparativa y consejos (OP.GG, U.GG y Data Dragon; sin IA) ----------
  renderMatchup() {
    const box = $('#selMatchup');
    const d = App.data.draft;
    const c = d?.active && d.myChampionId ? d.matchupCheck : null;
    if (!c || c.me !== d.myChampionId) {
      return selPaint(box, d?.active && d.myChampionId ? html`<div class="card-head"><h2>Tu enfrentamiento</h2></div>
        <p class="muted mu-wait">Aparece cuando se revele tu rival de línea.</p>` : '');
    }
    selPaint(box, matchupCard(c));
  },

  renderAi() {
    const box = $('#selAi');
    if (!App.data.draft?.active) return selPaint(box, '');
    const ai = App.data.state?.ai || {};
    const st = this.ai;
    const why = ai.mode === 'api' ? 'Añade una clave de Anthropic en Ajustes' : 'No se encuentra Claude Code en este equipo';
    const via = ai.mode === 'api' ? 'API de Anthropic' : 'Claude local';
    selPaint(box, html`<div class="card-head"><h2>Coach IA</h2><span class="sub">${via}</span><span class="spacer"></span>
        <span ${!ai.ready ? raw(`data-tip="${why}"`) : ''}><button class="btn btn-primary small" data-act="aiDraft" ${!ai.ready || st?.loading ? 'disabled' : ''}>${raw(SVG.spark)}${st?.text ? 'Actualizar consejo' : 'Pedir consejo'}</button></span></div>
      ${st?.loading ? html`<div class="ai-loading"><span class="spinner small"></span><span>Claude está estudiando la selección...</span></div>`
        : st?.error ? html`<div class="notice error">${raw(SVG.warn)}<span class="grow">${st.error}</span></div>`
        : st?.text ? html`<div class="ai-text">${miniMarkdown(st.text)}</div>`
        : html`<p class="muted ai-hint">${ai.ready ? 'Baneo, pick y plan de partida según los equipos que se ven ahora. Pídelo otra vez cuando se revelen más campeones.' : html`${why}. <button class="link" data-act="settings">Ir a Ajustes</button>`}</p>`}`);
  },

  askCoach() {
    this.ai = { loading: true };
    this.renderAi();
    window.api.action('askDraftCoach')
      .then(r => { this.ai = { text: r.text }; })
      .catch(err => { this.ai = { error: err?.message || 'No se pudo pedir el consejo' }; })
      .finally(() => { if (App.data.draft?.active) this.renderAi(); });
  },

  // Baneo elegido (se configura en Inicio > Cliente): resaltado en los baneos recomendados
  applyBan() {
    const c = App.data.config;
    if (!c) return;
    $$('.rec-btn', this.el).forEach(b => {
      const on = +b.dataset.id === c.ban?.id;
      b.classList.toggle('on', on);
      b.setAttribute('aria-pressed', String(on));
    });
  },

  // ---------- Cabecera de estado: lo mas importante primero (tu turno, tu campeon, tu enfrentamiento) ----------
  renderBanner() {
    const d = App.data.draft;
    const box = $('#selBanner');
    if (!d?.active) return selPaint(box, '');
    const me = d.myChampionId;
    let text, sub;
    if (d.locked && me) { text = `${Dd.champName(me)} bloqueado`; sub = 'Revisa la build e impórtala antes de que empiece la partida.'; }
    else if (me) { text = `${Dd.champName(me)} preseleccionado`; sub = 'Pulsa un pick recomendado para cambiarlo.'; }
    else { text = 'Elige a tu campeón'; sub = `Recomendaciones para ${roleName(d.role).toLowerCase()}.`; }
    const turn = d.turn === 'ban' ? html`<span class="turn ban">Te toca banear</span>`
      : d.turn === 'pick' ? html`<span class="turn pick">Te toca elegir</span>` : '';
    // Tu enfrentamiento: % de victorias de tu campeon contra tu rival de linea (U.GG, Esmeralda+)
    const m = me && d.matchup;
    const matchup = m ? html`<div class="banner-matchup ${m.winRate >= .5 ? 'good' : 'bad'}" data-tip="${Dd.champName(me)} contra ${Dd.champName(m.vs)} en ${roleName(d.role).toLowerCase()}: ${fmt.int(m.games)} partidas en Esmeralda+ (U.GG, todas las regiones)">
        <span class="bm-label">Tu enfrentamiento</span>
        <span class="bm-row">${icon('champ', me, { size: 28, tip: false })}<span class="bm-vs">vs</span>${icon('champ', m.vs, { size: 28, tip: false, cls: 'enemy' })}
          <b class="num ${wrCls(m.winRate)}">${fmt.pct(m.winRate)}</b></span>
        <span class="bm-sub num">${fmt.int(m.games)} partidas${m.games < 200 ? ' · poca muestra' : ''}</span>
      </div>` : '';
    selPaint(box, html`${me ? icon('champ', me, { size: 48, cls: 'banner-ico', tip: false }) : html`<span class="banner-role">${roleName(d.role)}</span>`}
      <div class="banner-text"><div class="banner-title">${text}${turn}</div>
        <div class="banner-sub">${me ? html`<span class="role-pill">${roleName(d.role)}</span>` : ''}${sub}${d.phase ? html` <span class="muted">· Fase: ${d.phase}</span>` : ''}</div></div>
      ${matchup}
      ${d.locked ? html`<span class="tag blue lock-tag">${raw(SVG.check)}Bloqueado</span>` : html`<span class="tag lock-tag">Sin bloquear</span>`}`);
  },

  // ---------- Equipos ----------
  renderTeams() {
    const d = App.data.draft;
    const allies = $('#selAllies'), enemies = $('#selEnemies');
    if (!d?.active) { selPaint(allies, ''); selPaint(enemies, ''); return; }
    const slots = (list, side) => {
      const out = [];
      for (let i = 0; i < 5; i++) {
        const p = list[i];
        const name = p?.championId ? Dd.champName(p.championId) : (side === 'ally' ? 'Eligiendo...' : 'Sin revelar');
        out.push(html`<div class="slot ${p?.isMe ? 'me' : ''} ${p?.championId ? '' : 'pending'}">
          ${p?.championId ? icon('champ', p.championId, { size: 42 }) : html`<span class="ico slot-empty" data-vars="--s:42px"></span>`}
          <div class="slot-txt"><div class="slot-name">${name}</div>
            <div class="slot-sub">${p?.isMe ? html`<b class="you">Tú</b> · ` : ''}${p?.position ? roleName(p.position) : side === 'ally' ? `Jugador ${i + 1}` : `Enemigo ${i + 1}`}</div></div>
        </div>`);
      }
      return out;
    };
    const bans = ids => html`<div class="bans">${[0, 1, 2, 3, 4].map(i => ids?.[i] ? html`<span class="ban">${icon('champ', ids[i], { size: 28 })}</span>` : html`<span class="ban none"></span>`)}</div>`;
    selPaint(allies, html`<div class="card-head"><h2>Tu equipo</h2></div>${slots(d.allies || [], 'ally')}<div class="bans-label">Baneos</div>${bans(d.bans?.ally)}`);
    selPaint(enemies, html`<div class="card-head"><h2>Enemigos</h2></div>${slots(d.enemies || [], 'enemy')}<div class="bans-label">Baneos</div>${bans(d.bans?.enemy)}`);
  },

  // ---------- Picks recomendados: ordenar, filtrar por etiqueta y desplegar los motivos ----------
  renderPicks() {
    const d = App.data.draft;
    const box = $('#selPicks');
    if (!d?.active) return selPaint(box, '');
    const head = (tools = '') => html`<div class="card-head"><h2>Picks recomendados</h2><span class="sub">${roleName(d.role)}</span><span class="spacer"></span>${tools}</div>`;
    if (d.error) return selPaint(box, html`${head()}<div class="notice error">${raw(SVG.warn)}<span class="grow">${d.error}</span></div>`);
    if (d.loading && !d.picks?.length) return selPaint(box, html`${head()}${skeletonRows(4)}`);
    if (!d.picks?.length) return selPaint(box, html`${head()}${emptyState({ glyph: 'swords', title: 'Sin recomendaciones', text: 'No hay datos suficientes para este rol todavía.' })}`);

    const tags = TAG_ORDER.filter(t => d.picks.some(p => p.tags.includes(t)));
    for (const t of [...this.pickTags]) if (!tags.includes(t)) this.pickTags.delete(t);
    const sortKey = { score: p => p.score, meta: p => p.metaWinRate ?? 0, mine: p => p.personal?.games ?? 0 }[this.pickSort] || (p => p.score);
    const list = d.picks.map((p, rank) => ({ p, rank }))
      .filter(({ p }) => [...this.pickTags].every(t => p.tags.includes(t)))
      .sort((a, b) => sortKey(b.p) - sortKey(a.p) || a.rank - b.rank);
    const max = Math.max(...d.picks.map(p => Math.abs(p.score)), 1);

    const tools = html`<div class="seg pick-sort" role="group" aria-label="Ordenar picks">${PICK_SORTS.map(s => html`<button type="button" class="${s.id === this.pickSort ? 'on' : ''}" data-act="pickSort" data-sort="${s.id}" data-tip="${s.tip}">${s.label}</button>`)}</div>`;
    const filters = tags.length > 1 ? html`<div class="pick-filters" role="group" aria-label="Filtrar por etiqueta"><span class="muted small">Filtrar:</span>${tags.map(t => html`<button type="button" class="tag ${TAG_INFO[t]?.cls || ''} ${this.pickTags.has(t) ? 'on' : ''}" data-act="pickTag" data-tag="${t}" aria-pressed="${this.pickTags.has(t)}" data-tip="${TAG_INFO[t]?.tip || ''}">${t}</button>`)}</div>` : '';

    const card = ({ p, rank }) => {
      const name = Dd.champName(p.championId);
      const mine = p.championId === d.myChampionId;
      const k = `pick:${p.championId}`;
      return html`<div class="pick xp ${xpOpen(k)} ${mine ? 'mine' : ''} ${rank === 0 ? 'best' : ''}">
        <div class="pick-row">
          <button type="button" class="pick-main" data-act="hover" data-id="${p.championId}" ${d.locked ? 'disabled' : ''}
              data-tip-title="${name}" data-tip-list="${p.reasons.join('\n')}${d.locked ? '' : '\nClic para marcarlo en el cliente'}">
            <span class="pick-rank num">${rank + 1}</span>
            ${icon('champ', p.championId, { size: 44, tip: false })}
            <span class="pick-txt">
              <span class="pick-name">${name}${rank === 0 ? html`<span class="pick-best">Mejor opción</span>` : ''}${mine ? html`<span class="pick-best you">Tu campeón</span>` : ''}</span>
              <span class="pick-tags">${p.tags.map(t => html`<span class="tag ${TAG_INFO[t]?.cls || ''}">${t}</span>`)}</span>
            </span>
            <span class="pick-meta">
              <span class="num">T${p.metaTier ?? '—'} · <b class="${wrCls(p.metaWinRate)}">${pctOr(p.metaWinRate)}</b></span>
              <span class="num muted">${p.personal ? `Tú: ${fmt.pct(p.personal.winRate)} en ${p.personal.games}` : 'Sin partidas tuyas'}</span>
            </span>
            <span class="pick-score ${p.score >= 0 ? 'pos' : 'neg'}" data-tip="Puntos sobre la media (meta, tu historial, counters y sinergias)"><b class="num">${fmt.signed(p.score, 1)}</b><i data-vars="--w:${(Math.abs(p.score) / max * 100).toFixed(0)}%"></i></span>
          </button>
          <button type="button" class="pick-more xp-head" data-expand="${k}" aria-expanded="${xpExpanded(k)}" aria-label="Ver por qué se recomienda ${name}" data-tip="Por qué se recomienda">${raw(SVG.chevron.replace('<svg', '<svg class="xp-chev"'))}</button>
        </div>
        <div class="xp-body"><div><div class="pick-detail">
          <ul class="pick-reasons">${p.reasons.map(r => html`<li class="${/^(Sufre|Pierde)/.test(r) ? 'bad' : ''}">${r}</li>`)}</ul>
          <div class="pick-actions">
            <button type="button" class="btn small ghost" data-act="explore" data-id="${p.championId}" data-role="${d.role}">${raw(SVG.search)}Ver su build</button>
            ${d.locked ? '' : champButtons(p.championId, d)}
          </div>
        </div></div></div>
      </div>`;
    };
    // Solo los primeros a la vista (lo importante primero); el resto, a un clic
    const shown = this.picksAll || this.pickTags.size ? list : list.slice(0, PICKS_SHOWN);
    const more = list.length > PICKS_SHOWN && !this.pickTags.size
      ? html`<button type="button" class="btn small ghost picks-more" data-act="picksAll">${raw(SVG.chevron.replace('<svg', `<svg class="${this.picksAll ? 'flip' : ''}"`))}${this.picksAll ? 'Ver menos' : `Ver los ${list.length} picks`}</button>` : '';
    selPaint(box, html`${head(tools)}${filters}
      ${list.length ? html`<div class="picks">${shown.map(card)}</div>${more}` : html`<p class="muted pick-none">Ningún pick tiene todas esas etiquetas. <button class="link" data-act="pickTag" data-tag="${[...this.pickTags][0] || ''}">Quitar un filtro</button></p>`}`);
  },

  // ---------- Build de tu campeon: lista unificada (OP.GG + U.GG) y detalle; la elegida se importa ----------
  renderBuild() {
    const d = App.data.draft;
    const box = $('#selBuild');
    if (!d?.active) return selPaint(box, '');
    const b = d.build;
    if (!b) {
      return selPaint(box, html`<div class="card-head"><h2>Build</h2></div>
        ${d.loading && d.myChampionId ? loadingState('Cargando builds de OP.GG y U.GG...') : emptyState({ glyph: 'scroll', title: 'Sin build', text: d.myChampionId ? 'No hay build disponible para este campeón y rol.' : 'Marca un campeón para ver sus builds, runas, hechizos y objetos.' })}`);
    }
    const imp = d.imported || {};
    const impChip = (k, label) => imp[k] ? html`<span class="tag ${imp[k] === 'ok' ? 'green' : 'red'}">${raw(imp[k] === 'ok' ? SVG.check : SVG.cross)}${label}</span>` : '';
    const auto = App.data.config?.autoImport || {};
    const autoOn = auto.runes || auto.spells || auto.items;
    const n = b.options?.length || 0;
    selPaint(box, html`<div class="card-head build-head">
        ${icon('champ', b.championId, { size: 32 })}
        <h2>${Dd.champName(b.championId)}</h2><span class="sub">${roleName(b.role)}${n ? ` · ${n} build${n > 1 ? 's' : ''}` : ''}</span>
        <span class="spacer"></span>
        <button class="btn small" data-act="importItems" data-tip="Crea el set «LoL Coach» en la tienda del juego con la build elegida: inicio, núcleo, botas, situacionales y consumibles">Solo objetos a la tienda</button>
        <button class="btn btn-primary small" data-act="import" data-tip="Importa al cliente las runas, los hechizos y los objetos de la build elegida">${raw(SVG.arrow)}Importar build</button>
      </div>
      ${imp.message || imp.runes || imp.spells || imp.items ? html`<div class="imported">${impChip('runes', 'Runas')}${impChip('spells', 'Hechizos')}${impChip('items', 'Objetos')}<span class="muted">${imp.message || ''}</span></div>` : ''}
      ${n > 1 ? html`<p class="build-hint muted">${d.locked && autoOn ? 'Ya has bloqueado: al elegir otra build se reimportan sus runas y objetos al momento.' : autoOn ? 'Elige una build: se importará sola al bloquear el campeón.' : 'Elige una build y pulsa «Importar build».'}</p>` : ''}
      ${buildPanel({ options: b.options || [], chosen: d.choice ?? 0, act: 'choose', base: b, vs: b.vs, sort: this.buildSort, flags: b.enemyFlags || [], otpInfo: b.otpInfo })}`);
  },

  // ---------- Baneos recomendados ----------
  renderRecs() {
    const recs = App.data.recs;
    const box = $('#selRecs');
    const ban = App.data.config?.ban?.id;
    const row = r => html`<div class="rec">
      <div class="rec-title">${r.title}</div>
      ${r.items?.length ? html`<div class="rec-items">${r.items.filter(i => i.id).map(i => html`
        <button class="rec-btn ${i.id === ban ? 'on' : ''}" data-act="ban" data-id="${i.id}" aria-pressed="${i.id === ban}" data-tip-title="${i.name}" data-tip="${i.tip || ''}\nClic para banearlo">
          ${icon('champ', i.id, { size: 30, tip: false })}<span class="rec-name">${i.name}</span><span class="rec-val num">${i.text}</span></button>`)}</div>`
        : html`<p class="muted small">${r.empty}</p>`}
    </div>`;
    selPaint(box, html`<div class="card-head"><h2>Baneos recomendados</h2></div>
      ${recs ? html`${recs.counter ? html`${row(recs.counter)}<div class="sep"></div>` : ''}${row(recs.global)}<div class="sep"></div>${row(recs.mine)}` : skeletonRows(3)}`);
  },

  // ---------- Fuera de la seleccion: aviso corto y el explorador en el centro ----------
  renderIdle() {
    const box = $('#selIdleNote');
    if (App.data.draft?.active) return selPaint(box, '');
    const conn = App.data.state?.connected;
    selPaint(box, html`${raw(SVG[conn ? 'swords' : 'plug'] || '')}<span>${conn
      ? 'Fuera de la selección. Al entrar en ella verás aquí los equipos, los picks recomendados y la build lista para importar.'
      : 'Cliente cerrado. Los ajustes de pick y baneo se aplicarán en tu próxima selección.'}</span>`);
  },

  // ---------- Explorador de campeon (OP.GG + U.GG por linea) ----------
  // Un solo elemento que se mueve: al centro fuera de la seleccion y a la pestana "Explorar" dentro
  buildExplore() {
    const el = document.createElement('div');
    el.className = 'card explore-card';
    setHtml(el, html`<div class="card-head explore-head"><h2>Explorar campeón</h2><span class="spacer"></span>
        <div data-slot="picker"></div><span class="exp-vs-label">contra</span><div data-slot="vs"></div>
      </div>
      <div class="explore-body"></div>`);
    const picker = ChampPicker({
      source: () => App.data.champions?.all || [], label: 'Campeón a explorar', placeholder: 'Busca un campeón',
      onChange: v => { if (v) this.loadExplore(v.id, '', true); },
    });
    // Rival para comprobar enfrentamientos; vacio = el mas jugado de la linea
    const vsPicker = ChampPicker({
      source: () => (App.data.champions?.all || []).filter(c => c.id !== this.exp.championId),
      label: 'Rival de línea', placeholder: 'Rival más jugado',
      onChange: v => {
        this.exp.vs = v?.id || null;
        if (this.exp.championId) this.loadExplore(this.exp.championId, this.exp.role, true);
      },
    });
    vsPicker.el.classList.add('exp-vs-picker');
    $('[data-slot="picker"]', el).replaceWith(picker.el);
    $('[data-slot="vs"]', el).replaceWith(vsPicker.el);
    this.exp = { el, picker, vsPicker, championId: null, role: '', vs: null, manual: false, data: null, loading: false, error: null };
    this.expReq = 0;
    this.tab = 'mine';
    // Pestana del visor: se recuerda al cambiar de campeon y entre sesiones ("Build" por defecto)
    this.expTab = lsGet('lolcoach.expTab', 'build');
    if (!EXP_TABS.some(t => t.id === this.expTab)) this.expTab = 'build';
    this.renderExplore();
  },

  placeExplore() {
    const view = this.el.querySelector('.draft-view');
    const active = !!App.data.draft?.active;
    const target = active ? $('#selExploreSlot') : $('#selIdle');
    if (this.exp.el.parentNode !== target) target.appendChild(this.exp.el);
    view.classList.toggle('exploring', active && this.tab === 'explore');
    $$('.sel-tabs [data-tab]', this.el).forEach(b => {
      b.classList.toggle('on', b.dataset.tab === this.tab);
      b.setAttribute('aria-selected', String(b.dataset.tab === this.tab));
    });
  },

  // Campeon por defecto: en la seleccion, el tuyo y tu rol (hasta que elijas otro); fuera, tu preseleccion
  syncExplore() {
    const d = App.data.draft;
    if (d?.active && !this.exp.manual && d.myChampionId) {
      if (d.myChampionId !== this.exp.championId || (d.role && d.role !== this.exp.role && !this.exp.loading)) this.loadExplore(d.myChampionId, d.role || '', false);
    } else if (!this.exp.championId && App.data.champions?.all?.length) {
      const id = App.data.config?.pick?.id || App.data.profile?.champions?.[0]?.championId;
      if (id) this.loadExplore(id, '', false);
    }
  },

  loadExplore(championId, role, manual) {
    if (!championId) return;
    // El rival elegido se conserva al cambiar de campeon o linea, salvo que sea el mismo campeon
    if (this.exp.vs === championId) { this.exp.vs = null; this.exp.vsPicker.set(null); }
    Object.assign(this.exp, { championId, role: role || '', manual: manual || this.exp.manual, loading: true, error: null });
    this.exp.picker.set({ id: championId, name: Dd.champName(championId) });
    const req = ++this.expReq;
    this.renderExplore();
    window.api.action('championStats', { championId, role: role || '', vs: this.exp.vs || null })
      .then(data => { if (req === this.expReq) Object.assign(this.exp, { data, role: data.role, loading: false }); })
      .catch(err => { if (req === this.expReq) Object.assign(this.exp, { loading: false, error: err?.message || 'No se pudieron cargar las estadísticas' }); })
      .finally(() => { if (req === this.expReq) this.renderExplore(); });
  },

  // Cabecera fija (campeon, filtros y cifras clave) y debajo una sola seccion, elegida en pestanas
  renderExplore() {
    const x = this.exp;
    if (!x) return;
    const body = $('.explore-body', x.el);
    if (!x.championId) return selPaint(body, emptyState({ glyph: 'swords', title: 'Elige un campeón', text: 'Busca cualquier campeón para ver sus builds, counters y sinergias según la línea.' }));
    if (x.error) return selPaint(body, html`<div class="notice error">${raw(SVG.warn)}<span class="grow">${x.error}</span></div>`);
    const s = x.data;
    if (!s || s.championId !== x.championId) return selPaint(body, html`<div class="exp-top"><span class="skel ico-skel"></span><span class="skel-lines"><span class="skel line-skel"></span><span class="skel line-skel short"></span></span></div>${skeletonRows(4)}`);
    const dmg = { AD: 'Daño físico', AP: 'Daño mágico', BOTH: 'Daño mixto' }[s.damageType];
    const sections = { build: () => this.exploreBuild(s), context: () => this.exploreContext(s), counters: () => this.exploreCounters(s), synergies: () => this.exploreSynergies(s) };
    const stat = (label, value, cls = '', tip = '') => html`<div class="exp-stat" ${tip ? raw(`data-tip="${esc(tip)}"`) : ''}><span class="exp-stat-label">${label}</span><b class="num ${cls}">${value}</b></div>`;
    const patch = s.ugg?.patch ? String(s.ugg.patch).replace('_', '.') : null;

    selPaint(body, html`
      <div class="exp-top ${x.loading ? 'is-loading' : ''}">
        ${icon('champ', s.championId, { size: 56 })}
        <div class="exp-title">
          <div class="exp-name">${Dd.champName(s.championId)}</div>
          <div class="exp-filters">
            <div class="seg exp-roles" role="group" aria-label="Línea del explorador">${ROLES.map(r => html`<button type="button" class="${r === s.role ? 'on' : ''}" data-act="expRole" data-role="${r}">${roleName(r)}</button>`)}</div>
            ${s.vs && !s.vsManual ? html`<span class="chip" data-tip="Sin rival elegido: las builds de OP.GG salen de la guía contra el rival más jugado de la línea. Elige otro arriba, en «contra».">${icon('champ', s.vs, { size: 18, tip: false })}contra ${Dd.champName(s.vs)} (más jugado)</span>` : ''}
            ${patch ? html`<span class="chip" data-tip="Parche de los datos de U.GG">U.GG ${patch} · Esmeralda+</span>` : ''}
            ${dmg ? html`<span class="chip">${dmg}</span>` : ''}
          </div>
        </div>
        <div class="exp-actions">${champButtons(s.championId, App.data.draft)}</div>
      </div>
      <div class="exp-stats">
        ${s.matchup ? stat(`vs ${Dd.champName(s.matchup.vs)}`, pctOr(s.matchup.winRate), wrCls(s.matchup.winRate),
          s.matchup.source ? `Tu % de victorias contra ${Dd.champName(s.matchup.vs)} en ${roleName(s.role).toLowerCase()} (${s.matchup.source}${s.matchup.games ? `, ${fmt.int(s.matchup.games)} partidas` : ''})` : 'Sin datos suficientes de este enfrentamiento') : ''}
        ${stat('Tier', s.stats.tier ? html`<span class="tier-badge t${s.stats.tier}">${s.stats.tier}</span>` : '—', '', s.stats.rank ? `Puesto ${s.stats.rank} en la línea (OP.GG)` : '')}
        ${stat('% victorias', pctOr(s.stats.winRate), wrCls(s.stats.winRate), 'OP.GG')}
        ${stat('% selección', pctOr(s.stats.pickRate), '', 'OP.GG')}
        ${stat('% baneos', pctOr(s.stats.banRate), '', 'OP.GG')}
        ${s.stats.rank ? stat('Puesto', `#${s.stats.rank}`, '', 'Posición en la tier list de la línea (OP.GG)') : ''}
        ${s.ugg?.games ? stat('Partidas', fmt.int(s.ugg.games), '', 'Partidas en U.GG (Esmeralda+, todas las regiones)') : ''}
      </div>
      ${s.vs ? html`<div class="mu-test-bar"><button class="btn small" data-act="testMatchup" ${this.muTest?.loading ? 'disabled' : ''}
          data-tip="Muestra la tarjeta «Tu enfrentamiento» de la selección con datos reales de ${Dd.champName(s.championId)} contra ${Dd.champName(s.vs)} en ${roleName(s.role).toLowerCase()}. Cambia el rival en «contra».">${raw(SVG.swords || '')}Probar «Tu enfrentamiento»</button>
        <span class="muted small">${Dd.champName(s.championId)} vs ${Dd.champName(s.vs)}${s.vsManual ? '' : ' (rival más jugado)'}</span></div>` : ''}
      ${this.matchupTestPanel(s)}
      <div class="seg exp-tabs" role="tablist" aria-label="Secciones del explorador">${EXP_TABS.map(t => html`<button type="button" role="tab" class="${t.id === this.expTab ? 'on' : ''}" aria-selected="${t.id === this.expTab}" data-act="expTab" data-tab="${t.id}">${t.label}</button>`)}</div>
      <div class="exp-section ${x.loading ? 'is-loading' : ''}">${(sections[this.expTab] || sections.build)()}</div>`);
  },

  // Prueba de "Tu enfrentamiento" desde el explorador: solo se ve mientras sigan el mismo campeon, linea y rival
  matchupTestKey(s) {
    return s ? `${s.championId}|${s.role}|${s.vs}` : '';
  },

  matchupTestPanel(s) {
    const t = this.muTest;
    if (!t || t.key !== this.matchupTestKey(s)) return '';
    const close = html`<button type="button" class="btn small ghost mu-test-close" data-act="closeMatchupTest" aria-label="Cerrar la prueba">Cerrar</button>`;
    const tag = html`<span class="tag blue" data-tip="Datos reales, pero fuera de la selección">Prueba</span>`;
    if (t.loading) return html`<div class="card mu-card mu-test"><div class="card-head"><h2>Tu enfrentamiento</h2><span class="mu-head">${tag}</span></div><div class="ai-loading"><span class="spinner small"></span><span>Consultando OP.GG, U.GG y Data Dragon...</span></div></div>`;
    if (t.error) return html`<div class="card mu-card mu-test"><div class="card-head"><h2>Tu enfrentamiento</h2><span class="mu-head">${tag}${close}</span></div><div class="notice error">${raw(SVG.warn)}<span class="grow">${t.error}</span></div></div>`;
    return html`<div class="card mu-card mu-test">${matchupCard(t.data, html`${tag}${close}`)}</div>`;
  },

  runMatchupTest() {
    const s = this.exp.data;
    if (!s?.vs) return;
    const key = this.matchupTestKey(s);
    this.muTest = { key, loading: true };
    this.renderExplore();
    window.api.action('testMatchup', { championId: s.championId, role: s.role, vs: s.vs })
      .then(data => { if (this.muTest?.key === key) this.muTest = { key, data }; })
      .catch(err => { if (this.muTest?.key === key) this.muTest = { key, error: err?.message || 'No se pudo hacer la prueba' }; })
      .finally(() => this.renderExplore());
  },

  // Fila de campeon clicable (counters y sinergias): abre ese campeon en el explorador, en esa linea
  expChamp(c, role) {
    const wr = c.winRate;
    return html`<button type="button" class="exp-champ" data-act="explore" data-id="${c.championId}" data-role="${role}" data-tip="Explorar ${Dd.champName(c.championId)} en ${roleName(role).toLowerCase()}">
      ${icon('champ', c.championId, { size: 32, tip: false })}<span class="exp-champ-name">${Dd.champName(c.championId)}${c.games ? html`<span class="muted num small">${fmt.int(c.games)} partidas</span>` : ''}</span>
      <span class="exp-wr"><b class="num ${wrCls(wr)}">${pctOr(wr)}</b>${wr != null ? html`<i class="wr-bar ${wrCls(wr)}" data-vars="--w:${Math.max(4, Math.min(100, (wr - .4) / .2 * 100)).toFixed(0)}%"></i>` : ''}</span></button>`;
  },

  exploreCounters(s) {
    const col = (title, hint, list) => html`<div class="exp-block"><h4 class="bp-h">${title}</h4><p class="muted small exp-hint">${hint}</p>
      ${list.length ? html`<div class="exp-list">${list.map(c => this.expChamp(c, s.role))}</div>` : html`<p class="muted small">Sin datos.</p>`}</div>`;
    return html`<div class="exp-two">
      ${col('Gana a', 'Tu % de victorias contra ellos (OP.GG).', s.counters.strong)}
      ${col('Sufre contra', 'Tu % de victorias contra ellos (OP.GG).', s.counters.weak)}
    </div>`;
  },

  exploreSynergies(s) {
    const roles = ROLES.filter(r => r !== s.role && s.synergies?.[r]?.length);
    if (!roles.length) return html`<p class="muted">Sin datos de sinergias para esta línea.</p>`;
    return html`<p class="muted small exp-hint">% de victorias jugando juntos. Clic en un campeón para explorarlo en su línea.</p>
      <div class="exp-syn-grid">${roles.map(r => html`<div class="exp-syn-card"><h4 class="bp-h">${roleName(r)}</h4>
        <div class="exp-list">${s.synergies[r].slice(0, 3).map(c => this.expChamp(c, r))}</div></div>`)}</div>`;
  },

  // Build elegida en el explorador (la mejor de la lista por defecto; se reinicia al cambiar de campeon o linea)
  expOption(s) {
    const key = `${s.championId}|${s.role}`;
    if (this.expChoiceKey !== key) { this.expChoiceKey = key; this.expChoice = 0; }
    if (!s.options?.[this.expChoice]) this.expChoice = 0;
    return s.options?.[this.expChoice] || null;
  },

  exploreContext(s) {
    const o = this.expOption(s);
    if (!o?.context?.length) return html`<p class="muted">Sin datos de objetos para esta línea.</p>`;
    return html`<p class="muted small exp-hint">Para la build elegida (${Dd.runeName(o.keystone)} · ${o.label}): objetos de su tipo de daño para cada situación, ordenados por lo que más se compra con este campeón.</p>
      ${contextBlock(o.context, [], 'Objetos por situación')}`;
  },

  // Lista unificada de builds (OP.GG + U.GG) y detalle de la elegida (solo lectura: la tuya se importa
  // desde "Mi seleccion")
  exploreBuild(s) {
    this.expOption(s);
    if (!s.options?.length && !s.build) return html`<p class="muted">Sin build para esta línea.</p>`;
    return buildPanel({ options: s.options || [], chosen: this.expChoice, act: 'expChoose', base: s.build, vs: s.vs, sort: this.buildSort, otpInfo: s.otp });
  },
});
