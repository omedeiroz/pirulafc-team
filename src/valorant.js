// Agentes (nome, função, ícones, habilidades) e mapas (imagens, minimapa, callouts) vindos de valorant-api.com.
// Agente ou mapa novo lançado pela Riot aparece sozinho no site.
const { cached, getJson } = require('./remote');

const H = 60 * 60 * 1000;
const ROLE_PT = { Controller: 'Controlador', Duelist: 'Duelista', Initiator: 'Iniciador', Sentinel: 'Sentinela' };
const SLOTS = ['Ability1', 'Ability2', 'Grenade', 'Ultimate'];

function agents(force = false) {
  return cached('valorant:agents:v3', 24 * H, async () => {
    const { data } = await getJson('https://valorant-api.com/v1/agents?isPlayableCharacter=true');
    return data
      .map((a) => ({
        name: a.displayName,
        role: ROLE_PT[a.role?.displayName] || a.role?.displayName || '',
        icon: a.displayIcon,
        roleIcon: a.role?.displayIcon || null, // ícone oficial da função
        // Habilidades para o quadro de estratégias (Q, E, C, X).
        abilities: SLOTS.map((slot) => a.abilities?.find((ab) => ab.slot === slot))
          .filter((ab) => ab?.displayIcon)
          .map((ab) => ({ slot: ab.slot, name: ab.displayName, icon: ab.displayIcon })),
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, force);
}

// Mapas competitivos (os que têm sites): imagens + minimapa + callouts já convertidos para o minimapa (0..1).
function mapsFull(force = false) {
  return cached('valorant:maps:v2', 24 * H, async () => {
    const { data } = await getJson('https://valorant-api.com/v1/maps');
    const out = {};
    for (const m of data) {
      if (!m.tacticalDescription) continue;
      // Conversão oficial da valorant-api: coordenada do jogo -> posição no minimapa.
      const toMap = (loc) => ({
        x: loc.y * m.xMultiplier + m.xScalarToAdd,
        y: loc.x * m.yMultiplier + m.yScalarToAdd,
      });
      out[m.displayName.toLowerCase()] = {
        splash: m.splash,
        list: m.listViewIcon,
        minimap: m.displayIcon,
        callouts: (m.callouts || [])
          .filter((c) => c.location)
          .map((c) => ({ name: c.regionName, area: c.superRegionName, ...toMap(c.location) }))
          .filter((c) => c.x >= 0 && c.x <= 1 && c.y >= 0 && c.y <= 1),
      };
    }
    return out;
  }, force);
}

async function mapImages(force = false) {
  const full = await mapsFull(force);
  return Object.fromEntries(Object.entries(full).map(([k, v]) => [k, { splash: v.splash, list: v.list }]));
}

async function mapBoard(mapName) {
  const m = (await mapsFull())[mapName.toLowerCase()];
  return m ? { minimap: m.minimap, callouts: m.callouts } : null;
}

module.exports = { agents, mapImages, mapBoard, SLOTS };
