import { Router } from 'express';
import { query, pool } from '../db/index.js';

const router = Router();

router.get('/', async (_req, res) => {
  const { rows } = await query('SELECT * FROM gifts WHERE on_sale = TRUE ORDER BY id');
  res.json(rows);
});

router.get('/mine', async (req, res) => {
  const { rows } = await query(
    `SELECT gi.*, g.name, g.image_url, g.rarity, g.category
     FROM gift_instances gi JOIN gifts g ON g.id = gi.gift_id
     WHERE gi.owner_id = $1`,
    [req.user.id]
  );
  res.json(rows);
});

router.post('/:giftId/buy', async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: gifts } = await client.query(
      'SELECT * FROM gifts WHERE id = $1 AND on_sale = TRUE FOR UPDATE', [req.params.giftId]
    );
    const gift = gifts[0];
    if (!gift) throw new Error('not_found');
    if (gift.sold >= gift.supply) throw new Error('sold_out');
    const col = gift.currency;
    const upd = await client.query(
      `UPDATE wallets SET ${col} = ${col} - $2 WHERE user_id = $1 AND ${col} >= $2`,
      [req.user.id, gift.price]
    );
    if (upd.rowCount === 0) throw new Error('insufficient');
    await client.query('UPDATE gifts SET sold = sold + 1 WHERE id = $1', [gift.id]);
    const inst = await client.query(
      'INSERT INTO gift_instances (gift_id, owner_id) VALUES ($1,$2) RETURNING *',
      [gift.id, req.user.id]
    );
    await client.query(
      `INSERT INTO gift_history (instance_id, event, to_user) VALUES ($1,'purchase',$2)`,
      [inst.rows[0].id, req.user.id]
    );
    await client.query(
      `INSERT INTO transactions (user_id, currency, amount, kind)
       VALUES ($1,$2,$3,'gift_purchase')`,
      [req.user.id, col, -gift.price]
    );
    await client.query('COMMIT');
    res.json(inst.rows[0]);
  } catch (e) {
    await client.query('ROLLBACK');
    res.status(400).json({ error: e.message });
  } finally {
    client.release();
  }
});

router.post('/:instanceId/upgrade-nft', async (req, res) => {
  const { rows } = await query(
    `UPDATE gift_instances SET is_nft = TRUE, status = 'upgraded',
       nft_serial = (SELECT COALESCE(MAX(nft_serial),0)+1 FROM gift_instances WHERE gift_id = gift_instances.gift_id)
     WHERE id = $1 AND owner_id = $2 AND is_nft = FALSE RETURNING *`,
    [req.params.instanceId, req.user.id]
  );
  if (!rows[0]) return res.status(400).json({ error: 'cannot_upgrade' });
  await query(`INSERT INTO gift_history (instance_id, event, from_user)
               VALUES ($1,'upgrade_nft',$2)`, [rows[0].id, req.user.id]);
  res.json(rows[0]);
});

export default router;