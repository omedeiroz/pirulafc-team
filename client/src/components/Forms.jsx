import { useState } from 'react';
import { api } from '../api.js';
import { useData } from '../data.jsx';
import { Modal, useFeedback } from './ui.jsx';

const val = (v) => v ?? '';

// ---------- Campeonato ----------
export function TournamentForm({ tournament, onClose, onSaved }) {
  const { notify } = useFeedback();
  const [f, setF] = useState({
    name: '', link: '', organizer: '', placement: '', startDate: '', endDate: '', prize: '', notes: '',
    ...tournament,
  });
  const bind = (k) => ({ value: val(f[k]), onChange: (e) => setF({ ...f, [k]: e.target.value }) });

  const submit = async (e) => {
    e.preventDefault();
    try {
      const saved = tournament
        ? await api.put(`/api/tournaments/${tournament.id}`, f)
        : await api.post('/api/tournaments', f);
      notify('Campeonato salvo');
      onSaved(saved);
    } catch (err) {
      notify(err.message, true);
    }
  };

  return (
    <Modal onClose={onClose}>
      <h2>{tournament ? 'Editar' : 'Novo'} campeonato</h2>
      <form onSubmit={submit}>
        <div className="field"><label>Nome *</label><input required maxLength={120} {...bind('name')} /></div>
        <div className="field"><label>Link do campeonato</label><input type="url" placeholder="https://…" {...bind('link')} /></div>
        <div className="grid-2">
          <div className="field"><label>Organizador</label><input maxLength={120} {...bind('organizer')} /></div>
          <div className="field"><label>Colocação final</label><input maxLength={60} placeholder="Ex.: Top 4, Campeão" {...bind('placement')} /></div>
        </div>
        <div className="grid-3">
          <div className="field"><label>Início</label><input type="date" {...bind('startDate')} /></div>
          <div className="field"><label>Fim</label><input type="date" {...bind('endDate')} /></div>
          <div className="field"><label>Premiação</label><input maxLength={60} {...bind('prize')} /></div>
        </div>
        <div className="field"><label>Observações</label><textarea rows={3} maxLength={2000} {...bind('notes')} /></div>
        <div className="modal-actions">
          <button type="button" className="btn-ghost" onClick={onClose}>Cancelar</button>
          <button className="btn-primary">Salvar</button>
        </div>
      </form>
    </Modal>
  );
}

// ---------- Partida (um mapa) ----------
const emptyRow = () => ({ player: '', agent: '', k: '', d: '', a: '', acs: '' });

export function MatchForm({ tournamentId, match, teamComps, onClose, onSaved }) {
  const { maps, players, agents } = useData();
  const { notify } = useFeedback();
  const [f, setF] = useState({
    date: new Date().toISOString().slice(0, 10), opponent: '', stage: '', map: '', scoreUs: '', scoreThem: '', vod: '', notes: '',
    ...match,
  });
  const [rows, setRows] = useState(Array.from({ length: 5 }, (_, i) => ({ ...emptyRow(), ...match?.stats?.[i] })));
  const bind = (k) => ({ value: val(f[k]), onChange: (e) => setF({ ...f, [k]: e.target.value }) });
  const setRow = (i, k, v) => setRows(rows.map((r, j) => (j === i ? { ...r, [k]: v } : r)));

  const compFor = (mapId) => teamComps.filter((c) => c.map === mapId).sort((a, b) => (a.confirmedAt < b.confirmedAt ? 1 : -1))[0];
  const fillFromComp = (mapId = f.map, silent = false) => {
    const comp = compFor(mapId);
    if (!comp) return !silent && notify(mapId ? 'Esse mapa não tem comp confirmada' : 'Escolha o mapa primeiro', true);
    setRows(comp.slots.map((s, i) => ({ ...rows[i], player: s.player, agent: s.agent })));
  };
  const onMapChange = (e) => {
    setF({ ...f, map: e.target.value });
    if (rows.every((r) => !r.player && !r.agent)) fillFromComp(e.target.value, true);
  };

  const submit = async (e) => {
    e.preventDefault();
    const stats = rows.filter((r) => r.player);
    if (new Set(stats.map((s) => s.player)).size !== stats.length) return notify('Um player aparece duas vezes', true);
    try {
      const body = { ...f, stats };
      if (match) await api.put(`/api/tournaments/${tournamentId}/matches/${match.id}`, body);
      else await api.post(`/api/tournaments/${tournamentId}/matches`, body);
      notify('Partida salva');
      onSaved();
    } catch (err) {
      notify(err.message, true);
    }
  };

  const mapOpts = [...maps].sort((a, b) => b.inRotation - a.inRotation || a.name.localeCompare(b.name));

  return (
    <Modal onClose={onClose} wide>
      <h2>{match ? 'Editar' : 'Nova'} partida</h2>
      <p className="muted small" style={{ marginTop: 0 }}>Uma partida = um mapa. Numa MD3, registre cada mapa separado.</p>
      <form onSubmit={submit}>
        <div className="grid-3">
          <div className="field"><label>Data</label><input type="date" {...bind('date')} /></div>
          <div className="field"><label>Adversário *</label><input required maxLength={120} {...bind('opponent')} /></div>
          <div className="field"><label>Fase</label><input maxLength={60} placeholder="Ex.: Grupos, Semi…" {...bind('stage')} /></div>
        </div>
        <div className="grid-3">
          <div className="field">
            <label>Mapa</label>
            <select value={f.map} onChange={onMapChange}>
              <option value="">—</option>
              {mapOpts.map((m) => <option key={m.id} value={m.id}>{m.name}{m.inRotation ? '' : ' (fora)'}</option>)}
            </select>
          </div>
          <div className="field"><label>Rounds nosso</label><input type="number" min={0} {...bind('scoreUs')} /></div>
          <div className="field"><label>Rounds deles</label><input type="number" min={0} {...bind('scoreThem')} /></div>
        </div>
        <div className="field"><label>Link do VOD / partida</label><input type="url" placeholder="https://…" {...bind('vod')} /></div>

        <div className="row" style={{ margin: '.4rem 0 .5rem' }}>
          <label style={{ margin: 0 }}>K/D/A dos players</label>
          <span className="spacer" />
          <button type="button" className="btn-sm" onClick={() => fillFromComp()}>Preencher com a comp do mapa</button>
        </div>
        <div className="stats-grid">
          {['Player', 'Agente', 'K', 'D', 'A', 'ACS'].map((h) => <span key={h} className="h">{h}</span>)}
          {rows.map((r, i) => (
            <Row key={i} r={r} i={i} setRow={setRow} players={players} agents={agents} />
          ))}
        </div>

        <div className="field" style={{ marginTop: '.9rem' }}><label>Observações</label><textarea rows={2} maxLength={1000} {...bind('notes')} /></div>
        <div className="modal-actions">
          <button type="button" className="btn-ghost" onClick={onClose}>Cancelar</button>
          <button className="btn-primary">Salvar</button>
        </div>
      </form>
    </Modal>
  );
}

function Row({ r, i, setRow, players, agents }) {
  const num = (k, ph) => (
    <input type="number" min={0} placeholder={ph} value={val(r[k])} onChange={(e) => setRow(i, k, e.target.value)} />
  );
  return (
    <>
      <select value={r.player} onChange={(e) => setRow(i, 'player', e.target.value)} aria-label={`Player ${i + 1}`}>
        <option value="">Player…</option>
        {players.map((p) => <option key={p.username} value={p.username}>{p.name}</option>)}
      </select>
      <select value={r.agent} onChange={(e) => setRow(i, 'agent', e.target.value)} aria-label={`Agente ${i + 1}`}>
        <option value="">Agente…</option>
        {agents.map((a) => <option key={a.name}>{a.name}</option>)}
      </select>
      {num('k', 'K')}{num('d', 'D')}{num('a', 'A')}{num('acs', 'ACS')}
    </>
  );
}
