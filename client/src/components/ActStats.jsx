import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { AgentIcon, Loading, useFeedback, useFetch } from './ui.jsx';
import { fmtDateTime } from '../utils.js';

const COOLDOWN_MS = 15 * 1000;

// Contagem regressiva do botão Atualizar (o servidor também bloqueia: 15 s por pessoa).
function useCooldown() {
  const [until, setUntil] = useState(0);
  const [, tick] = useState(0);
  useEffect(() => {
    if (until <= Date.now()) return;
    const id = setInterval(() => tick((x) => x + 1), 250);
    return () => clearInterval(id);
  }, [until]);
  const left = Math.max(0, Math.ceil((until - Date.now()) / 1000));
  return [left, (ms) => setUntil(Date.now() + ms)];
}

const kdColor = (kd) => ({ color: kd >= 1 ? 'var(--green)' : 'var(--red)' });
const wrColor = (wr) => ({ color: wr >= 50 ? 'var(--green)' : 'var(--red)' });

// Ranked do ato atual (HenrikDev): K/D, KDA, K/D/A, WR, HS%, ACS, ADR e agente mais jogado.
export default function ActStats({ username, canRefresh, onRefreshed }) {
  const { notify } = useFeedback();
  const stats = useFetch(`/api/act-stats/${username}`);
  const [busy, setBusy] = useState(false);
  const [left, startCooldown] = useCooldown();

  const refresh = async () => {
    setBusy(true);
    try {
      const r = await api.post('/api/profiles/me/riot-refresh');
      stats.setData(r.act);
      onRefreshed?.();
      startCooldown(r.retryInMs || COOLDOWN_MS);
      notify(r.act.error ? r.act.error : 'Dados atualizados', !!r.act.error);
    } catch (e) {
      if (e.status === 429 && e.data?.retryInMs) startCooldown(e.data.retryInMs);
      notify(e.message, true);
    } finally {
      setBusy(false);
    }
  };

  const s = stats.data;
  if (!s && stats.loading) return <div className="card"><Loading text="Buscando partidas ranqueadas do ato…" /></div>;
  if (!s?.linked) return null;

  const header = (
    <div className="card-head">
      <div>
        <h3>Ranked · {s.act?.name || 'ato atual'}</h3>
        {s.updatedAt && <div className="muted small">Atualizado {fmtDateTime(s.updatedAt)}</div>}
      </div>
      {canRefresh && (
        <button className="btn-sm" onClick={refresh} disabled={busy || left > 0} title="Buscar os dados mais recentes agora">
          {busy ? 'Atualizando…' : left > 0 ? `Atualizar (${left}s)` : '↻ Atualizar'}
        </button>
      )}
    </div>
  );

  if (s.error) return <div className="card">{header}<p className="muted small">{s.error}</p></div>;
  if (!s.matches) {
    return <div className="card">{header}<p className="muted small">Nenhuma partida ranqueada neste ato ainda.</p></div>;
  }

  const a = s.topAgent;
  return (
    <div className="card act-stats">
      {header}
      <div className="act-kpis">
        <div><b>{s.matches}</b><span>Partidas</span></div>
        <div><b style={wrColor(s.winRate)}>{s.winRate}%</b><span>Win rate · {s.wins}V {s.losses}D{s.draws ? ` ${s.draws}E` : ''}</span></div>
        <div><b style={kdColor(s.kd)}>{s.kd.toFixed(2)}</b><span>K/D</span></div>
        <div><b>{s.kda.toFixed(2)}</b><span>KDA</span></div>
        <div><b className="kda-num">{s.kills} / {s.deaths} / {s.assists}</b><span>K / D / A total</span></div>
        <div><b className="kda-num">{s.perMatch.k.toFixed(1)} / {s.perMatch.d.toFixed(1)} / {s.perMatch.a.toFixed(1)}</b><span>K / D / A por partida</span></div>
        <div><b>{s.hsPct ?? '—'}%</b><span>Headshot</span></div>
        <div><b>{s.acs ?? '—'} <small className="muted">/ {s.adr ?? '—'}</small></b><span>ACS / ADR</span></div>
      </div>

      {a && (
        <div className="top-agent">
          <AgentIcon name={a.name} size="lg" />
          <div className="top-agent-info">
            <span className="muted small">Agente mais jogado</span>
            <b className="top-agent-name">{a.name}</b>
            <div className="row small">
              <span>{a.matches} partidas</span>
              <span>K/D <b style={kdColor(a.kd)}>{a.kd.toFixed(2)}</b></span>
              <span>WR <b style={wrColor(a.winRate)}>{a.winRate}%</b></span>
              <span>K/D/A {a.kills}/{a.deaths}/{a.assists}</span>
            </div>
          </div>
          {s.agents.length > 1 && (
            <div className="other-agents">
              {s.agents.slice(1).map((x) => (
                <div key={x.name} className="row small" title={x.name}>
                  <AgentIcon name={x.name} size="sm" />
                  <span>{x.matches}p · K/D <b style={kdColor(x.kd)}>{x.kd.toFixed(2)}</b> · <b style={wrColor(x.winRate)}>{x.winRate}%</b></span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      {s.partial && <p className="muted small" style={{ marginBottom: 0 }}>Considerando as {s.matches} partidas mais recentes do ato.</p>}
    </div>
  );
}
