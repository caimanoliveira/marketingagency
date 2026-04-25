CREATE TABLE review_links (
  token TEXT PRIMARY KEY,
  post_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  workspace_id TEXT,
  expires_at INTEGER NOT NULL,
  used_at INTEGER,
  decision TEXT,
  comment TEXT,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id)
);
CREATE INDEX idx_review_links_post ON review_links(post_id);
CREATE INDEX idx_review_links_user ON review_links(user_id, created_at DESC);

CREATE TABLE post_comments (
  id TEXT PRIMARY KEY,
  post_id TEXT NOT NULL,
  user_id TEXT,           -- NULL when authored via review magic-link
  workspace_id TEXT,
  author_label TEXT NOT NULL DEFAULT 'owner',
  body TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE
);
CREATE INDEX idx_post_comments_post ON post_comments(post_id, created_at ASC);
