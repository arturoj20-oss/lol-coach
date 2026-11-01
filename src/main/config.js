// Configuracion en %APPDATA%\LoL Coach\config.json. La primera vez importa la de lol-auto-accept.
const fs = require('fs');
const path = require('path');

const DEFAULTS = {
  autoAccept: true,
  acceptDelay: 0,
  pick: null,          // { id, name }
  autoLock: false,
  ban: null,           // { id, name }
  role: '',            // '' = automatico, o top / jungle / mid / adc / support
  startWithWindows: false,
  autoImport: { runes: true, spells: true, items: true },
  otpBuilds: true,     // descargar datos de mains con la Riot API (los incluidos en la app se usan siempre)
  overlay: {
    // objectives: aviso 90 s antes de dragon, baron, larvas y heraldo (sin timers en pantalla)
    enabled: true, objectives: true, goldDiff: true, skillOrder: true, cs: true,
    sound: true, side: 'right', scale: 1,
    // Etiquetas de maestria, posicion y premades a los lados del marcador (Tab). scoutX/Y/Row: ajuste
    // en px de la posicion estimada del marcador; scoutSwap: tu equipo a la derecha; scoutCalibrate:
    // etiquetas de ejemplo para cuadrarlas (modo practica)
    scoutTab: true, scoutX: 0, scoutY: 0, scoutRow: 0, scoutSwap: false, scoutCalibrate: false,
  },
  csTarget: 7,          // objetivo manual de CS/min (si csAuto esta desactivado o no hay datos)
  csAuto: true,         // objetivo de CS segun tu campeon y posicion (U.GG)
  gameCampTimers: true, // activar en el cliente la opcion de mostrar siempre los timers de campamentos
  ai: 'local',          // coach con IA: 'local' (Claude Code del equipo) o 'api' (clave de Anthropic)
  theme: 'dark',        // tema de la ventana: 'dark', 'light' o 'system'
};

// Opciones que son grupos: se mezclan campo a campo para no perder los que falten
const NESTED = ['autoImport', 'overlay'];

const OLD_ROLES = { 'Rol auto': '', Top: 'top', Jungla: 'jungle', Mid: 'mid', ADC: 'adc', Support: 'support' };

function readJson(file) {
  try {
    // Set-Content -Encoding UTF8 de PowerShell escribe BOM
    return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^﻿/, ''));
  } catch {
    return null;
  }
}

function importOldConfig() {
  if (!process.env.LOCALAPPDATA) return null;
  const old = readJson(path.join(process.env.LOCALAPPDATA, 'LoL Auto-Accept', 'config.json'));
  if (!old) return null;
  return {
    autoAccept: !!old.enabled,
    acceptDelay: Math.min(10, Math.max(0, Number(old.delay) || 0)),
    pick: old.championId > 0 ? { id: old.championId, name: old.champion } : null,
    autoLock: !!old.autoLock,
    ban: old.banId > 0 ? { id: old.banId, name: old.ban } : null,
    role: OLD_ROLES[old.role] ?? '',
  };
}

class Config {
  constructor(dir) {
    this.file = path.join(dir, 'config.json');
    const saved = readJson(this.file);
    const loaded = saved || importOldConfig() || {};
    this.data = { ...DEFAULTS, ...loaded };
    for (const key of NESTED) this.data[key] = { ...DEFAULTS[key], ...(loaded[key] || {}) };
    // Opciones que ya no existen (timers de jungla, siguiente objeto, aviso configurable)
    delete this.data.jungleRecord;
    for (const k of ['camps', 'nextItem', 'notifyBefore']) delete this.data.overlay[k];
    this.save();
  }

  get() {
    return this.data;
  }

  set(patch) {
    for (const [key, value] of Object.entries(patch)) {
      this.data[key] = NESTED.includes(key) ? { ...this.data[key], ...value } : value;
    }
    this.save();
  }

  save() {
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      fs.writeFileSync(this.file, JSON.stringify(this.data, null, 2), 'utf8');
    } catch { }
  }
}

module.exports = { Config };
