// Perfis: funções preferidas (máx. 2), agentes favoritos (máx. 3), foto e banner.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const rank = require('./rank');

const ROLE_OPTIONS = ['Duelista', 'Controlador', 'Sentinela', 'Iniciador', 'Flex'];
const MAX_ROLES = 2;
const MAX_FAVORITES = 3;
const MAX_UPLOAD = 5 * 1024 * 1024;
const IMAGE_KINDS = ['avatar', 'banner'];

// Tipo real da imagem pelos primeiros bytes (não confia no Content-Type). SVG fica de fora de propósito.
function imageExt(buf) {
  if (buf.length < 12) return null;
  if (buf[0] === 0x89 && buf.toString('ascii', 1, 4) === 'PNG') return 'png';
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg';
  if (buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return 'webp';
  if (buf.toString('ascii', 0, 3) === 'GIF') return 'gif';
  return null;
}

module.exports = function profiles({ db, save, dataDir, users, roleOf, agentNames, wrap }) {
  const uploadDir = path.join(dataDir, 'uploads');
  fs.mkdirSync(uploadDir, { recursive: true });

  const get = (username) => (db.profiles[username] ||= { roles: [], favoriteAgents: [], avatar: null, banner: null });
  const fileUrl = (file) => (file ? `/api/uploads/${file}` : null);

  function publicProfile(username) {
    const u = users.find((x) => x.username === username);
    if (!u) return null;
    const p = db.profiles[username] || {};
    return {
      username: u.username,
      name: u.name,
      teamRole: roleOf(u), // player | coach
      roles: p.roles || [],
      favoriteAgents: p.favoriteAgents || [],
      avatar: fileUrl(p.avatar),
      banner: fileUrl(p.banner),
      riotId: p.riotId || null,
      region: p.region || 'br',
    };
  }

  function removeFile(file) {
    if (file) fs.rm(path.join(uploadDir, file), { force: true }, () => {});
  }

  const router = express.Router();

  router.get('/profiles/:username', (req, res) => {
    const p = publicProfile(req.params.username);
    p ? res.json(p) : res.status(404).json({ error: 'Usuário não encontrado' });
  });

  // Cada um só edita o próprio perfil.
  router.put('/profiles/me', wrap(async (req, res) => {
    const { roles, favoriteAgents, riotId, region } = req.body;
    const p = get(req.user);
    if (roles !== undefined) {
      if (!Array.isArray(roles) || roles.length > MAX_ROLES || new Set(roles).size !== roles.length || !roles.every((r) => ROLE_OPTIONS.includes(r))) {
        return res.status(400).json({ error: `Escolha até ${MAX_ROLES} funções` });
      }
      p.roles = roles;
    }
    if (favoriteAgents !== undefined) {
      const names = await agentNames();
      if (!Array.isArray(favoriteAgents) || favoriteAgents.length > MAX_FAVORITES || new Set(favoriteAgents).size !== favoriteAgents.length || !favoriteAgents.every((a) => names.has(a))) {
        return res.status(400).json({ error: `Escolha até ${MAX_FAVORITES} agentes favoritos` });
      }
      p.favoriteAgents = favoriteAgents;
    }
    if (riotId !== undefined) {
      if (!riotId) p.riotId = null;
      else {
        const parsed = rank.parseRiotId(riotId);
        if (!parsed) return res.status(400).json({ error: 'Riot ID inválido. Use o formato Nome#TAG' });
        p.riotId = parsed;
      }
    }
    if (region !== undefined) {
      if (!rank.REGIONS.includes(region)) return res.status(400).json({ error: 'Região inválida' });
      p.region = region;
    }
    save();
    res.json(publicProfile(req.user));
  }));

  // Elo atual/pico pelo Riot ID do perfil (HenrikDev, cache de 10 min).
  router.get('/rank/:username', wrap(async (req, res) => {
    const p = db.profiles[req.params.username];
    if (!p?.riotId) return res.json({ linked: false });
    res.json({ linked: true, ...(await rank.getRank({ riotId: p.riotId, region: p.region || 'br' })) });
  }));

  // Upload da foto/banner: o corpo é o arquivo bruto (o front já redimensiona antes de mandar).
  router.put('/profiles/me/:kind',
    express.raw({ type: ['image/*', 'application/octet-stream'], limit: MAX_UPLOAD }),
    (req, res) => {
      const { kind } = req.params;
      if (!IMAGE_KINDS.includes(kind)) return res.status(404).json({ error: 'Tipo inválido' });
      const buf = Buffer.isBuffer(req.body) ? req.body : null;
      const ext = buf && imageExt(buf);
      if (!ext) return res.status(400).json({ error: 'Envie uma imagem PNG, JPG, WebP ou GIF' });

      const file = `${req.user}-${kind}-${crypto.randomBytes(6).toString('hex')}.${ext}`;
      try {
        fs.mkdirSync(uploadDir, { recursive: true }); // garante a pasta mesmo se foi apagada com o servidor rodando
        fs.writeFileSync(path.join(uploadDir, file), buf);
      } catch (err) {
        console.error('[upload]', err);
        return res.status(500).json({ error: 'Não foi possível salvar a imagem no servidor' });
      }
      const p = get(req.user);
      removeFile(p[kind]);
      p[kind] = file;
      save();
      res.json(publicProfile(req.user));
    });

  router.delete('/profiles/me/:kind', (req, res) => {
    const { kind } = req.params;
    if (!IMAGE_KINDS.includes(kind)) return res.status(404).json({ error: 'Tipo inválido' });
    const p = get(req.user);
    removeFile(p[kind]);
    p[kind] = null;
    save();
    res.json(publicProfile(req.user));
  });

  router.get('/uploads/:file', (req, res) => {
    const { file } = req.params;
    if (!/^[a-z0-9_.-]+$/i.test(file) || file.includes('..')) return res.status(400).end();
    res.setHeader('Cache-Control', 'private, max-age=31536000, immutable'); // nome muda a cada upload
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.sendFile(path.join(uploadDir, file), (err) => err && !res.headersSent && res.status(404).end());
  });

  return { router, publicProfile, ROLE_OPTIONS, REGIONS: rank.REGIONS };
};
