import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useData } from '../data.jsx';
import { Empty, Loading, useFetch } from '../components/ui.jsx';
import { BoardCanvas } from '../components/Board.jsx';
import { SIDE_LABEL } from './StrategyEditor.jsx';
import { fmtDate } from '../utils.js';

export default function Strategies() {
  const { id: mapId } = useParams();
  const { map: getMap, playerName } = useData();
  const map = getMap(mapId);
  const list = useFetch(`/api/maps/${mapId}/strategies`);
  const board = useFetch(`/api/maps/${mapId}/board`);
  const [side, setSide] = useState('all');

  if (!map) return <Empty>Mapa não encontrado. <Link to="/mapas">Voltar</Link></Empty>;

  const items = (list.data || []).filter((s) => side === 'all' || s.side === side);
  const official = items.filter((s) => s.official);
  const others = items.filter((s) => !s.official);

  const card = (s) => (
    <Link key={s.id} to={`/mapas/${mapId}/estrategias/${s.id}`} className="strat-card">
      <div className="strat-thumb">
        {board.data && (
          <BoardCanvas minimap={board.data.minimap} callouts={board.data.callouts} items={s.phases[0]?.items || []}
            rotated={s.rotated} showCallouts={false} readOnly />
        )}
      </div>
      <div className="strat-card-body">
        <div className="row" style={{ gap: '.4rem' }}>
          <span className={`badge ${s.side === 'atk' ? 'red' : 'on'}`}>{SIDE_LABEL[s.side]}</span>
          {s.official && <span className="badge on">★ Padrão</span>}
          {s.tags.map((t) => <span key={t} className="badge">{t}</span>)}
        </div>
        <b className="strat-card-name">{s.name}</b>
        <span className="muted small">
          {s.phases.length} fase{s.phases.length > 1 ? 's' : ''} · por {playerName(s.createdBy)} · {fmtDate(s.updatedAt || s.createdAt)}
        </span>
      </div>
    </Link>
  );

  return (
    <>
      <Link className="back" to={`/mapas/${mapId}`}>← {map.name}</Link>
      <div className="page-head">
        <div>
          <h1>Estratégias · {map.name}</h1>
          <div className="muted">Jogadas desenhadas no minimapa, fase por fase. As marcadas com ★ são as padrão do time.</div>
        </div>
        <Link className="btn btn-primary" to={`/mapas/${mapId}/estrategias/nova`}>+ Nova estratégia</Link>
      </div>

      <div className="tabs" role="tablist">
        {[['all', 'Todas'], ['atk', 'Ataque'], ['def', 'Defesa']].map(([k, label]) => (
          <button key={k} role="tab" aria-selected={side === k} className={side === k ? 'active' : ''} onClick={() => setSide(k)}>
            {label}
          </button>
        ))}
      </div>

      {list.loading && !list.data ? <Loading /> : !items.length ? (
        <Empty>Nenhuma estratégia{side !== 'all' ? ` de ${SIDE_LABEL[side].toLowerCase()}` : ''} ainda. Crie a primeira em "+ Nova estratégia".</Empty>
      ) : (
        <>
          {official.length > 0 && (
            <section style={{ marginBottom: '1.5rem' }}>
              <h2>★ Padrão do time</h2>
              <div className="strat-grid">{official.map(card)}</div>
            </section>
          )}
          {others.length > 0 && (
            <section>
              <h2>{official.length ? 'Outras do time' : 'Do time'}</h2>
              <div className="strat-grid">{others.map(card)}</div>
            </section>
          )}
        </>
      )}
    </>
  );
}
