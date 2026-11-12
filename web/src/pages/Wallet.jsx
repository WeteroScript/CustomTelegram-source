import { useEffect, useState } from 'react';
import { api } from '../api.js';
import Layout from '../components/Layout.jsx';

export default function Wallet({ user }) {
  const [wallet, setWallet] = useState({ grams: 0, stars: 0 });
  const [history, setHistory] = useState([]);

  useEffect(() => {
    api('/wallet').then(setWallet).catch(() => {});
    api('/wallet/history').then(setHistory).catch(() => setHistory([]));
  }, []);

  return (
    <Layout user={user}>
      <h2>Кошелёк</h2>
      <div className="cards">
        <div className="card stat"><span className="muted">Грамы</span><strong>{Number(wallet.grams).toFixed(2)}</strong></div>
        <div className="card stat"><span className="muted">Звёзды</span><strong>{Number(wallet.stars).toFixed(2)}</strong></div>
      </div>
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