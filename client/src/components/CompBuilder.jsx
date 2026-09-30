import { useData } from '../data.jsx';
import { ROLES } from '../utils.js';
import { AgentIcon, RoleDot } from './ui.jsx';

export const emptySlots = () => Array.from({ length: 5 }, () => ({ agent: '', player: '' }));

// Montador de comp: 5 slots (agente + player). `draft` é controlado pelo pai.
// isAdmin: confirma a comp padrão. Os outros só enviam sugestão (onSavePreset).
export default function CompBuilder({ draft, setDraft, onConfirm, onSavePreset, busy, isAdmin }) {
  const { agents, players, role } = useData();
  const { slots, active } = draft;

  const picked = slots.map((s) => s.agent).filter(Boolean);
  const chosen = slots.map((s) => s.player).filter(Boolean);
  const dupPlayers = new Set(chosen.filter((p, i) => chosen.indexOf(p) !== i));
  const ready = picked.length === 5 && chosen.length === 5 && dupPlayers.size === 0;
  const roleCount = Object.fromEntries(ROLES.map((r) => [r, picked.filter((a) => role(a) === r).length]));
  const bench = players.filter((p) => !chosen.includes(p.username));

  // O que falta para poder confirmar (mostrado ao lado do botão).
  const missing = [
    picked.length < 5 && `${5 - picked.length} agente${5 - picked.length > 1 ? 's' : ''}`,
    chosen.length < 5 && `${5 - chosen.length} player${5 - chosen.length > 1 ? 's' : ''}`,
    dupPlayers.size > 0 && 'player repetido',
  ].filter(Boolean);

  const update = (patch) => setDraft((d) => ({ ...d, ...patch }));
  const setSlot = (i, patch) => update({ slots: slots.map((s, j) => (j === i ? { ...s, ...patch } : s)) });

  const pickAgent = (name) => {
    const at = slots.findIndex((s) => s.agent === name);
    if (at >= 0) {
      // clicar num agente já escolhido tira ele da comp
      return update({ slots: slots.map((s, j) => (j === at ? { ...s, agent: '' } : s)), active: at });
    }
    const next = slots.map((s, j) => (j === active ? { ...s, agent: name } : s));
    const empty = next.findIndex((s) => !s.agent);
    update({ slots: next, active: empty >= 0 ? empty : active });
  };

  return (
    <div className="builder">
      <div className="builder-slots">
        {slots.map((s, i) => (
          <div key={i} className={`builder-slot ${s.agent ? 'filled' : ''} ${active === i ? 'active' : ''}`}
            onClick={(e) => !e.target.closest('select, button') && update({ active: i })}>
            {s.agent ? <AgentIcon name={s.agent} size="lg" /> : <span className="agent-icon lg">+</span>}
            <div className="agent-name">{s.agent || `Slot ${i + 1}`}</div>
            {s.agent && <div className="small muted"><RoleDot role={role(s.agent)} />{role(s.agent)}</div>}
            <select value={s.player} className={dupPlayers.has(s.player) ? 'dup' : ''} aria-label={`Player do slot ${i + 1}`}
              onChange={(e) => setSlot(i, { player: e.target.value })}>
              <option value="">Player…</option>
              {players.map((p) => <option key={p.username} value={p.username}>{p.name}</option>)}
            </select>
            {s.agent && (
              <button className="btn-sm btn-danger" onClick={() => update({ slots: slots.map((x, j) => (j === i ? { ...x, agent: '' } : x)), active: i })}>
                remover
              </button>
            )}
          </div>
        ))}
      </div>

      <div className="role-summary">
        {ROLES.map((r) => <span key={r}><RoleDot role={r} />{r}: <b>{roleCount[r]}</b></span>)}
        {chosen.length === 5 && bench.length > 0 && <span>Banco: <b>{bench.map((p) => p.name).join(', ')}</b></span>}
        {dupPlayers.size > 0 && <span style={{ color: 'var(--red)' }}>Um player está em dois slots</span>}
      </div>

      <div className="agent-pool">
        {ROLES.map((r) => (
          <div className="role-group" key={r}>
            <h4><RoleDot role={r} />{r}</h4>
            <div className="agents">
              {agents.filter((a) => a.role === r).map((a) => (
                <button key={a.name} className={`agent-btn ${picked.includes(a.name) ? 'picked' : ''}`} title={a.name} onClick={() => pickAgent(a.name)}>
                  <AgentIcon name={a.name} />
                  <span className="tip">{a.name}</span>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="grid-2">
        <div>
          <label htmlFor="comp-name">Nome da comp (opcional)</label>
          <input id="comp-name" maxLength={60} placeholder="Ex.: Double init, Anti-eco…" value={draft.name}
            onChange={(e) => update({ name: e.target.value })} />
        </div>
        <div>
          <label htmlFor="comp-notes">Observações (opcional)</label>
          <input id="comp-notes" maxLength={1000} placeholder="Setups, quem calla, etc." value={draft.notes}
            onChange={(e) => update({ notes: e.target.value })} />
        </div>
      </div>

      <div className="row">
        <button className="btn-ghost" onClick={() => update({ slots: emptySlots(), active: 0, source: '', name: '', notes: '' })}>Limpar</button>
        {draft.source && <span className="small muted">Base: {draft.source}</span>}
        <span className="spacer" />
        {missing.length > 0 && <span className="small" style={{ color: 'var(--yellow)' }}>Falta: {missing.join(' · ')}</span>}
        {isAdmin ? (
          <>
            <button disabled={picked.length !== 5 || dupPlayers.size > 0 || busy} onClick={onSavePreset}>Salvar nas sugestões</button>
            <button className="btn-primary" disabled={!ready || busy} onClick={onConfirm}>Confirmar comp padrão</button>
          </>
        ) : (
          <button className="btn-primary" disabled={picked.length !== 5 || dupPlayers.size > 0 || busy} onClick={onSavePreset}>
            Enviar sugestão
          </button>
        )}
      </div>
    </div>
  );
}
