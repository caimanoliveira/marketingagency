CREATE TABLE trend_feeds (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  url TEXT NOT NULL,
  title TEXT,
  enabled INTEGER NOT NULL DEFAULT 1,
  added_at INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id),
  UNIQUE (user_id, url)
);
CREATE INDEX idx_trend_feeds_user ON trend_feeds(user_id);

CREATE TABLE trend_items (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  title TEXT NOT NULL,
  url TEXT NOT NULL,
  source TEXT,
  summary TEXT,
  published_at INTEGER,
  hook_potential TEXT,
  hook_angle TEXT,
  fetched_at INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id),
  UNIQUE (user_id, url)
);
CREATE INDEX idx_trend_items_user ON trend_items(user_id, published_at DESC);
