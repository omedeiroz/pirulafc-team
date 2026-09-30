import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { api } from '../api.js';
import { useData } from '../data.jsx';
import { AgentIcon, Avatar, Empty, Loading, ResultBadge, RoleDot, useFeedback, useFetch } from '../components/ui.jsx';
import ImageCropper, { IMAGE_SIZES } from '../components/ImageCropper.jsx';
import { RankBadge } from '../components/Rank.jsx';
import ActStats from '../components/ActStats.jsx';
import { aggregateStats, fmtDate, latestByMap, matchResult, record, resizeImage, ROLES } from '../utils.js';

const MAX_ROLES = 2;
const MAX_FAVS = 3;

export default function Profile() {
  const params = useParams();
  const { me, person, agents, maps, roleOptions = [], regions = ['br'], reloadBoot, mapName } = useData();
  const username = params.username || me.username;
  const p = person(username);
  const isMe = username === me.username;
  const isCoach = p?.teamRole === 'coach';
  const [rankKey, setRankKey] = useState(0); // muda ao clicar em Atualizar, para recarregar o elo do topo

  const tournaments = useFetch('/api/tournaments');
  const teamComps = useFetch('/api/team-comps');

  if (!p) return <Empty>Usuário não encontrado. <Link to="/jogadores">Voltar</Link></Empty>;
  if (params.username === me.username) return <Navigate to="/perfil" replace />;

  return (
    <>
      <ProfileHeader p={p} isMe={isMe} isCoach={isCoach} onChanged={reloadBoot} rankKey={rankKey} />

      <div className="profile-grid">
        {!isCoach && <RolesCard p={p} isMe={isMe} options={roleOptions} onChanged={reloadBoot} />}
        <FavoritesCard p={p} isMe={isMe} agents={agents} onChanged={reloadBoot} />
        {!isCoach && (isMe || p.riotId) && <RiotIdCard p={p} isMe={isMe} regions={regions} onChanged={reloadBoot} />}
        {isMe && <PasswordCard />}
        {isMe && me.admin && <BackupCard />}
      </div>

      {isCoach ? (
        <section className="section">
          <Empty>{p.name} é coach do time, então não tem histórico de partidas como jogador.</Empty>
        </section>
      ) : (
        <>
          {p.riotId && (
            <section className="section">
              <ActStats key={`${p.username}-${p.riotId}-${p.region}`} username={p.username} canRefresh={isMe}
                onRefreshed={() => setRankKey((k) => k + 1)} />
            </section>
          )}
          <section className="section">
            <h2>Agente por mapa</h2>
            <p className="muted small" style={{ marginTop: 0 }}>Das comps confirmadas pelo time (a mais recente de cada mapa).</p>
            {teamComps.data ? <AgentByMap username={username} teamComps={teamComps.data} maps={maps} /> : <Loading />}
          </section>
          <section className="section">
            <h2>Histórico individual</h2>
            {tournaments.data ? <History username={username} tournaments={tournaments.data} mapName={mapName} /> : <Loading />}
          </section>
        </>
      )}
    </>
  );
}

// ---------- Banner + foto + nome ----------
function ProfileHeader({ p, isMe, isCoach, onChanged, rankKey = 0 }) {
  const { notify } = useFeedback();
  const [busy, setBusy] = useState(null);
  const [cropping, setCropping] = useState(null); // { kind, file } enquanto a janela de recorte está aberta
  const avatarInput = useRef(null);
  const bannerInput = useRef(null);

  const send = async (kind, blob) => {
    await api.upload(`/api/profiles/me/${kind}`, blob);
    await onChanged();
    notify(kind === 'avatar' ? 'Foto atualizada' : 'Banner atualizado');
  };

  // Ao escolher o arquivo: abre o recorte. GIF vai direto (recortar tiraria a animação).
  const pick = async (kind, file) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) return notify('Escolha um arquivo de imagem', true);
    if (file.type !== 'image/gif') return setCropping({ kind, file });
    setBusy(kind);
    try {
      await send(kind, await resizeImage(file, IMAGE_SIZES[kind]));
    } catch (e) {
      notify(e.message, true);
    } finally {
      setBusy(null);
    }
  };

  // Erros daqui são mostrados dentro da janela de recorte, que continua aberta.
  const confirmCrop = async (blob) => {
    await send(cropping.kind, blob);
    setCropping(null);
  };

  const remove = async (kind) => {
    await api.del(`/api/profiles/me/${kind}`);
    await onChanged();
  };

  return (
    <div className="profile-hero">
      <div className="profile-banner" style={p.banner ? { backgroundImage: `url('${p.banner}')` } : undefined}>
        {isMe && (
          <div className="banner-actions">
            <button className="btn-sm" onClick={() => bannerInput.current.click()} disabled={!!busy}>
              {busy === 'banner' ? 'Enviando…' : p.banner ? 'Trocar banner' : 'Adicionar banner'}
            </button>
            {p.banner && <button className="btn-sm" onClick={() => remove('banner')}>Remover</button>}
          </div>
        )}
      </div>
      <div className="profile-id">
        <div className="profile-avatar">
          <Avatar username={p.username} size={112} />
          {isMe && (
            <button className="avatar-edit" title="Trocar foto" aria-label="Trocar foto" onClick={() => avatarInput.current.click()} disabled={!!busy}>
              {busy === 'avatar' ? '…' : '📷'}
            </button>
          )}
        </div>
        <div className="profile-name">
          <h1>{p.name}</h1>
          <div className="row">
            <span className="muted">@{p.username}</span>
            {isCoach ? <span className="badge red">Coach</span>
              : p.roles.map((r) => <span key={r} className={`role-chip role-chip-${r}`}><RoleDot role={r} />{r}</span>)}
          </div>
          {!isCoach && p.riotId && (
            <div style={{ marginTop: '.5rem' }}>
              <RankBadge key={`${p.riotId}-${p.region}-${rankKey}`} username={p.username} />
            </div>
          )}
        </div>
        {isMe && p.avatar && <button className="btn-sm btn-ghost" onClick={() => remove('avatar')}>Remover foto</button>}
      </div>
      <input ref={avatarInput} type="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden
        onChange={(e) => { pick('avatar', e.target.files[0]); e.target.value = ''; }} />
      <input ref={bannerInput} type="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden
        onChange={(e) => { pick('banner', e.target.files[0]); e.target.value = ''; }} />
      {cropping && (
        <ImageCropper file={cropping.file} kind={cropping.kind} onCancel={() => setCropping(null)} onConfirm={confirmCrop} />
      )}
    </div>
  );
}

// ---------- Trocar senha (só no próprio perfil) ----------
function PasswordCard() {
  const { me, setMe } = useData();
  const { notify } = useFeedback();
  const [f, setF] = useState({ current: '', next: '', confirm: '' });
  const [busy, setBusy] = useState(false);
  const ref = useRef(null);
  const mismatch = f.confirm && f.next !== f.confirm;
  const valid = f.current && f.next.length >= 8 && f.next === f.confirm;

  // Chegou por /perfil#senha (aviso de senha padrão): rola até aqui.
  useEffect(() => {
    if (window.location.hash === '#senha') ref.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, []);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      setMe(await api.post('/api/me/password', { current: f.current, next: f.next }));
      setF({ current: '', next: '', confirm: '' });
      notify('Senha trocada! Outros aparelhos logados foram desconectados.');
    } catch (err) {
      notify(err.message, true);
    } finally {
      setBusy(false);
    }
  };
  const bind = (k) => ({ value: f[k], onChange: (e) => setF({ ...f, [k]: e.target.value }) });

  return (
    <div className={`card ${me.mustChangePassword ? 'card-warn' : ''}`} id="senha" ref={ref}>
      <div className="card-head"><h3>Trocar senha</h3></div>
      {me.mustChangePassword && (
        <p className="small" style={{ color: 'var(--yellow)', marginTop: 0 }}>Você ainda está com a senha padrão. Troque antes de compartilhar o site.</p>
      )}
      <form onSubmit={submit}>
        <input type="text" autoComplete="username" value={me.username} readOnly hidden />
        <div className="field"><label htmlFor="pw-cur">Senha atual</label>
          <input id="pw-cur" type="password" autoComplete="current-password" {...bind('current')} /></div>
        <div className="grid-2">
          <div className="field"><label htmlFor="pw-new">Nova senha</label>
            <input id="pw-new" type="password" autoComplete="new-password" minLength={8} {...bind('next')} /></div>
          <div className="field"><label htmlFor="pw-conf">Repetir nova senha</label>
            <input id="pw-conf" type="password" autoComplete="new-password" {...bind('confirm')} /></div>
        </div>
        {f.next && f.next.length < 8 && <p className="small" style={{ color: 'var(--yellow)', marginTop: 0 }}>Mínimo de 8 caracteres.</p>}
        {mismatch && <p className="small" style={{ color: 'var(--red)', marginTop: 0 }}>As senhas não conferem.</p>}
        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <button className="btn-primary btn-sm" disabled={!valid || busy}>{busy ? 'Salvando…' : 'Trocar senha'}</button>
        </div>
      </form>
    </div>
  );
}

// ---------- Backup (só admin): baixar tudo / importar ----------
function BackupCard() {
  const { notify, confirm } = useFeedback();
  const [busy, setBusy] = useState(false);
  const input = useRef(null);

  const importFile = async (file) => {
    if (!file) return;
    let backup;
    try {
      backup = JSON.parse(await file.text());
    } catch {
      return notify('Esse arquivo não é um backup válido', true);
    }
    const d = backup?.data || {};
    const ok = await confirm(
      `Importar o backup de ${backup?.exportedAt ? new Date(backup.exportedAt).toLocaleString('pt-BR') : '?'}? ` +
      `Ele SUBSTITUI tudo que está no site (${d.teamComps?.length || 0} comps, ${d.customComps?.length || 0} sugestões, ` +
      `${d.tournaments?.length || 0} campeonatos, perfis e senhas).`
    );
    if (!ok) return;
    setBusy(true);
    try {
      const s = await api.post('/api/admin/backup', backup);
      notify(`Importado: ${s.comps} comps, ${s.suggestions} sugestões, ${s.tournaments} campeonatos, ${s.images} imagens.`);
      // As senhas vieram do backup: recarrega (pode pedir login de novo, com a senha do backup).
      setTimeout(() => window.location.assign('/perfil'), 1500);
    } catch (e) {
      notify(e.message, true);
      setBusy(false);
    }
  };

  return (
    <div className="card">
      <div className="card-head"><h3>Backup dos dados</h3></div>
      <p className="muted small" style={{ marginTop: 0 }}>
        Comps, sugestões, campeonatos, perfis, fotos e senhas num arquivo só. Guarde em lugar seguro: ele tem os hashes das senhas.
      </p>
      <div className="row">
        <a className="btn btn-sm" href="/api/admin/backup" download>Baixar backup</a>
        <button className="btn-sm btn-danger" disabled={busy} onClick={() => input.current.click()}>
          {busy ? 'Importando…' : 'Importar backup…'}
        </button>
      </div>
      <input ref={input} type="file" accept="application/json,.json" hidden
        onChange={(e) => { importFile(e.target.files[0]); e.target.value = ''; }} />
    </div>
  );
}

// ---------- Riot ID (para puxar o elo) ----------
const REGION_LABEL = { br: 'Brasil', latam: 'LATAM', na: 'América do Norte', eu: 'Europa', ap: 'Ásia-Pacífico', kr: 'Coreia' };

function RiotIdCard({ p, isMe, regions, onChanged }) {
  const { notify } = useFeedback();
  const [editing, setEditing] = useState(false);
  const [riotId, setRiotId] = useState(p.riotId || '');
  const [region, setRegion] = useState(p.region || 'br');
  const valid = /^.{3,16}#[\p{L}\p{N}]{3,5}$/u.test(riotId.trim());

  const save = async (e) => {
    e.preventDefault();
    try {
      await api.put('/api/profiles/me', { riotId: riotId.trim(), region });
      await onChanged();
      setEditing(false);
      notify('Riot ID salvo');
    } catch (err) {
      notify(err.message, true);
    }
  };
  const unlink = async () => {
    await api.put('/api/profiles/me', { riotId: '' });
    await onChanged();
    setRiotId('');
    setEditing(false);
  };

  return (
    <div className="card">
      <div className="card-head">
        <h3>Conta Riot</h3>
        {isMe && !editing && <button className="btn-sm" onClick={() => setEditing(true)}>{p.riotId ? 'Editar' : 'Vincular'}</button>}
      </div>
      {editing ? (
        <form onSubmit={save}>
          <div className="grid-2">
            <div className="field">
              <label htmlFor="riot-id">Riot ID</label>
              <input id="riot-id" placeholder="Nome#TAG" value={riotId} maxLength={22} onChange={(e) => setRiotId(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="riot-region">Região</label>
              <select id="riot-region" value={region} onChange={(e) => setRegion(e.target.value)}>
                {regions.map((r) => <option key={r} value={r}>{REGION_LABEL[r] || r}</option>)}
              </select>
            </div>
          </div>
          {riotId && !valid && <p className="small" style={{ color: 'var(--yellow)', marginTop: 0 }}>Use o formato Nome#TAG (ex.: Hadez#BR1).</p>}
          <div className="row" style={{ justifyContent: 'flex-end' }}>
            {p.riotId && <button type="button" className="btn-sm btn-danger" onClick={unlink}>Desvincular</button>}
            <span className="spacer" />
            <button type="button" className="btn-ghost btn-sm" onClick={() => { setRiotId(p.riotId || ''); setEditing(false); }}>Cancelar</button>
            <button className="btn-primary btn-sm" disabled={!valid}>Salvar</button>
          </div>
        </form>
      ) : p.riotId ? (
        <>
          <div><b>{p.riotId}</b> <span className="muted small">· {REGION_LABEL[p.region] || p.region}</span></div>
          <p className="muted small" style={{ marginBottom: 0 }}>O elo aparece no topo do perfil e atualiza a cada ~10 min.</p>
        </>
      ) : (
        <p className="muted small">Vincule seu Riot ID para mostrar seu elo no perfil e na página Jogadores.</p>
      )}
    </div>
  );
}

// ---------- Funções (máx. 2) ----------
function RolesCard({ p, isMe, options, onChanged }) {
  const { notify } = useFeedback();
  const [editing, setEditing] = useState(false);
  const [sel, setSel] = useState(p.roles);
  useEffect(() => setSel(p.roles), [p.roles]);

  const toggle = (r) => setSel(sel.includes(r) ? sel.filter((x) => x !== r) : sel.length < MAX_ROLES ? [...sel, r] : sel);
  const save = async () => {
    try {
      await api.put('/api/profiles/me', { roles: sel });
      await onChanged();
      setEditing(false);
      notify('Funções salvas');
    } catch (e) {
      notify(e.message, true);
    }
  };

  return (
    <div className="card">
      <div className="card-head">
        <h3>Funções</h3>
        {isMe && !editing && <button className="btn-sm" onClick={() => setEditing(true)}>Editar</button>}
      </div>
      {editing ? (
        <>
          <p className="muted small" style={{ marginTop: 0 }}>Escolha até {MAX_ROLES}. ({sel.length}/{MAX_ROLES})</p>
          <div className="role-options">
            {options.map((r) => {
              const on = sel.includes(r);
              return (
                <button key={r} type="button" aria-pressed={on} className={`role-option ${on ? 'on' : ''}`}
                  disabled={!on && sel.length >= MAX_ROLES} onClick={() => toggle(r)}>
                  <RoleDot role={r} />{r}
                </button>
              );
            })}
          </div>
          <div className="row" style={{ marginTop: '.8rem', justifyContent: 'flex-end' }}>
            <button className="btn-ghost btn-sm" onClick={() => { setSel(p.roles); setEditing(false); }}>Cancelar</button>
            <button className="btn-primary btn-sm" onClick={save}>Salvar</button>
          </div>
        </>
      ) : p.roles.length ? (
        <div className="role-options">
          {p.roles.map((r) => <span key={r} className={`role-chip role-chip-${r} lg`}><RoleDot role={r} />{r}</span>)}
        </div>
      ) : <p className="muted small">{isMe ? 'Você ainda não escolheu suas funções.' : 'Nenhuma função definida.'}</p>}
    </div>
  );
}

// ---------- Agentes favoritos (máx. 3) ----------
function FavoritesCard({ p, isMe, agents, onChanged }) {
  const { notify } = useFeedback();
  const [editing, setEditing] = useState(false);
  const [sel, setSel] = useState(p.favoriteAgents);
  useEffect(() => setSel(p.favoriteAgents), [p.favoriteAgents]);

  const toggle = (a) => setSel(sel.includes(a) ? sel.filter((x) => x !== a) : sel.length < MAX_FAVS ? [...sel, a] : sel);
  const save = async () => {
    try {
      await api.put('/api/profiles/me', { favoriteAgents: sel });
      await onChanged();
      setEditing(false);
      notify('Favoritos salvos');
    } catch (e) {
      notify(e.message, true);
    }
  };

  const list = editing ? sel : p.favoriteAgents;

  return (
    <div className="card">
      <div className="card-head">
        <h3>Agentes favoritos</h3>
        {isMe && !editing && <button className="btn-sm" onClick={() => setEditing(true)}>Editar</button>}
      </div>
      <div className="fav-slots">
        {Array.from({ length: MAX_FAVS }, (_, i) => list[i]).map((a, i) => (
          <div key={i} className={`fav-slot ${a ? '' : 'empty'}`}>
            {a ? <><AgentIcon name={a} size="lg" /><b>{a}</b></> : <span className="muted small">{editing ? `Escolha ${i + 1}` : '—'}</span>}
          </div>
        ))}
      </div>
      {editing && (
        <>
          <p className="muted small">Clique para marcar/desmarcar. ({sel.length}/{MAX_FAVS})</p>
          <div className="agent-pool">
            {ROLES.map((r) => (
              <div className="role-group" key={r}>
                <h4><RoleDot role={r} />{r}</h4>
                <div className="agents">
                  {agents.filter((a) => a.role === r).map((a) => {
                    const on = sel.includes(a.name);
                    return (
                      <button key={a.name} className={`agent-btn ${on ? 'picked' : ''}`} aria-pressed={on}
                        disabled={!on && sel.length >= MAX_FAVS} onClick={() => toggle(a.name)}>
                        <AgentIcon name={a.name} /><span className="tip">{a.name}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
          <div className="row" style={{ marginTop: '.8rem', justifyContent: 'flex-end' }}>
            <button className="btn-ghost btn-sm" onClick={() => { setSel(p.favoriteAgents); setEditing(false); }}>Cancelar</button>
            <button className="btn-primary btn-sm" onClick={save}>Salvar</button>
          </div>
        </>
      )}
      {!editing && !p.favoriteAgents.length && (
        <p className="muted small">{isMe ? 'Marque até 3 agentes que você mais curte jogar.' : 'Nenhum favorito ainda.'}</p>
      )}
    </div>
  );
}

// ---------- Agente por mapa (comps confirmadas) ----------
function AgentByMap({ username, teamComps, maps }) {
  const current = latestByMap(teamComps);
  const rotation = maps.filter((m) => m.inRotation).sort((a, b) => a.name.localeCompare(b.name));
  return (
    <div className="agent-by-map">
      {rotation.map((m) => {
        const comp = current[m.id];
        const slot = comp?.slots.find((s) => s.player === username);
        return (
          <Link key={m.id} to={`/mapas/${m.id}`} className="abm-card" style={m.splash ? { backgroundImage: `url('${m.splash}')` } : undefined}>
            <span className="abm-map">{m.name}</span>
            {slot ? (
              <span className="abm-agent"><AgentIcon name={slot.agent} size="sm" />{slot.agent}</span>
            ) : (
              <span className="abm-agent muted">{comp ? 'Banco' : 'Sem comp'}</span>
            )}
          </Link>
        );
      })}
    </div>
  );
}

// ---------- Histórico individual (dos campeonatos) ----------
function History({ username, tournaments, mapName }) {
  const rows = useMemo(() => {
    const out = [];
    for (const t of tournaments) {
      for (const m of t.matches) {
        const s = m.stats.find((x) => x.player === username);
        if (s) out.push({ t, m, s });
      }
    }
    return out.sort((a, b) => ((a.m.date || '') < (b.m.date || '') ? 1 : -1));
  }, [tournaments, username]);

  if (!rows.length) return <Empty>Nenhuma partida registrada ainda. As estatísticas aparecem quando o time preenche os campeonatos.</Empty>;

  const matches = rows.map((r) => r.m);
  const me = aggregateStats(matches.map((m) => ({ ...m, stats: m.stats.filter((s) => s.player === username) })))[0];
  const rec = record(matches);

  // Por agente e por mapa
  const group = (keyFn) => {
    const g = {};
    for (const r of rows) {
      const k = keyFn(r);
      if (!k) continue;
      const x = (g[k] ||= { key: k, n: 0, w: 0, l: 0, k: 0, d: 0, a: 0, acsSum: 0, acsN: 0 });
      x.n++;
      const res = matchResult(r.m);
      if (res === 'W') x.w++;
      if (res === 'L') x.l++;
      x.k += r.s.k || 0; x.d += r.s.d || 0; x.a += r.s.a || 0;
      if (r.s.acs != null) { x.acsSum += r.s.acs; x.acsN++; }
    }
    return Object.values(g).sort((a, b) => b.n - a.n);
  };
  const byAgent = group((r) => r.s.agent);
  const byMap = group((r) => r.m.map);

  const kd = (x) => (x.d ? x.k / x.d : x.k).toFixed(2);
  const wr = (x) => (x.w + x.l ? `${Math.round((x.w / (x.w + x.l)) * 100)}%` : '—');
  const acs = (x) => (x.acsN ? Math.round(x.acsSum / x.acsN) : '—');

  const breakdown = (title, list, label) => (
    <div className="card" style={{ padding: 0 }}>
      <h3 style={{ padding: '1rem 1rem 0' }}>{title}</h3>
      <div style={{ overflowX: 'auto' }}>
        <table>
          <thead><tr><th>{label}</th><th className="num">Mapas</th><th className="num">V-D</th><th className="num">WR</th><th className="num">K/D</th><th className="num">ACS</th></tr></thead>
          <tbody>
            {list.map((x) => (
              <tr key={x.key}>
                <td>{label === 'Agente'
                  ? <div className="row" style={{ flexWrap: 'nowrap' }}><AgentIcon name={x.key} size="sm" />{x.key}</div>
                  : <b>{mapName(x.key)}</b>}</td>
                <td className="num">{x.n}</td>
                <td className="num">{x.w}-{x.l}</td>
                <td className="num">{wr(x)}</td>
                <td className="num" style={{ color: x.k >= x.d ? 'var(--green)' : 'var(--red)' }}>{kd(x)}</td>
                <td className="num">{acs(x)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );

  return (
    <>
      <div className="kpis">
        <div className="kpi"><b>{rows.length}</b><span>Mapas jogados</span></div>
        <div className="kpi"><b>{rec.w}-{rec.l}</b><span>V-D {rec.wr != null && `· ${rec.wr}%`}</span></div>
        <div className="kpi"><b style={{ color: me.kd >= 1 ? 'var(--green)' : 'var(--red)' }}>{me.kd.toFixed(2)}</b><span>K/D</span></div>
        <div className="kpi"><b>{me.kda.toFixed(2)}</b><span>KDA</span></div>
        <div className="kpi"><b>{me.acs ?? '—'}</b><span>ACS médio</span></div>
        <div className="kpi"><b>{me.k}/{me.d}/{me.a}</b><span>K / D / A total</span></div>
      </div>

      <div className="profile-grid">
        {breakdown('Por agente', byAgent, 'Agente')}
        {breakdown('Por mapa', byMap, 'Mapa')}
      </div>

      <h3 style={{ marginTop: '1.5rem' }}>Partidas</h3>
      <div className="table-wrap">
        <table>
          <thead>
            <tr><th>Data</th><th>Campeonato</th><th>Adversário</th><th>Mapa</th><th>Agente</th><th className="num">K/D/A</th><th className="num">ACS</th><th>Resultado</th></tr>
          </thead>
          <tbody>
            {rows.map(({ t, m, s }) => (
              <tr key={m.id}>
                <td>{fmtDate(m.date)}</td>
                <td><Link to={`/campeonatos/${t.id}`}>{t.name}</Link></td>
                <td>{m.opponent}</td>
                <td>{mapName(m.map)}</td>
                <td><div className="row" style={{ flexWrap: 'nowrap' }}>{s.agent && <AgentIcon name={s.agent} size="sm" />}{s.agent || '—'}</div></td>
                <td className="num">{s.k ?? '—'}/{s.d ?? '—'}/{s.a ?? '—'}</td>
                <td className="num">{s.acs ?? '—'}</td>
                <td><ResultBadge match={m} /> <span className="small muted">{m.scoreUs ?? '–'}:{m.scoreThem ?? '–'}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
