// Actualizaciones automaticas desde las Releases de GitHub (electron-updater, repositorio publico).
// Totalmente automatico (decision del usuario): busca al arrancar y cada 4 h, descarga en segundo
// plano y se instala al salir. Como la app vive en la bandeja y casi nunca se cierra, si hay una
// version descargada y el cliente de LoL lleva 10 min cerrado, se instala en silencio y la app se
// vuelve a abrir en la bandeja (con --updated). Nunca durante una seleccion o partida.
const { app } = require('electron');
const { log } = require('./log');

const CHECK_EVERY = 4 * 3600e3;
const IDLE_BEFORE_INSTALL = 10 * 60e3;

// isIdle(): true si se puede reiniciar (cliente cerrado); beforeInstall(): para salir sin ir a la bandeja
function initUpdater({ isIdle, beforeInstall }) {
  // Sin empaquetar no hay app-update.yml ni nada que actualizar
  if (!app.isPackaged) return null;
  let autoUpdater;
  try {
    ({ autoUpdater } = require('electron-updater'));
  } catch (e) {
    log(`actualizar: electron-updater no disponible (${e.message})`);
    return null;
  }
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.logger = {
    info: m => log(`actualizar: ${m}`), warn: m => log(`actualizar: ${m}`),
    error: m => log(`actualizar: ${m}`), debug: () => {},
  };

  const status = { version: app.getVersion(), state: 'idle', next: null };
  let idleSince = null;
  autoUpdater.on('checking-for-update', () => { status.state = 'checking'; });
  autoUpdater.on('update-not-available', () => { status.state = 'latest'; });
  autoUpdater.on('update-available', info => { status.state = 'downloading'; status.next = info.version; });
  autoUpdater.on('update-downloaded', info => {
    status.state = 'ready';
    status.next = info.version;
    log(`actualizar: ${info.version} descargada; se instala al salir o con el cliente cerrado 10 min`);
  });
  autoUpdater.on('error', e => { status.state = 'error'; log(`actualizar: error ${e?.message || e}`); });

  const check = () => autoUpdater.checkForUpdates().catch(e => log(`actualizar: no se pudo comprobar (${e.message})`));
  setTimeout(check, 30e3);
  setInterval(check, CHECK_EVERY);

  setInterval(() => {
    if (status.state !== 'ready') return;
    if (!isIdle()) { idleSince = null; return; }
    idleSince ||= Date.now();
    if (Date.now() - idleSince < IDLE_BEFORE_INSTALL) return;
    log(`actualizar: instalando ${status.next} en silencio`);
    beforeInstall();
    // isSilent: sin ventanas del instalador; isForceRunAfter: volver a abrir la app
    autoUpdater.quitAndInstall(true, true);
  }, 60e3);

  return status;
}

module.exports = { initUpdater };
