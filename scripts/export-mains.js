// Mete en la app los datos de mains descargados en este equipo: junta data/mains (lo que ya traia la
// app) con %APPDATA%\LoL Coach\cache\mains y escribe data/mains/{id}.json.gz, que entra en el
// instalador. Uso: npm run export-mains (despues, npm run dist para reconstruir el instalador)
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { OtpBuilds } = require('../src/main/otp');

// MAINS_APPDATA y MAINS_OUT permiten probarlo con otras carpetas
const appData = process.env.MAINS_APPDATA || path.join(process.env.APPDATA || '', 'LoL Coach');
const out = process.env.MAINS_OUT || path.join(__dirname, '..', 'data', 'mains');

// Sin Riot API: solo se leen y se juntan los archivos (el otp.json antiguo no se toca)
const mains = new OtpBuilds(null, appData, out, false);
fs.mkdirSync(out, { recursive: true });
let champs = 0, games = 0, players = 0, bytes = 0;
for (const id of mains.storedIds()) {
  const file = mains.exportOf(id);
  if (!file.champ && !file.records.length) continue;
  const gz = zlib.gzipSync(JSON.stringify(file), { level: 9 });
  fs.writeFileSync(path.join(out, `${id}.json.gz`), gz);
  champs++;
  games += file.records.length;
  players += Object.values(file.players).filter(p => p.main && !p.dropped).length;
  bytes += gz.length;
}
console.log(`data/mains: ${champs} campeones, ${players} mains, ${games} partidas (${(bytes / 1048576).toFixed(1)} MB comprimidos)`);
