import { Router } from 'express';
import { query, pool } from '../db/index.js';

const router = Router();

router.get('/', async (req, res) => {
  const { rows } = await query('SELECT * FROM wallets WHERE user_id = $1', [req.user.id]);
  if (rows[0]) return res.json(rows[0]);
  const created = await query(
    'INSERT INTO wallets (user_id) VALUES ($1) RETURNING *', [req.user.id]
  );
  res.json(created.rows[0]);
});

router.get('/history', async (req, res) => {
  const { currency, limit = 50 } = req.query;
  const { rows } = await query(
    `SELECT * FROM transactions WHERE user_id = $1
     AND ($2::text IS NULL OR currency = $2)
     ORDER BY id DESC LIMIT $3`,
    [req.user.id, currency || null, limit]
  );
  res.json(rows);
});

router.post('/transfer', async (req, res) => {
  const { toDigitalId, currency, amount } = req.body;
  if (amount <= 0) return res.status(400).json({ error: 'bad_amount' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const to = await client.query('SELECT id FROM users WHERE digital_id = $1', [toDigitalId]);
    if (!to.rows[0]) throw new Error('not_found');
    const upd = await client.query(
      `UPDATE wallets SET ${currency} = ${currency} - $2 WHERE user_id = $1 AND ${currency} >= $2`,
      [req.user.id, amount]
    );
    if (upd.rowCount === 0) throw new Error('insufficient');
    await client.query(
      `UPDATE wallets SET ${currency} = ${currency} + $2 WHERE user_id = $1`,
      [to.rows[0].id, amount]
    );
    for (const [uid, kind, cp] of [[req.user.id, 'transfer_out', to.rows[0].id],
                                   [to.rows[0].id, 'transfer_in', req.user.id]]) {
      await client.query(
        `INSERT INTO transactions (user_id, currency, amount, kind, counterparty)
         VALUES ($1,$2,$3,$4,$5)`,
        [uid, currency, currency === 'grams' ? -amount : amount, kind, cp]
      );
    }
    await client.query('COMMIT');
    res.json({ ok: true });
  } catch (e) {
    await client.query('ROLLBACK');
    res.status(400).json({ error: e.message });
  } finally {
    client.release();
  }
});

export default router;