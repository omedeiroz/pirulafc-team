// fetch JSON com cache em memória + cópia em disco. Se a API cair, devolve a última resposta válida.
const fs = require('fs');
const path = require('path');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const FILE = path.join(DATA_DIR, 'api-cache.json');
const HEADERS = { 'User-Agent': 'Mozilla/5.0 (Comps team site)', Accept: 'application/json,text/html' };

let store = {};
try {
  store = JSON.parse(fs.readFileSync(FILE, 'utf8'));
} catch {
  /* sem cache ainda */
}

let saveTimer;
function persist() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(FILE, JSON.stringify(store));
  }, 1000);
}

const inflight = new Map();

async function fetchText(url) {
  const res = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`${res.status} em ${url}`);
  return res.text();
}

// key: nome do cache; ttl em ms; fn: função async que busca o valor.
async function cached(key, ttl, fn, force = false) {
  const hit = store[key];
  if (!force && hit && Date.now() - hit.at < ttl) return hit.value;
  if (inflight.has(key)) return inflight.get(key);
  const p = (async () => {
    try {
      const value = await fn();
      store[key] = { value, at: Date.now() };
      persist();
      return value;
    } catch (err) {
      if (hit) {
        console.warn(`[api] ${key}: usando cache antigo (${err.message})`);
        return hit.value;
      }
      throw err;
    } finally {
      inflight.delete(key);
    }
  })();
  inflight.set(key, p);
  return p;
}

const getJson = async (url) => JSON.parse(await fetchText(url));

module.exports = { cached, getJson, fetchText };
