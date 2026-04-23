CREATE TABLE account_metrics (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  network TEXT NOT NULL,
  account_ref TEXT NOT NULL,
  snapshot_date TEXT NOT NULL,
  followers INTEGER,
  following INTEGER,
  impressions INTEGER,
  reach INTEGER,
  profile_views INTEGER,
  extra_json TEXT,
  created_at INTEGER NOT NULL,
  UNIQUE (user_id, network, account_ref, snapshot_date)
);

CREATE INDEX idx_account_metrics_user_net_date ON account_metrics(user_id, network, snapshot_date DESC);

CREATE TABLE post_metrics (
  id TEXT PRIMARY KEY,
  post_id TEXT NOT NULL,
  target_id TEXT NOT NULL,
  network TEXT NOT NULL,
  snapshot_at INTEGER NOT NULL,
  likes INTEGER,
  comments INTEGER,
  shares INTEGER,
  saved INTEGER,
  reach INTEGER,
  impressions INTEGER,
  engagement_rate REAL,
  extra_json TEXT,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE,
  FOREIGN KEY (target_id) REFERENCES post_targets(id) ON DELETE CASCADE
);

CREATE INDEX idx_post_metrics_target_snap ON post_metrics(target_id, snapshot_at DESC);
CREATE INDEX idx_post_metrics_post ON post_metrics(post_id, snapshot_at DESC);
