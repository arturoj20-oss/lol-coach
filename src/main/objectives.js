// Tiempos de aparicion de los objetivos (en segundos de partida). Riot los cambia entre
// temporadas: si no cuadran con el parche actual, se pueden ajustar en config.json
// (clave "objectiveTimes") sin tocar el codigo.
const DEFAULT_TIMES = {
  dragonFirst: 300,     // primer dragon
  dragonRespawn: 300,   // tras matar un dragon
  elderRespawn: 360,    // dragon ancestral, tras el alma o tras matar al anterior
  grubs: 480,           // larvas del vacio
  herald: 900,          // heraldo de la grieta (se va al salir el baron)
  atakhan: 0,           // Atakhan: eliminado en el parche 26.1 (0 = no existe)
  baron: 1200,          // primer baron: 20:00 desde el parche 26.1 (antes 25:00)
  baronRespawn: 360,
  inhibRespawn: 300,
  baronBuff: 180,
  elderBuff: 150,
};

// El overlay solo avisa (no muestra timers): 90 s antes de que salgan estos objetivos
const NOTIFY_BEFORE = 90;
const NOTIFY_KEYS = ['dragon', 'elder', 'baron', 'grubs', 'herald'];

const DRAGON_TYPES = {
  Fire: 'Infernal', Water: 'Oceánico', Earth: 'De montaña', Air: 'De nubes',
  Hextech: 'Hextech', Chemtech: 'Quimtech', Elder: 'Ancestral',
};

const LANES = { L: 'top', C: 'mid', R: 'bot' };
const LANE_NAMES = { top: 'superior', mid: 'central', bot: 'inferior' };

module.exports = { DEFAULT_TIMES, DRAGON_TYPES, LANES, LANE_NAMES, NOTIFY_BEFORE, NOTIFY_KEYS };
