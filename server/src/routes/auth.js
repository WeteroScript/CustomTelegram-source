import { Router } from 'express';
import { query } from '../db/index.js';
import { issueToken } from '../middleware/auth.js';

const router = Router();

// Проверка кода из авторизационного бота. Код живёт 5 минут и одноразовый.
router.post('/verify', async (req, res) => {
  const { virtualNumber, code } = req.body;
  if (!virtualNumber || !code) return res.status(400).json({ error: 'bad_request' });
  const { rows } = await query(
    `SELECT * FROM auth_codes
     WHERE virtual_number = $1 AND used = FALSE AND attempts < 5
     ORDER BY id DESC LIMIT 1`,
    [virtualNumber]
  );
  const rec = rows[0];
  if (!rec) return res.status(429).json({ error: 'too_many_attempts' });
  await query('UPDATE auth_codes SET attempts = attempts + 1 WHERE id = $1', [rec.id]);
  if (new Date(rec.expires_at) < new Date()) {
    return res.status(410).json({ error: 'code_expired' });
  }
  if (rec.code !== String(code)) {
    return res.status(401).json({ error: 'wrong_code' });
  }
  await query('UPDATE auth_codes SET used = TRUE WHERE id = $1', [rec.id]);
  const { rows: users } = await query('SELECT * FROM users WHERE id = $1', [rec.user_id]);
  const user = users[0];
  if (!user) return res.status(404).json({ error: 'user_not_found' });
  if (user.is_blocked) return res.status(403).json({ error: 'blocked' });
  res.json({ token: await issueToken(user), user });
});

export default router;