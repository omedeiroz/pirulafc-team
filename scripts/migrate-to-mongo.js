// Copia os dados locais (data/db.json + data/uploads/) para o MongoDB do MONGODB_URI.
// Uso: coloque MONGODB_URI no .env e rode `npm run migrar`.
// Não sobrescreve um banco que já tem dados, a menos que passe --force.
const fs = require('fs');
const path = require('path');

try { process.loadEnvFile(path.join(__dirname, '..', '.env')); } catch { /* sem .env */ }

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('Defina MONGODB_URI no .env (string de conexão do MongoDB Atlas).');

  const dataDir = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
  const dbFile = path.join(dataDir, 'db.json');
  const uploadDir = path.join(dataDir, 'uploads');
  if (!fs.existsSync(dbFile)) throw new Error(`Não achei ${dbFile}`);
  const data = JSON.parse(fs.readFileSync(dbFile, 'utf8'));

  const { MongoClient, Binary } = require('mongodb');
  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 15000 });
  await client.connect();
  try {
    const db = client.db(process.env.MONGODB_DB || 'comps');
    const existing = await db.collection('state').findOne({ _id: 'db' });
    if (existing && !process.argv.includes('--force')) {
      throw new Error('O MongoDB já tem dados. Para sobrescrever mesmo assim: npm run migrar -- --force');
    }
    await db.collection('state').replaceOne({ _id: 'db' }, { _id: 'db', data, updatedAt: new Date() }, { upsert: true });

    // Só as imagens que algum perfil ainda usa.
    const used = new Set(Object.values(data.profiles || {}).flatMap((p) => [p.avatar, p.banner]).filter(Boolean));
    let n = 0;
    for (const name of used) {
      const file = path.join(uploadDir, name);
      if (!fs.existsSync(file)) { console.warn(`  imagem não encontrada, pulando: ${name}`); continue; }
      await db.collection('uploads').replaceOne({ _id: name }, { _id: name, data: new Binary(fs.readFileSync(file)), createdAt: new Date() }, { upsert: true });
      n++;
    }
    console.log(`Migrado: ${data.teamComps?.length || 0} comps, ${data.customComps?.length || 0} sugestões, ` +
      `${data.tournaments?.length || 0} campeonatos, ${Object.keys(data.profiles || {}).length} perfis, ${n} imagens.`);
  } finally {
    await client.close();
  }
}

main().catch((err) => {
  console.error('Erro:', err.message);
  process.exit(1);
});
