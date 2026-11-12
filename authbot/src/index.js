import { Bot, InlineKeyboard } from 'grammy';
import 'dotenv/config';
import { query, pool } from './db.js';
import { allocateNumber } from './virtualNumbers.js';
import { sendLoginCode } from './authCodes.js';
import { mainMenu, adminMenu } from './keyboards.js';

const bot = new Bot(process.env.BOT_TOKEN);
const ownerId = Number(process.env.OWNER_ID);

async function ensureUser(from) {
  const { rows } = await query('SELECT * FROM users WHERE id = $1', [from.id]);
  if (rows[0]) return { user: rows[0], created: false };
  const virtualNumber = await allocateNumber();
  const digitalId = Number(virtualNumber.replace('+', ''));
  const { rows: created } = await query(
    `INSERT INTO users (id, digital_id, username, first_name, last_name, language, is_owner)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [from.id, digitalId, from.username || null, from.first_name || 'Пользователь',
     from.last_name || null, from.language_code || 'ru', from.id === ownerId]
  );
  await query('INSERT INTO wallets (user_id) VALUES ($1) ON CONFLICT DO NOTHING', [from.id]);
  return { user: created[0], created: true };
}

bot.start(async (ctx) => {
  const { user, created } = await ensureUser(ctx.from);
  const kb = user.is_owner || user.is_admin ? adminMenu : mainMenu;
  if (created) {
    await ctx.reply(
      `Добро пожаловать в CustomTelegram!\nВаш виртуальный номер: ${'+' + user.digital_id}\n` +
      `Цифровой ID: ${user.digital_id}\n\nДля входа в приложение запросите код кнопкой «Код для входа».`,
      kb
    );
  } else {
    await ctx.reply('С возвращением!', kb);
  }
});

bot.command('start', (ctx) => bot.handleUpdate({ ...ctx.update, message: ctx.update.message }));

bot.hears('Мой номер', async (ctx) => {
  const { rows } = await query('SELECT digital_id FROM users WHERE id = $1', [ctx.from.id]);
  if (!rows[0]) return ctx.reply('Сначала нажмите /start');
  ctx.reply(`Ваш виртуальный номер: +${rows[0].digital_id}`);
});

bot.hears('Профиль', async (ctx) => {
  const { rows } = await query('SELECT * FROM users WHERE id = $1', [ctx.from.id]);
  const u = rows[0];
  if (!u) return ctx.reply('Сначала нажмите /start');
  const tags = u.tags.length ? u.tags.join(', ') : 'нет';
  ctx.reply(
    `Профиль\nИмя: ${u.first_name} ${u.last_name || ''}\n` +
    `Юзернейм: ${u.username ? '@' + u.username : 'нет'}\n` +
    `Цифровой ID: ${u.digital_id}\nТеги: ${tags}\nБлокировка: ${u.is_blocked ? 'да' : 'нет'}`
  );
});

bot.hears('Помощь', (ctx) => ctx.reply(
  'Это авторизационный бот CustomTelegram. Он выдаёт виртуальный номер при регистрации и одноразовые коды для входа в приложение. Код действует 5 минут.'
));

bot.hears('Код для входа', async (ctx) => {
  const { rows } = await query('SELECT * FROM users WHERE id = $1', [ctx.from.id]);
  if (!rows[0]) return ctx.reply('Сначала нажмите /start');
  if (rows[0].is_blocked) return ctx.reply('Ваш аккаунт заблокирован.');
  const kb = new InlineKeyboard()
    .text('Для веб-версии', 'code:web')
    .text('Для приложения', 'code:app')
    .row();
  ctx.reply('Для чего нужен код?', kb);
});

bot.callbackQuery(/^code:/, async (ctx) => {
  const device = ctx.callbackQuery.data.split(':')[1];
  const { rows } = await query('SELECT digital_id FROM users WHERE id = $1', [ctx.from.id]);
  if (!rows[0]) return ctx.answerCallbackQuery('Сначала /start');
  try {
    const { code, expiresAt } = await sendLoginCode(ctx.from.id, '+' + rows[0].digital_id);
    await ctx.answerCallbackQuery();
    await ctx.reply(
      `Код для входа (${device}): ${code}\nНомер: +${rows[0].digital_id}\nДействует до ${expiresAt.toLocaleTimeString()}.\nНикому не сообщайте код.`
    );
  } catch {
    ctx.answerCallbackQuery('Ошибка выдачи кода');
  }
});

bot.hears('Статистика', async (ctx) => {
  const admin = await query('SELECT is_admin, is_owner FROM users WHERE id = $1', [ctx.from.id]);
  if (!admin.rows[0] || (!admin.rows[0].is_admin && !admin.rows[0].is_owner)) return;
  const users = await query('SELECT count(*)::int AS n FROM users');
  const msgs = await query('SELECT count(*)::int AS n FROM messages');
  const gifts = await query('SELECT count(*)::int AS n FROM gift_instances');
  ctx.reply(`Пользователей: ${users.rows[0].n}\nСообщений: ${msgs.rows[0].n}\nПодарков: ${gifts.rows[0].n}`);
});

bot.hears('Рассылка', async (ctx) => {
  const admin = await query('SELECT is_admin, is_owner FROM users WHERE id = $1', [ctx.from.id]);
  if (!admin.rows[0] || (!admin.rows[0].is_admin && !admin.rows[0].is_owner)) return;
  ctx.session = { awaitingBroadcast: true };
  ctx.reply('Отправьте сообщение для рассылки всем пользователям. /cancel — отмена.');
});

bot.command('cancel', (ctx) => {
  ctx.session = {};
  ctx.reply('Отменено.');
});

bot.on('message', async (ctx) => {
  if (!ctx.session || !ctx.session.awaitingBroadcast) return;
  const admin = await query('SELECT is_admin, is_owner FROM users WHERE id = $1', [ctx.from.id]);
  if (!admin.rows[0] || (!admin.rows[0].is_admin && !admin.rows[0].is_owner)) return;
  ctx.session = {};
  const { rows } = await query('SELECT id FROM users WHERE is_blocked = FALSE');
  let sent = 0;
  for (const r of rows) {
    try {
      await bot.api.copyMessage(r.id, ctx.chat.id, ctx.message.message_id);
      sent++;
    } catch {}
  }
  ctx.reply(`Рассылка доставлена ${sent} пользователям.`);
});

bot.catch((err) => console.error('Bot error:', err));

bot.start();
process.on('SIGINT', async () => {
  await bot.stop();
  await pool.end();
  process.exit(0);
});