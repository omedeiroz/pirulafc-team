import { useCallback, useEffect, useState } from 'react';
import { Link, NavLink, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { api } from './api.js';
import { DataProvider } from './data.jsx';
import { Avatar, Loading } from './components/ui.jsx';
import Login from './pages/Login.jsx';
import Maps from './pages/Maps.jsx';
import MapDetail from './pages/MapDetail.jsx';
import Tournaments from './pages/Tournaments.jsx';
import TournamentDetail from './pages/TournamentDetail.jsx';
import Players from './pages/Players.jsx';
import Profile from './pages/Profile.jsx';

export default function App() {
  const [me, setMe] = useState(undefined); // undefined = verificando sessão
  const [boot, setBoot] = useState(null);
  const [bootError, setBootError] = useState(null);

  const loadBoot = useCallback(async () => {
    setBootError(null);
    try {
      setBoot(await api.get('/api/bootstrap'));
    } catch (e) {
      setBootError(e.message);
    }
  }, []);

  useEffect(() => {
    api.get('/api/me').then(setMe).catch(() => setMe(null));
    const onUnauthorized = () => setMe(null);
    window.addEventListener('unauthorized', onUnauthorized);
    return () => window.removeEventListener('unauthorized', onUnauthorized);
  }, []);

  useEffect(() => {
    if (me) loadBoot();
  }, [me, loadBoot]);

  if (me === undefined) return null;
  if (!me) return <Login onLogin={setMe} />;
  if (bootError) {
    return (
      <div className="login-wrap">
        <div className="login-card">
          <p>{bootError}</p>
          <button className="btn-primary" onClick={loadBoot}>Tentar de novo</button>
        </div>
      </div>
    );
  }
  if (!boot) return <div className="login-wrap"><Loading text="Carregando mapas e agentes…" /></div>;

  const logout = async () => {
    await api.post('/api/logout').catch(() => {});
    setMe(null);
    setBoot(null);
  };

  return (
    <DataProvider value={{ ...boot, me, setMe, reloadBoot: loadBoot }}>
      <Shell me={me} onLogout={logout}>
        <Routes>
          <Route path="/" element={<Navigate to="/mapas" replace />} />
          <Route path="/mapas" element={<Maps />} />
          <Route path="/mapas/:id" element={<MapDetail />} />
          <Route path="/campeonatos" element={<Tournaments />} />
          <Route path="/campeonatos/:id" element={<TournamentDetail />} />
          <Route path="/jogadores" element={<Players />} />
          <Route path="/jogadores/:username" element={<Profile />} />
          <Route path="/perfil" element={<Profile />} />
          <Route path="*" element={<Navigate to="/mapas" replace />} />
        </Routes>
      </Shell>
    </DataProvider>
  );
}

function Shell({ me, onLogout, children }) {
  const { pathname } = useLocation();
  useEffect(() => window.scrollTo(0, 0), [pathname]);
  return (
    <>
      <header className="topbar">
        <NavLink className="brand" to="/mapas">COMPS</NavLink>
        <nav>
          <NavLink to="/mapas">Mapas &amp; Comps</NavLink>
          <NavLink to="/campeonatos">Campeonatos</NavLink>
          <NavLink to="/jogadores">Jogadores</NavLink>
        </nav>
        <div className="user">
          <NavLink to="/perfil" className="user-link" title="Meu perfil">
            <Avatar username={me.username} size={30} />
            <span className="user-name">{me.name}</span>
          </NavLink>
          {me.role === 'coach' && <span className="badge red">Coach</span>}
          <button className="btn-sm btn-ghost" onClick={onLogout}>Sair</button>
        </div>
      </header>
      {me.mustChangePassword && pathname !== '/perfil' && (
        <div className="warn-bar">
          Você ainda está usando a senha padrão. <Link to="/perfil#senha">Trocar agora →</Link>
        </div>
      )}
      <main>{children}</main>
    </>
  );
}
