// Estratégias por mapa (quadro estilo Valoplant): fases com agentes, habilidades, setas, desenhos e textos.
// Todos criam; quem criou ou o admin edita; só o admin marca/desmarca como "padrão do time"
// e só ele edita ou apaga uma estratégia padrão.
const express = require('express');

const SIDES = ['atk', 'def'];
const SLOTS = ['Ability1', 'Ability2', 'Grenade', 'Ultimate'];
const TEAMS = ['ally', 'enemy'];
const ITEM_TYPES = ['agent', 'ability', 'spike', 'arrow', 'line', 'pen', 'text'];
const LIMITS = { phases: 12, items: 300, penPoints: 600, text: 80, name: 60, notes: 2000, task: 120, tags: 4 };
const COLOR = /^#[0-9a-f]{6}$/i;

const str = (v, max) => String(v ?? '').trim().slice(0, max);
const coord = (v) => {
  const n = Number(v);
  if (!Number.isFinite(n)) throw new Error('Coordenada inválida');
  return Math.round(Math.min(1, Math.max(0, n)) * 10000) / 10000; // 0..1, 4 casas
};

module.exports = function strategies({ db, save, newId, isAdmin, playerNames, agentNames, findMap, wrap }) {
  db.strategies ||= [];
  const router = express.Router();

  const canEdit = (s, u) => (s.official ? isAdmin(u) : s.createdBy === u || isAdmin(u));

  // Normaliza e valida os itens de uma fase. Lança erro com mensagem amigável.
  function cleanItems(items, agents) {
    if (!Array.isArray(items)) throw new Error('Fase inválida');
    if (items.length > LIMITS.items) throw new Error(`Máximo de ${LIMITS.items} itens por fase`);
    return items.map((it) => {
      if (!it || !ITEM_TYPES.includes(it.type)) throw new Error('Item desconhecido no quadro');
      const base = { id: str(it.id, 24) || newId(), type: it.type };
      const color = COLOR.test(it.color || '') ? it.color : '#ffffff';
      switch (it.type) {
        case 'agent':
          if (!agents.has(it.agent)) throw new Error(`Agente inválido: ${it.agent}`);
          return { ...base, x: coord(it.x), y: coord(it.y), agent: it.agent, team: TEAMS.includes(it.team) ? it.team : 'ally', player: playerNames.has(it.player) ? it.player : '' };
        case 'ability':
          if (!agents.has(it.agent) || !SLOTS.includes(it.slot)) throw new Error('Habilidade inválida');
          return { ...base, x: coord(it.x), y: coord(it.y), agent: it.agent, slot: it.slot, team: TEAMS.includes(it.team) ? it.team : 'ally' };
        case 'spike':
          return { ...base, x: coord(it.x), y: coord(it.y) };
        case 'text':
          return { ...base, x: coord(it.x), y: coord(it.y), text: str(it.text, LIMITS.text) || '…', color };
        case 'arrow':
        case 'line': {
          const p = (it.points || []).slice(0, 4).map(coord);
          if (p.length !== 4) throw new Error('Linha inválida');
          return { ...base, points: p, color, dashed: !!it.dashed };
        }
        case 'pen': {
          const p = (it.points || []).map(coord);
          if (p.length < 4 || p.length % 2 || p.length > LIMITS.penPoints * 2) throw new Error('Desenho inválido');
          return { ...base, points: p, color };
        }
        default:
          throw new Error('Item desconhecido no quadro');
      }
    });
  }

  async function cleanStrategy(body, mapId, excludeId) {
    const name = str(body.name, LIMITS.name);
    if (!name) throw new Error('Dê um nome para a estratégia');
    if (db.strategies.some((s) => s.map === mapId && s.id !== excludeId && s.name.toLowerCase() === name.toLowerCase())) {
      const e = new Error(`Já existe uma estratégia chamada "${name}" neste mapa`);
      e.status = 409;
      throw e;
    }
    const agents = await agentNames();
    const phases = Array.isArray(body.phases) ? body.phases : [];
    if (!phases.length || phases.length > LIMITS.phases) throw new Error(`Use de 1 a ${LIMITS.phases} fases`);
    return {
      name,
      side: SIDES.includes(body.side) ? body.side : 'atk',
      tags: (Array.isArray(body.tags) ? body.tags : []).map((t) => str(t, 24)).filter(Boolean).slice(0, LIMITS.tags),
      notes: str(body.notes, LIMITS.notes),
      rotated: !!body.rotated,
      assignments: (Array.isArray(body.assignments) ? body.assignments : []).slice(0, 5).map((a) => ({
        player: playerNames.has(a?.player) ? a.player : '',
        agent: agents.has(a?.agent) ? a.agent : '',
        task: str(a?.task, LIMITS.task),
      })),
      phases: phases.map((ph, i) => ({
        id: str(ph?.id, 24) || newId(),
        name: str(ph?.name, 30) || `Fase ${i + 1}`,
        note: str(ph?.note, 300),
        items: cleanItems(ph?.items || [], agents),
      })),
    };
  }

  const fail = (res, err) => res.status(err.status || 400).json({ error: err.message });
  const summary = (s) => ({ ...s, phases: s.phases.map((p) => ({ ...p })) });

  router.get('/maps/:id/strategies', (req, res) => {
    const list = db.strategies.filter((s) => s.map === req.params.id)
      .sort((a, b) => (b.official - a.official) || ((a.updatedAt || a.createdAt) < (b.updatedAt || b.createdAt) ? 1 : -1));
    res.json(list.map(summary));
  });

  router.get('/strategies/:sid', (req, res) => {
    const s = db.strategies.find((x) => x.id === req.params.sid);
    s ? res.json(s) : res.status(404).json({ error: 'Estratégia não encontrada' });
  });

  router.post('/maps/:id/strategies', wrap(async (req, res) => {
    const map = await findMap(req.params.id);
    if (!map) return res.status(404).json({ error: 'Mapa não encontrado' });
    try {
      const s = { id: newId(), map: map.id, ...(await cleanStrategy(req.body, map.id)), official: false, createdBy: req.user, createdAt: new Date().toISOString() };
      db.strategies.push(s);
      save();
      res.status(201).json(s);
    } catch (err) {
      fail(res, err);
    }
  }));

  router.put('/strategies/:sid', wrap(async (req, res) => {
    const s = db.strategies.find((x) => x.id === req.params.sid);
    if (!s) return res.status(404).json({ error: 'Estratégia não encontrada' });
    if (!canEdit(s, req.user)) {
      return res.status(403).json({ error: s.official ? 'Só o admin altera uma estratégia padrão. Use "Duplicar" para fazer a sua versão.' : 'Só quem criou (ou o admin) pode alterar' });
    }
    try {
      Object.assign(s, await cleanStrategy(req.body, s.map, s.id), { updatedBy: req.user, updatedAt: new Date().toISOString() });
      save();
      res.json(s);
    } catch (err) {
      fail(res, err);
    }
  }));

  router.delete('/strategies/:sid', (req, res) => {
    const i = db.strategies.findIndex((x) => x.id === req.params.sid);
    if (i < 0) return res.status(404).json({ error: 'Estratégia não encontrada' });
    if (!canEdit(db.strategies[i], req.user)) return res.status(403).json({ error: 'Sem permissão para apagar esta estratégia' });
    db.strategies.splice(i, 1);
    save();
    res.json({ ok: true });
  });

  // Admin marca/desmarca como padrão do time.
  router.post('/strategies/:sid/official', (req, res) => {
    if (!isAdmin(req.user)) return res.status(403).json({ error: 'Só o admin define as estratégias padrão' });
    const s = db.strategies.find((x) => x.id === req.params.sid);
    if (!s) return res.status(404).json({ error: 'Estratégia não encontrada' });
    s.official = !!req.body.official;
    s.officialBy = s.official ? req.user : null;
    save();
    res.json(s);
  });

  return { router };
};
