import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api.js';
import { useData } from '../data.jsx';
import { AgentIcon, Empty, ExtLink, Loading, ResultBadge, useFeedback, useFetch } from '../components/ui.jsx';
import { MatchForm, TournamentForm } from '../components/Forms.jsx';
import StatsTable from '../components/StatsTable.jsx';
import { aggregateStats, fmtDate, fmtRange, matchResult, record } from '../utils.js';

export default function TournamentDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { playerName, mapName } = useData();
  const { notify, confirm } = useFeedback();
  const t = useFetch(`/api/tournaments/${id}`);
  const teamComps = useFetch('/api/team-comps');
  const [editing, setEditing] = useState(false);
  const [matchModal, setMatchModal] = useState(null); // null | 'new' | match

  if (t.error) return <Empty>{t.error.message} <Link to="/campeonatos">Voltar</Link></Empty>;
  if (!t.data) return <Loading />;

  const tour = t.data;
  const matches = [...tour.matches].sort((a, b) => ((a.date || '') > (b.date || '') ? 1 : -1));
  const rec = record(matches);
  const byMap = {};
  for (const m of matches) {
    if (!m.map) continue;
    const r = (byMap[m.map] ||= { w: 0, l: 0 });
    const res = matchResult(m);
    if (res === 'W') r.w++;
    if (res === 'L') r.l++;
  }

  const removeTournament = async () => {
    if (!(await confirm(`Excluir "${tour.name}" e todas as partidas?`))) return;
    await api.del(`/api/tournaments/${tour.id}`);
    notify('Campeonato excluído');
    navigate('/campeonatos');
  };

  const removeMatch = async (m) => {
    if (!(await confirm('Excluir esta partida?'))) return;
    await api.del(`/api/tournaments/${tour.id}/matches/${m.id}`);
    notify('Partida excluída');
    t.reload();
  };

  return (
    <>
      <Link className="back" to="/campeonatos">← Campeonatos</Link>
      <div className="page-head">
        <div>
          <h1>{tour.name}</h1>
          <div className="muted row">
            {tour.startDate && <span>{fmtRange(tour.startDate, tour.endDate)}</span>}
            {tour.organizer && <span>· {tour.organizer}</span>}
            {tour.prize && <span>· Prêmio: {tour.prize}</span>}
            {tour.link && <span>· <ExtLink href={tour.link}>Página do campeonato ↗</ExtLink></span>}
          </div>
        </div>
        <div className="row">
          <button onClick={() => setEditing(true)}>Editar</button>
          <button className="btn-danger" onClick={removeTournament}>Excluir</button>
        </div>
      </div>
      {tour.notes && <div className="card small" style={{ whiteSpace: 'pre-wrap', marginBottom: '1rem' }}>{tour.notes}</div>}

      <div className="kpis">
        <div className="kpi"><b>{tour.placement || '—'}</b><span>Colocação</span></div>
        <div className="kpi"><b>{rec.w}-{rec.l}</b><span>Mapas V-D</span></div>
        <div className="kpi"><b>{rec.wr != null ? `${rec.wr}%` : '—'}</b><span>Win rate</span></div>
        <div className="kpi"><b>{rec.rounds > 0 ? '+' : ''}{rec.rounds}</b><span>Saldo de rounds</span></div>
      </div>

      {Object.keys(byMap).length > 0 && (
        <div className="row" style={{ marginBottom: '1rem' }}>
          {Object.entries(byMap).map(([m, r]) => <span key={m} className="badge">{mapName(m)}: {r.w}-{r.l}</span>)}
        </div>
      )}

      <section className="section">
        <div className="page-head" style={{ marginBottom: '.8rem' }}>
          <h2>Partidas</h2>
          <button className="btn-primary" onClick={() => setMatchModal('new')}>+ Adicionar partida</button>
        </div>
        {!matches.length ? <Empty>Nenhuma partida registrada.</Empty> : matches.map((m) => (
          <div className="match-card" key={m.id}>
            <div className="match-head">
              <ResultBadge match={m} />
              <span className="score">{m.scoreUs ?? '–'} : {m.scoreThem ?? '–'}</span>
              <div>
                <div><b>vs {m.opponent}</b> · {mapName(m.map)}</div>
                <div className="small muted">{[fmtDate(m.date), m.stage].filter(Boolean).join(' · ')}</div>
              </div>
              <span className="spacer" />
              <ExtLink href={m.vod}>VOD ↗</ExtLink>
              <button className="btn-sm" onClick={() => setMatchModal(m)}>Editar</button>
              <button className="btn-sm btn-danger" onClick={() => removeMatch(m)}>Excluir</button>
            </div>
            {m.stats.length > 0 && (
              <div style={{ overflowX: 'auto' }}>
                <table>
                  <thead>
                    <tr><th>Player</th><th>Agente</th><th className="num">K</th><th className="num">D</th><th className="num">A</th><th className="num">K/D</th><th className="num">ACS</th></tr>
                  </thead>
                  <tbody>
                    {m.stats.map((s) => (
                      <tr key={s.player}>
                        <td><b>{playerName(s.player)}</b></td>
                        <td><div className="row">{s.agent && <AgentIcon name={s.agent} size="sm" />} {s.agent}</div></td>
                        <td className="num">{s.k ?? '—'}</td>
                        <td className="num">{s.d ?? '—'}</td>
                        <td className="num">{s.a ?? '—'}</td>
                        <td className="num">{s.d ? ((s.k || 0) / s.d).toFixed(2) : '—'}</td>
                        <td className="num">{s.acs ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {m.notes && <div className="small muted" style={{ padding: '.6rem 1rem', whiteSpace: 'pre-wrap' }}>{m.notes}</div>}
          </div>
        ))}
      </section>

      <section className="section">
        <h2>Estatísticas no campeonato</h2>
        <StatsTable rows={aggregateStats(matches)} />
      </section>

      {editing && (
        <TournamentForm tournament={tour} onClose={() => setEditing(false)} onSaved={(saved) => { setEditing(false); t.setData(saved); }} />
      )}
      {matchModal && (
        <MatchForm
          tournamentId={tour.id}
          match={matchModal === 'new' ? null : matchModal}
          teamComps={teamComps.data || []}
          onClose={() => setMatchModal(null)}
          onSaved={() => { setMatchModal(null); t.reload(); }}
        />
      )}
    </>
  );
}
