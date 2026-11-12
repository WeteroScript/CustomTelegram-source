import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import Layout from '../components/Layout.jsx';

export default function Chats({ user, onLogout }) {
  const [chats, setChats] = useState([]);
  const [title, setTitle] = useState('');
  const [peerId, setPeerId] = useState('');
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const load = () => api('/chats').then(setChats).catch(() => setChats([]));

  useEffect(() => {
    load();
    const t = setInterval(load, 10000);
    return () => clearInterval(t);
  }, []);

  // Счётчик непрочитанных в заголовке вкладки браузера.
  useEffect(() => {
    const total = chats.reduce((sum, c) => sum + (c.unread || 0), 0);
    document.title = total > 0 ? `(${total}) CustomTelegram` : 'CustomTelegram';
    return () => { document.title = 'CustomTelegram'; };
  }, [chats]);

  const createGroup = async (e) => {
    e.preventDefault();
    if (!title.trim()) return;
    await api('/chats', { method: 'POST', body: JSON.stringify({ type: 'group', title }) });
    setTitle('');
    load();
  };

  const openPrivate = async (e) => {
    e.preventDefault();
    setError('');
    if (!peerId.trim()) return;
    try {
      const chat = await api('/chats/private', {
        method: 'POST',
        body: JSON.stringify({ digitalId: peerId.trim() })
      });
      setPeerId('');
      navigate(`/chats/${chat.id}`);
    } catch (err) {
      setError('Пользователь с таким цифровым ID не найден');
    }
  };

  return (
    <Layout user={user} onLogout={onLogout}>
      <h2>Чаты</h2>
      <form className="row" onSubmit={openPrivate}>
        <input value={peerId} onChange={(e) => setPeerId(e.target.value)} placeholder="Цифровой ID собеседника" />
        <button>Личный чат</button>
      </form>
      {error && <p className="error">{error}</p>}
      <form className="row" onSubmit={createGroup}>
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Название группы" />
        <button>Создать группу</button>
      </form>
      <ul className="list">
        {chats.map((c) => (
          <li key={c.id}>
            <Link to={`/chats/${c.id}`}>
              <strong>{c.title || `Чат ${c.id}`}</strong>
              <span className="muted small">{c.last_message ? String(c.last_message).slice(0, 40) : c.type}</span>
            </Link>
            <span className="row">
              {c.unread > 0 && <span className="badge">{c.unread}</span>}
            </span>
          </li>
        ))}
        {chats.length === 0 && <li className="muted">Пока нет чатов</li>}
      </ul>
    </Layout>
  );
}