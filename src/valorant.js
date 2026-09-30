// Agentes (nome, função, ícone) e imagens dos mapas vindos de valorant-api.com.
// Agente novo lançado pela Riot aparece sozinho no site.
const { cached, getJson } = require('./remote');

const H = 60 * 60 * 1000;
const ROLE_PT = { Controller: 'Controlador', Duelist: 'Duelista', Initiator: 'Iniciador', Sentinel: 'Sentinela' };

function agents(force = false) {
  return cached('valorant:agents:v2', 24 * H, async () => {
    const { data } = await getJson('https://valorant-api.com/v1/agents?isPlayableCharacter=true');
    return data
      .map((a) => ({
        name: a.displayName,
        role: ROLE_PT[a.role?.displayName] || a.role?.displayName || '',
        icon: a.displayIcon,
        roleIcon: a.role?.displayIcon || null, // ícone oficial da função
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, force);
}

function mapImages(force = false) {
  return cached('valorant:maps', 24 * H, async () => {
    const { data } = await getJson('https://valorant-api.com/v1/maps');
    const out = {};
    for (const m of data) {
      if (!m.tacticalDescription) continue; // só mapas com sites (competitivos)
      out[m.displayName.toLowerCase()] = { splash: m.splash, list: m.listViewIcon };
    }
    return out;
  }, force);
}

module.exports = { agents, mapImages };
