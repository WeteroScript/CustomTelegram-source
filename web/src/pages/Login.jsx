import { useState } from 'react';
import { api } from '../api.js';

export default function Login({ onLogin }) {
  const [virtualNumber, setVirtualNumber] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const data = await api('/auth/verify', {
        method: 'POST',
        body: JSON.stringify({ virtualNumber, code })
      });
      onLogin(data);
    } catch (err) {
      setError('Неверный номер или код. Код можно получить в авторизационном боте.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth-page">
      <form className="card auth-card" onSubmit={submit}>
        <h1>CustomTelegram</h1>
        <p className="muted">Вход по номеру и коду из бота</p>
        <label>Виртуальный номер</label>
        <input value={virtualNumber} onChange={(e) => setVirtualNumber(e.target.value)} placeholder="+9901..." />
        <label>Код из бота</label>
        <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="000000" />
        {error && <p className="error">{error}</p>}
        <button disabled={busy}>{busy ? 'Проверка…' : 'Войти'}</button>
      </form>
    </div>
  );
}