CREATE TABLE posts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  media_id TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (media_id) REFERENCES media(id)
);

CREATE TABLE post_targets (
  id TEXT PRIMARY KEY,
  post_id TEXT NOT NULL,
  network TEXT NOT NULL,
  body_override TEXT,
  scheduled_at INTEGER,
  published_at INTEGER,
  external_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE,
  UNIQUE (post_id, network)
);

CREATE TABLE media (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  r2_key TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  original_name TEXT NOT NULL,
  width INTEGER,
  height INTEGER,
  duration_ms INTEGER,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE INDEX idx_posts_user_updated ON posts(user_id, updated_at DESC);
CREATE INDEX idx_post_targets_post ON post_targets(post_id);
CREATE INDEX idx_media_user_created ON media(user_id, created_at DESC);
