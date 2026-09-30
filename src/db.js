// Banco simples em arquivo JSON (data/db.json). Guarda só o que é do time:
// comps confirmadas, comps prontas e campeonatos. Mapas, agentes e meta vêm das APIs.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');

function load() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const data = fs.existsSync(DB_FILE) ? JSON.parse(fs.readFileSync(DB_FILE, 'utf8')) : {};
  data.secret ||= crypto.randomBytes(32).toString('hex');
  data.customComps ||= [];
  data.teamComps ||= [];
  data.tournaments ||= [];
  data.profiles ||= {}; // username -> { roles, favoriteAgents, avatar, banner }
  data.passwords ||= {}; // username -> hash "salt:hash" (senha trocada pelo próprio usuário; substitui a de users.js)
  write(data);
  return data;
}

function write(data) {
  const tmp = DB_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, DB_FILE);
}

const db = load();

module.exports = {
  DATA_DIR,
  data: db,
  save: () => write(db),
  newId: () => crypto.randomBytes(8).toString('hex'),
};
