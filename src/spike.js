// Tudo sobre mapas, map pool e comps vem da API pública do THESPIKE.GG,
// usando SOMENTE eventos oficiais do VCT (Kickoff, Stages, Masters, Champions).
// Showmatches, Game Changers, Challengers e Ascension ficam de fora.
const { cached, getJson, fetchText } = require('./remote');

const API = 'https://api.thespike.gg';
const SITE = 'https://www.thespike.gg';
const H = 60 * 60 * 1000;
const RECENT_DAYS = 100; // "meta atual" = eventos que começaram nos últimos N dias (ou em andamento)

// A busca rápida do site só casa palavras soltas, então varremos alguns termos.
const SEARCH_TERMS = ['Kickoff', 'Stage 1', 'Stage 2', 'Stage 3', 'Masters', 'Champions', 'Americas', 'EMEA', 'Pacific', 'China'];

const slug = (name) => name.toLowerCase().replace(/[^a-z0-9]+/g, '-');

// Catálogo de mapas competitivos com os IDs internos do THESPIKE (lidos dos filtros da página de stats).
function mapCatalog(force = false) {
  return cached('spike:maps', 24 * H, async () => {
    const html = await fetchText(`${SITE}/valorant-stats/agents-compositions`);
    const json = html.match(/<script id="__NEXT_DATA__" type="application\/json">(.*?)<\/script>/s)?.[1];
    const maps = JSON.parse(json).props.pageProps.filters.maps;
    if (!maps?.length) throw new Error('Filtros de mapas não encontrados');
    return maps.map((m) => ({ id: slug(m.title), name: m.title, spikeId: m.id }));
  }, force);
}

function isOfficialVct(title, year) {
  return (
    title.startsWith(`VALORANT Champions Tour ${year} - `) &&
    !/showmatch|game changers|challengers|ascension/i.test(title)
  );
}

// Eventos oficiais do VCT do ano, com datas e map pool.
function vctEvents(force = false) {
  return cached('spike:events', 12 * H, async () => {
    const year = new Date().getFullYear();
    const found = new Map();
    const results = await Promise.allSettled(
      SEARCH_TERMS.map((q) => getJson(`${API}/quick-search?q=${encodeURIComponent(q)}&searchFor[]=event`))
    );
    for (const r of results) {
      if (r.status !== 'fulfilled' || !Array.isArray(r.value)) continue;
      for (const e of r.value) if (isOfficialVct(e.title, year)) found.set(e.id, e);
    }
    const details = await Promise.allSettled([...found.keys()].map((id) => getJson(`${API}/events/${id}`)));
    const events = details
      .filter((d) => d.status === 'fulfilled')
      .map(({ value: e }) => ({
        id: e.id,
        title: e.title.replace(/^VALORANT Champions Tour \d{4} - /, 'VCT '),
        startDate: e.startDate,
        endDate: e.endDate,
        status: e.status, // past | ongoing | upcoming
        mapPool: (e.mapPool || []).map((m) => m.title),
      }))
      .filter((e) => e.status !== 'upcoming')
      .sort((a, b) => (a.startDate < b.startDate ? 1 : -1));
    if (!events.length) throw new Error('Nenhum evento do VCT encontrado');
    return events;
  }, force);
}

// Mapas + rotação atual (= map pool do evento oficial mais recente que tenha pool definido).
async function maps(force = false) {
  const [catalog, events] = await Promise.all([mapCatalog(force), vctEvents(force)]);
  const poolEvent = events.find((e) => e.mapPool.length);
  const pool = new Set(poolEvent?.mapPool || []);
  return {
    poolSource: poolEvent ? { id: poolEvent.id, title: poolEvent.title } : null,
    maps: catalog.map((m) => ({ ...m, inRotation: pool.has(m.name) })),
  };
}

function eventsForScope(events, scope) {
  if (scope === 'season') return events;
  if (/^\d+$/.test(String(scope))) return events.filter((e) => String(e.id) === String(scope));
  const cutoff = new Date(Date.now() - RECENT_DAYS * 864e5).toISOString().slice(0, 10);
  return events.filter((e) => e.status === 'ongoing' || e.startDate >= cutoff);
}

// Soma as comps de vários eventos para um mapa. Chave = conjunto de agentes (ordem não importa).
async function metaComps(spikeMapId, scope = 'recent', force = false) {
  const events = eventsForScope(await vctEvents(force), scope);
  const perEvent = await Promise.allSettled(
    events.map((e) =>
      cached(`spike:comps:${e.id}:${spikeMapId}`, e.status === 'ongoing' ? 3 * H : 48 * H,
        () => getJson(`${API}/stats/compositions?event=${e.id}&map=${spikeMapId}`), force)
    )
  );
  if (events.length && perEvent.every((r) => r.status === 'rejected')) {
    throw perEvent[0].reason;
  }

  const agg = new Map();
  let totalSides = 0;
  for (const r of perEvent) {
    if (r.status !== 'fulfilled' || !Array.isArray(r.value) || !r.value.length) continue;
    totalSides += r.value[0].totalSidesPlayed || 0;
    for (const c of r.value) {
      const agents = c.agents.map((a) => a.title).sort();
      const key = agents.join('|');
      const cur = agg.get(key) || { agents, timesPlayed: 0, wins: 0 };
      cur.timesPlayed += Number(c.timesPlayed) || 0;
      cur.wins += Number(c.wins) || 0;
      agg.set(key, cur);
    }
  }

  const comps = [...agg.values()]
    .map((c) => ({
      agents: c.agents,
      timesPlayed: c.timesPlayed,
      wins: c.wins,
      winRate: c.timesPlayed ? +((c.wins / c.timesPlayed) * 100).toFixed(1) : null,
      pickRate: totalSides ? +((c.timesPlayed / totalSides) * 100).toFixed(1) : null,
    }))
    .sort((a, b) => b.timesPlayed - a.timesPlayed || (b.winRate || 0) - (a.winRate || 0));
  // Todas as comps vão pro front, que ordena e filtra (WR, jogos, agente…).

  return { events, comps };
}

module.exports = { maps, vctEvents, metaComps };
