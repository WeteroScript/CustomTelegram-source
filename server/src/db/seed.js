import 'dotenv/config';
import { query, pool } from './index.js';

const GIFTS = [
  ['golden-heart', 'Золотое сердце', 'Подарок-символ привязанности', 'https://placehold.co/300x300/f5c542/000?text=Heart', 'stars', 50, 1000, 'love', 'common'],
  ['plush-bear', 'Плюшевый медведь', 'Классический подарок-игрушка', 'https://placehold.co/300x300/8b5a2b/fff?text=Bear', 'stars', 100, 5000, 'toys', 'common'],
  ['diamond-ring', 'Бриллиантовое кольцо', 'Редкий подарок премиум-класса', 'https://placehold.co/300x300/b9f2ff/000?text=Ring', 'grams', 500, 100, 'jewelry', 'legendary'],
  ['rocket', 'Ракета', 'Подарок для настоящих амбиций', 'https://placehold.co/300x300/4c8dff/fff?text=Rocket', 'stars', 250, 2000, 'tech', 'rare'],
  ['eternal-rose', 'Вечная роза', 'Никогда не увядает', 'https://placehold.co/300x300/ff5c5c/fff?text=Rose', 'grams', 150, 3000, 'love', 'rare'],
  ['cosmic-cube', 'Космический куб', 'Артефакт из глубин космоса', 'https://placehold.co/300x300/7b2ff7/fff?text=Cube', 'grams', 1000, 50, 'collectibles', 'legendary']
];

for (const [slug, name, description, imageUrl, currency, price, supply, category, rarity] of GIFTS) {
  await query(
    `INSERT INTO gifts (slug, name, description, image_url, currency, price, supply, category, rarity)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT (slug) DO NOTHING`,
    [slug, name, description, imageUrl, currency, price, supply, category, rarity]
  );
}
console.log('Seed gifts inserted');
await pool.end();