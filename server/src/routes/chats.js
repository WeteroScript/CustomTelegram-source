import { Router } from 'express';
import { query } from '../db/index.js';

const router = Router();

router.get('/', async (req, res) => {
  const { rows } = await query(
    `SELECT c.*, cm.role FROM chats c
     JOIN chat_members cm ON cm.chat_id = c.id AND cm.user_id = $1
     ORDER BY c.created_at DESC`,
    [req.user.id]
  );
  res.json(rows);
});

router.post('/', async (req, res) => {
  const { type, title, memberIds = [] } = req.body;
  const { rows } = await query(
    'INSERT INTO chats (type, title, created_by) VALUES ($1,$2,$3) RETURNING *',
    [type, title, req.user.id]
  );
  const chat = rows[0];
  const members = [...new Set([req.user.id, ...memberIds])];
  for (const m of members) {
    await query(
      'INSERT INTO chat_members (chat_id, user_id, role) VALUES ($1,$2,$3)',
      [chat.id, m, m === req.user.id ? 'owner' : 'member']
    );
  }
  res.json(chat);
});

router.post('/:id/members', async (req, res) => {
  await query(
    `INSERT INTO chat_members (chat_id, user_id, role) VALUES ($1,$2,'member')
     ON CONFLICT DO NOTHING`,
    [req.params.id, req.body.userId]
  );
  res.json({ ok: true });
});

export default router;