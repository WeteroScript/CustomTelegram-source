import { useEffect, useState } from 'react';
import { api } from '../api.js';
import Layout from '../components/Layout.jsx';

export default function Gifts({ user }) {
  const [market, setMarket] = useState([]);
  const [mine, setMine] = useState([]);
  const [error, setError] = useState('');

  const load = () => {
    api('/gifts').then(setMarket).catch(() => setMarket([]));
    api('/gifts/mine').then(setMine).catch(() => setMine([]));
  };

  useEffect(() => { load(); }, []);

  const buy = async (id) => {
    setError('');
    try {
      await api(`/gifts/${id}/buy`, { method: 'POST' });
      load();
    } catch (e) {
      setError('Не удалось купить: ' + e.message);
    }
  };

  const upgrade = async (id) => {
    try {
      await api(`/gifts/${id}/upgrade-nft`, { method: 'POST' });
      load();
    } catch (e) {
      setError('Не удалось улучшить: ' + e.message);
    }
  };

  return (
    <Layout user={user}>
      <h2>Подарки</h2>
      {error && <p className="error">{error}</p>}
      <h3>Маркет</h3>
      <div className="grid">
        {market.map((g) => (
          <div key={g.id} className="card gift">
            <img src={g.image_url} alt={g.name} />
            <div><strong>{g.name}</strong></div>
            <div className="muted small">{g.category} · {g.rarity}</div>
            <div>{g.price} {g.currency}</div>
            <button onClick={() => buy(g.id)}>Купить</button>
          </div>
        ))}
      </div>
      <h3>Мои подарки</h3>
      <div className="grid">
        {mine.map((g) => (
          <div key={g.id} className="card gift">
            <img src={g.image_url} alt={g.name} />
            <div><strong>{g.name}</strong></div>
            <div className="muted small">{g.rarity}{g.is_nft ? ` · NFT #${g.nft_serial}` : ''}</div>
            {!g.is_nft && <button onClick={() => upgrade(g.id)}>Улучшить до NFT</button>}
          </div>
        ))}
        {mine.length === 0 && <p className="muted">Подарков пока нет</p>}
      </div>
    </Layout>
  );
}