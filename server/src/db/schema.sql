CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS users (
  id BIGINT PRIMARY KEY,
  digital_id BIGINT UNIQUE NOT NULL DEFAULT floor(random()*9000000000+1000000000)::bigint,
  username TEXT UNIQUE,
  first_name TEXT NOT NULL,
  last_name TEXT,
  bio TEXT DEFAULT '',
  avatar_url TEXT,
  status TEXT DEFAULT 'offline',
  language TEXT DEFAULT 'ru',
  is_admin BOOLEAN DEFAULT FALSE,
  is_owner BOOLEAN DEFAULT FALSE,
  is_blocked BOOLEAN DEFAULT FALSE,
  tags TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS auth_codes (
  id BIGSERIAL PRIMARY KEY,
  virtual_number TEXT NOT NULL,
  code TEXT NOT NULL,
  user_id BIGINT REFERENCES users(id),
  expires_at TIMESTAMPTZ NOT NULL,
  used BOOLEAN DEFAULT FALSE,
  attempts INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sessions (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id),
  token_hash TEXT NOT NULL,
  device TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  last_seen TIMESTAMPTZ DEFAULT now(),
  revoked BOOLEAN DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS chats (
  id BIGSERIAL PRIMARY KEY,
  type TEXT NOT NULL CHECK (type IN ('private','group','channel')),
  title TEXT,
  avatar_url TEXT,
  created_by BIGINT REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS chat_members (
  chat_id BIGINT NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
  user_id BIGINT NOT NULL REFERENCES users(id),
  role TEXT DEFAULT 'member' CHECK (role IN ('owner','admin','member','restricted')),
  rights JSONB DEFAULT '{}',
  joined_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (chat_id, user_id)
);

CREATE TABLE IF NOT EXISTS messages (
  id BIGSERIAL PRIMARY KEY,
  chat_id BIGINT NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
  sender_id BIGINT REFERENCES users(id),
  reply_to BIGINT REFERENCES messages(id),
  forwarded_from BIGINT REFERENCES users(id),
  text TEXT,
  kind TEXT DEFAULT 'text',
  payload JSONB DEFAULT '{}',
  edited BOOLEAN DEFAULT FALSE,
  pinned BOOLEAN DEFAULT FALSE,
  deleted BOOLEAN DEFAULT FALSE,
  self_destruct_at TIMESTAMPTZ,
  scheduled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Загруженные файлы: связь с сообщением и владельцем для учёта и очистки.
CREATE TABLE IF NOT EXISTS media_files (
  id BIGSERIAL PRIMARY KEY,
  file_path TEXT NOT NULL,
  thumb_path TEXT,
  name TEXT NOT NULL,
  mime TEXT NOT NULL,
  size BIGINT NOT NULL,
  owner_id BIGINT NOT NULL REFERENCES users(id),
  message_id BIGINT REFERENCES messages(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS reactions (
  message_id BIGINT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  user_id BIGINT NOT NULL REFERENCES users(id),
  emoji TEXT NOT NULL,
  PRIMARY KEY (message_id, user_id, emoji)
);

-- Последнее прочитанное сообщение пользователя в каждом чате.
CREATE TABLE IF NOT EXISTS message_reads (
  chat_id BIGINT NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
  user_id BIGINT NOT NULL REFERENCES users(id),
  last_read_message_id BIGINT NOT NULL DEFAULT 0,
  PRIMARY KEY (chat_id, user_id)
);

CREATE TABLE IF NOT EXISTS wallets (
  user_id BIGINT PRIMARY KEY REFERENCES users(id),
  grams NUMERIC DEFAULT 0,
  stars NUMERIC DEFAULT 0
);

CREATE TABLE IF NOT EXISTS transactions (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id),
  currency TEXT NOT NULL CHECK (currency IN ('grams','stars')),
  amount NUMERIC NOT NULL,
  kind TEXT NOT NULL,
  counterparty BIGINT REFERENCES users(id),
  meta JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS gifts (
  id BIGSERIAL PRIMARY KEY,
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  image_url TEXT NOT NULL,
  currency TEXT NOT NULL CHECK (currency IN ('grams','stars')),
  price NUMERIC NOT NULL,
  supply INT NOT NULL,
  sold INT DEFAULT 0,
  category TEXT NOT NULL,
  rarity TEXT NOT NULL,
  on_sale BOOLEAN DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS gift_instances (
  id BIGSERIAL PRIMARY KEY,
  gift_id BIGINT NOT NULL REFERENCES gifts(id),
  owner_id BIGINT REFERENCES users(id),
  status TEXT DEFAULT 'inventory' CHECK (status IN ('inventory','transfer_pending','upgraded')),
  hidden BOOLEAN DEFAULT FALSE,
  is_nft BOOLEAN DEFAULT FALSE,
  nft_serial INT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS gift_history (
  id BIGSERIAL PRIMARY KEY,
  instance_id BIGINT NOT NULL REFERENCES gift_instances(id) ON DELETE CASCADE,
  event TEXT NOT NULL,
  from_user BIGINT REFERENCES users(id),
  to_user BIGINT REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS audit_log (
  id BIGSERIAL PRIMARY KEY,
  actor_id BIGINT NOT NULL,
  action TEXT NOT NULL,
  target_id BIGINT,
  details JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);