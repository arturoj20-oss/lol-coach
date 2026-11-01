// Registro en %APPDATA%\LoL Coach\log.txt para diagnosticar fallos (sobre todo en la seleccion)
const fs = require('fs');
const path = require('path');

let logPath = null;

function initLog(dir) {
  logPath = path.join(dir, 'log.txt');
}

function log(text) {
  if (!logPath) return;
  try {
    if (fs.existsSync(logPath) && fs.statSync(logPath).size > 200 * 1024) fs.unlinkSync(logPath);
    const time = new Date().toTimeString().slice(0, 8);
    fs.appendFileSync(logPath, `${time} ${text}\n`, 'utf8');
  } catch { }
}

module.exports = { initLog, log };
