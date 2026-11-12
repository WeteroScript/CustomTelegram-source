import { Pool } from 'pg';
import 'dotenv/config';

export const pool = new Pool({ connectionString: process.env.DATABASE_URL });
export const query = (text, params) => pool.query(text, params);