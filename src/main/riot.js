// API de Riot con la clave personal de %APPDATA%\LoL Coach\riot-key.txt.
// Respeta los limites de la clave (20 peticiones/s y 100 cada 2 min) y guarda en disco las
// partidas y timelines, que no cambian nunca.
const fs = require('fs');
const path = require('path');

// Region del cliente -> servidor de la API y region de enrutado
const PLATFORMS = {
  EUW: ['euw1', 'europe'], EUNE: ['eun1', 'europe'], TR: ['tr1', 'europe'], RU: ['ru', 'europe'],
  NA: ['na1', 'americas'], BR: ['br1', 'americas'], LAN: ['la1', 'americas'], LAS: ['la2', 'americas'],
  KR: ['kr', 'asia'], JP: ['jp1', 'asia'], OCE: ['oc1', 'sea'], ME: ['me1', 'europe'],
};

// Margen por debajo del limite real
const LIMITS = [[18, 1000], [95, 120000]];

class RiotApi {
  constructor(dir) {
    this.keyFile = path.join(dir, 'riot-key.txt');
    this.cacheDir = path.join(dir, 'cache', 'riot');
    fs.mkdirSync(path.join(this.cacheDir, 'matches'), { recursive: true });
    fs.mkdirSync(path.join(this.cacheDir, 'timelines'), { recursive: true });
    this.setRegion('EUW');
    this.sent = [];
    this.queue = Promise.resolve();
  }

  setRegion(region) {
    const [platform, routing] = PLATFORMS[String(region).toUpperCase()] || PLATFORMS.EUW;
    this.platform = platform;
    this.routing = routing;
  }

  key() {
    try { return fs.readFileSync(this.keyFile, 'utf8').trim(); } catch { return ''; }
  }

  hasKey() {
    return /^RGAPI-/.test(this.key());
  }

  saveKey(value) {
    fs.writeFileSync(this.keyFile, value.trim(), 'utf8');
  }

  // Espera hasta que haya hueco en los dos limites; las peticiones salen de una en una
  slot() {
    const wait = async () => {
      for (;;) {
        const now = Date.now();
        this.sent = this.sent.filter(t => now - t < 120000);
        const delay = Math.max(0, ...LIMITS.map(([max, ms]) => {
          const recent = this.sent.filter(t => now - t < ms);
          return recent.length < max ? 0 : recent[recent.length - max] + ms - now + 5;
        }));
        if (!delay) { this.sent.push(now); return; }
        await new Promise(r => setTimeout(r, delay));
      }
    };
    const turn = this.queue.then(wait);
    this.queue = turn.catch(() => { });
    return turn;
  }

  async get(host, urlPath, retries = 2, key = this.key()) {
    if (!key) throw new Error('Falta la clave de Riot');
    await this.slot();
    const res = await fetch(`https://${host}.api.riotgames.com${urlPath}`, {
      headers: { 'X-Riot-Token': key }, signal: AbortSignal.timeout(15000),
    });
    if (res.status === 429 && retries > 0) {
      const after = Number(res.headers.get('retry-after')) || 5;
      await new Promise(r => setTimeout(r, after * 1000));
      return this.get(host, urlPath, retries - 1, key);
    }
    if (res.status === 404) return null;
    if (res.status === 401 || res.status === 403) throw new Error('La clave de Riot no es válida o ha caducado');
    if (!res.ok) throw new Error(`Riot API ${res.status}`);
    return res.json();
  }

  // Comprueba una clave nueva antes de guardarla
  async validate(key) {
    await this.get(this.platform, '/lol/status/v4/platform-data', 0, key.trim());
  }

  cached(kind, id, fetcher) {
    const file = path.join(this.cacheDir, kind, `${id}.json`);
    try { return Promise.resolve(JSON.parse(fs.readFileSync(file, 'utf8'))); } catch { }
    return fetcher().then(data => {
      if (data) try { fs.writeFileSync(file, JSON.stringify(data)); } catch { }
      return data;
    });
  }

  account(gameName, tagLine) {
    return this.get(this.routing, `/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(gameName)}/${encodeURIComponent(tagLine)}`);
  }

  summoner(puuid) {
    return this.get(this.platform, `/lol/summoner/v4/summoners/by-puuid/${puuid}`);
  }

  league(puuid) {
    return this.get(this.platform, `/lol/league/v4/entries/by-puuid/${puuid}`);
  }

  matchIds(puuid, count = 20, start = 0, queue = null) {
    const q = queue ? `&queue=${queue}` : '';
    return this.get(this.routing, `/lol/match/v5/matches/by-puuid/${puuid}/ids?start=${start}&count=${count}${q}`);
  }

  match(id) {
    return this.cached('matches', id, () => this.get(this.routing, `/lol/match/v5/matches/${id}`));
  }

  timeline(id) {
    return this.cached('timelines', id, () => this.get(this.routing, `/lol/match/v5/matches/${id}/timeline`));
  }

  mastery(puuid, championId) {
    return this.get(this.platform, `/lol/champion-mastery/v4/champion-masteries/by-puuid/${puuid}/by-champion/${championId}`);
  }

  topMasteries(puuid, count = 3) {
    return this.get(this.platform, `/lol/champion-mastery/v4/champion-masteries/by-puuid/${puuid}/top?count=${count}`);
  }

  activeGame(puuid) {
    return this.get(this.platform, `/lol/spectator/v5/active-games/by-summoner/${puuid}`);
  }

  // Peticiones hechas en los ultimos 2 min (las tareas de fondo dejan hueco a las de la interfaz)
  recentCount() {
    const now = Date.now();
    return this.sent.filter(t => now - t < 120000).length;
  }

  // Llamadas a otra region (OTP de EUW, KR y NA). platform: 'euw1', 'kr', 'na1'...
  apexLeague(platform, tier) {
    return this.get(platform, `/lol/league/v4/${tier}leagues/by-queue/RANKED_SOLO_5x5`);
  }

  topMasteriesOn(platform, puuid, count = 3) {
    return this.get(platform, `/lol/champion-mastery/v4/champion-masteries/by-puuid/${puuid}/top?count=${count}`);
  }

  matchIdsOn(routing, puuid, count = 10, queue = 420) {
    return this.get(routing, `/lol/match/v5/matches/by-puuid/${puuid}/ids?start=0&count=${count}&queue=${queue}`);
  }

  // Clasificatorias Solo/Duo desde startTime (segundos), de 100 en 100 (mains de otp.js)
  matchIdsSince(routing, puuid, startTime, start = 0, count = 100) {
    return this.get(routing, `/lol/match/v5/matches/by-puuid/${puuid}/ids?queue=420&startTime=${startTime}&start=${start}&count=${count}`);
  }

  accountByRiotId(routing, gameName, tagLine) {
    return this.get(routing, `/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(gameName)}/${encodeURIComponent(tagLine)}`);
  }

  // Riot ID de un jugador de cualquier region (nombre de los OTP)
  accountByPuuid(routing, puuid) {
    return this.get(routing, `/riot/account/v1/accounts/by-puuid/${puuid}`);
  }

  // Sin cache en disco: de estas partidas solo se guarda un resumen (otp.js)
  matchOn(routing, id) {
    return this.get(routing, `/lol/match/v5/matches/${id}`);
  }
}

module.exports = { RiotApi, PLATFORMS };
