import { useState } from 'react';
import { api } from '../api.js';
import Layout from '../components/Layout.jsx';

export default function Admin({ user }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [message, setMessage] = useState('');

  const search = async (e) => {
    e.preventDefault();
    if (!query.trim()) return;
    try {
      const found = await api(`/admin/users/search?q=${encodeURIComponent(query)}`);
      setResults(found);
    } catch {
      setMessage('Пользователь не найден');
      setResults([]);
    }
  };

  const grant = async (digitalId, currency, amount) => {
    await api('/admin/grant', { method: 'POST', body: JSON.stringify({ digitalId, currency, amount: Number(amount) }) });
    setMessage('Начислено');
  };

  const toggleBlock = async (digitalId) => {
    await api(`/admin/users/${digitalId}/block`, { method: 'POST' });
    setMessage('Статус обновлён');
  };

  const toggleTag = async (digitalId, tag) => {
    await api(`/admin/users/${digitalId}/tags`, {
      method: 'POST',
      body: JSON.stringify({ add: tag.startsWith('+') ? [tag.slice(1)] : [], remove: tag.startsWith('-') ? [tag.slice(1)] : [] })
    });
    setMessage('Теги обновлены');
  };

  return (
    <Layout user={user}>
      <h2>Админ-панель</h2>
      <form className="row" onSubmit={search}>
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="ID или юзернейм" />
        <button>Найти</button>
      </form>
      {message && <p className="muted">{message}</p>}
      <ul className="list">
        {results.map((u) => (
          <li key={u.id} className="admin-user">
            <div>
              <strong>{u.first_name} {u.last_name}</strong>
              <div className="muted small">ID {u.digital_id} · @{u.username || 'нет'} · теги: {(u.tags || []).join(', ') || 'нет'}</div>
            </div>
            <div className="row">
              <input type="number" placeholder="Сумма" id={`amount-${u.id}`} style={{ width: '90px' }} />
              <button onClick={() => grant(u.digital_id, 'stars', document.getElementById(`amount-${u.id}`).value)}>Звёзды</button>
              <button onClick={() => grant(u.digital_id, 'grams', document.getElementById(`amount-${u.id}`).value)}>Грамы</button>
              <button onClick={() => toggleBlock(u.digital_id)}>{u.is_blocked ? 'Разблокировать' : 'Заблокировать'}</button>
              <button onClick={() => toggleTag(u.digital_id, '+tester')}>+tester</button>
              <button onClick={() => toggleTag(u.digital_id, '-tester')}>-tester</button>
            </div>
          </li>
        ))}
      </ul>
    </Layout>
  );
}