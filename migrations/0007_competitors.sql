CREATE TABLE competitors (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  network TEXT NOT NULL,
  username TEXT NOT NULL,
  display_name TEXT,
  profile_picture_url TEXT,
  added_at INTEGER NOT NULL,
  last_snapshot_at INTEGER,
  FOREIGN KEY (user_id) REFERENCES users(id),
  UNIQUE (user_id, network, username)
);
CREATE INDEX idx_competitors_user ON competitors(user_id, network);

CREATE TABLE competitor_snapshots (
  id TEXT PRIMARY KEY,
  competitor_id TEXT NOT NULL,
  snapshot_date TEXT NOT NULL,
  followers INTEGER,
  media_count INTEGER,
  recent_avg_likes REAL,
  recent_avg_comments REAL,
  recent_posts_sampled INTEGER,
  extra_json TEXT,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (competitor_id) REFERENCES competitors(id) ON DELETE CASCADE,
  UNIQUE (competitor_id, snapshot_date)
);
CREATE INDEX idx_competitor_snapshots_comp_date ON competitor_snapshots(competitor_id, snapshot_date DESC);
