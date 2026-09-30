import { useMemo, useState } from 'react';
import { useData } from '../data.jsx';
import { ROLES } from '../utils.js';
import { AgentsRow, Empty } from './ui.jsx';

const SORTS = {
  timesPlayed: 'Jogos',
  pickRate: 'Pick rate',
  winRate: 'Win rate',
  wins: 'Vitórias',
};

const PAGE = 10;

// Lista das comps do meta pro com ordenação e filtros (tudo no front, sem nova chamada à API).
export default function MetaCompList({ comps, onUse, isInUse = () => false }) {
  const { agents, role } = useData();
  const [sortBy, setSortBy] = useState('timesPlayed');
  const [desc, setDesc] = useState(true);
  const [minGames, setMinGames] = useState(1);
  const [minWr, setMinWr] = useState(0);
  const [agent, setAgent] = useState('');
  const [limit, setLimit] = useState(PAGE);

  const byRole = (list) => [...list].sort((a, b) => ROLES.indexOf(role(a)) - ROLES.indexOf(role(b)));

  const list = useMemo(() => {
    const dir = desc ? -1 : 1;
    return comps
      .filter((c) => c.timesPlayed >= minGames && (c.winRate ?? 0) >= minWr && (!agent || c.agents.includes(agent)))
      .sort((a, b) =>
        dir * ((a[sortBy] ?? 0) - (b[sortBy] ?? 0)) ||
        b.timesPlayed - a.timesPlayed // desempate: mais jogos primeiro
      );
  }, [comps, sortBy, desc, minGames, minWr, agent]);

  // Clicar no título de uma métrica ordena por ela (clicar de novo inverte).
  const sortHeader = (key, label) => (
    <button type="button" className={`sort-head ${sortBy === key ? 'active' : ''}`} onClick={() => {
      if (sortBy === key) setDesc(!desc);
      else { setSortBy(key); setDesc(true); }
      setLimit(PAGE);
    }}>
      {label}{sortBy === key ? (desc ? ' ↓' : ' ↑') : ''}
    </button>
  );

  const set = (fn) => (e) => { fn(e.target.value); setLimit(PAGE); };
  const filtered = minGames > 1 || minWr > 0 || agent;

  return (
    <>
      <div className="filters">
        <div>
          <label htmlFor="f-sort">Ordenar por</label>
          <div className="row" style={{ flexWrap: 'nowrap' }}>
            <select id="f-sort" value={sortBy} onChange={set(setSortBy)}>
              {Object.entries(SORTS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <button type="button" className="btn-sm" title="Inverter ordem" onClick={() => setDesc(!desc)}>
              {desc ? '↓ Maior' : '↑ Menor'}
            </button>
          </div>
        </div>
        <div>
          <label htmlFor="f-games">Mín. de jogos</label>
          <input id="f-games" type="number" min={1} value={minGames} onChange={set((v) => setMinGames(Math.max(1, Number(v) || 1)))} />
        </div>
        <div>
          <label htmlFor="f-wr">Win rate mín. (%)</label>
          <input id="f-wr" type="number" min={0} max={100} step={5} value={minWr} onChange={set((v) => setMinWr(Math.min(100, Math.max(0, Number(v) || 0))))} />
        </div>
        <div>
          <label htmlFor="f-agent">Com o agente</label>
          <select id="f-agent" value={agent} onChange={set(setAgent)}>
            <option value="">Qualquer</option>
            {agents.map((a) => <option key={a.name} value={a.name}>{a.name}</option>)}
          </select>
        </div>
        {filtered && (
          <button type="button" className="btn-ghost btn-sm" style={{ alignSelf: 'flex-end' }}
            onClick={() => { setMinGames(1); setMinWr(0); setAgent(''); setLimit(PAGE); }}>
            Limpar filtros
          </button>
        )}
      </div>

      {sortBy === 'winRate' && minGames < 3 && (
        <p className="small" style={{ color: 'var(--yellow)', margin: '0 0 .6rem' }}>
          Dica: ordenando por win rate, suba o mínimo de jogos (ex.: 5) para ignorar comps jogadas 1 ou 2 vezes.
        </p>
      )}

      <div className="small muted" style={{ marginBottom: '.5rem' }}>
        {list.length} de {comps.length} comps
      </div>

      {!list.length ? <Empty>Nenhuma comp com esses filtros.</Empty> : (
        <div className="comp-list">
          <div className="comp-list-head">
            <span style={{ flex: 1 }}>Comp</span>
            <div className="stats">
              {sortHeader('timesPlayed', 'Jogos')}
              {sortHeader('pickRate', 'Pick')}
              {sortHeader('winRate', 'Win')}
            </div>
            <span style={{ width: 62 }} />
          </div>
          {list.slice(0, limit).map((c) => (
            <div className={`comp-item ${isInUse(c.agents) ? 'in-use' : ''}`} key={c.agents.join()}>
              <AgentsRow agents={c.agents} />
              <div className="comp-names" style={{ flex: 1, minWidth: 160 }}>{byRole(c.agents).join(' · ')}</div>
              <div className="stats">
                <div><b>{c.timesPlayed}</b><span>Jogos</span></div>
                <div><b>{c.pickRate}%</b><span>Pick</span></div>
                <div><b style={{ color: c.winRate >= 50 ? 'var(--green)' : 'var(--red)' }}>{c.winRate}%</b><span>{c.wins}V</span></div>
              </div>
              {isInUse(c.agents)
                ? <span className="badge on" style={{ minWidth: 62, textAlign: 'center' }}>Em uso</span>
                : <button className="btn-sm" onClick={() => onUse(c.agents)}>Usar</button>}
            </div>
          ))}
          {list.length > limit && (
            <button className="btn-ghost" style={{ justifyContent: 'center' }} onClick={() => setLimit(limit + PAGE)}>
              Mostrar mais ({list.length - limit} restantes)
            </button>
          )}
        </div>
      )}
    </>
  );
}
