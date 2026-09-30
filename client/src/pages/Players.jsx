import { Link } from 'react-router-dom';
import { useData } from '../data.jsx';
import { AgentIcon, Avatar, Empty, Loading, useFetch } from '../components/ui.jsx';
import StatsTable from '../components/StatsTable.jsx';
import { RankBadge } from '../components/Rank.jsx';
import { aggregateStats, latestByMap, record } from '../utils.js';

export default function Players() {
  const { players, staff = [], maps, mapName, playerName } = useData();
  const tournaments = useFetch('/api/tournaments');
  const teamComps = useFetch('/api/team-comps');

  if (!tournaments.data || !teamComps.data) return <Loading />;

  const matches = tournaments.data.flatMap((t) => t.matches);
  const current = latestByMap(teamComps.data);
  const rotation = maps.filter((m) => m.inRotation).sort((a, b) => a.name.localeCompare(b.name));

  const byMap = {};
  for (const m of matches) if (m.map) (byMap[m.map] ||= []).push(m);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Jogadores</h1>
          <div className="muted">Quem joga o quê em cada mapa e as estatísticas somando todos os campeonatos.</div>
        </div>
      </div>

      <div className="row" style={{ marginBottom: '1.2rem' }}>
        <span className="muted small">Line-up:</span>
        {players.map((p) => <Link key={p.username} to={`/jogadores/${p.username}`} className="badge">{p.name}</Link>)}
        {staff.map((s) => (
          <Link key={s.username} to={`/jogadores/${s.username}`} className="badge red">{s.role === 'coach' ? 'Coach' : s.role}: {s.name}</Link>
        ))}
      </div>

      <h2>Agentes por mapa (comps atuais)</h2>
      <div className="table-wrap">
        <table>
          <thead>
            <tr><th>Player</th><th>Elo</th>{rotation.map((m) => <th key={m.id}><Link to={`/mapas/${m.id}`}>{m.name}</Link></th>)}</tr>
          </thead>
          <tbody>
            {players.map((p) => (
              <tr key={p.username}>
                <td>
                  <Link to={`/jogadores/${p.username}`} className="row" style={{ flexWrap: 'nowrap', color: 'inherit' }}>
                    <Avatar username={p.username} size={28} /><b>{p.name}</b>
                  </Link>
                </td>
                <td><RankBadge username={p.username} compact /></td>
                {rotation.map((m) => {
                  const comp = current[m.id];
                  const slot = comp?.slots.find((s) => s.player === p.username);
                  if (!comp) return <td key={m.id} className="muted small">—</td>;
                  if (!slot) return <td key={m.id} className="muted small">banco</td>;
                  return (
                    <td key={m.id}><div className="row"><AgentIcon name={slot.agent} size="sm" /><span className="small">{slot.agent}</span></div></td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <section className="section">
        <h2>Estatísticas gerais</h2>
        <p className="muted small" style={{ marginTop: 0 }}>{matches.length} mapas registrados em {tournaments.data.length} campeonatos.</p>
        <StatsTable rows={aggregateStats(matches)} />
      </section>

      <section className="section">
        <h2>Desempenho por mapa</h2>
        {!Object.keys(byMap).length ? <Empty>Registre partidas nos campeonatos para ver os dados por mapa.</Empty> : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Mapa</th><th className="num">Jogos</th><th className="num">V-D</th><th className="num">Win rate</th><th className="num">Saldo rounds</th><th>Melhor K/D</th></tr>
              </thead>
              <tbody>
                {Object.entries(byMap).map(([map, ms]) => {
                  const r = record(ms);
                  const best = aggregateStats(ms)[0];
                  return (
                    <tr key={map}>
                      <td><b>{mapName(map)}</b></td>
                      <td className="num">{ms.length}</td>
                      <td className="num">{r.w}-{r.l}</td>
                      <td className="num">{r.wr != null ? `${r.wr}%` : '—'}</td>
                      <td className="num">{r.rounds > 0 ? '+' : ''}{r.rounds}</td>
                      <td>{best ? `${playerName(best.player)} (${best.kd.toFixed(2)})` : '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
