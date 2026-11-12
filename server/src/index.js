import express from 'express';
import http from 'node:http';
import 'dotenv/config';
import authRoutes from './routes/auth.js';
import userRoutes from './routes/users.js';
import chatRoutes from './routes/chats.js';
import messageRoutes from './routes/messages.js';
import walletRoutes from './routes/wallet.js';
import giftRoutes from './routes/gifts.js';
import adminRoutes from './routes/admin.js';
import { authenticate } from './middleware/auth.js';
import { initWs } from './ws.js';

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
initWs(server);

const port = process.env.PORT || 8080;
server.listen(port, () => console.log('Server on port', port));