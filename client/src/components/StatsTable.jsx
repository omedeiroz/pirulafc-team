import { useData } from '../data.jsx';
import { AgentIcon, Empty } from './ui.jsx';

// Tabela de K/D/A agregada por player (vem de aggregateStats).
export default function StatsTable({ rows }) {
  const { playerName } = useData();
  if (!rows.length) return <Empty>Sem estatísticas registradas.</Empty>;
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Player</th><th className="num">Mapas</th><th className="num">K</th><th className="num">D</th><th className="num">A</th>
            <th className="num">K/D</th><th className="num">KDA</th><th className="num">ACS</th><th>Agentes</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((p) => (
            <tr key={p.player}>
              <td><b>{playerName(p.player)}</b></td>
              <td className="num">{p.maps}</td>
              <td className="num">{p.k}</td>
              <td className="num">{p.d}</td>
              <td className="num">{p.a}</td>
              <td className="num" style={{ color: p.kd >= 1 ? 'var(--green)' : 'var(--red)' }}>{p.kd.toFixed(2)}</td>
              <td className="num">{p.kda.toFixed(2)}</td>
              <td className="num">{p.acs ?? '—'}</td>
              <td><div className="agents-row">{p.topAgents.slice(0, 4).map((a) => <AgentIcon key={a} name={a} size="sm" />)}</div></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
