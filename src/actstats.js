// Estatísticas de ranked do ato atual (HenrikDev): K/D, KDA, WR, HS%, ACS, ADR e agente mais jogado.
// Junta as partidas recentes (sempre atualizadas) com as armazenadas pela HenrikDev (vão mais para trás).
const { cached, getJson } = require('./remote');
const { henrikGet, RankError } = require('./rank');

const TTL = 10 * 60 * 1000;
const MAX_STORED_PAGES = 4; // até ~100 partidas armazenadas por consulta
const PAGE_SIZE = 25;

// Ato atual pelo calendário da valorant-api (ex.: "V26 · ATO V").
function currentAct() {
  return cached('valorant:current-act', 6 * 60 * 60 * 1000, async () => {
    const { data } = await getJson('https://valorant-api.com/v1/seasons');
    const now = Date.now();
    const act = data.find((s) => /Act/i.test(s.type) && Date.parse(s.startTime) <= now && now <= Date.parse(s.endTime));
    if (!act) throw new Error('Ato atual não encontrado');
    const episode = data.find((s) => s.uuid === act.parentUuid);
    return {
      id: act.uuid,
      name: `${episode ? `${episode.displayName} · ` : ''}${act.displayName.replace(/^ACT\b/i, 'ATO')}`,
      start: act.startTime,
      end: act.endTime,
    };
  });
}

const same = (a, b) => String(a || '').toLowerCase() === String(b || '').toLowerCase();

// Os dois formatos da HenrikDev -> { id, seasonId, startedAt, map, agent, k, d, a, hs, bs, ls, dmg, score, rounds, won }
function fromRecent(m, name, tag) {
  const p = m.players?.find((x) => same(x.name, name) && same(x.tag, tag));
  if (!p) return null;
  const team = m.teams?.find((t) => same(t.team_id, p.team_id));
  const rounds = (team?.rounds?.won ?? 0) + (team?.rounds?.lost ?? 0) || m.rounds?.length || 0;
  return {
    id: m.metadata.match_id,
    seasonId: m.metadata.season?.id,
    startedAt: m.metadata.started_at,
    map: m.metadata.map?.name,
    agent: p.agent?.name,
    k: p.stats.kills, d: p.stats.deaths, a: p.stats.assists,
    hs: p.stats.headshots, bs: p.stats.bodyshots, ls: p.stats.legshots,
    dmg: p.stats.damage?.dealt ?? 0,
    score: p.stats.score,
    rounds,
    won: team ? team.won && team.rounds.won !== team.rounds.lost : null,
    draw: team ? team.rounds.won === team.rounds.lost : false,
  };
}

function fromStored(m) {
  const s = m.stats;
  const mine = s.team?.toLowerCase();
  const other = mine === 'red' ? 'blue' : 'red';
  const us = m.teams?.[mine] ?? 0;
  const them = m.teams?.[other] ?? 0;
  return {
    id: m.meta.id,
    seasonId: m.meta.season?.id,
    startedAt: m.meta.started_at,
    map: m.meta.map?.name,
    agent: s.character?.name,
    k: s.kills, d: s.deaths, a: s.assists,
    hs: s.shots?.head ?? 0, bs: s.shots?.body ?? 0, ls: s.shots?.leg ?? 0,
    dmg: s.damage?.made ?? 0,
    score: s.score,
    rounds: us + them,
    won: us > them,
    draw: us === them,
  };
}

async function loadMatches(region, name, tag, act) {
  const byId = new Map();
  const n = encodeURIComponent(name);
  const t = encodeURIComponent(tag);

  const recent = await henrikGet(`/v4/matches/${region}/pc/${n}/${t}?mode=competitive&size=10`);
  for (const m of recent.data || []) {
    const x = fromRecent(m, name, tag);
    if (x) byId.set(x.id, x);
  }

  // Armazenadas, página a página, até passar do começo do ato.
  let partial = false;
  for (let page = 1; page <= MAX_STORED_PAGES; page++) {
    const res = await henrikGet(`/v1/stored-matches/${region}/${n}/${t}?mode=competitive&page=${page}&size=${PAGE_SIZE}`);
    const list = (res.data || []).map(fromStored);
    for (const x of list) if (!byId.has(x.id)) byId.set(x.id, x);
    const oldest = list[list.length - 1]?.startedAt;
    if (!list.length || !res.results?.after || (oldest && oldest < act.start)) break;
    if (page === MAX_STORED_PAGES) partial = true; // ainda tinha partidas do ato: conta só as mais recentes
  }
  return { fetchedAt: new Date().toISOString(), partial, list: [...byId.values()].filter((x) => x.seasonId === act.id) };
}

function summarize(matches) {
  const sum = (f) => matches.reduce((acc, m) => acc + (f(m) || 0), 0);
  const k = sum((m) => m.k), d = sum((m) => m.d), a = sum((m) => m.a);
  const shots = sum((m) => m.hs + m.bs + m.ls);
  const rounds = sum((m) => m.rounds);
  const wins = matches.filter((m) => m.won).length;
  const draws = matches.filter((m) => m.draw).length;
  const losses = matches.length - wins - draws;
  const n = matches.length;
  const round2 = (x) => Math.round(x * 100) / 100;
  return {
    matches: n, wins, losses, draws,
    winRate: n ? Math.round((wins / n) * 100) : null,
    kills: k, deaths: d, assists: a,
    kd: d ? round2(k / d) : k,
    kda: d ? round2((k + a) / d) : k + a,
    perMatch: n ? { k: round2(k / n), d: round2(d / n), a: round2(a / n) } : null,
    hsPct: shots ? Math.round((sum((m) => m.hs) / shots) * 100) : null,
    acs: rounds ? Math.round(sum((m) => m.score) / rounds) : null,
    adr: rounds ? Math.round(sum((m) => m.dmg) / rounds) : null,
  };
}

// { act, ...resumo, topAgent: { name, ...resumo }, agents: [...top 3] } ou { error }
async function getActStats({ riotId, region }, force = false) {
  const [name, tag] = riotId.split('#');
  try {
    const act = await currentAct();
    const { fetchedAt, partial, list: matches } = await cached(`act:${act.id}:${region}:${riotId.toLowerCase()}`, TTL, () => loadMatches(region, name, tag, act), force);
    const byAgent = {};
    for (const m of matches) (byAgent[m.agent] ||= []).push(m);
    const agents = Object.entries(byAgent)
      .map(([agent, list]) => ({ name: agent, ...summarize(list) }))
      .sort((x, y) => y.matches - x.matches || y.kd - x.kd);
    return { act, ...summarize(matches), topAgent: agents[0] || null, agents: agents.slice(0, 3), partial: !!partial, updatedAt: fetchedAt };
  } catch (e) {
    return { error: e instanceof RankError ? e.message : 'Não foi possível buscar as estatísticas agora' };
  }
}

module.exports = { getActStats };
