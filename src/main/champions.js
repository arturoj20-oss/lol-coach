// Campeones: datos de Data Dragon (nombres en espanol, id para iconos, tipo de dano) y,
// del cliente, los que tienes. Sin Data Dragon se usa la lista del propio cliente.
const normalize = s => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

class Champions {
  constructor() {
    this.ddragon = null;
    this.clear();
  }

  clear() {
    this.loaded = false;
    this.byId = new Map();     // id -> { id, key, name, nameEn, damage }
    this.byName = new Map();   // nombre en minusculas -> id
    this.byEnglish = new Map();// nombre en ingles normalizado (el de OP.GG) -> id
    this.byKey = new Map();    // key de Data Dragon en minusculas -> id
    this.owned = [];           // ids de tus campeones + rotacion gratuita
  }

  // Con Data Dragon ya hay nombres e iconos aunque el cliente este cerrado; load() anade despues
  // los que tienes y los recien salidos
  setDataDragon(data) {
    this.ddragon = data;
    for (const c of data?.champions || []) if (!this.byId.has(c.id)) this.add(c);
  }

  // Campeones reales, sin repetir: el cliente tambien devuelve variantes con ids altos
  // (p. ej. Aatrox 266 y 60266) que no sirven para elegir ni banear
  static real(list) {
    const seen = new Set();
    return (list || [])
      .filter(c => c.id > 0 && c.id < 3000)
      .filter(c => !seen.has(c.id) && seen.add(c.id));
  }

  add(c) {
    this.byId.set(c.id, c);
    this.byName.set(c.name.toLowerCase(), c.id);
    this.byEnglish.set(normalize(c.nameEn), c.id);
    this.byKey.set(c.key.toLowerCase(), c.id);
  }

  async load(lcu) {
    const owned = Champions.real(await lcu.request('GET', '/lol-champions/v1/owned-champions-minimal'));
    if (!owned.length) return false;
    this.clear();
    if (this.ddragon) {
      for (const c of this.ddragon.champions) this.add(c);
    }
    // Campeones que el cliente conoce y Data Dragon todavia no (recien salidos)
    const summary = Champions.real(await lcu.request('GET', '/lol-game-data/assets/v1/champion-summary.json'));
    for (const c of summary) {
      if (!this.byId.has(c.id)) this.add({ id: c.id, key: c.alias, name: c.name, nameEn: c.name, damage: 'AD' });
    }
    this.owned = owned.map(c => c.id);
    this.loaded = true;
    return true;
  }

  get(id) {
    return this.byId.get(id);
  }

  name(id) {
    return this.byId.get(id)?.name;
  }

  // { id, name } a partir de lo escrito (sin distinguir mayusculas) o null si no existe
  find(text) {
    const id = this.byName.get(String(text || '').trim().toLowerCase());
    return id ? { id, name: this.name(id) } : null;
  }

  idFromEnglish(name) {
    return this.byEnglish.get(normalize(name));
  }

  idFromKey(key) {
    return this.byKey.get(String(key || '').toLowerCase());
  }

  // Lo que necesita la interfaz (canal 'champions')
  snapshot() {
    const dd = this.ddragon || {};
    const all = [...this.byId.values()]
      .sort((a, b) => a.name.localeCompare(b.name, 'es'))
      .map(c => ({ id: c.id, name: c.name, key: c.key }));
    return { version: dd.version || null, all, owned: this.owned, spells: dd.spells || {}, runes: dd.runes || {}, items: dd.items || {} };
  }
}

module.exports = { Champions };
