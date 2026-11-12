import { useEffect, useState } from 'react';
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { api, getToken, setToken } from './api.js';
import Login from './pages/Login.jsx';
import Chats from './pages/Chats.jsx';
import ChatView from './pages/ChatView.jsx';
import Wallet from './pages/Wallet.jsx';
import Gifts from './pages/Gifts.jsx';
import Profile from './pages/Profile.jsx';
import Admin from './pages/Admin.jsx';

export default function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    if (!getToken()) { setLoading(false); return; }
    api('/users/me').then(setUser).catch(() => setToken(null)).finally(() => setLoading(false));
  }, []);

  const onLogin = (data) => {
    setToken(data.token);
    setUser(data.user);
    navigate('/chats');
  };

  const onLogout = () => {
    setToken(null);
    setUser(null);
    navigate('/');
  };

  if (loading) return <div className="center">Загрузка…</div>;

  return (
    <Routes>
      <Route path="/" element={user ? <Navigate to="/chats" /> : <Login onLogin={onLogin} />} />
      <Route path="/chats" element={user ? <Chats user={user} onLogout={onLogout} /> : <Navigate to="/" />} />
      <Route path="/chats/:id" element={user ? <ChatView user={user} /> : <Navigate to="/" />} />
      <Route path="/wallet" element={user ? <Wallet user={user} /> : <Navigate to="/" />} />
      <Route path="/gifts" element={user ? <Gifts user={user} /> : <Navigate to="/" />} />
      <Route path="/profile" element={user ? <Profile user={user} setUser={setUser} /> : <Navigate to="/" />} />
      <Route path="/admin" element={user && (user.is_admin || user.is_owner) ? <Admin user={user} /> : <Navigate to="/" />} />
      <Route path="*" element={<Navigate to="/" />} />
    </Routes>
  );
}