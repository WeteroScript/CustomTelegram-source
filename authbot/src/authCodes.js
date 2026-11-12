import crypto from 'node:crypto';
import { query } from './db.js';

export async function issueCode(virtualNumber, userId) {
  const code = String(crypto.randomInt(100000, 999999));
  const expires = new Date(Date.now() + 5 * 60 * 1000);
  await query(
    `INSERT INTO auth_codes (virtual_number, code, user_id, expires_at)
     VALUES ($1,$2,$3,$4)`,
    [virtualNumber, code, userId, expires]
  );
  return { code, expiresAt: expires };
}

export async function sendLoginCode(userId, virtualNumber) {
  const { rows } = await query('SELECT * FROM users WHERE id = $1', [userId]);
  if (!rows[0]) throw new Error('not_registered');
  const { code, expiresAt } = await issueCode(virtualNumber, userId);
  return { code, expiresAt };
}