// Onde os dados do time e as imagens ficam guardados.
// - Com MONGODB_URI (ex.: MongoDB Atlas grátis): tudo no banco, para rodar em hospedagem sem disco (Render free).
// - Sem MONGODB_URI: arquivos locais em DATA_DIR (data/db.json e data/uploads/), como no desenvolvimento.
const fs = require('fs');
const path = require('path');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');

function fileStorage() {
  const dbFile = path.join(DATA_DIR, 'db.json');
  const uploadDir = path.join(DATA_DIR, 'uploads');
  return {
    kind: 'arquivos locais',
    async loadDb() {
      return fs.existsSync(dbFile) ? JSON.parse(fs.readFileSync(dbFile, 'utf8')) : null;
    },
    async saveDb(data) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
      const tmp = dbFile + '.tmp';
      fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
      fs.renameSync(tmp, dbFile);
    },
    async putFile(name, buffer) {
      fs.mkdirSync(uploadDir, { recursive: true });
      fs.writeFileSync(path.join(uploadDir, name), buffer);
    },
    async getFile(name) {
      const p = path.join(uploadDir, name);
      return fs.existsSync(p) ? fs.readFileSync(p) : null;
    },
    async deleteFile(name) {
      fs.rmSync(path.join(uploadDir, name), { force: true });
    },
    async close() {},
  };
}

async function mongoStorage(uri) {
  const { MongoClient, Binary } = require('mongodb');
  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 15000 });
  await client.connect();
  const db = client.db(process.env.MONGODB_DB || 'comps');
  const state = db.collection('state'); // um documento só: { _id: 'db', data }
  const uploads = db.collection('uploads'); // { _id: nome do arquivo, data: Binary }
  return {
    kind: 'MongoDB',
    async loadDb() {
      const doc = await state.findOne({ _id: 'db' });
      return doc ? doc.data : null;
    },
    async saveDb(data) {
      await state.replaceOne({ _id: 'db' }, { _id: 'db', data, updatedAt: new Date() }, { upsert: true });
    },
    async putFile(name, buffer) {
      await uploads.replaceOne({ _id: name }, { _id: name, data: new Binary(buffer), createdAt: new Date() }, { upsert: true });
    },
    async getFile(name) {
      const doc = await uploads.findOne({ _id: name });
      return doc ? Buffer.from(doc.data.buffer) : null;
    },
    async deleteFile(name) {
      await uploads.deleteOne({ _id: name });
    },
    async close() {
      await client.close();
    },
  };
}

async function createStorage() {
  return process.env.MONGODB_URI ? mongoStorage(process.env.MONGODB_URI) : fileStorage();
}

module.exports = { createStorage, DATA_DIR };
