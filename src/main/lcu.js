// Conexion con la API local del cliente de League (LCU) en 127.0.0.1. No toca el juego.
const https = require('https');
const fs = require('fs');
const { execFile } = require('child_process');

const LOCKFILES = [
  'C:\\Riot Games\\League of Legends\\lockfile',
  'D:\\Riot Games\\League of Legends\\lockfile',
  'E:\\Riot Games\\League of Legends\\lockfile',
  'C:\\Program Files\\Riot Games\\League of Legends\\lockfile',
];

// El cliente usa un certificado autofirmado; este agente solo se usa para 127.0.0.1
const localAgent = new https.Agent({ rejectUnauthorized: false, keepAlive: false });

function getClientCommandLine() {
  const script = "(Get-CimInstance Win32_Process -Filter \"Name='LeagueClientUx.exe'\" | Select-Object -First 1).CommandLine";
  return new Promise(resolve => {
    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script],
      { windowsHide: true, timeout: 8000 }, (err, stdout) => resolve(err ? '' : stdout));
  });
}

async function findAuth() {
  // 1) Linea de comandos del cliente (funciona este donde este instalado)
  const cmd = await getClientCommandLine();
  const port = /--app-port=(\d+)/.exec(cmd)?.[1];
  const token = /--remoting-auth-token=([\w-]+)/.exec(cmd)?.[1];
  // Carpeta del juego: la del ejecutable, que va al principio de la linea de comandos
  const exe = /^"([^"]+)"/.exec(cmd.trim())?.[1] || '';
  const installDir = exe ? exe.replace(/[\\/][^\\/]+$/, '') : null;
  if (port && token) return { port, token, installDir };
  // 2) Lockfile: nombre:pid:puerto:password:protocolo
  for (const file of LOCKFILES) {
    try {
      const parts = fs.readFileSync(file, 'utf8').split(':');
      if (parts.length >= 5) return { port: parts[2], token: parts[3], installDir: file.replace(/\\lockfile$/, '') };
    } catch { }
  }
  return null;
}

class Lcu {
  constructor() {
    this.auth = null;
  }

  async connect() {
    this.auth = await findAuth();
    return !!this.auth;
  }

  disconnect() {
    this.auth = null;
  }

  // Devuelve el JSON de la respuesta; los codigos 4xx/5xx se lanzan como error
  request(method, path, body, timeout = 2000) {
    if (!this.auth) return Promise.reject(new Error('Cliente no conectado'));
    const data = body === undefined ? null : Buffer.from(JSON.stringify(body));
    const headers = {
      Authorization: 'Basic ' + Buffer.from(`riot:${this.auth.token}`).toString('base64'),
      Accept: 'application/json',
    };
    if (data) {
      headers['Content-Type'] = 'application/json';
      headers['Content-Length'] = data.length;
    } else if (method !== 'GET') {
      headers['Content-Length'] = 0;
    }
    return new Promise((resolve, reject) => {
      const req = https.request(
        { host: '127.0.0.1', port: this.auth.port, path, method, headers, agent: localAgent, timeout },
        res => {
          const chunks = [];
          res.on('data', c => chunks.push(c));
          res.on('end', () => {
            const text = Buffer.concat(chunks).toString('utf8');
            if (res.statusCode >= 400) {
              // El cuerpo suele traer el motivo ({ errorCode, message }): va en el error para el registro
              const err = new Error(`${res.statusCode} en ${path}${text ? `: ${text.slice(0, 300)}` : ''}`);
              err.status = res.statusCode;
              err.body = text;
              return reject(err);
            }
            try { resolve(text ? JSON.parse(text) : null); } catch { resolve(text); }
          });
        });
      req.on('timeout', () => req.destroy(new Error('Tiempo de espera agotado')));
      req.on('error', reject);
      if (data) req.write(data);
      req.end();
    });
  }
}

module.exports = { Lcu };
