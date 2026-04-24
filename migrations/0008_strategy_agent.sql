CREATE TABLE content_pillars (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  color TEXT,
  position INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id)
);
CREATE INDEX idx_pillars_user ON content_pillars(user_id, position);

CREATE TABLE inspiration_sources (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  network TEXT NOT NULL,
  username TEXT NOT NULL,
  note TEXT,
  added_at INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id),
  UNIQUE(user_id, network, username)
);

CREATE TABLE weekly_suggestions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  week_start TEXT NOT NULL,
  theme TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  suggestions_json TEXT NOT NULL,
  rationale TEXT,
  model TEXT NOT NULL,
  input_tokens INTEGER,
  output_tokens INTEGER,
  cached_tokens INTEGER,
  created_at INTEGER NOT NULL,
  approved_at INTEGER,
  FOREIGN KEY (user_id) REFERENCES users(id),
  UNIQUE(user_id, week_start)
);
CREATE INDEX idx_weekly_user_week ON weekly_suggestions(user_id, week_start DESC);
