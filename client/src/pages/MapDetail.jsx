import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api.js';
import { useData } from '../data.jsx';
import { fmtDate, fmtDateTime, ROLES } from '../utils.js';
import { AgentIcon, AgentsRow, Empty, Loading, RoleDot, useFeedback, useFetch } from '../components/ui.jsx';
import CompBuilder, { emptySlots } from '../components/CompBuilder.jsx';
import MetaCompList from '../components/MetaCompList.jsx';

// Sugere o player de cada agente pelo histórico de comps confirmadas (peso maior pra comp atual do mapa).
function suggestPlayers(agents, allHistory, currentSlots) {
  const score = {};
  const bump = (agent, player, n) => { (score[agent] ||= {})[player] = (score[agent][player] || 0) + n; };
  for (const c of allHistory) for (const s of c.slots) bump(s.agent, s.player, 1);
  for (const s of currentSlots || []) bump(s.agent, s.player, 5);
  const used = new Set();
  return agents.map((agent) => {
    const pick = Object.entries(score[agent] || {}).sort((a, b) => b[1] - a[1]).find(([p]) => !used.has(p))?.[0] || '';
    if (pick) used.add(pick);
    return { agent, player: pick };
  });
}

const draftFrom = (c) => ({
  slots: c ? c.slots.map((s) => ({ ...s })) : emptySlots(),
  active: 0,
  source: c?.source || '',
  name: c?.name || '',
  notes: c?.notes || '',
});

export default function MapDetail() {
  const { id } = useParams();
  const { map: getMap, playerName, players, role, me, admins = [] } = useData();
  const isAdmin = !!me.admin;
  const adminNames = admins.map(playerName).join(' / ') || 'o admin';
  const { notify, confirm } = useFeedback();
  const map = getMap(id);

  const [allHistory, setAllHistory] = useState(null);
  const [draft, setDraft] = useState(draftFrom(null));
  const [busy, setBusy] = useState(false);
  const [scope, setScope] = useState('recent');
  const [refreshKey, setRefreshKey] = useState(0);
  const [tab, setTab] = useState('meta');
  const builderRef = useRef(null);
  const currentRef = useRef(null);

  const history = (allHistory || []).filter((c) => c.map === id);
  const current = history[0] || null;

  const events = useFetch('/api/vct-events');
  const meta = useFetch(`/api/maps/${id}/meta?scope=${scope}${refreshKey ? `&refresh=1&k=${refreshKey}` : ''}`);
  const custom = useFetch(`/api/maps/${id}/custom-comps`);
  const byRole = (agents) => [...agents].sort((a, b) => ROLES.indexOf(role(a)) - ROLES.indexOf(role(b)));

  const loadHistory = async () => {
    const list = await api.get('/api/team-comps');
    setAllHistory(list);
    return list;
  };

  useEffect(() => {
    let alive = true;
    api.get('/api/team-comps').then((list) => {
      if (!alive) return;
      setAllHistory(list);
      setDraft(draftFrom(list.find((c) => c.map === id)));
    });
    return () => { alive = false; };
  }, [id]);

  if (!map) return <Empty>Mapa não encontrado. <Link to="/mapas">Voltar</Link></Empty>;

  const scrollTo = (ref) => ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  // "Em uso": mesma comp (mesmos agentes; e mesmos players, quando a sugestão tem players) que a padrão atual.
  const agentKey = (agents) => [...agents].sort().join('|');
  const slotKey = (slots) => slots.map((s) => `${s.agent}:${s.player}`).sort().join('|');
  const isInUse = (agents, slots) => {
    if (!current || agentKey(agents) !== agentKey(current.slots.map((s) => s.agent))) return false;
    const full = slots?.every((s) => s.player);
    return !full || slotKey(slots) === slotKey(current.slots);
  };

  // Carrega no montador. Se a sugestão já tem players, usa; senão sugere pelo histórico.
  // suggestionId: quando vem de uma sugestão, para poder "Salvar alterações" nela depois.
  const loadIntoBuilder = (agents, source, name = '', slots = null, notes = '', suggestionId = null) => {
    const hasPlayers = slots?.some((s) => s.player);
    const ordered = hasPlayers
      ? [...slots].sort((a, b) => ROLES.indexOf(role(a.agent)) - ROLES.indexOf(role(b.agent))).map((s) => ({ ...s }))
      : suggestPlayers(byRole(agents), allHistory || [], current?.slots);
    setDraft({ slots: ordered, active: 0, source, name, notes, suggestionId });
    scrollTo(builderRef);
    notify(isAdmin ? 'Comp carregada. Confira os players e confirme.' : 'Comp carregada. Ajuste e envie como sugestão.');
  };

  // Admin: transforma uma sugestão (com os 5 players) direto na comp padrão.
  const setAsDefault = async (c) => {
    if (!(await confirm(`Definir "${c.name}" como a comp padrão de ${map.name}?`))) return;
    try {
      await api.post(`/api/maps/${id}/team-comp`, {
        slots: c.slots, name: c.name, notes: c.notes || '', source: `Sugestão de ${playerName(c.createdBy)}`,
      });
      await loadHistory();
      notify('Comp padrão atualizada!');
      scrollTo(currentRef);
    } catch (e) {
      notify(e.message, true);
    }
  };

  const confirmComp = async () => {
    setBusy(true);
    try {
      await api.post(`/api/maps/${id}/team-comp`, { slots: draft.slots, name: draft.name, notes: draft.notes, source: draft.source });
      await loadHistory();
      notify('Comp confirmada e salva!');
      scrollTo(currentRef);
    } catch (e) {
      notify(e.message, true);
    } finally {
      setBusy(false);
    }
  };

  const suggestionBody = () => ({
    name: draft.name || (isAdmin ? 'Comp do time' : `Sugestão de ${me.name}`),
    notes: draft.notes,
    slots: draft.slots.map((s) => ({ agent: s.agent, player: s.player })),
  });

  const afterSuggestionSaved = (msg, saved) => {
    notify(msg);
    custom.reload();
    setTab('custom');
    if (saved) setDraft((d) => ({ ...d, suggestionId: saved.id, name: saved.name }));
  };

  // Salvar como nova sugestão. Se o nome já existe e a pessoa pode editar aquela, oferece substituir.
  const savePreset = async () => {
    setBusy(true);
    try {
      const saved = await api.post(`/api/maps/${id}/custom-comps`, suggestionBody());
      afterSuggestionSaved(isAdmin ? 'Comp salva nas sugestões' : `Sugestão enviada! ${adminNames} decide se vira a padrão.`, saved);
    } catch (e) {
      if (e.status === 409 && e.data?.canOverwrite && (await confirm(`${e.message} Substituir pelas alterações que você fez?`))) {
        try {
          const saved = await api.put(`/api/custom-comps/${e.data.conflictId}`, suggestionBody());
          afterSuggestionSaved(`"${saved.name}" atualizada`, saved);
        } catch (e2) {
          notify(e2.message, true);
        }
      } else {
        notify(e.message, true);
      }
    } finally {
      setBusy(false);
    }
  };

  // Salvar alterações na sugestão que foi carregada no montador.
  const updateSuggestion = async () => {
    setBusy(true);
    try {
      const saved = await api.put(`/api/custom-comps/${draft.suggestionId}`, suggestionBody());
      afterSuggestionSaved(`"${saved.name}" atualizada`, saved);
    } catch (e) {
      notify(e.message, true);
    } finally {
      setBusy(false);
    }
  };

  // Sugestão carregada no montador e que esta pessoa pode editar (quem criou ou admin).
  const editingSuggestion = draft.suggestionId && custom.data?.find((c) => c.id === draft.suggestionId);
  const canEditLoaded = !!editingSuggestion && (isAdmin || editingSuggestion.createdBy === me.username);

  const scopeLabel = scope === 'recent' ? 'Meta atual (VCT)' : scope === 'season' ? 'Temporada VCT'
    : events.data?.find((e) => String(e.id) === scope)?.title || 'VCT';

  const inComp = new Set(current?.slots.map((s) => s.player));
  const bench = players.filter((p) => !inComp.has(p.username)).map((p) => p.name);

  return (
    <>
      <Link className="back" to="/mapas">← Todos os mapas</Link>
      <div className="map-hero" style={map.splash ? { backgroundImage: `url('${map.splash}')` } : undefined}>
        <span className={`badge ${map.inRotation ? 'on' : ''}`}>{map.inRotation ? 'Na rotação' : 'Fora da rotação'}</span>
        <h1 style={{ marginTop: '.5rem' }}>{map.name}</h1>
      </div>

      {/* ---------- Comp atual ---------- */}
      <section ref={currentRef}>
        {!allHistory ? <Loading /> : !current ? (
          <><h2>Comp do time</h2><Empty>Nenhuma comp confirmada para {map.name} ainda. Monte uma abaixo.</Empty></>
        ) : (
          <>
            <div className="page-head" style={{ marginBottom: '.8rem' }}>
              <div>
                <h2>Comp do time{current.name && ` — ${current.name}`}</h2>
                <div className="muted small">
                  Confirmada por <b>{playerName(current.confirmedBy)}</b> em {fmtDateTime(current.confirmedAt)}
                  {current.source && ` · base: ${current.source}`}
                  {bench.length > 0 && ` · banco: ${bench.join(', ')}`}
                </div>
              </div>
            </div>
            <div className="team-comp">
              {current.slots.map((s) => (
                <div className="slot-card" key={s.agent}>
                  <AgentIcon name={s.agent} size="lg" />
                  <div className="agent-name">{s.agent}</div>
                  <div className="small muted"><RoleDot role={role(s.agent)} />{role(s.agent)}</div>
                  <div className="player-name">{playerName(s.player)}</div>
                </div>
              ))}
            </div>
            {current.notes && <div className="card small" style={{ marginTop: '.8rem', whiteSpace: 'pre-wrap' }}>{current.notes}</div>}
          </>
        )}
      </section>

      {/* ---------- 1. Escolher base: meta pro ou comp pronta ---------- */}
      <section className="section">
        <div className="page-head" style={{ marginBottom: '.6rem' }}>
          <div>
            <h2>{current ? 'Trocar a comp' : 'Escolher comp'}</h2>
            <div className="muted small">Clique em <b>Usar</b> para carregar no montador. Os players são sugeridos pelo histórico do time.</div>
          </div>
        </div>
        <div className="tabs" role="tablist">
          <button role="tab" aria-selected={tab === 'meta'} className={tab === 'meta' ? 'active' : ''} onClick={() => setTab('meta')}>
            Meta pro (VCT)
          </button>
          <button role="tab" aria-selected={tab === 'custom'} className={tab === 'custom' ? 'active' : ''} onClick={() => setTab('custom')}>
            Sugestões do time{custom.data?.length ? ` (${custom.data.length})` : ''}
          </button>
        </div>

        {tab === 'meta' && (
          <>
            <div className="row" style={{ marginBottom: '.8rem' }}>
              <select value={scope} onChange={(e) => setScope(e.target.value)} style={{ width: 'auto', minWidth: 220 }} aria-label="Recorte de eventos">
                <option value="recent">Meta atual (eventos recentes)</option>
                <option value="season">Temporada VCT inteira</option>
                {events.data?.length > 0 && (
                  <optgroup label="Evento específico">
                    {events.data.map((e) => (
                      <option key={e.id} value={String(e.id)}>{e.title}{e.status === 'ongoing' ? ' (ao vivo)' : ''}</option>
                    ))}
                  </optgroup>
                )}
              </select>
              <button className="btn-sm" title="Buscar dados novos" onClick={() => setRefreshKey(Date.now())}>↻ Atualizar</button>
              <span className="muted small" style={{ flex: 1, minWidth: 200 }}>
                Só eventos oficiais do VCT (THESPIKE.GG)
                {meta.data?.events?.length > 0 && `: ${meta.data.events.map((e) => e.title.replace(/^VCT /, '')).join(', ')}`}
              </span>
            </div>
            {meta.loading ? <Loading text="Carregando comps do VCT…" /> : meta.error ? <Empty>{meta.error.message}</Empty>
              : !meta.data.comps.length ? <Empty>Nenhuma partida oficial em {map.name} nesse recorte. Tente "Temporada VCT inteira".</Empty>
              : <MetaCompList key={id} comps={meta.data.comps} isInUse={(agents) => isInUse(agents)}
                  onUse={(agents) => loadIntoBuilder(agents, scopeLabel)} />}
          </>
        )}

        {tab === 'custom' && (
          custom.loading ? <Loading /> : !custom.data?.length
            ? <Empty>Nenhuma sugestão ainda. Monte uma comp abaixo e clique em "{isAdmin ? 'Salvar nas sugestões' : 'Enviar sugestão'}".</Empty>
            : (
              <div className="comp-list">
                {custom.data.map((c) => {
                  const slots = c.slots || c.agents.map((agent) => ({ agent, player: '' }));
                  const full = slots.every((s) => s.player);
                  const inUse = isInUse(c.agents, slots);
                  const canDelete = isAdmin || c.createdBy === me.username;
                  return (
                    <div className={`comp-item ${inUse ? 'in-use' : ''}`} key={c.id}>
                      <AgentsRow agents={c.agents} />
                      <div style={{ flex: 1, minWidth: 180 }}>
                        <b>{c.name}</b>
                        <div className="comp-names">
                          {full
                            ? [...slots].sort((a, b) => ROLES.indexOf(role(a.agent)) - ROLES.indexOf(role(b.agent)))
                              .map((s) => `${s.agent} (${playerName(s.player)})`).join(' · ')
                            : byRole(c.agents).join(' · ')}
                        </div>
                        {c.notes && <div className="small muted" style={{ marginTop: 2 }}>{c.notes}</div>}
                      </div>
                      <span className="small muted">
                        {c.fromDefault ? 'Já foi padrão' : 'por'} {c.fromDefault ? `· ${fmtDate(c.createdAt)}` : `${playerName(c.createdBy)} · ${fmtDate(c.createdAt)}`}
                      </span>
                      {inUse ? <span className="badge on">Em uso</span> : (
                        <>
                          {isAdmin && full && <button className="btn-sm btn-primary" onClick={() => setAsDefault({ ...c, slots })}>Definir como padrão</button>}
                          <button className="btn-sm" onClick={() => loadIntoBuilder(c.agents, `Sugestão: ${c.name}`, c.name, slots, c.notes || '', c.id)}>
                            {isAdmin || c.createdBy === me.username ? 'Editar' : 'Usar'}
                          </button>
                        </>
                      )}
                      {canDelete && (
                        <button className="btn-sm btn-danger" onClick={async () => {
                          if (!(await confirm('Excluir esta sugestão?'))) return;
                          try {
                            await api.del(`/api/custom-comps/${c.id}`);
                            custom.reload();
                          } catch (e) {
                            notify(e.message, true);
                          }
                        }}>Excluir</button>
                      )}
                    </div>
                  );
                })}
              </div>
            )
        )}
      </section>

      {/* ---------- 2. Montador ---------- */}
      <section className="section" ref={builderRef}>
        <div className="page-head" style={{ marginBottom: '.8rem' }}>
          <div>
            <h2>{isAdmin ? 'Montar e confirmar' : 'Montar sugestão'}</h2>
            <div className="muted small">
              Selecione um slot, clique no agente e escolha quem joga.{' '}
              {isAdmin
                ? 'Ao confirmar, vira a comp padrão do time neste mapa.'
                : `Só ${adminNames} define a comp padrão. Envie a sua como sugestão.`}
            </div>
          </div>
        </div>
        <div className="card">
          <CompBuilder draft={draft} setDraft={setDraft} busy={busy} isAdmin={isAdmin}
            onConfirm={confirmComp} onSavePreset={savePreset}
            editingName={canEditLoaded ? editingSuggestion.name : null} onUpdateSuggestion={updateSuggestion} />
        </div>
      </section>

      {/* ---------- Histórico ---------- */}
      <section className="section">
        <h2>Histórico de comps confirmadas</h2>
        {!history.length ? <Empty>Sem histórico ainda.</Empty> : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Data</th><th>Comp</th><th>Players</th><th>Confirmada por</th><th /></tr></thead>
              <tbody>
                {history.map((c, i) => (
                  <tr key={c.id}>
                    <td>{fmtDateTime(c.confirmedAt)} {i === 0 && <span className="badge on">Atual</span>}</td>
                    <td><div className="agents-row">{c.slots.map((s) => <AgentIcon key={s.agent} name={s.agent} size="sm" />)}</div></td>
                    <td className="small">{c.slots.map((s) => `${playerName(s.player)} (${s.agent})`).join(', ')}</td>
                    <td>{playerName(c.confirmedBy)}</td>
                    <td className="num">
                      {i > 0 && <button className="btn-sm" onClick={() => { setDraft(draftFrom(c)); scrollTo(builderRef); }}>Reusar</button>}{' '}
                      {isAdmin && (
                        <button className="btn-sm btn-danger" onClick={async () => {
                          if (!(await confirm('Excluir esta comp do histórico?'))) return;
                          await api.del(`/api/team-comps/${c.id}`);
                          loadHistory();
                        }}>Excluir</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
