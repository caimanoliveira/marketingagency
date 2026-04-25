CREATE TABLE post_comments_raw (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  post_id TEXT NOT NULL,
  target_id TEXT NOT NULL,
  network TEXT NOT NULL,
  external_comment_id TEXT,
  commenter_handle TEXT,
  body TEXT NOT NULL,
  posted_at INTEGER,
  fetched_at INTEGER NOT NULL,
  sentiment TEXT,                  -- positive | neutral | negative | NULL when not classified
  topics_json TEXT,                -- JSON array of strings
  classified_at INTEGER,
  FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE,
  UNIQUE (network, external_comment_id)
);
CREATE INDEX idx_pcr_user_fetched ON post_comments_raw(user_id, fetched_at DESC);
CREATE INDEX idx_pcr_user_unclassified ON post_comments_raw(user_id) WHERE classified_at IS NULL;
CREATE INDEX idx_pcr_handle ON post_comments_raw(user_id, commenter_handle);
