import { Router } from 'express';
import { query } from '../db/index.js';
import { isOnline } from '../ws.js';

const router = Router();

router.get('/me', async (req, res) => {
  const { rows } = await query('SELECT * FROM users WHERE id = $1', [req.user.id]);
  res.json(rows[0]);
});

router.patch('/me', async (req, res) => {
  const { username, firstName, lastName, bio, avatarUrl, language } = req.body;
  const { rows } = await query(
    `UPDATE users SET
       username = COALESCE($2, username),
       first_name = COALESCE($3, first_name),
       last_name = COALESCE($4, last_name),
       bio = COALESCE($5, bio),
       avatar_url = COALESCE($6, avatar_url),
       language = COALESCE($7, language)
     WHERE id = $1 RETURNING *`,
    [req.user.id, username, firstName, lastName, bio, avatarUrl, language]
  );
  res.json(rows[0]);
});

// Онлайн-статусы пользователей по списку id через запятую.
router.get('/online', async (req, res) => {
  const ids = (req.query.ids || '').split(',').map(Number).filter(Boolean);
  res.json(ids.map((id) => ({ id, online: isOnline(id) })));
});

router.get('/:digitalId', async (req, res) => {
  const { rows } = await query(
    'SELECT * FROM users WHERE digital_id = $1', [req.params.digitalId]
  );
  if (!rows[0]) return res.status(404).json({ error: 'not_found' });
  res.json(rows[0]);
});

export default router;