// Programa de fondo: descarga los mains de todos los campeones aunque la app este cerrada, hasta tenerlo
// todo. Arranca al iniciar sesion, sin ventana, desde la carpeta Inicio de Windows (lo instala
// scripts/mains-worker-task.ps1). Al terminar se quita de Inicio. Mientras funciona, la app no descarga:
// recarga lo que este guarda y le pasa sus prioridades (ver otp.js). Registro: log.txt ("otp:")
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const { RiotApi } = require('../src/main/riot');
const { OtpBuilds } = require('../src/main/otp');
const { DataDragon } = require('../src/main/ddragon');
const { Champions } = require('../src/main/champions');
const { initOpgg } = require('../src/main/opgg');
const { initLog, log } = require('../src/main/log');

const dir = path.join(process.env.APPDATA || '', 'LoL Coach');
const STARTUP = path.join(process.env.APPDATA || '', 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Startup', 'LoL Coach - Mains.vbs');
const AFTER_GAME = 3 * 60000;   // tras cerrar el juego se sigue esperando (post-partida de la app)
const sleep = ms => new Promise(r => setTimeout(r, ms));

// Con la partida abierta se pausa para dejar la API libre (scouting y post-partida de la app)
function gameRunning() {
  return new Promise(resolve => execFile('tasklist', ['/FI', 'IMAGENAME eq League of Legends.exe', '/NH'], { windowsHide: true },
    (err, out) => resolve(!err && /League of Legends\.exe/i.test(out))));
}

(async () => {
  initLog(dir);
  initOpgg(dir);
  // Data Dragon con reintentos: al iniciar sesion puede no haber red todavia
  const champions = new Champions();
  for (;;) {
    try { champions.setDataDragon(await new DataDragon(dir).load()); break; } catch (e) { log(`otp: programa de fondo, Data Dragon: ${e.message}`); await sleep(60000); }
  }
  const otp = new OtpBuilds(new RiotApi(dir), dir);
  if (otp.workerAlive()) return log('otp: el programa de fondo ya estaba en marcha');
  otp.champions = champions;
  otp.isWorker = true;
  otp.heartbeat();

  let lastGame = 0;
  setInterval(async () => {
    if (await gameRunning()) lastGame = Date.now();
    otp.paused = Date.now() - lastGame < AFTER_GAME;
  }, 30000).unref();

  const finish = () => { otp.stop(); otp.save(); otp.releaseLock(); };
  for (const sig of ['SIGINT', 'SIGTERM', 'SIGBREAK']) process.on(sig, () => { finish(); process.exit(0); });

  otp.on('complete', () => {
    log('otp: programa de fondo: todos los campeones descargados; se quita del inicio de Windows');
    try { fs.unlinkSync(STARTUP); } catch { }
  });
  const s = otp.status();
  log(`otp: programa de fondo en marcha (${s.ready} de ${s.total} campeones listos)`);
  otp.running = true;
  try { await otp.loop(); } catch (e) { log(`otp: programa de fondo: ${e.message}`); }
  finish();
  process.exit(0);
})();
