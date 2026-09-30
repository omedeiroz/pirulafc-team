// Elo dos jogadores via HenrikDev API (não oficial; a API da Riot não libera elo individual).
// A chave fica em HENRIKDEV_API_KEY (.env). Ícones de elo vêm da valorant-api.com.
const { cached, getJson } = require('./remote');

const API = 'https://api.henrikdev.xyz/valorant';
const REGIONS = ['br', 'latam', 'na', 'eu', 'ap', 'kr'];
const RANK_TTL = 10 * 60 * 1000;

const TIER_PT = {
  Iron: 'Ferro', Bronze: 'Bronze', Silver: 'Prata', Gold: 'Ouro', Platinum: 'Platina',
  Diamond: 'Diamante', Ascendant: 'Ascendente', Immortal: 'Imortal', Radiant: 'Radiante', Unrated: 'Sem rank',
};
const tierPt = (name = '') => name.replace(/^[A-Za-z]+/, (w) => TIER_PT[w] || w);

// Ícones do episódio mais recente: tier (número) -> ícone.
function tierIcons() {
  return cached('valorant:tiers', 24 * 60 * 60 * 1000, async () => {
    const { data } = await getJson('https://valorant-api.com/v1/competitivetiers');
    const latest = data[data.length - 1];
    return Object.fromEntries(latest.tiers.map((t) => [t.tier, t.smallIcon || t.largeIcon || null]));
  });
}

class RankError extends Error {}

async function fetchMmr(region, name, tag) {
  const key = process.env.HENRIKDEV_API_KEY;
  if (!key) throw new RankError('Elo indisponível: configure HENRIKDEV_API_KEY no .env do servidor');
  const url = `${API}/v3/mmr/${region}/pc/${encodeURIComponent(name)}/${encodeURIComponent(tag)}`;
  const res = await fetch(url, { headers: { Authorization: key }, signal: AbortSignal.timeout(15000) });
  const body = await res.json().catch(() => ({}));
  if (res.status === 404) {
    // 404 também acontece quando a conta existe mas não jogou nada recente
    throw new RankError(body.errors?.[0]?.code === 24
      ? 'A conta precisa jogar uma partida recente para o elo aparecer'
      : 'Riot ID não encontrado nessa região');
  }
  if (res.status === 429) throw new Error('Limite da HenrikDev atingido, tente em 1 minuto');
  if (res.status === 401 || res.status === 403) throw new RankError('Chave da HenrikDev inválida');
  if (!res.ok) throw new Error(`HenrikDev ${res.status}`);
  return body.data;
}

// { riotId, region, current: {tier, name, rr, lastChange, icon}, peak: {...}, gamesNeeded } ou { error }
async function getRank({ riotId, region }) {
  const [name, tag] = riotId.split('#');
  try {
    const [d, icons] = await Promise.all([
      cached(`rank:${region}:${riotId.toLowerCase()}`, RANK_TTL, () => fetchMmr(region, name, tag)),
      tierIcons().catch(() => ({})),
    ]);
    const tier = (t) => t && { tier: t.id, name: tierPt(t.name), icon: icons[t.id] || null };
    return {
      riotId: `${d.account?.name || name}#${d.account?.tag || tag}`,
      region,
      current: { ...tier(d.current?.tier), rr: d.current?.rr ?? null, lastChange: d.current?.last_change ?? null },
      peak: d.peak ? { ...tier(d.peak.tier), season: d.peak.season?.short || null } : null,
      gamesNeeded: d.current?.games_needed_for_rating || 0,
      leaderboard: d.current?.leaderboard_placement?.rank ?? null,
    };
  } catch (e) {
    return { riotId, region, error: e instanceof RankError ? e.message : 'Não foi possível consultar o elo agora' };
  }
}

// "Nome#TAG" -> normalizado ou null se inválido (nome 3–16, tag 3–5, como na Riot).
function parseRiotId(value) {
  const m = String(value || '').trim().match(/^(.{3,16})#([\p{L}\p{N}]{3,5})$/u);
  return m ? `${m[1].trim()}#${m[2]}` : null;
}

module.exports = { getRank, parseRiotId, REGIONS };
