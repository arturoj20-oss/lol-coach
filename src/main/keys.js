// Estado de la tecla Tab (marcador del juego) sin capturarla: se consulta GetAsyncKeyState de
// user32 cada 50 ms, asi que el juego sigue recibiendo la tecla (globalShortcut se la tragaria).
// Solo se sondea mientras hay partida. Sin koffi (no deberia pasar) simplemente no avisa nunca.
const { EventEmitter } = require('events');
const { log } = require('./log');

const VK_TAB = 0x09;

let getKey = null;
try {
  const koffi = require('koffi');
  const user32 = koffi.load('user32.dll');
  const GetAsyncKeyState = user32.func('short __stdcall GetAsyncKeyState(int vKey)');
  getKey = vk => (GetAsyncKeyState(vk) & 0x8000) !== 0;
} catch (e) {
  log(`tecla Tab: koffi no disponible (${e.message})`);
}

class TabWatcher extends EventEmitter {
  constructor() {
    super();
    this.timer = null;
    this.down = false;
  }

  start() {
    if (this.timer || !getKey) return;
    this.timer = setInterval(() => {
      const down = getKey(VK_TAB);
      if (down !== this.down) {
        this.down = down;
        this.emit('change', down);
      }
    }, 50);
  }

  stop() {
    clearInterval(this.timer);
    this.timer = null;
    if (this.down) {
      this.down = false;
      this.emit('change', false);
    }
  }
}

module.exports = { TabWatcher };
