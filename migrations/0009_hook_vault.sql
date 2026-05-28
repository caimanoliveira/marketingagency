CREATE TABLE hooks (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  template TEXT NOT NULL,
  hook_type TEXT,
  niche TEXT,
  source_handle TEXT,
  network TEXT,
  view_count INTEGER,
  use_count INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id)
);
CREATE INDEX idx_hooks_user ON hooks(user_id, created_at DESC);
CREATE INDEX idx_hooks_user_type ON hooks(user_id, hook_type);
