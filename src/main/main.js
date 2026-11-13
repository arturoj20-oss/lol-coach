// LoL Coach: ventanas (principal y overlay), icono de la bandeja y comunicacion con la interfaz.
// --hidden: arranca oculto en la bandeja y muestra la ventana cuando se abre el cliente.
const { app, BrowserWindow, Tray, Menu, ipcMain, nativeImage, nativeTheme, screen, shell, desktopCapturer } = require('electron');
const path = require('path');
const { Config } = require('./config');
const { Companion } = require('./companion');
const { initLog, log } = require('./log');
const { initOpgg } = require('./opgg');
const { TabWatcher, gameFocused } = require('./keys');
const { initUpdater, consumeShowMark } = require('./updater');

const RENDERER = path.join(__dirname, '..', 'renderer');
const CHANNELS = ['state', 'champions', 'recs', 'draft', 'scouting', 'live', 'profile', 'postgame', 'otp'];

let win = null;
let overlay = null;
let tray = null;
let config = null;
let companion = null;
let exiting = false;
let trayTipShown = false;
let overlayTest = null;
const tab = new TabWatcher();   // Tab pulsado = marcador del juego abierto (oro por linea)

const ICON = path.join(__dirname, '..', 'assets', 'icon.png');

function send(channel, data) {
  for (const w of [win, overlay]) {
    if (w && !w.isDestroyed()) w.webContents.send(channel, data);
  }
}

function showWindow(activate) {
  if (win.isMinimized()) win.restore();
  if (activate) win.show(); else win.showInactive();
  // Al abrir la ventana, comprobar si hay version nueva (si hace mas de 30 min de la ultima vez)
  const u = companion?.updater?.status;
  if (u && u.state !== 'dev' && (!u.checkedAt || Date.now() - u.checkedAt > 30 * 60e3)) companion.updater.check();
}

// Tema efectivo de la ventana ('system' sigue a Windows)
function isDarkTheme() {
  const t = config.get().theme;
  if (t === 'light') return false;
  return t !== 'system' || nativeTheme.shouldUseDarkColors;
}

function createWindow(icon) {
  win = new BrowserWindow({
    width: 1280, height: 720, minWidth: 1024, minHeight: 640,
    frame: false,
    show: false,
    icon,
    title: 'LoL Coach',
    // Fondo antes de pintar la interfaz, segun el tema guardado (evita un destello)
    backgroundColor: isDarkTheme() ? '#15181e' : '#f4f1ea',
    webPreferences: { preload: path.join(__dirname, 'preload.js') },
  });
  win.loadFile(path.join(RENDERER, 'index.html'));
  // Los enlaces externos se abren en el navegador
  win.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' }; });

  // Cerrar la ventana la manda a la bandeja; para salir del todo, "Salir" en el icono
  win.on('close', e => {
    if (exiting) return;
    e.preventDefault();
    win.hide();
    if (!trayTipShown) {
      trayTipShown = true;
      tray.displayBalloon({ title: 'LoL Coach', content: 'Sigue funcionando en la bandeja. Clic derecho en el icono para salir.' });
    }
  });
}

// Overlay: transparente, encima del juego y sin recibir clics. Necesita el juego en modo
// "sin bordes" o ventana (en pantalla completa Windows no deja dibujar encima del juego). Por si el
// juego lo manda detras, mientras se ve se vuelve a poner encima cada 2 s sin quitarle el foco.
function createOverlay() {
  const { bounds } = screen.getPrimaryDisplay();
  overlay = new BrowserWindow({
    ...bounds,
    transparent: true, frame: false, resizable: false, movable: false,
    focusable: false, skipTaskbar: true, hasShadow: false, show: false,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), backgroundThrottling: false },
  });
  overlay.setAlwaysOnTop(true, 'screen-saver');
  overlay.setIgnoreMouseEvents(true);
  // Que el overlay no salga en las capturas: si no, el lector del minimapa se veria a si mismo
  overlay.setContentProtection(true);
  overlay.loadFile(path.join(RENDERER, 'overlay.html'));
  setInterval(() => {
    if (!overlay || overlay.isDestroyed() || !overlay.isVisible()) return;
    overlay.setAlwaysOnTop(true, 'screen-saver');
    overlay.moveTop();
  }, 2000);
}

function updateOverlay(live) {
  if (!overlay || overlay.isDestroyed()) return;
  const want = overlayTest || (config.get().overlay.enabled && live?.active);
  if (want && !overlay.isVisible()) overlay.showInactive();
  if (!want && overlay.isVisible()) overlay.hide();
  // La tecla Tab solo se mira con el overlay a la vista y el oro por linea o las etiquetas activados
  const o = config.get().overlay;
  if (want && (o.goldDiff !== false || o.scoutTab !== false)) tab.start(); else tab.stop();
}

// Captura del marcador (Tab) para medir su geometria: una por partida, en cache\tab-capture.png.
// El overlay no sale (setContentProtection), solo el juego
let captured = false;   // se reinicia al acabar la partida
async function captureScoreboard(dir) {
  if (captured) return;
  captured = true;
  await new Promise(r => setTimeout(r, 400));   // que el marcador termine de abrirse
  try {
    const { size, scaleFactor } = screen.getPrimaryDisplay();
    const sources = await desktopCapturer.getSources({
      types: ['screen'], thumbnailSize: { width: Math.round(size.width * scaleFactor), height: Math.round(size.height * scaleFactor) },
    });
    const src = sources.find(s => s.display_id === String(screen.getPrimaryDisplay().id)) || sources[0];
    if (!src) return;
    const file = path.join(dir, 'cache', 'tab-capture.png');
    require('fs').writeFileSync(file, src.thumbnail.toPNG());
    log(`overlay: captura del marcador en ${file}`);
  } catch (e) {
    log(`overlay: no se pudo capturar el marcador: ${e.message}`);
  }
}

function createTray(icon) {
  tray = new Tray(icon);
  tray.setToolTip('LoL Coach');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Abrir', click: () => showWindow(true) },
    { label: 'Salir', click: () => { exiting = true; app.quit(); } },
  ]));
  tray.on('double-click', () => showWindow(true));
}

function applyStartWithWindows(enabled) {
  // Sin empaquetar, el ejecutable es electron.exe y hay que pasarle la carpeta de la app
  const args = app.isPackaged ? ['--hidden'] : [app.getAppPath(), '--hidden'];
  app.setLoginItemSettings({ openAtLogin: enabled, path: process.execPath, args });
}

// Valida y limpia lo que manda la interfaz antes de guardarlo
function cleanConfig(patch) {
  const clean = {};
  const bool = v => !!v;
  const num = (v, min, max, step = 1) => Math.min(max, Math.max(min, Math.round((Number(v) || 0) / step) * step));
  for (const key of ['autoAccept', 'autoLock', 'startWithWindows', 'gameCampTimers', 'csAuto', 'otpBuilds']) {
    if (key in patch) clean[key] = bool(patch[key]);
  }
  if ('acceptDelay' in patch) clean.acceptDelay = num(patch.acceptDelay, 0, 10);
  if ('csTarget' in patch) clean.csTarget = num(patch.csTarget, 1, 12, 0.5);
  if ('role' in patch && ['', 'top', 'jungle', 'mid', 'adc', 'support'].includes(patch.role)) clean.role = patch.role;
  if ('ai' in patch && ['local', 'api'].includes(patch.ai)) clean.ai = patch.ai;
  if ('theme' in patch && ['dark', 'light', 'system'].includes(patch.theme)) clean.theme = patch.theme;
  // Ultima version cuyas novedades ya se vieron (aviso de una sola vez tras actualizar)
  if ('seenVersion' in patch && /^\d+\.\d+\.\d+$/.test(patch.seenVersion)) clean.seenVersion = patch.seenVersion;
  for (const key of ['pick', 'ban']) {
    if (!(key in patch)) continue;
    const v = patch[key];
    // Admite { id, name }, un id o un nombre; sin lista de campeones se mantiene lo que habia
    if (!v) clean[key] = null;
    else if (companion.champions.loaded || companion.champions.byId.size) {
      const id = typeof v === 'object' ? v.id : typeof v === 'number' ? v : null;
      clean[key] = id && companion.champions.get(id) ? { id, name: companion.champions.name(id) } : companion.champions.find(typeof v === 'object' ? v.name : v);
    }
  }
  if (patch.autoImport && typeof patch.autoImport === 'object') {
    clean.autoImport = {};
    for (const k of ['runes', 'spells', 'items']) if (k in patch.autoImport) clean.autoImport[k] = bool(patch.autoImport[k]);
  }
  if (patch.overlay && typeof patch.overlay === 'object') {
    const o = patch.overlay;
    clean.overlay = {};
    for (const k of ['enabled', 'objectives', 'goldDiff', 'skillOrder', 'cs', 'sound', 'scoutTab', 'scoutSwap', 'scoutCalibrate']) if (k in o) clean.overlay[k] = bool(o[k]);
    // Ajuste en px de las etiquetas del marcador (separacion, altura y espacio entre filas)
    if ('scoutX' in o) clean.overlay.scoutX = num(o.scoutX, -400, 400);
    if ('scoutY' in o) clean.overlay.scoutY = num(o.scoutY, -400, 400);
    if ('scoutRow' in o) clean.overlay.scoutRow = num(o.scoutRow, -40, 40);
    if ('side' in o && ['left', 'right'].includes(o.side)) clean.overlay.side = o.side;
    if ('scale' in o) clean.overlay.scale = Math.min(1.4, Math.max(0.8, Math.round((Number(o.scale) || 1) * 10) / 10));
    // Desplazamiento vertical (px) del panel de oro que sale encima del marcador al pulsar Tab
    if ('tabOffsetY' in o) clean.overlay.tabOffsetY = num(o.tabOffsetY, -600, 600);
  }
  return clean;
}

function setupIpc() {
  ipcMain.handle('init', () => companion.snapshot());

  ipcMain.on('set-config', (_e, patch) => {
    const clean = cleanConfig(patch || {});
    config.set(clean);
    if ('startWithWindows' in clean) applyStartWithWindows(clean.startWithWindows);
    send('config', config.get());
    if ('pick' in clean || 'role' in clean) companion.refreshRecs();
    if (clean.overlay) updateOverlay(companion.live.state);
    if ('ai' in clean) send('state', companion.state());
    if (clean.gameCampTimers) companion.syncCampTimers();
    if ('otpBuilds' in clean) { companion.syncOtp(); send('state', companion.state()); }
  });

  ipcMain.handle('set-secret', (_e, name, value) => companion.setSecret(name, value));

  // Los errores se devuelven como { error } para que la interfaz los muestre sin trazas de Electron
  ipcMain.handle('action', async (_e, name, args) => {
    try {
      return { ok: true, result: await companion.action(name, args) };
    } catch (e) {
      log(`accion ${name}: ${e.message}`);
      return { ok: false, error: e.message };
    }
  });

  ipcMain.on('window', (_e, cmd) => {
    if (cmd === 'minimize') win.minimize();
    else if (cmd === 'close') win.close();
  });
}

async function start() {
  const dir = app.getPath('userData');
  initLog(dir);
  initOpgg(dir);
  config = new Config(dir);
  companion = new Companion(config, dir);
  // Aviso a Discord de quien abre cada version nueva (solo la app instalada, no en desarrollo)
  if (app.isPackaged) {
    require('./report').watchInstall({
      config, version: app.getVersion(),
      identity: () => { const id = companion.profile.identity; return id?.gameName ? `${id.gameName}#${id.tagLine}` : null; },
    });
  }

  const icon = nativeImage.createFromPath(ICON);
  createTray(icon.resize({ width: 16, height: 16 }));
  createWindow(icon);
  createOverlay();
  setupIpc();

  for (const channel of CHANNELS) companion.on(channel, data => send(channel, data));
  companion.on('live', live => { if (!live?.active) captured = false; if (!overlayTest) updateOverlay(live); });
  tab.on('change', down => {
    if (overlay && !overlay.isDestroyed()) overlay.webContents.send('tab', down);
    if (down && companion.live.state?.active && !overlayTest && gameFocused()) captureScoreboard(dir);
  });
  companion.on('accepted', () => shell.beep());
  // El cliente se abre: mostramos la ventana junto a el (sin quitarle el foco); se cierra: a la bandeja
  companion.on('client-opened', () => { if (!win.isVisible()) showWindow(false); });
  companion.on('client-closed', () => win.hide());
  // "Probar overlay": datos de ejemplo durante 10 s
  companion.on('test-overlay', sample => {
    overlayTest = sample;
    updateOverlay(sample);
    send('live', sample);
    // Etiquetas del marcador de ejemplo (se ven manteniendo Tab)
    if (overlay && !overlay.isDestroyed()) overlay.webContents.send('scouting', require('./scouting').sampleScouting(sample.lanes));
    clearTimeout(start.testTimer);
    start.testTimer = setTimeout(() => {
      overlayTest = null;
      send('live', companion.live.state);
      if (overlay && !overlay.isDestroyed()) overlay.webContents.send('scouting', companion.scouting.state);
      updateOverlay(companion.live.state);
    }, 10000);
  });

  // --updated: la abre el actualizador tras instalar. Si la instalacion la pediste tu (marca), se
  // muestra la ventana; si fue en silencio, se queda en la bandeja
  const updated = process.argv.includes('--updated');
  const showAfterUpdate = consumeShowMark();
  if ((!process.argv.includes('--hidden') && !updated) || showAfterUpdate) win.once('ready-to-show', () => showWindow(true));
  if (updated) log(`actualizado a la ${app.getVersion()}`);
  companion.updater = initUpdater({
    isIdle: () => !companion.state().connected,
    beforeInstall: () => { exiting = true; },
    onChange: () => send('state', companion.state()),
  });
  await companion.start();
}

// Una sola instancia: si ya hay una abierta, le pedimos que muestre su ventana
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => { if (win) showWindow(true); });
  app.whenReady().then(start);
  app.on('before-quit', () => { exiting = true; tab.stop(); companion?.stop(); });
  // Seguir en la bandeja aunque no haya ventanas
  app.on('window-all-closed', () => { });
}
