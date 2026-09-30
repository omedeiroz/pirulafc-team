// Dados globais do boot: usuário logado, players, agentes (valorant-api) e mapas/rotação (THESPIKE, VCT).
import { createContext, useContext, useMemo } from 'react';

const DataContext = createContext(null);

export function DataProvider({ value, children }) {
  const helpers = useMemo(() => {
    const agentsByName = Object.fromEntries(value.agents.map((a) => [a.name, a]));
    // Todo mundo (players + coach), pra exibir nomes, fotos e "confirmada por".
    const people = [...value.players, ...(value.staff || [])];
    const peopleByUser = Object.fromEntries(people.map((p) => [p.username, p]));
    const mapsById = Object.fromEntries(value.maps.map((m) => [m.id, m]));
    return {
      ...value,
      people,
      agent: (name) => agentsByName[name],
      role: (name) => agentsByName[name]?.role || '',
      person: (u) => peopleByUser[u],
      playerName: (u) => peopleByUser[u]?.name || u || '—',
      map: (id) => mapsById[id],
      mapName: (id) => mapsById[id]?.name || id || '—',
    };
  }, [value]);
  return <DataContext.Provider value={helpers}>{children}</DataContext.Provider>;
}

export const useData = () => useContext(DataContext);
