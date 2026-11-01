// Datos estaticos de Data Dragon (campeones, objetos, runas, hechizos) en espanol,
// guardados en disco por version para no descargarlos en cada arranque
const fs = require('fs');
const path = require('path');

const CDN = 'https://ddragon.leagueoflegends.com';

async function getJson(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(20000) });
  if (!res.ok) throw new Error(`${res.status} en ${url}`);
  return res.json();
}

class DataDragon {
  constructor(dir) {
    this.dir = path.join(dir, 'cache', 'ddragon');
    fs.mkdirSync(this.dir, { recursive: true });
    this.data = null;
  }

  async load() {
    let version;
    try {
      version = (await getJson(`${CDN}/api/versions.json`))[0];
    } catch {
      // Sin conexion: la ultima version descargada
      version = fs.readdirSync(this.dir).filter(f => f.endsWith('-v4.json')).map(f => f.slice(0, -8)).sort().pop();
      if (!version) throw new Error('No se pudo descargar Data Dragon');
    }
    // v4: los objetos guardan descripcion, mapas, si se compran (objetos por contexto) y sus componentes; las runas su arbol
    const file = path.join(this.dir, `${version}-v4.json`);
    try {
      this.data = JSON.parse(fs.readFileSync(file, 'utf8'));
      return this.data;
    } catch { }

    const base = `${CDN}/cdn/${version}/data`;
    const [champsEs, champsEn, items, runes, spells] = await Promise.all([
      getJson(`${base}/es_ES/champion.json`),
      getJson(`${base}/en_US/champion.json`),
      getJson(`${base}/es_ES/item.json`),
      getJson(`${base}/es_ES/runesReforged.json`),
      getJson(`${base}/es_ES/summoner.json`),
    ]);

    const champions = Object.values(champsEs.data).map(c => ({
      id: Number(c.key), key: c.id, name: c.name,
      nameEn: champsEn.data[c.id]?.name || c.name,
      // AP si su puntuacion de magia supera la de ataque
      damage: c.info.magic > c.info.attack ? 'AP' : 'AD',
      tags: c.tags,
    })).sort((a, b) => a.name.localeCompare(b.name, 'es'));

    const itemMap = {};
    for (const [id, it] of Object.entries(items.data)) {
      itemMap[id] = {
        name: it.name, gold: it.gold?.total || 0, into: it.into || [], from: (it.from || []).map(Number), tags: it.tags || [],
        desc: String(it.description || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(),
        sr: !!it.maps?.['11'], buy: it.gold?.purchasable !== false && !it.requiredAlly && !it.requiredChampion,
      };
    }
    const runeMap = {};
    for (const style of runes) {
      runeMap[style.id] = { name: style.name, icon: style.icon };
      // style y slot: arbol y fila de cada runa (para ordenar paginas que vienen sin separar, como las de U.GG)
      style.slots.forEach((slot, i) => { for (const r of slot.runes) runeMap[r.id] = { name: r.name, icon: r.icon, style: style.id, slot: i }; });
    }
    // Fragmentos de estadisticas (no vienen en runesReforged)
    const shards = {
      5008: 'Fuerza adaptable', 5005: 'Velocidad de ataque', 5007: 'Aceleración de habilidades',
      5001: 'Vida creciente', 5010: 'Velocidad de movimiento', 5011: 'Vida', 5013: 'Tenacidad y resistencia a ralentizaciones',
      5002: 'Armadura', 5003: 'Resistencia mágica',
    };
    for (const [id, name] of Object.entries(shards)) runeMap[id] = { name, icon: null };
    const spellMap = {};
    for (const s of Object.values(spells.data)) spellMap[s.key] = { key: s.id, name: s.name };

    this.data = { version, champions, items: itemMap, runes: runeMap, spells: spellMap };
    try { fs.writeFileSync(file, JSON.stringify(this.data)); } catch { }
    return this.data;
  }
}

module.exports = { DataDragon };
