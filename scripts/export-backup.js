// Gera backups/backup-AAAA-MM-DD.json com os dados e as fotos locais (ou do MongoDB, se MONGODB_URI estiver ativa).
// Depois é só importar no site: Perfil do admin → Backup → Importar.
// ATENÇÃO: o arquivo tem os hashes das senhas. A pasta backups/ fica fora do git.
const fs = require('fs');
const path = require('path');

try { process.loadEnvFile(path.join(__dirname, '..', '.env')); } catch { /* sem .env */ }

const { createStorage } = require('../src/storage');
const { exportBackup } = require('../src/backup');

(async () => {
  const storage = await createStorage();
  try {
    const data = await storage.loadDb();
    if (!data) throw new Error('Nenhum dado encontrado para exportar');
    const backup = await exportBackup(data, (name) => storage.getFile(name));
    const dir = path.join(__dirname, '..', 'backups');
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, `backup-${new Date().toISOString().slice(0, 10)}.json`);
    fs.writeFileSync(file, JSON.stringify(backup));
    console.log(`Backup de ${storage.kind} salvo em ${file}`);
    console.log(`  ${data.teamComps?.length || 0} comps, ${data.customComps?.length || 0} sugestões, ` +
      `${data.tournaments?.length || 0} campeonatos, ${Object.keys(data.profiles || {}).length} perfis, ` +
      `${Object.keys(backup.files).length} imagens (${Math.round(fs.statSync(file).size / 1024)} KB)`);
  } finally {
    await storage.close();
  }
})().catch((err) => {
  console.error('Erro:', err.message);
  process.exit(1);
});
