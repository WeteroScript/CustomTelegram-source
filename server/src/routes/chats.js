import { Router } from 'express';
import { query, pool } from '../db/index.js';

const router = Router();

// Список чатов пользователя с количеством непрочитанных сообщений.
router.get('/', async (req, res) => {
  const { rows } = await query(
    `SELECT c.*, cm.role,
       (SELECT count(*)::int FROM messages m
        WHERE m.chat_id = c.id AND m.deleted = FALSE AND m.sender_id != $1
          AND m.scheduled_at IS NULL
          AND m.id > COALESCE(mr.last_read_message_id, 0)) AS unread,
       (SELECT m2.text FROM messages m2
        WHERE m2.chat_id = c.id AND m2.deleted = FALSE
          AND (m2.scheduled_at IS NULL OR m2.scheduled_at <= now())
        ORDER BY m2.id DESC LIMIT 1) AS last_message,
       (SELECT max(m3.created_at) FROM messages m3
        WHERE m3.chat_id = c.id AND m3.deleted = FALSE
          AND (m3.scheduled_at IS NULL OR m3.scheduled_at <= now())) AS last_activity
     FROM chats c
     JOIN chat_members cm ON cm.chat_id = c.id AND cm.user_id = $1
     LEFT JOIN message_reads mr ON mr.chat_id = c.id AND mr.user_id = $1
     ORDER BY last_activity DESC NULLS LAST`,
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

// Отметить чат прочитанным до последнего сообщения.
router.post('/:id/read', async (req, res) => {
  const { rows: member } = await query(
    'SELECT 1 FROM chat_members WHERE chat_id = $1 AND user_id = $2',
    [req.params.id, req.user.id]
  );
  if (!member[0]) return res.status(403).json({ error: 'forbidden' });
  const { rows: latest } = await query(
    'SELECT COALESCE(MAX(id), 0) AS mid FROM messages WHERE chat_id = $1 AND deleted = FALSE',
    [req.params.id]
  );
  await query(
    `INSERT INTO message_reads (chat_id, user_id, last_read_message_id)
     VALUES ($1,$2,$3)
     ON CONFLICT (chat_id, user_id)
     DO UPDATE SET last_read_message_id = GREATEST(message_reads.last_read_message_id, $3)`,
    [req.params.id, req.user.id, latest[0].mid]
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
    `SELECT u.id, u.first_name, u.last_name, u.username, u.digital_id, u.status
     FROM chat_members cm JOIN users u ON u.id = cm.user_id
     WHERE cm.chat_id = $1 AND cm.user_id != $2`,
    [req.params.id, req.user.id]
  );
  const o = others[0] || {};
  res.json({ ...chat, title: `${o.first_name || ''} ${o.last_name || ''}`.trim() || 'Собеседник', peer: o });
});

export default router;