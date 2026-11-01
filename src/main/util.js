// Utilidades compartidas

// Ejecuta fn sobre cada elemento con como mucho `limit` a la vez; devuelve los resultados en orden
async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i], i);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

const pct = v => `${Math.round(v * 100)}%`;

// Rol del cliente/API -> rol de la app
const ROLE_FROM_POSITION = {
  top: 'top', jungle: 'jungle', middle: 'mid', mid: 'mid', bottom: 'adc', utility: 'support',
  TOP: 'top', JUNGLE: 'jungle', MIDDLE: 'mid', BOTTOM: 'adc', UTILITY: 'support',
};
const ROLE_NAMES = { top: 'top', jungle: 'jungla', mid: 'mid', adc: 'ADC', support: 'support' };

// Grieta del Invocador: reclutamiento, clasificatorias, a ciegas, partida rapida
const RIFT_QUEUES = [400, 420, 430, 440, 480, 490];

// Rol de una partida del historial del cliente (participante con timeline.lane / role)
function laneToRole(timeline) {
  const lane = timeline?.lane;
  if (lane === 'BOTTOM') return ['DUO_SUPPORT', 'SUPPORT'].includes(timeline.role) ? 'support' : 'adc';
  return { TOP: 'top', JUNGLE: 'jungle', MIDDLE: 'mid' }[lane] || '';
}

module.exports = { mapLimit, pct, ROLE_FROM_POSITION, ROLE_NAMES, RIFT_QUEUES, laneToRole };
