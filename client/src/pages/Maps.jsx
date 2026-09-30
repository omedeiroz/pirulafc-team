import { Link } from 'react-router-dom';
import { useData } from '../data.jsx';
import { AgentIcon, Loading, useFetch } from '../components/ui.jsx';
import { latestByMap } from '../utils.js';

export default function Maps() {
  const { maps, poolSource } = useData();
  const { data: teamComps, loading } = useFetch('/api/team-comps');
  const current = latestByMap(teamComps || []);

  const byName = (a, b) => a.name.localeCompare(b.name);
  const on = maps.filter((m) => m.inRotation).sort(byName);
  const off = maps.filter((m) => !m.inRotation).sort(byName);

  const card = (m) => (
    <Link key={m.id} to={`/mapas/${m.id}`} className={`map-card ${m.inRotation ? '' : 'off'}`}
      style={m.splash ? { backgroundImage: `url('${m.splash}')` } : undefined}>
      <div className="info">
        <h3>{m.name}</h3>
        <div className="row" style={{ marginTop: '.4rem' }}>
          {current[m.id]
            ? <div className="agents-row">{current[m.id].slots.map((s) => <AgentIcon key={s.agent} name={s.agent} size="sm" />)}</div>
            : loading ? <span className="badge">…</span>
            : m.inRotation ? <span className="badge red">Definir comp →</span>
            : <span className="badge">Sem comp</span>}
        </div>
      </div>
    </Link>
  );

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Mapas &amp; Comps</h1>
          <div className="muted">
            Map pool atual: {on.length} mapas
            {poolSource && <> (definido pelo <b>{poolSource.title}</b>)</>}. Clique num mapa para ver o meta e definir a comp do time.
          </div>
        </div>
      </div>
      {on.length ? <div className="maps-grid">{on.map(card)}</div> : <Loading />}
      <div className="section">
        <h2 className="muted">Fora da rotação</h2>
        <div className="maps-grid">{off.map(card)}</div>
      </div>
    </>
  );
}
