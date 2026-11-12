import { query } from './db.js';

const PREFIXES = ['+9901', '+9902', '+9903', '+9904'];
const MIN_DIGITS = 7;
const MAX_DIGITS = 7;

export function generateNumber() {
  const prefix = PREFIXES[Math.floor(Math.random() * PREFIXES.length)];
  let digits = '';
  for (let i = 0; i < MIN_DIGITS; i++) {
    digits += Math.floor(Math.random() * 10);
  }
  return prefix + digits;
}

export async function allocateNumber() {
  for (let attempt = 0; attempt < 20; attempt++) {
    const candidate = generateNumber();
    const { rows } = await query(
      'SELECT 1 FROM users WHERE username = $1 OR digital_id::text = $2',
      [candidate, candidate.replace('+', '')]
    );
    if (rows.length === 0) return candidate;
  }
  throw new Error('cannot_allocate_number');
}