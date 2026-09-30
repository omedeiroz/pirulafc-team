// Dados do time: comps confirmadas, sugestões, campeonatos, perfis e senhas trocadas.
// Mapas, agentes e meta vêm das APIs. O armazenamento (arquivo local ou MongoDB) fica em storage.js.
const crypto = require('crypto');
const { createStorage, DATA_DIR } = require('./storage');

// Objeto único, preenchido no init(). Os módulos guardam a referência, então nunca é trocado, só atualizado.
const data = {};
let storage = null;

function withDefaults(d) {
  d.secret ||= crypto.randomBytes(32).toString('hex');
  d.customComps ||= [];
  d.teamComps ||= [];
  d.tournaments ||= [];
  d.profiles ||= {}; // username -> { roles, favoriteAgents, avatar, banner, riotId, region }
  d.passwords ||= {}; // username -> hash "salt:hash" (senha trocada pelo próprio usuário; substitui a de users.js)
  return d;
}

async function init() {
  storage = await createStorage();
  Object.assign(data, withDefaults((await storage.loadDb()) || {}));
  await storage.saveDb(data);
  console.log(`[db] dados em: ${storage.kind}`);
  return storage;
}

// save() é chamado de forma síncrona pelas rotas. As gravações entram numa fila (uma por vez)
// e várias alterações seguidas viram uma gravação só.
let pending = false;
let chain = Promise.resolve();
function save() {
  if (pending) return;
  pending = true;
  chain = chain.then(async () => {
    pending = false;
    try {
      await storage.saveDb(data);
    } catch (err) {
      console.error('[db] erro ao salvar:', err.message);
    }
  });
}

// Espera as gravações pendentes (usado ao desligar o servidor).
const flush = () => chain;

module.exports = {
  DATA_DIR,
  data,
  init,
  save,
  flush,
  files: {
    put: (name, buffer) => storage.putFile(name, buffer),
    get: (name) => storage.getFile(name),
    del: (name) => storage.deleteFile(name),
  },
  close: async () => { await flush(); await storage?.close(); },
  newId: () => crypto.randomBytes(8).toString('hex'),
};
