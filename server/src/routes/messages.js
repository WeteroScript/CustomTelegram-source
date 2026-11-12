import { Router } from 'express';
import { query } from '../db/index.js';

const router = Router();

const ALLOWED_EMOJI = ['👍', '👎', '❤️', '🔥', '😂', '😮', '😢', '🎉'];

async function assertMember(userId, chatId) {
  const { rows } = await query(
    'SELECT 1 FROM chat_members WHERE chat_id = $1 AND user_id = $2',
    [chatId, userId]
  );
  if (!rows[0]) throw new Error('forbidden');
}

router.get('/:chatId', async (req, res) => {
  try {
    await assertMember(req.user.id, req.params.chatId);
  } catch {
    return res.status(403).json({ error: 'forbidden' });
  }
  // Помечаем удалёнными просроченные самоуничтожающиеся сообщения чата.
  await query(
    'UPDATE messages SET deleted = TRUE WHERE chat_id = $1 AND self_destruct_at IS NOT NULL AND self_destruct_at < now()',
    [req.params.chatId]
  );
  const { rows } = await query(
    `SELECT m.*, u.first_name AS sender_first_name, u.last_name AS sender_last_name,
       r.text AS reply_text, ru.first_name AS reply_sender_name
     FROM messages m
     LEFT JOIN users u ON u.id = m.sender_id
     LEFT JOIN messages r ON r.id = m.reply_to
     LEFT JOIN users ru ON ru.id = r.sender_id
     WHERE m.chat_id = $1 AND m.deleted = FALSE
       AND (m.scheduled_at IS NULL OR m.scheduled_at <= now())
     ORDER BY m.id DESC LIMIT 100`,
    [req.params.chatId]
  );
  const ids = rows.map((r) => r.id);
  let reactions = [];
  if (ids.length) {
    const r = await query(
      'SELECT message_id, emoji, count(*)::int AS n FROM reactions WHERE message_id = ANY($1) GROUP BY message_id, emoji',
      [ids]
    );
    reactions = r.rows;
  }
  res.json(rows.reverse().map((m) => ({
    ...m,
    reactions: reactions.filter((r) => r.message_id === m.id)
  })));
});

router.post('/:chatId', async (req, res) => {
  try {
    await assertMember(req.user.id, req.params.chatId);
  } catch {
    return res.status(403).json({ error: 'forbidden' });
  }
  const { text, replyTo, kind = 'text', payload = {}, scheduledAt, selfDestructAt } = req.body;
  if (replyTo) {
    const { rows: target } = await query(
      'SELECT 1 FROM messages WHERE id = $1 AND chat_id = $2 AND deleted = FALSE',
      [replyTo, req.params.chatId]
    );
    if (!target[0]) return res.status(400).json({ error: 'bad_reply_target' });
  }
  const { rows } = await query(
    `INSERT INTO messages (chat_id, sender_id, reply_to, text, kind, payload, scheduled_at, self_destruct_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
    [req.params.chatId, req.user.id, replyTo, text, kind, payload, scheduledAt, selfDestructAt]
  );
  res.json(rows[0]);
});

// Пересылка сообщения в другой чат, где пользователь состоит.
router.post('/:id/forward', async (req, res) => {
  const { toChatId } = req.body;
  const { rows: source } = await query(
    'SELECT * FROM messages WHERE id = $1 AND deleted = FALSE', [req.params.id]
  );
  if (!source[0]) return res.status(404).json({ error: 'not_found' });
  try {
    await assertMember(req.user.id, toChatId);
    await assertMember(req.user.id, source[0].chat_id);
  } catch {
    return res.status(403).json({ error: 'forbidden' });
  }
  const { rows } = await query(
    `INSERT INTO messages (chat_id, sender_id, forwarded_from, text, kind, payload)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [toChatId, req.user.id, source[0].sender_id, source[0].text, source[0].kind, source[0].payload]
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

// Переключение реакции: повторное нажатие убирает её.
router.post('/:id/react', async (req, res) => {
  const { emoji } = req.body;
  if (!ALLOWED_EMOJI.includes(emoji)) return res.status(400).json({ error: 'bad_emoji' });
  const { rows: msg } = await query('SELECT chat_id FROM messages WHERE id = $1 AND deleted = FALSE', [req.params.id]);
  if (!msg[0]) return res.status(404).json({ error: 'not_found' });
  try {
    await assertMember(req.user.id, msg[0].chat_id);
  } catch {
    return res.status(403).json({ error: 'forbidden' });
  }
  const del = await query(
    'DELETE FROM reactions WHERE message_id = $1 AND user_id = $2 AND emoji = $3',
    [req.params.id, req.user.id, emoji]
  );
  if (del.rowCount === 0) {
    await query(
      'INSERT INTO reactions (message_id, user_id, emoji) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING',
      [req.params.id, req.user.id, emoji]
    );
  }
  const { rows } = await query(
    `SELECT message_id, emoji, count(*)::int AS n FROM reactions
     WHERE message_id = $1 GROUP BY message_id, emoji`,
    [req.params.id]
  );
  res.json({ messageId: Number(req.params.id), reactions: rows });
});

export default router;