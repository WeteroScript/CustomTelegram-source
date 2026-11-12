import { Router } from 'express';
import { query, pool } from '../db/index.js';

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

// Приватный чат один на один. Находит существующий или создаёт новый.
router.post('/private', async (req, res) => {
  const { digitalId } = req.body;
  const { rows: other } = await query('SELECT id FROM users WHERE digital_id = $1', [digitalId]);
  if (!other[0]) return res.status(404).json({ error: 'user_not_found' });
  if (other[0].id === req.user.id) return res.status(400).json({ error: 'self_chat' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const existing = await client.query(
      `SELECT c.id FROM chats c
       JOIN chat_members a ON a.chat_id = c.id AND a.user_id = $1
       JOIN chat_members b ON b.chat_id = c.id AND b.user_id = $2
       WHERE c.type = 'private' LIMIT 1`,
      [req.user.id, other[0].id]
    );
    if (existing.rows[0]) {
      await client.query('COMMIT');
      return res.json({ id: existing.rows[0].id, existing: true });
    }
    const chat = await client.query(
      `INSERT INTO chats (type, created_by) VALUES ('private',$1) RETURNING *`,
      [req.user.id]
    );
    for (const m of [req.user.id, other[0].id]) {
      await client.query(
        `INSERT INTO chat_members (chat_id, user_id, role) VALUES ($1,$2,'member')`,
        [chat.rows[0].id, m]
      );
    }
    await client.query('COMMIT');
    res.json({ id: chat.rows[0].id, existing: false });
  } catch (e) {
    await client.query('ROLLBACK');
    res.status(400).json({ error: e.message });
  } finally {
    client.release();
  }
});

router.post('/:id/members', async (req, res) => {
  await query(
    `INSERT INTO chat_members (chat_id, user_id, role) VALUES ($1,$2,'member')
     ON CONFLICT DO NOTHING`,
    [req.params.id, req.body.userId]
  );
  res.json({ ok: true });
});

// Информация о чате: название и собеседник для приватных чатов.
router.get('/:id/info', async (req, res) => {
  const { rows: member } = await query(
    'SELECT 1 FROM chat_members WHERE chat_id = $1 AND user_id = $2',
    [req.params.id, req.user.id]
  );
  if (!member[0]) return res.status(403).json({ error: 'forbidden' });
  const { rows: chats } = await query('SELECT * FROM chats WHERE id = $1', [req.params.id]);
  const chat = chats[0];
  if (!chat) return res.status(404).json({ error: 'not_found' });
  if (chat.type !== 'private') return res.json({ ...chat, title: chat.title || `Чат ${chat.id}` });
  const { rows: others } = await query(
    `SELECT u.first_name, u.last_name, u.username, u.digital_id
     FROM chat_members cm JOIN users u ON u.id = cm.user_id
     WHERE cm.chat_id = $1 AND cm.user_id != $2`,
    [req.params.id, req.user.id]
  );
  const o = others[0] || {};
  res.json({ ...chat, title: `${o.first_name || ''} ${o.last_name || ''}`.trim() || 'Собеседник', peer: o });
});

export default router;