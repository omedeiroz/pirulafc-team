import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Empty, ExtLink, Loading, useFetch } from '../components/ui.jsx';
import { TournamentForm } from '../components/Forms.jsx';
import { fmtRange, record } from '../utils.js';

export default function Tournaments() {
  const navigate = useNavigate();
  const { data: list, loading } = useFetch('/api/tournaments');
  const [creating, setCreating] = useState(false);

  if (loading && !list) return <Loading />;
  const all = list.flatMap((t) => t.matches);
  const rec = record(all);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Campeonatos</h1>
          <div className="muted">Todos os campeonatos que o time jogou.</div>
        </div>
        <button className="btn-primary" onClick={() => setCreating(true)}>+ Novo campeonato</button>
      </div>

      <div className="kpis">
        <div className="kpi"><b>{list.length}</b><span>Campeonatos</span></div>
        <div className="kpi"><b>{all.length}</b><span>Mapas jogados</span></div>
        <div className="kpi"><b>{rec.w}-{rec.l}</b><span>Vitórias - Derrotas</span></div>
        <div className="kpi"><b>{rec.wr != null ? `${rec.wr}%` : '—'}</b><span>Win rate</span></div>
      </div>

      {!list.length ? <Empty>Nenhum campeonato cadastrado ainda. Clique em "Novo campeonato".</Empty> : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Campeonato</th><th>Data</th><th>Organizador</th><th>Colocação</th><th className="num">Mapas</th><th className="num">V-D</th><th>Link</th></tr>
            </thead>
            <tbody>
              {list.map((t) => {
                const r = record(t.matches);
                return (
                  <tr key={t.id} className="clickable" onClick={(e) => !e.target.closest('a') && navigate(`/campeonatos/${t.id}`)}>
                    <td><b>{t.name}</b></td>
                    <td>{fmtRange(t.startDate, t.endDate)}</td>
                    <td>{t.organizer}</td>
                    <td>{t.placement && <span className="badge red">{t.placement}</span>}</td>
                    <td className="num">{t.matches.length}</td>
                    <td className="num">{r.w}-{r.l}</td>
                    <td><ExtLink href={t.link}>Abrir ↗</ExtLink></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {creating && (
        <TournamentForm onClose={() => setCreating(false)} onSaved={(t) => navigate(`/campeonatos/${t.id}`)} />
      )}
    </>
  );
}
