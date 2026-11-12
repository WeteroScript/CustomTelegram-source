import { useState } from 'react';
import { api } from '../api.js';
import Layout from '../components/Layout.jsx';

export default function Profile({ user, setUser }) {
  const [form, setForm] = useState({
    firstName: user.first_name || '',
    lastName: user.last_name || '',
    bio: user.bio || '',
    username: user.username || ''
  });
  const [saved, setSaved] = useState(false);

  const update = (key) => (e) => setForm({ ...form, [key]: e.target.value });

  const save = async (e) => {
    e.preventDefault();
    const updated = await api('/users/me', { method: 'PATCH', body: JSON.stringify(form) });
    setUser(updated);
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  };

  return (
    <Layout user={user}>
      <h2>Профиль</h2>
      <form className="card form" onSubmit={save}>
        <label>Имя</label>
        <input value={form.firstName} onChange={update('firstName')} />
        <label>Фамилия</label>
        <input value={form.lastName} onChange={update('lastName')} />
        <label>Юзернейм</label>
        <input value={form.username} onChange={update('username')} />
        <label>О себе</label>
        <textarea value={form.bio} onChange={update('bio')} rows={3} />
        <button>Сохранить</button>
        {saved && <span className="muted small">Сохранено</span>}
      </form>
      <div className="muted">Цифровой ID: {user.digital_id}</div>
    </Layout>
  );
}