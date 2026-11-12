import { Router } from 'express';
import multer from 'multer';
import crypto from 'node:crypto';
import path from 'node:path';
import fs from 'node:fs';
import sharp from 'sharp';
import { query } from '../db/index.js';

const UPLOAD_DIR = path.resolve('uploads');
fs.mkdirSync(path.join(UPLOAD_DIR, 'thumbs'), { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) =>
    cb(null, crypto.randomBytes(16).toString('hex') + path.extname(file.originalname).toLowerCase())
});
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }
});

const router = Router();

// Загрузка изображения или файла. Возвращает пути и метаданные для payload сообщения.
router.post('/', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'no_file' });
  const isImage = (req.file.mimetype || '').startsWith('image/');
  let thumb = null;
  if (isImage) {
    const thumbPath = path.join(UPLOAD_DIR, 'thumbs', req.file.filename + '.jpg');
    try {
      await sharp(req.file.path).rotate().resize(320).jpeg({ quality: 70 }).toFile(thumbPath);
      thumb = '/uploads/thumbs/' + req.file.filename + '.jpg';
    } catch {
      thumb = null;
    }
  }
  const meta = {
    url: '/uploads/' + req.file.filename,
    thumb,
    name: req.file.originalname,
    mime: req.file.mimetype,
    size: req.file.size
  };
  // Сохраняем метаданные, чтобы файл можно было найти и удалить вместе с сообщением.
  const { rows } = await query(
    `INSERT INTO media_files (file_path, thumb_path, name, mime, size, owner_id)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
    [meta.url, thumb, meta.name, meta.mime, meta.size, req.user.id]
  );
  res.json({ id: rows[0].id, kind: isImage ? 'image' : 'file', media: meta });
});

export default router;