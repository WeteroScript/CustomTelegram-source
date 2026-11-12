# CustomTelegram

Мессенджер с авторизацией через бота, чатами, кошельком, подарками и NFT.

## Структура
- server — серверная часть (API, WebSocket, база данных)
- authbot — сервис авторизационного бота
- web — веб-приложение
- mobile — мобильный клиент
- docs — документация

## Локальный запуск
1. Скопируйте server/.env.example в server/.env и заполните значения.
2. Поднимите базу: docker compose up -d postgres redis
3. Сервер: cd server && npm install && npm run migrate && npm run dev
4. Веб: cd web && npm install && npm run dev

Подробности — в docs/ARCHITECTURE.md.