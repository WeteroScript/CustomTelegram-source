import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import Layout from '../components/Layout.jsx';

export default function Chats({ user, onLogout }) {
  const [chats, setChats] = useState([]);
  const [title, setTitle] = useState('');

  const load = () => api('/chats').then(setChats).catch(() => setChats([]));

  useEffect(() => { load(); }, []);

  const create = async (e) => {
    e.preventDefault();
    if (!title.trim()) return;
    await api('/chats', {
      method: 'POST',
      body: JSON.stringify({ type: 'group', title })
    });
    setTitle('');
    load();
  };

  return (
    <Layout user={user} onLogout={onLogout}>
      <h2>Чаты</h2>
      <form className="row" onSubmit={create}>
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Название группы" />
        <button>Создать</button>
      </form>
      <ul className="list">
        {chats.map((c) => (
          <li key={c.id}>
            <Link to={`/chats/${c.id}`}>
              <strong>{c.title || `Чат ${c.id}`}</strong>
              <span className="muted small">{c.type} · {c.role}</span>
            </Link>
          </li>
        ))}
        {chats.length === 0 && <li className="muted">Пока нет чатов</li>}
      </ul>
    </Layout>
  );
}