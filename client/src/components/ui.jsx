import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import { useData } from '../data.jsx';
import { isHttp, matchResult, ROLES } from '../utils.js';

// ---------- Ícone de agente ----------
export function AgentIcon({ name, size = '' }) {
  const { agent } = useData();
  const icon = agent(name)?.icon;
  return (
    <span className={`agent-icon ${size}`} title={name}>
      {icon ? <img src={icon} alt="" /> : (name || '?').slice(0, 2).toUpperCase()}
    </span>
  );
}

export function AgentsRow({ agents, size = '' }) {
  const { role } = useData();
  const sorted = [...agents].sort((a, b) => ROLES.indexOf(role(a)) - ROLES.indexOf(role(b)));
  return <div className="agents-row">{sorted.map((a) => <AgentIcon key={a} name={a} size={size} />)}</div>;
}

// Foto do usuário (ou iniciais) em círculo.
export function Avatar({ username, size = 32 }) {
  const { person } = useData();
  const p = person(username);
  const [broken, setBroken] = useState(null); // URL da imagem que falhou ao carregar
  const initials = (p?.name || username || '?').slice(0, 2).toUpperCase();
  const showImg = p?.avatar && broken !== p.avatar;
  return (
    <span className="avatar" style={{ width: size, height: size, fontSize: size * 0.38 }} title={p?.name}>
      {showImg ? <img src={p.avatar} alt="" onError={() => setBroken(p.avatar)} /> : initials}
    </span>
  );
}

// Ícone da função: oficial (valorant-api) para Duelista/Controlador/Iniciador/Sentinela;
// Flex não tem ícone oficial, então usamos um próprio (setas cruzadas = "joga de tudo").
export function RoleDot({ role, size = 16 }) {
  const { roleIcons = {} } = useData();
  const style = { width: size, height: size };
  if (roleIcons[role]) return <img className="role-icon" src={roleIcons[role]} alt="" title={role} style={style} />;
  if (role === 'Flex') {
    return (
      <svg className="role-icon" viewBox="0 0 24 24" style={style} fill="none" stroke="currentColor" strokeWidth="2.4"
        strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <title>Flex</title>
        <path d="M16 3h5v5" /><path d="M4 20 21 3" /><path d="M21 16v5h-5" /><path d="M15 15l6 6" /><path d="M4 4l5 5" />
      </svg>
    );
  }
  return <span className={`role-dot role-${role}`} />;
}

export function ExtLink({ href, children }) {
  if (!isHttp(href)) return null;
  return <a href={href} target="_blank" rel="noopener noreferrer">{children}</a>;
}

export function ResultBadge({ match }) {
  const r = matchResult(match);
  if (!r) return <span className="badge">—</span>;
  const cls = r === 'W' ? 'win' : r === 'L' ? 'loss' : '';
  return <span className={`badge ${cls}`}>{r === 'W' ? 'Vitória' : r === 'L' ? 'Derrota' : 'Empate'}</span>;
}

export const Loading = ({ text = 'Carregando…' }) => <div className="loading">{text}</div>;
export const Empty = ({ children }) => <div className="empty">{children}</div>;

// ---------- Modal ----------
export function Modal({ onClose, children, wide }) {
  const ref = useRef(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    // Só na abertura: foca o primeiro campo e escuta o Esc (sem refazer a cada render).
    const onKey = (e) => e.key === 'Escape' && closeRef.current();
    document.addEventListener('keydown', onKey);
    ref.current?.querySelector('input:not([type=range]), select, textarea')?.focus();
    return () => document.removeEventListener('keydown', onKey);
  }, []);
  return (
    <div className="modal-back" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" ref={ref} style={wide ? { maxWidth: 820 } : undefined}>
        {children}
      </div>
    </div>
  );
}

// ---------- Toast + confirmação (via contexto) ----------
const FeedbackContext = createContext(null);

export function FeedbackProvider({ children }) {
  const [toast, setToast] = useState(null);
  const [confirmState, setConfirmState] = useState(null);
  const timer = useRef();

  const notify = useCallback((msg, isError = false) => {
    setToast({ msg, isError, key: Date.now() });
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setToast(null), 3200);
  }, []);

  const confirm = useCallback((message) => new Promise((resolve) => setConfirmState({ message, resolve })), []);
  const answer = (v) => { confirmState.resolve(v); setConfirmState(null); };

  return (
    <FeedbackContext.Provider value={{ notify, confirm }}>
      {children}
      <div className={`toast ${toast ? 'show' : ''} ${toast?.isError ? 'err' : ''}`} role="status" aria-live="polite">
        {toast?.msg}
      </div>
      {confirmState && (
        <Modal onClose={() => answer(false)}>
          <h3>{confirmState.message}</h3>
          <div className="modal-actions">
            <button className="btn-ghost" onClick={() => answer(false)}>Cancelar</button>
            <button className="btn-primary" onClick={() => answer(true)}>Confirmar</button>
          </div>
        </Modal>
      )}
    </FeedbackContext.Provider>
  );
}

export const useFeedback = () => useContext(FeedbackContext);

// ---------- Carregar dados de uma URL ----------
export function useFetch(url, deps = []) {
  const [state, setState] = useState({ data: null, error: null, loading: true });
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let alive = true;
    setState((s) => ({ ...s, loading: true, error: null }));
    api.get(url)
      .then((data) => alive && setState({ data, error: null, loading: false }))
      .catch((error) => alive && setState({ data: null, error, loading: false }));
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, tick, ...deps]);
  return { ...state, reload: () => setTick((t) => t + 1), setData: (data) => setState((s) => ({ ...s, data })) };
}
