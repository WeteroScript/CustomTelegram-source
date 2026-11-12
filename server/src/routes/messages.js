import { Router } from 'express';
import { query } from '../db/index.js';

const router = Router();

router.get('/:chatId', async (req, res) => {
  const { rows } = await query(
    `SELECT * FROM messages WHERE chat_id = $1 AND deleted = FALSE
     ORDER BY id DESC LIMIT 100`,
    [req.params.chatId]
  );
  res.json(rows.reverse());
});

router.post('/:chatId', async (req, res) => {
  const { text, replyTo, kind = 'text', payload = {}, scheduledAt, selfDestructAt } = req.body;
  const { rows } = await query(
    `INSERT INTO messages (chat_id, sender_id, reply_to, text, kind, payload, scheduled_at, self_destruct_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
    [req.params.chatId, req.user.id, replyTo, text, kind, payload, scheduledAt, selfDestructAt]
  );
  res.json(rows[0]);
});

router.patch('/:id', async (req, res) => {
  const { rows } = await query(
    `UPDATE messages SET text = $2, edited = TRUE
     WHERE id = $1 AND sender_id = $3 AND deleted = FALSE RETURNING *`,
    [req.params.id, req.body.text, req.user.id]
  );
  res.json(rows[0]);
});

router.delete('/:id', async (req, res) => {
  await query('UPDATE messages SET deleted = TRUE WHERE id = $1 AND sender_id = $2',
    [req.params.id, req.user.id]);
  res.json({ ok: true });
});

export default router;