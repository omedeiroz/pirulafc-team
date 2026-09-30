import { useCallback, useEffect, useReducer, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api.js';
import { useData } from '../data.jsx';
import { AgentIcon, Empty, Loading, Modal, RoleDot, useFeedback, useFetch } from '../components/ui.jsx';
import { BoardCanvas, COLORS, TEAM_COLOR, uid, useDeleteKey } from '../components/Board.jsx';
import { latestByMap, ROLES } from '../utils.js';

export const SIDE_LABEL = { atk: 'Ataque', def: 'Defesa' };
export const TAGS = ['Default', 'Execução', 'Retake', 'Pós-plant', 'Anti-eco', 'Pistol', 'Fake', 'Rush', 'Split', 'Lurk'];
const PHASE_NAMES = { atk: ['Setup', 'Execução', 'Pós-plant'], def: ['Setup', 'Rotação', 'Retake'] };
const MAX_PHASES = 12;
const HISTORY = 60;

const TOOLS = [
  { id: 'select', label: 'Mover', icon: '✥', hint: 'Arraste itens. Delete apaga o selecionado.' },
  { id: 'arrow', label: 'Seta', icon: '➜' },
  { id: 'line', label: 'Linha', icon: '╱' },
  { id: 'pen', label: 'Lápis', icon: '✎' },
  { id: 'text', label: 'Texto', icon: 'T' },
  { id: 'erase', label: 'Borracha', icon: '⌫', hint: 'Clique ou arraste por cima para apagar.' },
];

function newPhase(side, index, items = []) {
  return { id: uid(), name: PHASE_NAMES[side]?.[index] || `Fase ${index + 1}`, note: '', items };
}

// Documento + histórico juntos, numa função pura (desfazer/refazer só das fases do quadro).
function reducer(state, action) {
  const withHistory = (phases) => ({
    doc: { ...state.doc, phases },
    past: [...state.past.slice(-(HISTORY - 1)), state.doc.phases],
    future: [],
  });
  switch (action.type) {
    case 'load':
      return { doc: action.doc, past: [], future: [] };
    case 'field': // campos de texto: sem histórico
      return { ...state, doc: { ...state.doc, ...action.patch } };
    case 'phases':
      return withHistory(action.phases);
    case 'items':
      return withHistory(state.doc.phases.map((p, i) => (i === action.idx ? { ...p, items: action.items } : p)));
    case 'phaseField': // nome/observação da fase: sem histórico
      return { ...state, doc: { ...state.doc, phases: state.doc.phases.map((p, i) => (i === action.idx ? { ...p, ...action.patch } : p)) } };
    case 'undo':
      if (!state.past.length) return state;
      return { doc: { ...state.doc, phases: state.past[state.past.length - 1] }, past: state.past.slice(0, -1), future: [state.doc.phases, ...state.future] };
    case 'redo':
      if (!state.future.length) return state;
      return { doc: { ...state.doc, phases: state.future[0] }, past: [...state.past, state.doc.phases], future: state.future.slice(1) };
    default:
      return state;
  }
}

export default function StrategyEditor() {
  const { id: mapId, sid } = useParams();
  const navigate = useNavigate();
  const { map: getMap, me, agent, role, playerName, players, agents } = useData();
  const { notify, confirm } = useFeedback();
  const map = getMap(mapId);
  const isNew = !sid;

  const board = useFetch(`/api/maps/${mapId}/board`);
  const [state, dispatch] = useReducer(reducer, { doc: null, past: [], future: [] });
  const st = state.doc; // documento da estratégia
  const [editing, setEditing] = useState(isNew);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [phaseIdx, setPhaseIdx] = useState(0);

  // Ferramentas do quadro
  const [tool, setTool] = useState('select');
  const [pending, setPending] = useState(null);
  const [color, setColor] = useState(COLORS[0]);
  const [dashed, setDashed] = useState(false);
  const [selectedId, setSelectedId] = useState(null);
  const [enemyAgent, setEnemyAgent] = useState('');
  const [showCallouts, setShowCallouts] = useState(true);
  const [textAt, setTextAt] = useState(null);

  // Carrega a estratégia (ou monta uma nova com a comp padrão do mapa).
  useEffect(() => {
    let alive = true;
    setPhaseIdx(0);
    setDirty(false);
    setEditing(isNew);
    if (isNew) {
      api.get('/api/team-comps').then((comps) => {
        if (!alive) return;
        const comp = latestByMap(comps)[mapId];
        const slots = comp
          ? [...comp.slots].sort((a, b) => ROLES.indexOf(role(a.agent)) - ROLES.indexOf(role(b.agent)))
          : Array.from({ length: 5 }, () => ({ agent: '', player: '' }));
        dispatch({ type: 'load', doc: {
          name: '', side: 'atk', tags: [], notes: '', rotated: false, official: false,
          assignments: slots.map((s) => ({ player: s.player, agent: s.agent, task: '' })),
          phases: [newPhase('atk', 0)],
        } });
      });
    } else {
      api.get(`/api/strategies/${sid}`)
        .then((s) => alive && dispatch({ type: 'load', doc: s }))
        .catch((e) => alive && notify(e.message, true));
    }
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sid, mapId]);

  // Aviso ao fechar a aba com alterações não salvas.
  useEffect(() => {
    if (!dirty) return undefined;
    const onUnload = (e) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', onUnload);
    return () => window.removeEventListener('beforeunload', onUnload);
  }, [dirty]);

  // Fase atual (o índice é ajustado se um desfazer remover fases).
  const pIdx = st ? Math.min(phaseIdx, st.phases.length - 1) : 0;
  const phase = st?.phases[pIdx];

  // ---------- Alterações (com desfazer/refazer nas fases) ----------
  const changePhases = useCallback((phases) => { dispatch({ type: 'phases', phases }); setDirty(true); }, []);
  const commitItems = useCallback((items) => { dispatch({ type: 'items', idx: pIdx, items }); setDirty(true); }, [pIdx]);
  const undo = useCallback(() => { dispatch({ type: 'undo' }); setDirty(true); }, []);
  const redo = useCallback(() => { dispatch({ type: 'redo' }); setDirty(true); }, []);
  const setField = (patch) => { dispatch({ type: 'field', patch }); setDirty(true); };
  const hist = state;

  const deleteSelected = useCallback((id) => {
    if (!phase) return;
    commitItems(phase.items.filter((i) => i.id !== id));
    setSelectedId(null);
  }, [phase, commitItems]);
  useDeleteKey(editing ? selectedId : null, deleteSelected);

  // Atalhos: Ctrl+Z / Ctrl+Y (ou Ctrl+Shift+Z), Esc cancela a colocação.
  useEffect(() => {
    if (!editing) return undefined;
    const onKey = (e) => {
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) return;
      const k = e.key.toLowerCase();
      if ((e.ctrlKey || e.metaKey) && k === 'z' && !e.shiftKey) { e.preventDefault(); undo(); }
      else if ((e.ctrlKey || e.metaKey) && (k === 'y' || (k === 'z' && e.shiftKey))) { e.preventDefault(); redo(); }
      else if (k === 'escape') { setTool('select'); setPending(null); }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [editing, undo, redo]);

  if (!map) return <Empty>Mapa não encontrado. <Link to="/mapas">Voltar</Link></Empty>;
  if (!st || (!board.data && board.loading)) return <Loading text="Carregando quadro…" />;
  if (board.error) return <Empty>{board.error.message}</Empty>;

  const isAdmin = !!me.admin;
  const canEdit = isNew || (st.official ? isAdmin : st.createdBy === me.username || isAdmin);
  const allies = st.assignments.filter((a) => a.agent);

  const pick = (item) => { setPending(item); setTool('place'); setSelectedId(null); };
  const pickTool = (t) => { setTool(t); setPending(null); if (t !== 'select') setSelectedId(null); };

  // ---------- Fases ----------
  const addPhase = () => {
    if (st.phases.length >= MAX_PHASES) return notify(`Máximo de ${MAX_PHASES} fases`, true);
    // A nova fase começa com uma cópia da atual (as posições continuam de onde parou).
    const copy = phase.items.map((it) => ({ ...it, id: uid() }));
    changePhases([...st.phases.slice(0, pIdx + 1), newPhase(st.side, pIdx + 1, copy), ...st.phases.slice(pIdx + 1)]);
    setPhaseIdx(pIdx + 1);
  };
  const removePhase = async () => {
    if (st.phases.length === 1) return notify('A estratégia precisa de pelo menos uma fase', true);
    if (!(await confirm(`Apagar a fase "${phase.name}"?`))) return;
    changePhases(st.phases.filter((_, i) => i !== pIdx));
    setPhaseIdx(Math.max(0, pIdx - 1));
  };
  const renamePhase = (name) => { dispatch({ type: 'phaseField', idx: pIdx, patch: { name } }); setDirty(true); };
  const setPhaseNote = (note) => { dispatch({ type: 'phaseField', idx: pIdx, patch: { note } }); setDirty(true); };

  // ---------- Salvar / ações ----------
  const save = async () => {
    if (!st.name.trim()) return notify('Dê um nome para a estratégia', true);
    setSaving(true);
    try {
      const body = { ...st };
      const saved = isNew ? await api.post(`/api/maps/${mapId}/strategies`, body) : await api.put(`/api/strategies/${sid}`, body);
      dispatch({ type: 'load', doc: saved });
      setDirty(false);
      notify('Estratégia salva');
      if (isNew) navigate(`/mapas/${mapId}/estrategias/${saved.id}`, { replace: true });
      else setEditing(false);
    } catch (e) {
      notify(e.message, true);
    } finally {
      setSaving(false);
    }
  };

  const duplicate = async () => {
    try {
      const copy = await api.post(`/api/maps/${mapId}/strategies`, { ...st, name: `Cópia de ${st.name}`.slice(0, 60) });
      notify('Cópia criada. Agora é sua para editar.');
      navigate(`/mapas/${mapId}/estrategias/${copy.id}`);
    } catch (e) {
      notify(e.message, true);
    }
  };

  const remove = async () => {
    if (!(await confirm(`Apagar a estratégia "${st.name}"?`))) return;
    try {
      await api.del(`/api/strategies/${sid}`);
      notify('Estratégia apagada');
      navigate(`/mapas/${mapId}/estrategias`);
    } catch (e) {
      notify(e.message, true);
    }
  };

  const toggleOfficial = async () => {
    try {
      const s = await api.post(`/api/strategies/${sid}/official`, { official: !st.official });
      dispatch({ type: 'field', patch: { official: s.official } });
      notify(s.official ? 'Marcada como padrão do time' : 'Deixou de ser padrão');
    } catch (e) {
      notify(e.message, true);
    }
  };

  const cancelEdit = async () => {
    if (dirty && !(await confirm('Descartar as alterações não salvas?'))) return;
    if (isNew) return navigate(`/mapas/${mapId}/estrategias`);
    const fresh = await api.get(`/api/strategies/${sid}`);
    dispatch({ type: 'load', doc: fresh });
    setDirty(false);
    setEditing(false);
  };

  const setAssignment = (i, patch) => setField({ assignments: st.assignments.map((a, j) => (j === i ? { ...a, ...patch } : a)) });
  const toggleTag = (t) => setField({ tags: st.tags.includes(t) ? st.tags.filter((x) => x !== t) : st.tags.length < 4 ? [...st.tags, t] : st.tags });

  const abilityButtons = (agentName, team) => (agent(agentName)?.abilities || []).map((ab) => (
    <button key={`${team}-${agentName}-${ab.slot}`} type="button" title={`${agentName}: ${ab.name}`}
      className={`pal-ability ${pending?.type === 'ability' && pending.agent === agentName && pending.slot === ab.slot && pending.team === team ? 'on' : ''}`}
      style={{ borderColor: TEAM_COLOR[team] }}
      onClick={() => pick({ type: 'ability', agent: agentName, slot: ab.slot, team })}>
      <img src={ab.icon} alt={ab.name} />
    </button>
  ));

  // Paleta: aparece acima do quadro no celular e na lateral no computador.
  const renderPalette = (cls) => (
      <div className={`card palette ${cls}`}>
        <h3>Nosso time</h3>
        {!allies.length && <p className="muted small">Defina os agentes em "Quem faz o quê" abaixo.</p>}
        <div className="pal-agents">
          {allies.map((a) => (
            <div key={a.agent} className="pal-agent-row">
              <button type="button" title={`Colocar ${a.agent}`}
                className={`pal-agent ${pending?.type === 'agent' && pending.agent === a.agent && pending.team === 'ally' ? 'on' : ''}`}
                onClick={() => pick({ type: 'agent', agent: a.agent, player: a.player, team: 'ally' })}>
                <AgentIcon name={a.agent} size="sm" />
                <span className="small">{a.player ? playerName(a.player) : a.agent}</span>
              </button>
              <div className="pal-abilities">{abilityButtons(a.agent, 'ally')}</div>
            </div>
          ))}
        </div>

        <h3 style={{ marginTop: '1rem' }}>Inimigos</h3>
        <div className="row">
          <select value={enemyAgent} onChange={(e) => setEnemyAgent(e.target.value)} aria-label="Agente inimigo" style={{ flex: 1 }}>
            <option value="">Escolha um agente…</option>
            {agents.map((a) => <option key={a.name}>{a.name}</option>)}
          </select>
          {enemyAgent && (
            <button type="button" className={`pal-agent enemy ${pending?.type === 'agent' && pending.agent === enemyAgent && pending.team === 'enemy' ? 'on' : ''}`}
              title={`Colocar ${enemyAgent} inimigo`} onClick={() => pick({ type: 'agent', agent: enemyAgent, team: 'enemy' })}>
              <AgentIcon name={enemyAgent} size="sm" />
            </button>
          )}
        </div>
        {enemyAgent && <div className="pal-abilities" style={{ marginTop: '.4rem' }}>{abilityButtons(enemyAgent, 'enemy')}</div>}

        <h3 style={{ marginTop: '1rem' }}>Objetos</h3>
        <button type="button" className={`pal-agent ${pending?.type === 'spike' ? 'on' : ''}`} onClick={() => pick({ type: 'spike' })}>
          <svg width="26" height="26" viewBox="-20 -20 40 40" aria-hidden="true">
            <polygon points="0,-19 16,-9 16,9 0,19 -16,9 -16,-9" fill="#ff4655" stroke="#fff" strokeWidth="3" />
            <path d="M0,-9 L6,0 L0,9 L-6,0 Z" fill="#fff" />
          </svg>
          <span className="small">Spike</span>
        </button>
        <p className="muted small" style={{ marginBottom: 0 }}>
          <span style={{ color: TEAM_COLOR.ally }}>●</span> nosso time · <span style={{ color: TEAM_COLOR.enemy }}>●</span> inimigos
        </p>
      </div>
  );

  return (
    <>
      <Link className="back" to={`/mapas/${mapId}/estrategias`}>← Estratégias de {map.name}</Link>

      {/* ---------- Cabeçalho ---------- */}
      <div className="page-head">
        <div style={{ flex: 1, minWidth: 240 }}>
          {editing ? (
            <input className="strat-name-input" value={st.name} maxLength={60} placeholder="Nome da estratégia (ex.: Default A)"
              onChange={(e) => setField({ name: e.target.value })} autoFocus={isNew} />
          ) : (
            <h1 style={{ marginBottom: '.3rem' }}>{st.name}</h1>
          )}
          <div className="row">
            <span className={`badge ${st.side === 'atk' ? 'red' : 'on'}`}>{SIDE_LABEL[st.side]}</span>
            {st.official && <span className="badge on">★ Padrão do time</span>}
            {st.tags.map((t) => <span key={t} className="badge">{t}</span>)}
            {!isNew && <span className="muted small">por {playerName(st.createdBy)}{st.updatedBy ? ` · editada por ${playerName(st.updatedBy)}` : ''}</span>}
            {dirty && <span className="small" style={{ color: 'var(--yellow)' }}>● alterações não salvas</span>}
          </div>
        </div>
        <div className="row">
          {editing ? (
            <>
              <button className="btn-ghost" onClick={cancelEdit} disabled={saving}>Cancelar</button>
              <button className="btn-primary" onClick={save} disabled={saving}>{saving ? 'Salvando…' : 'Salvar'}</button>
            </>
          ) : (
            <>
              {isAdmin && <button onClick={toggleOfficial}>{st.official ? '☆ Tirar de padrão' : '★ Marcar como padrão'}</button>}
              <button onClick={duplicate}>Duplicar</button>
              {canEdit && <button className="btn-danger" onClick={remove}>Apagar</button>}
              {canEdit && <button className="btn-primary" onClick={() => setEditing(true)}>Editar</button>}
            </>
          )}
        </div>
      </div>

      {editing && (
        <div className="card strat-meta">
          <div className="row">
            <label style={{ margin: 0 }}>Lado</label>
            {['atk', 'def'].map((s) => (
              <button key={s} type="button" className={`btn-sm ${st.side === s ? 'btn-primary' : ''}`} onClick={() => setField({ side: s })}>
                {SIDE_LABEL[s]}
              </button>
            ))}
            <span className="spacer" />
            <label style={{ margin: 0 }}>Tags (até 4)</label>
            {TAGS.map((t) => (
              <button key={t} type="button" className={`btn-sm tag-btn ${st.tags.includes(t) ? 'on' : ''}`} onClick={() => toggleTag(t)}>{t}</button>
            ))}
          </div>
        </div>
      )}

      {/* ---------- Fases ---------- */}
      <div className="phase-bar">
        {st.phases.map((p, i) => (
          <button key={p.id} className={`phase-tab ${i === pIdx ? 'active' : ''}`} onClick={() => { setPhaseIdx(i); setSelectedId(null); }}>
            <span className="phase-num">{i + 1}</span>{p.name}
          </button>
        ))}
        {editing && st.phases.length < MAX_PHASES && (
          <button className="phase-tab add" onClick={addPhase} title="Nova fase (começa com uma cópia desta)">+ Fase</button>
        )}
        <span className="spacer" />
        {!editing && st.phases.length > 1 && (
          <>
            <button className="btn-sm" disabled={pIdx === 0} onClick={() => setPhaseIdx(pIdx - 1)}>← Anterior</button>
            <button className="btn-sm" disabled={pIdx === st.phases.length - 1} onClick={() => setPhaseIdx(pIdx + 1)}>Próxima →</button>
          </>
        )}
      </div>

      <div className={`strat-layout ${editing ? 'editing' : ''}`}>
        {/* ---------- Quadro ---------- */}
        <div className="strat-board-col">
          {editing && renderPalette('palette-top')}
          {editing && (
            <div className="board-toolbar">
              {TOOLS.map((t) => (
                <button key={t.id} type="button" className={`tool-btn ${tool === t.id ? 'on' : ''}`} title={t.hint || t.label} onClick={() => pickTool(t.id)}>
                  <span className="tool-icon">{t.icon}</span>{t.label}
                </button>
              ))}
              {tool === 'line' && (
                <label className="tool-check"><input type="checkbox" checked={dashed} onChange={(e) => setDashed(e.target.checked)} /> tracejada</label>
              )}
              <span className="tool-sep" />
              {COLORS.map((c) => (
                <button key={c} type="button" className={`color-dot ${color === c ? 'on' : ''}`} style={{ background: c }} aria-label={`Cor ${c}`} onClick={() => setColor(c)} />
              ))}
              <span className="tool-sep" />
              <button type="button" className="tool-btn" onClick={undo} disabled={!hist.past.length} title="Desfazer (Ctrl+Z)">↶</button>
              <button type="button" className="tool-btn" onClick={redo} disabled={!hist.future.length} title="Refazer (Ctrl+Y)">↷</button>
              {selectedId && (
                <button type="button" className="tool-btn" onClick={() => deleteSelected(selectedId)} title="Apagar o item selecionado (Delete)">
                  Apagar selecionado
                </button>
              )}
              <button type="button" className="tool-btn" disabled={!phase.items.length}
                onClick={async () => (await confirm('Limpar tudo desta fase?')) && commitItems([])}>Limpar fase</button>
            </div>
          )}

          <div className="board-wrap">
            <BoardCanvas
              minimap={board.data.minimap}
              callouts={board.data.callouts}
              items={phase.items}
              rotated={st.rotated}
              showCallouts={showCallouts}
              readOnly={!editing}
              tool={tool}
              pending={pending}
              color={color}
              dashed={dashed}
              selectedId={selectedId}
              onSelect={setSelectedId}
              onCommit={commitItems}
              onRequestText={(p) => setTextAt(p)}
            />
          </div>

          <div className="row board-footer">
            <label className="tool-check"><input type="checkbox" checked={showCallouts} onChange={(e) => setShowCallouts(e.target.checked)} /> nomes dos lugares</label>
            <button type="button" className="btn-sm" onClick={() => (editing ? setField({ rotated: !st.rotated }) : dispatch({ type: 'field', patch: { rotated: !st.rotated } }))}>⟲ Girar mapa</button>
            {editing && tool === 'place' && pending && (
              <span className="small" style={{ color: 'var(--yellow)' }}>Clique no mapa para colocar · Esc cancela</span>
            )}
            {editing && tool !== 'place' && TOOLS.find((t) => t.id === tool)?.hint && (
              <span className="small muted">{TOOLS.find((t) => t.id === tool).hint}</span>
            )}
          </div>

          {editing ? (
            <div className="phase-edit row">
              <input value={phase.name} maxLength={30} onChange={(e) => renamePhase(e.target.value)} aria-label="Nome da fase" style={{ maxWidth: 200 }} />
              <input value={phase.note} maxLength={300} placeholder="O que acontece nesta fase (opcional)" onChange={(e) => setPhaseNote(e.target.value)} style={{ flex: 1 }} />
              <button className="btn-sm btn-danger" onClick={removePhase} disabled={st.phases.length === 1}>Apagar fase</button>
            </div>
          ) : (
            phase.note && <div className="card small" style={{ marginTop: '.6rem' }}><b>{phase.name}:</b> {phase.note}</div>
          )}
        </div>

        {/* ---------- Lateral: paleta (editando) e quem faz o quê ---------- */}
        <aside className="strat-side">
          {editing && renderPalette('palette-side')}

          <div className="card">
            <h3>Quem faz o quê</h3>
            {editing ? (
              <div className="assign-edit">
                {st.assignments.map((a, i) => (
                  <div key={i} className="assign-row">
                    <select value={a.player} onChange={(e) => setAssignment(i, { player: e.target.value })} aria-label={`Player ${i + 1}`}>
                      <option value="">Player…</option>
                      {players.map((p) => <option key={p.username} value={p.username}>{p.name}</option>)}
                    </select>
                    <select value={a.agent} onChange={(e) => setAssignment(i, { agent: e.target.value })} aria-label={`Agente ${i + 1}`}>
                      <option value="">Agente…</option>
                      {agents.map((ag) => <option key={ag.name}>{ag.name}</option>)}
                    </select>
                    <input value={a.task} maxLength={120} placeholder="Função na jogada (ex.: smoke CT e Top)" onChange={(e) => setAssignment(i, { task: e.target.value })} />
                  </div>
                ))}
              </div>
            ) : allies.length ? (
              <div className="assign-view">
                {st.assignments.filter((a) => a.agent || a.task).map((a, i) => (
                  <div key={i} className="assign-view-row">
                    {a.agent && <AgentIcon name={a.agent} size="sm" />}
                    <div>
                      <div><b>{a.player ? playerName(a.player) : '—'}</b> <span className="muted small">{a.agent} {a.agent && <RoleDot role={role(a.agent)} size={12} />}</span></div>
                      {a.task && <div className="small">{a.task}</div>}
                    </div>
                  </div>
                ))}
              </div>
            ) : <p className="muted small">Ninguém definido.</p>}
          </div>

          <div className="card">
            <h3>Observações</h3>
            {editing ? (
              <textarea rows={4} maxLength={2000} value={st.notes} placeholder="Calls, timings, o que fazer se der errado…" onChange={(e) => setField({ notes: e.target.value })} />
            ) : st.notes ? <p className="small" style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{st.notes}</p> : <p className="muted small" style={{ margin: 0 }}>Sem observações.</p>}
          </div>
        </aside>
      </div>

      {textAt && <TextModal color={color} onClose={() => setTextAt(null)}
        onSave={(text) => { commitItems([...phase.items, { type: 'text', id: uid(), x: textAt.x, y: textAt.y, text, color }]); setTextAt(null); }} />}
    </>
  );
}

function TextModal({ color, onClose, onSave }) {
  const [text, setText] = useState('');
  return (
    <Modal onClose={onClose}>
      <h3>Texto no mapa</h3>
      <form onSubmit={(e) => { e.preventDefault(); if (text.trim()) onSave(text.trim()); }}>
        <input value={text} maxLength={80} placeholder="Ex.: 2 lurk / wait util" onChange={(e) => setText(e.target.value)} style={{ color }} />
        <div className="modal-actions">
          <button type="button" className="btn-ghost" onClick={onClose}>Cancelar</button>
          <button className="btn-primary" disabled={!text.trim()}>Adicionar</button>
        </div>
      </form>
    </Modal>
  );
}
