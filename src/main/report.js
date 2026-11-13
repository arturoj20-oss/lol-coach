// Reportes de bugs y sugerencias desde Ajustes: se mandan a un webhook de Discord.
// La URL va en report-webhook.txt (junto a este archivo): esta en .gitignore para que no quede
// en el repositorio publico, pero entra en el instalador (build.files incluye src/**)
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { log } = require('./log');

const WEBHOOK_FILE = path.join(__dirname, 'report-webhook.txt');
const WEBHOOK_RE = /^https:\/\/(?:canary\.|ptb\.)?discord(?:app)?\.com\/api\/webhooks\/\d+\/[\w-]+$/;
const LOG_LINES = 30;
const MIN_TEXT = 10;
const MAX_TEXT = 1500;
const COOLDOWN = 60 * 1000;
const TYPES = { bug: { title: 'Bug', emoji: '🐞', color: 0xF25A6E }, idea: { title: 'Sugerencia', emoji: '💡', color: 0x1FC7B6 } };

let lastSent = 0;

function webhookUrl() {
  try {
    const url = fs.readFileSync(WEBHOOK_FILE, 'utf8').trim();
    return WEBHOOK_RE.test(url) ? url : null;
  } catch { return null; }
}

// Ultimas lineas del registro, sin la carpeta del usuario de Windows
function logTail(dir) {
  try {
    const lines = fs.readFileSync(path.join(dir, 'log.txt'), 'utf8').trimEnd().split(/\r?\n/).slice(-LOG_LINES);
    const home = os.homedir();
    return lines.join('\n').split(home).join('%USERPROFILE%');
  } catch { return ''; }
}

// Lo que se adjuntaria: se ensena en Ajustes antes de enviar
function preview(dir, { version, phase, riotId }) {
  return { enabled: !!webhookUrl(), version, phase: phase || 'sin cliente', riotId: riotId || null, log: logTail(dir) };
}

async function send(dir, ctx, args = {}) {
  const url = webhookUrl();
  if (!url) throw new Error('El envío de reportes no está configurado en esta versión');
  const type = TYPES[args.type] ? args.type : 'bug';
  const text = String(args.text || '').trim();
  if (text.length < MIN_TEXT) throw new Error(`Escribe al menos ${MIN_TEXT} caracteres`);
  if (text.length > MAX_TEXT) throw new Error(`Máximo ${MAX_TEXT} caracteres`);
  const wait = COOLDOWN - (Date.now() - lastSent);
  if (wait > 0) throw new Error(`Espera ${Math.ceil(wait / 1000)} s antes de enviar otro reporte`);

  const t = TYPES[type];
  const fields = [{ name: 'Versión', value: ctx.version || '?', inline: true }];
  if (args.withLog) fields.push({ name: 'Fase', value: ctx.phase || 'sin cliente', inline: true });
  if (args.withRiotId && ctx.riotId) fields.push({ name: 'Riot ID', value: ctx.riotId, inline: true });
  const payload = {
    username: 'LoL Coach',
    // Sin menciones: el texto lo escribe cualquiera
    allowed_mentions: { parse: [] },
    embeds: [{ title: `${t.emoji} ${t.title}`, description: text, color: t.color, fields, timestamp: new Date().toISOString() }],
  };
  const form = new FormData();
  form.append('payload_json', JSON.stringify(payload));
  const tail = args.withLog ? logTail(dir) : '';
  if (tail) form.append('files[0]', new Blob([tail], { type: 'text/plain' }), 'log.txt');

  const res = await fetch(url, { method: 'POST', body: form, signal: AbortSignal.timeout(15000) });
  if (!res.ok) {
    log(`reporte: Discord respondio ${res.status}`);
    throw new Error(res.status === 429 ? 'Demasiados reportes seguidos: prueba en un rato' : 'No se pudo enviar el reporte');
  }
  lastSent = Date.now();
  log(`reporte: enviado (${type})`);
  return true;
}

module.exports = { preview, send };
