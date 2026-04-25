CREATE TABLE ai_variant_outcomes (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  network TEXT,
  tone TEXT,
  variant_text TEXT NOT NULL,
  post_id TEXT,
  applied_at INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id)
);
CREATE INDEX idx_variant_outcomes_user_applied ON ai_variant_outcomes(user_id, applied_at DESC);
CREATE INDEX idx_variant_outcomes_post ON ai_variant_outcomes(post_id);
