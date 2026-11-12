import express from 'express';
import http from 'node:http';
import url from 'node:url';
import { WebSocketServer } from 'ws';
import jwt from 'jsonwebtoken';
import 'dotenv/config';
import authRoutes from './routes/auth.js';
import userRoutes from './routes/users.js';
import chatRoutes from './routes/chats.js';
import messageRoutes from './routes/messages.js';
import walletRoutes from './routes/wallet.js';
import giftRoutes from './routes/gifts.js';
import adminRoutes from './routes/admin.js';
import { authenticate } from './middleware/auth.js';
import { query } from './db/index.js';

const app = express();
app.use(express.json({ limit: '10mb' }));
app.use('/api/auth', authRoutes);
app.use('/api/users', authenticate, userRoutes);
app.use('/api/chats', authenticate, chatRoutes);
app.use('/api/messages', authenticate, messageRoutes);
app.use('/api/wallet', authenticate, walletRoutes);
app.use('/api/gifts', authenticate, giftRoutes);
app.use('/api/admin', authenticate, adminRoutes);

app.get('/health', (_req, res) => res.json({ ok: true }));

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });
const clients = new Map(); // userId -> Set<ws>

function isMember(userId, chatId) {
  return query('SELECT 1 FROM chat_members WHERE chat_id = $1 AND user_id = $2', [chatId, userId])
    .then((r) => r.rowCount > 0).catch(() => false);
}

wss.on('connection', async (ws, req) => {
  const { searchParams } = new url.URL(req.url, 'http://localhost');
  let userId = null;
  try {
    userId = jwt.verify(searchParams.get('token') || '', process.env.JWT_SECRET).id;
  } catch {
    ws.close(4001, 'unauthorized');
    return;
  }
  if (!clients.has(userId)) clients.set(userId, new Set());
  clients.get(userId).add(ws);
  ws.send(JSON.stringify({ type: 'hello' }));

  ws.on('message', async (raw) => {
    try {
      const data = JSON.parse(raw.toString());
      if (data.type === 'message' && data.chatId) {
        if (!(await isMember(userId, data.chatId))) return;
        const { rows } = await query(
          `INSERT INTO messages (chat_id, sender_id, text) VALUES ($1,$2,$3) RETURNING *`,
          [data.chatId, userId, data.text]
        );
        const payload = JSON.stringify({ type: 'message', chatId: data.chatId, message: rows[0] });
        const members = await query('SELECT user_id FROM chat_members WHERE chat_id = $1', [data.chatId]);
        for (const m of members.rows) {
          for (const client of clients.get(m.user_id) || []) {
            if (client.readyState === ws.OPEN) client.send(payload);
          }
        }
      }
    } catch (e) {
      console.error('ws message error:', e.message);
    }
  });

  ws.on('close', () => {
    const set = clients.get(userId);
    if (set) {
      set.delete(ws);
      if (set.size === 0) clients.delete(userId);
    }
  });
});

const port = process.env.PORT || 8080;
server.listen(port, () => console.log('Server on port', port));