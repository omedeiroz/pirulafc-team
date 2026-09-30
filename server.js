const path = require('path');
const crypto = require('crypto');

// Carrega o .env (ex.: HENRIKDEV_API_KEY) se existir.
try { process.loadEnvFile(path.join(__dirname, '.env')); } catch { /* sem .env */ }
const express = require('express');

const USERS = require('./src/users');
const spike = require('./src/spike');
const valorant = require('./src/valorant');
const dbStore = require('./src/db');
const { data: db, save, newId } = dbStore;
const createProfiles = require('./src/profiles');
const { exportBackup, importBackup } = require('./src/backup');

const PORT = process.env.PORT || 3000;
const SESSION_DAYS = 30;
const USER_NAMES = new Set(USERS.map((u) => u.username));
const roleOf = (u) => u.role || 'player';
// Só quem joga pode ser escalado em comp ou ter K/D/A; o coach não entra.
const PLAYER_NAMES = new Set(USERS.filter((u) => roleOf(u) === 'player').map((u) => u.username));

const app = express();
app.disable('x-powered-by');
// Atrás de túnel/hospedagem (Cloudflare, Railway…): usa o IP real do visitante no limite de tentativas de login.
if (process.env.TRUST_PROXY) app.set('trust proxy', Number(process.env.TRUST_PROXY) || 1);
// JSON pequeno em tudo; só a importação de backup (que traz as fotos) aceita arquivo maior.
const smallJson = express.json({ limit: '200kb' });
const backupJson = express.json({ limit: '30mb' });
app.use((req, res, next) => (req.path === '/api/admin/backup' ? backupJson : smallJson)(req, res, next));

// ---------- Autenticação (token assinado em cookie httpOnly) ----------

function sign(payload) {
  return crypto.createHmac('sha256', db.secret).update(payload).digest('base64url');
}

// Senha atual do usuário: a que ele trocou (db) ou a inicial de users.js.
const passwordHashOf = (username) => db.passwords[username] || USERS.find((u) => u.username === username)?.password || '';
// "Versão" da senha dentro do token: trocar a senha derruba as sessões abertas em outros aparelhos.
const passwordVersion = (username) => crypto.createHash('sha256').update(passwordHashOf(username)).digest('base64url').slice(0, 10);

function makeToken(username) {
  const payload = Buffer.from(JSON.stringify({ u: username, pv: passwordVersion(username), exp: Date.now() + SESSION_DAYS * 864e5 })).toString('base64url');
  return `${payload}.${sign(payload)}`;
}

function readToken(token) {
  if (!token || !token.includes('.')) return null;
  const [payload, sig] = token.split('.');
  const expected = sign(payload);
  if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  try {
    const { u, pv, exp } = JSON.parse(Buffer.from(payload, 'base64url').toString());
    return exp > Date.now() && USER_NAMES.has(u) && pv === passwordVersion(u) ? u : null;
  } catch {
    return null;
  }
}

function getCookie(req, name) {
  const found = (req.headers.cookie || '').split(';').map((c) => c.trim()).find((c) => c.startsWith(name + '='));
  return found ? decodeURIComponent(found.slice(name.length + 1)) : null;
}

function checkPassword(user, password) {
  const [salt, hash] = passwordHashOf(user.username).split(':');
  const got = crypto.scryptSync(String(password), salt, 64);
  return crypto.timingSafeEqual(got, Buffer.from(hash, 'hex'));
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  return `${salt}:${crypto.scryptSync(password, salt, 64).toString('hex')}`;
}

function sessionCookie(req, username) {
  const secure = req.secure || req.headers['x-forwarded-proto'] === 'https' ? '; Secure' : '';
  return `session=${makeToken(username)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${SESSION_DAYS * 86400}${secure}`;
}

// Quem ainda usa a senha inicial de users.js recebe um aviso para trocar.
const meInfo = (u) => ({ username: u.username, name: u.name, role: roleOf(u), admin: !!u.admin, mustChangePassword: !db.passwords[u.username] });

const loginAttempts = new Map(); // ip -> { count, until }

app.post('/api/login', (req, res) => {
  const ip = req.ip;
  const att = loginAttempts.get(ip) || { count: 0, until: 0 };
  if (att.until > Date.now()) return res.status(429).json({ error: 'Muitas tentativas. Tente de novo em alguns minutos.' });

  const username = String(req.body?.username || '').trim().toLowerCase();
  const user = USERS.find((u) => u.username === username);
  if (!user || !checkPassword(user, req.body?.password || '')) {
    att.count += 1;
    if (att.count >= 8) Object.assign(att, { count: 0, until: Date.now() + 5 * 60 * 1000 });
    loginAttempts.set(ip, att);
    return res.status(401).json({ error: 'Usuário ou senha inválidos' });
  }
  loginAttempts.delete(ip);
  res.setHeader('Set-Cookie', sessionCookie(req, user.username));
  res.json(meInfo(user));
});

app.post('/api/logout', (req, res) => {
  res.setHeader('Set-Cookie', 'session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0');
  res.json({ ok: true });
});

// Health check da hospedagem (sem login).
app.get('/api/health', (req, res) => res.json({ ok: true }));

app.use('/api', (req, res, next) => {
  const username = readToken(getCookie(req, 'session'));
  if (!username) return res.status(401).json({ error: 'Não autenticado' });
  req.user = username;
  next();
});

// ---------- Helpers ----------

const bad = (res, msg) => res.status(400).json({ error: msg });
const forbidden = (res, msg) => res.status(403).json({ error: msg });
const isAdmin = (username) => USERS.some((u) => u.username === username && u.admin);
const str = (v, max = 200) => String(v ?? '').trim().slice(0, max);
const num = (v) => (v === '' || v === null || v === undefined || isNaN(Number(v)) ? null : Math.max(0, Math.round(Number(v))));
// Rotas async: erros das APIs externas viram 502 em vez de derrubar o request.
const wrap = (fn) => (req, res, next) => fn(req, res, next).catch((e) => {
  console.warn('[api]', e.message);
  res.status(502).json({ error: 'Não foi possível consultar as APIs de dados (THESPIKE.GG / valorant-api). Tente de novo.' });
});

async function findMap(id) {
  return (await spike.maps()).maps.find((m) => m.id === id);
}

async function agentNames() {
  return new Set((await valorant.agents()).map((a) => a.name));
}

async function validAgents(agents) {
  const names = await agentNames();
  return Array.isArray(agents) && agents.length === 5 && new Set(agents).size === 5 && agents.every((a) => names.has(a));
}

// ---------- Perfis (funções, favoritos, foto, banner) ----------

const profiles = createProfiles({ db, save, files: dbStore.files, users: USERS, roleOf, agentNames, wrap });
app.use('/api', profiles.router);

// ---------- Backup (só admin): baixar tudo / importar de outro lugar ----------

app.get('/api/admin/backup', wrap(async (req, res) => {
  if (!isAdmin(req.user)) return forbidden(res, 'Só o admin pode baixar o backup');
  await dbStore.flush();
  const backup = await exportBackup(db, dbStore.files.get);
  res.setHeader('Content-Disposition', `attachment; filename="backup-${new Date().toISOString().slice(0, 10)}.json"`);
  res.json(backup);
}));

app.post('/api/admin/backup', async (req, res) => {
  if (!isAdmin(req.user)) return forbidden(res, 'Só o admin pode importar backup');
  try {
    const summary = await importBackup(db, req.body, dbStore.files.put);
    save();
    await dbStore.flush();
    console.log('[backup] importado por', req.user, summary);
    res.json(summary);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ---------- Básico ----------

app.get('/api/me', (req, res) => {
  const u = USERS.find((x) => x.username === req.user);
  res.json(meInfo(u));
});

// Trocar a própria senha. Derruba as outras sessões (versão da senha no token) e renova a atual.
app.post('/api/me/password', (req, res) => {
  const u = USERS.find((x) => x.username === req.user);
  const { current, next } = req.body || {};
  if (!checkPassword(u, current || '')) return bad(res, 'Senha atual incorreta');
  if (typeof next !== 'string' || next.length < 8) return bad(res, 'A nova senha precisa ter pelo menos 8 caracteres');
  if (next.length > 128) return bad(res, 'Senha longa demais');
  if (next === current) return bad(res, 'A nova senha precisa ser diferente da atual');
  if (next.toLowerCase() === 'teste123') return bad(res, 'Escolha uma senha diferente da padrão');
  db.passwords[u.username] = hashPassword(next);
  save();
  res.setHeader('Set-Cookie', sessionCookie(req, u.username));
  res.json(meInfo(u));
});

// Tudo que o front precisa no boot. Mapas/rotação (THESPIKE, VCT) e agentes (valorant-api) são dinâmicos.
app.get('/api/bootstrap', wrap(async (req, res) => {
  const [{ maps, poolSource }, agents, images] = await Promise.all([
    spike.maps(),
    valorant.agents(),
    valorant.mapImages().catch(() => ({})),
  ]);
  res.json({
    // players = line-up (entra nas comps); staff = coach etc. (só aparece como autor das ações)
    players: USERS.filter((u) => roleOf(u) === 'player').map((u) => profiles.publicProfile(u.username)),
    staff: USERS.filter((u) => roleOf(u) !== 'player').map((u) => ({ ...profiles.publicProfile(u.username), role: roleOf(u) })),
    roleOptions: profiles.ROLE_OPTIONS,
    regions: profiles.REGIONS,
    admins: USERS.filter((u) => u.admin).map((u) => u.username),
    // Ícones oficiais das funções (valorant-api). Flex não tem ícone oficial; o front usa um próprio.
    roleIcons: Object.fromEntries(agents.filter((a) => a.roleIcon).map((a) => [a.role, a.roleIcon])),
    agents,
    maps: maps.map((m) => ({ ...m, splash: images[m.name.toLowerCase()]?.splash || '' })),
    poolSource,
  });
}));

// ---------- Comps do meta (THESPIKE.GG, só VCT oficial) ----------

app.get('/api/vct-events', wrap(async (req, res) => {
  res.json(await spike.vctEvents());
}));

app.get('/api/maps/:id/meta', wrap(async (req, res) => {
  const map = await findMap(req.params.id);
  if (!map) return res.status(404).json({ error: 'Mapa não encontrado' });
  const scope = str(req.query.scope, 20) || 'recent';
  const { events, comps } = await spike.metaComps(map.spikeId, scope, req.query.refresh === '1');
  res.json({ events, comps });
}));

// Comps salvas pelo time como "prontas" (presets próprios)
app.get('/api/maps/:id/custom-comps', (req, res) => {
  res.json(db.customComps.filter((c) => c.map === req.params.id).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)));
});

// Qualquer um salva/sugere comps. Pode vir só com agentes ou já com os players de cada slot.
app.post('/api/maps/:id/custom-comps', wrap(async (req, res) => {
  const map = await findMap(req.params.id);
  if (!map) return res.status(404).json({ error: 'Mapa não encontrado' });
  const slots = Array.isArray(req.body.slots) ? req.body.slots : (req.body.agents || []).map((agent) => ({ agent, player: '' }));
  const agents = slots.map((s) => s.agent);
  if (!(await validAgents(agents))) return bad(res, 'Escolha 5 agentes diferentes');
  const players = slots.map((s) => s.player).filter(Boolean);
  if (players.some((p) => !PLAYER_NAMES.has(p)) || new Set(players).size !== players.length) {
    return bad(res, 'Players inválidos ou repetidos');
  }
  // Sem duplicatas no mesmo mapa: nem nome repetido, nem a mesma comp (agentes + players) de novo.
  const name = str(req.body.name, 60) || 'Comp sugerida';
  const sameMap = db.customComps.filter((c) => c.map === map.id);
  if (sameMap.some((c) => c.name.trim().toLowerCase() === name.toLowerCase())) {
    return res.status(409).json({ error: `Já existe uma comp chamada "${name}" neste mapa. Escolha outro nome.` });
  }
  const key = (list) => list.map((s) => `${s.agent}:${s.player || ''}`).sort().join('|');
  const dup = sameMap.find((c) => key(c.slots || c.agents.map((agent) => ({ agent, player: '' }))) === key(slots));
  if (dup) return res.status(409).json({ error: `Essa comp já foi salva como "${dup.name}".` });

  const comp = {
    id: newId(),
    map: map.id,
    name,
    notes: str(req.body.notes, 1000),
    agents,
    slots: slots.map((s) => ({ agent: s.agent, player: PLAYER_NAMES.has(s.player) ? s.player : '' })),
    createdBy: req.user,
    createdAt: new Date().toISOString(),
  };
  db.customComps.push(comp);
  save();
  res.status(201).json(comp);
}));

// Cada um apaga as próprias sugestões; o admin apaga qualquer uma.
app.delete('/api/custom-comps/:id', (req, res) => {
  const i = db.customComps.findIndex((c) => c.id === req.params.id);
  if (i < 0) return res.status(404).json({ error: 'Comp não encontrada' });
  if (db.customComps[i].createdBy !== req.user && !isAdmin(req.user)) return forbidden(res, 'Só quem criou (ou o admin) pode excluir esta comp');
  db.customComps.splice(i, 1);
  save();
  res.json({ ok: true });
});

// ---------- Comp confirmada do time (agente + player) ----------

app.get('/api/team-comps', (req, res) => {
  const list = req.query.map ? db.teamComps.filter((c) => c.map === req.query.map) : db.teamComps;
  res.json([...list].sort((a, b) => (a.confirmedAt < b.confirmedAt ? 1 : -1)));
});

// Só o admin define a comp padrão (evita cada um trocar por conta própria).
app.post('/api/maps/:id/team-comp', wrap(async (req, res) => {
  if (!isAdmin(req.user)) return forbidden(res, 'Só o admin define a comp padrão. Salve como sugestão.');
  const map = await findMap(req.params.id);
  if (!map) return res.status(404).json({ error: 'Mapa não encontrado' });
  const slots = req.body.slots;
  if (!Array.isArray(slots) || slots.length !== 5) return bad(res, 'A comp precisa de 5 slots');
  const agents = slots.map((s) => s.agent);
  const players = slots.map((s) => s.player);
  if (!(await validAgents(agents))) return bad(res, 'Escolha 5 agentes diferentes');
  const notPlayer = players.find((p) => USER_NAMES.has(p) && !PLAYER_NAMES.has(p));
  if (notPlayer) return bad(res, `${notPlayer} é da comissão técnica e não pode ser escalado`);
  if (!players.every((p) => PLAYER_NAMES.has(p)) || new Set(players).size !== 5) return bad(res, 'Cada agente precisa de um player diferente');

  const comp = {
    id: newId(),
    map: map.id,
    name: str(req.body.name, 60),
    source: str(req.body.source, 80),
    notes: str(req.body.notes, 1000),
    slots: slots.map((s) => ({ agent: s.agent, player: s.player })),
    confirmedBy: req.user,
    confirmedAt: new Date().toISOString(),
  };
  db.teamComps.push(comp);
  save();
  res.status(201).json(comp);
}));

app.delete('/api/team-comps/:id', (req, res) => {
  if (!isAdmin(req.user)) return forbidden(res, 'Só o admin pode apagar do histórico');
  const i = db.teamComps.findIndex((c) => c.id === req.params.id);
  if (i < 0) return res.status(404).json({ error: 'Comp não encontrada' });
  db.teamComps.splice(i, 1);
  save();
  res.json({ ok: true });
});
// ---------- Campeonatos ----------

function cleanTournament(body) {
  const link = str(body.link, 500);
  return {
    name: str(body.name, 120),
    link: /^https?:\/\//i.test(link) ? link : '',
    organizer: str(body.organizer, 120),
    startDate: str(body.startDate, 10),
    endDate: str(body.endDate, 10),
    placement: str(body.placement, 60),
    prize: str(body.prize, 60),
    notes: str(body.notes, 2000),
  };
}

async function cleanMatch(body) {
  const stats = Array.isArray(body.stats) ? body.stats : [];
  const [map, agents] = await Promise.all([findMap(body.map), agentNames()]);
  return {
    date: str(body.date, 10),
    opponent: str(body.opponent, 120),
    stage: str(body.stage, 60),
    map: map ? map.id : '',
    scoreUs: num(body.scoreUs),
    scoreThem: num(body.scoreThem),
    vod: /^https?:\/\//i.test(str(body.vod, 500)) ? str(body.vod, 500) : '',
    notes: str(body.notes, 1000),
    stats: stats
      .filter((s) => PLAYER_NAMES.has(s.player))
      .slice(0, 5)
      .map((s) => ({
        player: s.player,
        agent: agents.has(s.agent) ? s.agent : '',
        k: num(s.k), d: num(s.d), a: num(s.a), acs: num(s.acs),
      })),
  };
}

const findT = (id) => db.tournaments.find((t) => t.id === id);

app.get('/api/tournaments', (req, res) => {
  res.json([...db.tournaments].sort((a, b) => ((a.startDate || '') < (b.startDate || '') ? 1 : -1)));
});

app.get('/api/tournaments/:id', (req, res) => {
  const t = findT(req.params.id);
  t ? res.json(t) : res.status(404).json({ error: 'Campeonato não encontrado' });
});

app.post('/api/tournaments', (req, res) => {
  const t = cleanTournament(req.body);
  if (!t.name) return bad(res, 'Informe o nome do campeonato');
  const full = { id: newId(), ...t, matches: [], createdBy: req.user, createdAt: new Date().toISOString() };
  db.tournaments.push(full);
  save();
  res.status(201).json(full);
});

app.put('/api/tournaments/:id', (req, res) => {
  const t = findT(req.params.id);
  if (!t) return res.status(404).json({ error: 'Campeonato não encontrado' });
  const upd = cleanTournament(req.body);
  if (!upd.name) return bad(res, 'Informe o nome do campeonato');
  Object.assign(t, upd);
  save();
  res.json(t);
});

app.delete('/api/tournaments/:id', (req, res) => {
  const i = db.tournaments.findIndex((t) => t.id === req.params.id);
  if (i < 0) return res.status(404).json({ error: 'Campeonato não encontrado' });
  db.tournaments.splice(i, 1);
  save();
  res.json({ ok: true });
});

app.post('/api/tournaments/:id/matches', wrap(async (req, res) => {
  const t = findT(req.params.id);
  if (!t) return res.status(404).json({ error: 'Campeonato não encontrado' });
  const m = await cleanMatch(req.body);
  if (!m.opponent) return bad(res, 'Informe o adversário');
  const full = { id: newId(), ...m, createdBy: req.user };
  t.matches.push(full);
  save();
  res.status(201).json(full);
}));

app.put('/api/tournaments/:id/matches/:mid', wrap(async (req, res) => {
  const t = findT(req.params.id);
  const m = t?.matches.find((x) => x.id === req.params.mid);
  if (!m) return res.status(404).json({ error: 'Partida não encontrada' });
  const upd = await cleanMatch(req.body);
  if (!upd.opponent) return bad(res, 'Informe o adversário');
  Object.assign(m, upd);
  save();
  res.json(m);
}));

app.delete('/api/tournaments/:id/matches/:mid', (req, res) => {
  const t = findT(req.params.id);
  const i = t ? t.matches.findIndex((x) => x.id === req.params.mid) : -1;
  if (i < 0) return res.status(404).json({ error: 'Partida não encontrada' });
  t.matches.splice(i, 1);
  save();
  res.json({ ok: true });
});

// ---------- Front-end ----------

// Erros de parsing do corpo (arquivo grande demais, JSON inválido…) voltam em JSON, não em HTML.
app.use('/api', (err, req, res, next) => {
  if (res.headersSent) return next(err);
  const status = err.status || err.statusCode || 500;
  if (status >= 500) console.error('[api]', err);
  res.status(status).json({ error: status === 413 ? 'Imagem muito grande (máx. 5 MB)' : err.expose ? err.message : 'Erro no servidor' });
});

// Em produção serve o build do React (npm run build). Em dev, o Vite (porta 5173) faz proxy de /api para cá.
const DIST = path.join(__dirname, 'client', 'dist');
app.use(express.static(DIST));
app.get(/^\/(?!api\/).*/, (req, res) => res.sendFile(path.join(DIST, 'index.html'), (err) => {
  if (err) res.status(404).send('Front-end não compilado. Rode "npm run build" ou use "npm run dev".');
}));

// Carrega os dados (arquivo local ou MongoDB) antes de aceitar conexões.
dbStore.init().then(() => {
  const server = app.listen(PORT, () => {
    console.log(`Comps rodando em http://localhost:${PORT}`);
    // Aquece o cache das APIs para o primeiro acesso ser rápido.
    Promise.all([spike.maps(), valorant.agents(), valorant.mapImages()]).catch((e) => console.warn('[api] aquecimento falhou:', e.message));
  });

  // Hospedagens (Render etc.) mandam SIGTERM antes de desligar: grava o que estiver pendente.
  const shutdown = (signal) => {
    console.log(`[server] ${signal}: salvando e encerrando…`);
    server.close();
    dbStore.close().finally(() => process.exit(0));
    setTimeout(() => process.exit(0), 8000).unref();
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}).catch((err) => {
  console.error('[db] não foi possível carregar os dados:', err.message);
  if (process.env.MONGODB_URI && /alert number 80|ServerSelection|timed out/i.test(`${err.name} ${err.message}`)) {
    console.error('[db] Dica: no MongoDB Atlas, vá em Network Access e libere 0.0.0.0/0 (o Render não tem IP fixo). ' +
      'Confira também usuário/senha no MONGODB_URI.');
  }
  process.exit(1);
});
