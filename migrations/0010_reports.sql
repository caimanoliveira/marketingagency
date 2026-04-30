-- migrations/0010_reports.sql
CREATE TABLE IF NOT EXISTS reports (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title       TEXT,
  period_days INTEGER NOT NULL DEFAULT 30,
  token       TEXT NOT NULL UNIQUE,
  snapshot    TEXT NOT NULL,
  created_at  INTEGER NOT NULL,
  expires_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_reports_user  ON reports(user_id);
CREATE INDEX IF NOT EXISTS idx_reports_token ON reports(token);
