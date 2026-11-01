// Actualizaciones desde las Releases de GitHub (electron-updater, repositorio publico).
// - Al abrir la app comprueba enseguida (y luego cada 4 h) y descarga en segundo plano; la interfaz
//   avisa de si esta al dia o hay version nueva y ofrece «Instalar y reiniciar» (install()).
// - Respaldo automatico: se instala al salir o, si el cliente de LoL lleva 10 min cerrado, en
//   silencio (la app vuelve a la bandeja con --updated). Nunca durante una seleccion o partida.
const { app } = require('electron');
const fs = require('fs');
const path = require('path');
const { log } = require('./log');

const CHECK_EVERY = 4 * 3600e3;
const IDLE_BEFORE_INSTALL = 10 * 60e3;
// Marca para volver a mostrar la ventana tras una instalacion pedida desde la interfaz
const SHOW_MARK = () => path.join(app.getPath('userData'), 'show-after-update');

// isIdle(): true si se puede reiniciar (cliente cerrado); beforeInstall(): para salir sin ir a la
// bandeja; onChange(): el estado ha cambiado (para mandarlo a la interfaz)
function initUpdater({ isIdle, beforeInstall, onChange = () => {} }) {
  const status = { version: app.getVersion(), state: app.isPackaged ? 'idle' : 'dev', next: null, percent: null, checkedAt: null };
  const api = { status, check: async () => false, install: () => { throw new Error('Esta copia no se actualiza (sin empaquetar)'); } };
  // Sin empaquetar no hay app-update.yml ni nada que actualizar
  if (!app.isPackaged) return api;
  let autoUpdater;
  try {
    ({ autoUpdater } = require('electron-updater'));
  } catch (e) {
    log(`actualizar: electron-updater no disponible (${e.message})`);
    return api;
  }
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.logger = {
    info: m => log(`actualizar: ${m}`), warn: m => log(`actualizar: ${m}`),
    error: m => log(`actualizar: ${m}`), debug: () => {},
  };

  const set = patch => { Object.assign(status, patch); onChange(); };
  let lastPct = -1;
  autoUpdater.on('checking-for-update', () => { if (status.state !== 'ready') set({ state: 'checking' }); });
  autoUpdater.on('update-not-available', () => set({ state: 'latest', next: null, checkedAt: Date.now() }));
  autoUpdater.on('update-available', info => set({ state: 'downloading', next: info.version, percent: 0, checkedAt: Date.now() }));
  autoUpdater.on('download-progress', p => {
    const pct = Math.floor(p.percent || 0);
    if (pct === lastPct) return;
    lastPct = pct;
    set({ percent: pct });
  });
  autoUpdater.on('update-downloaded', info => {
    set({ state: 'ready', next: info.version, percent: 100 });
    log(`actualizar: ${info.version} descargada; lista para instalar`);
  });
  autoUpdater.on('error', e => { set({ state: 'error' }); log(`actualizar: error ${e?.message || e}`); });

  api.check = async () => {
    if (['checking', 'downloading', 'ready'].includes(status.state)) return true;
    try { await autoUpdater.checkForUpdates(); return true; } catch (e) { log(`actualizar: no se pudo comprobar (${e.message})`); set({ state: 'error' }); return false; }
  };
  api.install = (show = true) => {
    if (status.state !== 'ready') throw new Error(status.state === 'downloading' ? `Todavía se está descargando (${status.percent || 0} %)` : 'No hay ninguna versión nueva descargada');
    log(`actualizar: instalando ${status.next}${show ? ' (pedido desde la interfaz)' : ' en silencio'}`);
    if (show) { try { fs.writeFileSync(SHOW_MARK(), String(status.next)); } catch { } }
    beforeInstall();
    // isSilent: sin ventanas del instalador; isForceRunAfter: volver a abrir la app
    setImmediate(() => autoUpdater.quitAndInstall(true, true));
    return true;
  };

  // Enseguida al abrir (lo justo para que la ventana este lista) y luego cada 4 h
  setTimeout(api.check, 3000);
  setInterval(api.check, CHECK_EVERY);

  // Respaldo: instalar en silencio con el cliente de LoL cerrado 10 min
  let idleSince = null;
  setInterval(() => {
    if (status.state !== 'ready') return;
    if (!isIdle()) { idleSince = null; return; }
    idleSince ||= Date.now();
    if (Date.now() - idleSince >= IDLE_BEFORE_INSTALL) api.install(false);
  }, 60e3);

  return api;
}

// Tras una instalacion pedida desde la interfaz: true (y se borra la marca) si hay que mostrar la ventana
function consumeShowMark() {
  try { fs.unlinkSync(SHOW_MARK()); return true; } catch { return false; }
}

module.exports = { initUpdater, consumeShowMark };
