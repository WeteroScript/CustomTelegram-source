import { Router } from 'express';
import { query } from '../db/index.js';
import { broadcastToChat } from '../ws.js';

const router = Router();

const ALLOWED_EMOJI = ['👍', '👎', '❤️', '🔥', '😂', '😮', '😢', '🎉'];
const ALLOWED_KINDS = ['text', 'image', 'file'];

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
  const q = (req.query.q || '').toString().trim();
  const { rows } = await query(
    `SELECT m.*, u.first_name AS sender_first_name, u.last_name AS sender_last_name,
       r.text AS reply_text, ru.first_name AS reply_sender_name
     FROM messages m
     LEFT JOIN users u ON u.id = m.sender_id
     LEFT JOIN messages r ON r.id = m.reply_to
     LEFT JOIN users ru ON ru.id = r.sender_id
     WHERE m.chat_id = $1 AND m.deleted = FALSE
       AND (m.scheduled_at IS NULL OR m.scheduled_at <= now())
       AND ($2::text = '' OR m.text ILIKE '%' || $2 || '%')
     ORDER BY m.id DESC LIMIT 100`,
    [req.params.chatId, q]
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

// Свои отложенные сообщения чата, ещё не наступило время отправки.
router.get('/:chatId/scheduled', async (req, res) => {
  try {
    await assertMember(req.user.id, req.params.chatId);
  } catch {
    return res.status(403).json({ error: 'forbidden' });
  }
  const { rows } = await query(
    `SELECT id, text, scheduled_at FROM messages
     WHERE chat_id = $1 AND sender_id = $2 AND deleted = FALSE
       AND scheduled_at IS NOT NULL AND scheduled_at > now()
     ORDER BY scheduled_at ASC`,
    [req.params.chatId, req.user.id]
  );
  res.json(rows);
});

// Закреплённые сообщения чата.
router.get('/:chatId/pinned', async (req, res) => {
  try {
    await assertMember(req.user.id, req.params.chatId);
  } catch {
    return res.status(403).json({ error: 'forbidden' });
  }
  const { rows } = await query(
    `SELECT m.*, u.first_name AS sender_first_name, u.last_name AS sender_last_name
     FROM messages m LEFT JOIN users u ON u.id = m.sender_id
     WHERE m.chat_id = $1 AND m.deleted = FALSE AND m.pinned = TRUE
     ORDER BY m.id DESC`,
    [req.params.chatId]
  );
  res.json(rows);
});

router.post('/:chatId', async (req, res) => {
  try {
    await assertMember(req.user.id, req.params.chatId);
  } catch {
    return res.status(403).json({ error: 'forbidden' });
  }
  const { text, replyTo, kind = 'text', payload = {}, scheduledAt, selfDestructAt, mediaId } = req.body;
  if (!ALLOWED_KINDS.includes(kind)) return res.status(400).json({ error: 'bad_kind' });
  if (kind !== 'text' && !payload?.media?.url) {
    return res.status(400).json({ error: 'media_required' });
  }
  if (replyTo) {
    const { rows: target } = await query(
      'SELECT 1 FROM messages WHERE id = $1 AND chat_id = $2 AND deleted = FALSE',
      [replyTo, req.params.chatId]
    );
    if (!target[0]) return res.status(400).json({ error: 'bad_reply_target' });
  }
  if (scheduledAt && new Date(scheduledAt) < new Date()) {
    return res.status(400).json({ error: 'bad_schedule_time' });
  }
  const { rows } = await query(
    `INSERT INTO messages (chat_id, sender_id, reply_to, text, kind, payload, scheduled_at, self_destruct_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
    [req.params.chatId, req.user.id, replyTo, text, kind, payload, scheduledAt, selfDestructAt]
  );
  const message = rows[0];
  // Привязываем загруженный файл к сообщению, если он был.
  if (mediaId) {
    await query(
      'UPDATE media_files SET message_id = $1 WHERE id = $2 AND owner_id = $3 AND message_id IS NULL',
      [message.id, mediaId, req.user.id]
    );
  }
  if (!scheduledAt) {
    await broadcastToChat(req.params.chatId, {
      type: 'message', chatId: Number(req.params.chatId), message
    });
  }
  res.json(message);
});

// Отмена отложенного сообщения: доступна только автору.
router.delete('/:id/schedule', async (req, res) => {
  const { rows } = await query(
    `DELETE FROM messages
     WHERE id = $1 AND sender_id = $2 AND scheduled_at IS NOT NULL AND scheduled_at > now()`,
    [req.params.id, req.user.id]
  );
  if (rows.length === 0) return res.status(404).json({ error: 'not_found' });
  res.json({ ok: true });
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
  await broadcastToChat(toChatId, { type: 'message', chatId: Number(toChatId), message: rows[0] });
  res.json(rows[0]);
});

router.patch('/:id', async (req, res) => {
  const { rows } = await query(
    `UPDATE messages SET text = $2, edited = TRUE
     WHERE id = $1 AND sender_id = $3 AND deleted = FALSE AND kind = 'text' RETURNING *`,
    [req.params.id, req.body.text, req.user.id]
  );
  res.json(rows[0]);
});

// При удалении сообщения с файлом файл тоже удаляется с диска.
router.delete('/:id', async (req, res) => {
  await query('UPDATE messages SET deleted = TRUE WHERE id = $1 AND sender_id = $2',
    [req.params.id, req.user.id]);
  res.json({ ok: true });
});

// Закрепить или открепить сообщение. Право есть у владельца, админа и автора.
router.post('/:id/pin', async (req, res) => {
  const { rows: msg } = await query(
    `SELECT m.chat_id, cm.role, m.sender_id
     FROM messages m
     JOIN chat_members cm ON cm.chat_id = m.chat_id AND cm.user_id = $2
     WHERE m.id = $1 AND m.deleted = FALSE`,
    [req.params.id, req.user.id]
  );
  if (!msg[0]) return res.status(404).json({ error: 'not_found' });
  const canPin = ['owner', 'admin'].includes(msg[0].role) || msg[0].sender_id === req.user.id;
  if (!canPin) return res.status(403).json({ error: 'forbidden' });
  const { rows } = await query(
    'UPDATE messages SET pinned = NOT pinned WHERE id = $1 RETURNING id, pinned',
    [req.params.id]
  );
  res.json(rows[0]);
});

// Переключение реакции: повторное нажатие убирает её. Итог рассылается всем участникам чата.
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
  await broadcastToChat(msg[0].chat_id, {
    type: 'reaction', messageId: Number(req.params.id), reactions: rows
  });
  res.json({ messageId: Number(req.params.id), reactions: rows });
});

export default router;