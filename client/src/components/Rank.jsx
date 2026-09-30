import { useFetch } from './ui.jsx';

// Elo atual (ícone + nome + RR) buscado pelo Riot ID do perfil (HenrikDev, cache de 10 min no servidor).
export function RankBadge({ username, compact = false, refreshKey = 0 }) {
  const { data, loading } = useFetch(`/api/rank/${username}${refreshKey ? `?k=${refreshKey}` : ''}`);
  if (loading && !data) return <span className="muted small">…</span>;
  if (!data?.linked) return compact ? <span className="muted small">—</span> : null;
  if (data.error) return <span className="muted small" title={data.error}>{compact ? '—' : data.error}</span>;

  const { current, peak, gamesNeeded } = data;
  return (
    <span className={`rank-badge ${compact ? 'compact' : ''}`} title={data.riotId}>
      {current.icon && <img src={current.icon} alt="" />}
      <span>
        <b>{current.name}</b>
        {current.tier > 2 && current.rr != null && <span className="muted"> · {current.rr} RR</span>}
        {!compact && gamesNeeded > 0 && <span className="muted"> · faltam {gamesNeeded} jogos p/ ranquear</span>}
        {!compact && peak?.name && peak.tier > 2 && (
          <span className="rank-peak">
            Pico: {peak.icon && <img src={peak.icon} alt="" />}{peak.name}{peak.season ? ` (${peak.season.toUpperCase()})` : ''}
          </span>
        )}
      </span>
    </span>
  );
}
