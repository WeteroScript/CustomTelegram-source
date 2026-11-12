import { useEffect, useState } from 'react';
import { api } from '../api.js';
import Layout from '../components/Layout.jsx';

export default function Wallet({ user }) {
  const [wallet, setWallet] = useState({ grams: 0, stars: 0 });
  const [history, setHistory] = useState([]);
  const [form, setForm] = useState({ toDigitalId: '', currency: 'stars', amount: '' });
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const refresh = () => {
    api('/wallet').then(setWallet).catch(() => {});
    api('/wallet/history').then(setHistory).catch(() => setHistory([]));
  };

  useEffect(() => { refresh(); }, []);

  const transfer = async (e) => {
    e.preventDefault();
    setError('');
    setMessage('');
    try {
      await api('/wallet/transfer', {
        method: 'POST',
        body: JSON.stringify({ ...form, amount: Number(form.amount) })
      });
      setMessage('Перевод выполнен');
      setForm({ toDigitalId: '', currency: form.currency, amount: '' });
      refresh();
    } catch (err) {
      if (err.message === 'insufficient') setError('Недостаточно средств');
      else if (err.message === 'not_found') setError('Получатель не найден');
      else setError('Не удалось выполнить перевод');
    }
  };

  return (
    <Layout user={user}>
      <h2>Кошелёк</h2>
      <div className="cards">
        <div className="card stat"><span className="muted">Грамы</span><strong>{Number(wallet.grams).toFixed(2)}</strong></div>
        <div className="card stat"><span className="muted">Звёзды</span><strong>{Number(wallet.stars).toFixed(2)}</strong></div>
      </div>
      <h3>Перевод</h3>
      <form className="card form" onSubmit={transfer}>
        <label>Цифровой ID получателя</label>
        <input value={form.toDigitalId} onChange={(e) => setForm({ ...form, toDigitalId: e.target.value })} />
        <label>Валюта</label>
        <select value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })}>
          <option value="stars">Звёзды</option>
          <option value="grams">Грамы</option>
        </select>
        <label>Сумма</label>
        <input type="number" step="0.01" min="0" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
        <button>Перевести</button>
        {message && <span className="positive small">{message}</span>}
        {error && <span className="error small">{error}</span>}
      </form>
      <h3>История</h3>
      <ul className="list">
        {history.map((t) => (
          <li key={t.id}>
            <strong>{t.kind}</strong>
            <span className={Number(t.amount) >= 0 ? 'positive' : 'negative'}>
              {Number(t.amount) >= 0 ? '+' : ''}{Number(t.amount).toFixed(2)} {t.currency}
            </span>
          </li>
        ))}
        {history.length === 0 && <li className="muted">Операций пока нет</li>}
      </ul>
    </Layout>
  );
}