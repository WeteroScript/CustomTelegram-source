import { Router } from 'express';
import { query } from '../db/index.js';
import { requireAdmin } from '../middleware/auth.js';

const router = Router();
router.use(requireAdmin);

async function audit(actorId, action, targetId, details) {
  await query('INSERT INTO audit_log (actor_id, action, target_id, details) VALUES ($1,$2,$3,$4)',
    [actorId, action, targetId || null, details || {}]);
}

router.get('/users/search', async (req, res) => {
  const { rows } = await query(
    'SELECT * FROM users WHERE digital_id = $1::text OR username = $2',
    [req.query.q, req.query.q]
  );
  res.json(rows);
});

router.post('/grant', async (req, res) => {
  const { digitalId, currency, amount } = req.body;
  const { rows } = await query('SELECT id FROM users WHERE digital_id = $1', [digitalId]);
  if (!rows[0]) return res.status(404).json({ error: 'not_found' });
  await query(
    `INSERT INTO wallets (user_id, ${currency}) VALUES ($1,$2)
     ON CONFLICT (user_id) DO UPDATE SET ${currency} = wallets.${currency} + $2`,
    [rows[0].id, amount]
  );
  await query(
    `INSERT INTO transactions (user_id, currency, amount, kind)
     VALUES ($1,$2,$3,'admin_grant')`, [rows[0].id, currency, amount]
  );
  await audit(req.user.id, 'grant', rows[0].id, { currency, amount });
  res.json({ ok: true });
});

router.post('/users/:digitalId/block', async (req, res) => {
  await query('UPDATE users SET is_blocked = NOT is_blocked WHERE digital_id = $1',
    [req.params.digitalId]);
  await audit(req.user.id, 'toggle_block', req.params.digitalId);
  res.json({ ok: true });
});

const ALLOWED_TAGS = ['tester','admin','owner','builder','scam','major','dolboeb','huesosina'];
router.post('/users/:digitalId/tags', async (req, res) => {
  const { add, remove } = req.body;
  if (!add.every(t => ALLOWED_TAGS.includes(t)) || !remove.every(t => ALLOWED_TAGS.includes(t))) {
    return res.status(400).json({ error: 'bad_tag' });
  }
  await query(
    `UPDATE users SET tags = (SELECT array_agg(DISTINCT x) FROM unnest(
       (SELECT tags FROM users WHERE digital_id = $1) || $2
     ) AS x WHERE NOT x = ANY($3)) WHERE digital_id = $1`,
    [req.params.digitalId, add || [], remove || []]
  );
  await audit(req.user.id, 'tags', req.params.digitalId, { add, remove });
  res.json({ ok: true });
});

router.get('/audit', async (_req, res) => {
  const { rows } = await query('SELECT * FROM audit_log ORDER BY id DESC LIMIT 200');
  res.json(rows);
});

export default router;