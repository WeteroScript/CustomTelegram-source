import jwt from 'jsonwebtoken';
import { query } from '../db/index.js';

export function authenticate(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'unauthorized' });
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: 'unauthorized' });
  }
}

export async function issueToken(user) {
  return jwt.sign({ id: user.id }, process.env.JWT_SECRET, { expiresIn: '30d' });
}

export async function requireAdmin(req, res, next) {
  const { rows } = await query(
    'SELECT is_admin, is_owner FROM users WHERE id = $1', [req.user.id]
  );
  if (!rows[0] || (!rows[0].is_admin && !rows[0].is_owner)) {
    return res.status(403).json({ error: 'forbidden' });
  }
  next();
}