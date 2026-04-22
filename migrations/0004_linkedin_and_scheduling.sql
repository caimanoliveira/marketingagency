CREATE TABLE linkedin_connections (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  linkedin_member_id TEXT NOT NULL,
  linkedin_member_name TEXT NOT NULL,
  access_token TEXT NOT NULL,
  refresh_token TEXT,
  expires_at INTEGER NOT NULL,
  scopes TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id),
  UNIQUE (user_id)
);

CREATE TABLE linkedin_orgs (
  id TEXT PRIMARY KEY,
  connection_id TEXT NOT NULL,
  org_urn TEXT NOT NULL,
  org_name TEXT NOT NULL,
  org_logo_url TEXT,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (connection_id) REFERENCES linkedin_connections(id) ON DELETE CASCADE,
  UNIQUE (connection_id, org_urn)
);

CREATE TABLE oauth_states (
  state TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  network TEXT NOT NULL,
  redirect_to TEXT,
  created_at INTEGER NOT NULL
);

ALTER TABLE post_targets ADD COLUMN target_ref TEXT;
ALTER TABLE post_targets ADD COLUMN last_error TEXT;
ALTER TABLE post_targets ADD COLUMN attempts INTEGER NOT NULL DEFAULT 0;

CREATE INDEX idx_post_targets_scheduled ON post_targets(status, scheduled_at);
