# Развёртывание

## Требования
Node.js 20+, Docker, токен бота от BotFather.

## Шаги
1. docker compose up -d — поднимает PostgreSQL и Redis.
2. server: cp .env.example .env, заполнить JWT_SECRET, OWNER_ID, DATABASE_URL. Затем npm install, npm run migrate, npm run seed, npm run start.
3. authbot: cp .env.example .env, вписать BOT_TOKEN, тот же DATABASE_URL, OWNER_ID, API_SECRET. Затем npm install, npm run start.
4. web: npm install, npm run build, результат в dist раздаётся любым статическим сервером. Для разработки npm run dev с прокси на localhost:8080.

## Переменные
JWT_SECRET — секрет токенов сервера.
OWNER_ID — Telegram ID владельца, получает админ-права автоматически.
API_SECRET в боте и AUTH_BOT_API_SECRET на сервере — общий секрет для будущей межсервисной аутентификации.