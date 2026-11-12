import { WebSocketServer } from 'ws';
import jwt from 'jsonwebtoken';
import url from 'node:url';
import { query } from '../db/index.js';

const clients = new Map(); // userId -> Set<ws>

function sendToUsers(userIds, payload) {
  const data = JSON.stringify(payload);
  for (const uid of userIds) {
    for (const client of clients.get(uid) || []) {
      if (client.readyState === 1) client.send(data);
    }
  }
}

export async function broadcastToChat(chatId, payload) {
  const { rows } = await query('SELECT user_id FROM chat_members WHERE chat_id = $1', [chatId]);
  sendToUsers(rows.map((r) => r.user_id), payload);
}

function broadcastToAll(payload) {
  sendToUsers([...clients.keys()], payload);
}

export function isOnline(userId) {
  const set = clients.get(userId);
  return Boolean(set && set.size > 0);
}

async function isMember(userId, chatId) {
  const { rowCount } = await query(
    'SELECT 1 FROM chat_members WHERE chat_id = $1 AND user_id = $2',
    [chatId, userId]
  );
  return rowCount > 0;
}

export function initWs(server) {
  const wss = new WebSocketServer({ server, path: '/ws' });

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
    await query("UPDATE users SET status = 'online' WHERE id = $1", [userId]);
    broadcastToAll({ type: 'presence', userId, online: true });

    ws.on('message', async (raw) => {
      try {
        const data = JSON.parse(raw.toString());
        if (data.type === 'message' && data.chatId) {
          if (!(await isMember(userId, data.chatId))) return;
          const { rows } = await query(
            `INSERT INTO messages (chat_id, sender_id, text) VALUES ($1,$2,$3) RETURNING *`,
            [data.chatId, userId, data.text]
          );
          await broadcastToChat(data.chatId, { type: 'message', chatId: data.chatId, message: rows[0] });
        }
      } catch (e) {
        console.error('ws message error:', e.message);
      }
    });

    ws.on('close', async () => {
      const set = clients.get(userId);
      if (set) {
        set.delete(ws);
        if (set.size === 0) {
          clients.delete(userId);
          await query("UPDATE users SET status = 'offline' WHERE id = $1", [userId]);
          broadcastToAll({ type: 'presence', userId, online: false });
        }
      }
    });
  });

  return wss;
}