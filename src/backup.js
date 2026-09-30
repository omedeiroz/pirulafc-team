// Backup completo do time num JSON só: dados + imagens (base64).
// Usado pelo `npm run exportar` e pelo card "Backup" do admin (baixar/importar pelo site).
const VERSION = 1;
const MAX_FILES = 200;

// Imagens que algum perfil usa.
const usedFiles = (data) => [...new Set(Object.values(data.profiles || {}).flatMap((p) => [p.avatar, p.banner]).filter(Boolean))];

async function exportBackup(data, getFile) {
  const files = {};
  for (const name of usedFiles(data)) {
    const buf = await getFile(name);
    if (buf) files[name] = buf.toString('base64');
  }
  const { secret, ...rest } = data; // o segredo das sessões fica de fora: cada instalação tem o seu
  return { app: 'comps', version: VERSION, exportedAt: new Date().toISOString(), data: rest, files };
}

// Confere o formato antes de substituir qualquer coisa. Lança erro com mensagem amigável.
function validateBackup(b) {
  if (!b || b.app !== 'comps' || b.version !== VERSION || typeof b.data !== 'object') {
    throw new Error('Arquivo não é um backup válido deste site');
  }
  for (const k of ['customComps', 'teamComps', 'tournaments']) {
    if (b.data[k] !== undefined && !Array.isArray(b.data[k])) throw new Error(`Backup corrompido (${k})`);
  }
  for (const k of ['profiles', 'passwords']) {
    if (b.data[k] !== undefined && (typeof b.data[k] !== 'object' || Array.isArray(b.data[k]))) throw new Error(`Backup corrompido (${k})`);
  }
  const names = Object.keys(b.files || {});
  if (names.length > MAX_FILES) throw new Error('Backup com imagens demais');
  if (names.some((n) => !/^[a-z0-9_.-]+$/i.test(n) || n.includes('..'))) throw new Error('Backup com nome de imagem inválido');
}

// Substitui os dados atuais pelos do backup (mantém o segredo das sessões desta instalação).
async function importBackup(data, backup, putFile) {
  validateBackup(backup);
  for (const [name, b64] of Object.entries(backup.files || {})) await putFile(name, Buffer.from(b64, 'base64'));
  const secret = data.secret;
  for (const k of Object.keys(data)) delete data[k];
  Object.assign(data, backup.data, { secret });
  data.customComps ||= [];
  data.teamComps ||= [];
  data.tournaments ||= [];
  data.profiles ||= {};
  data.passwords ||= {};
  return {
    comps: data.teamComps.length,
    suggestions: data.customComps.length,
    tournaments: data.tournaments.length,
    profiles: Object.keys(data.profiles).length,
    images: Object.keys(backup.files || {}).length,
  };
}

module.exports = { exportBackup, importBackup };
