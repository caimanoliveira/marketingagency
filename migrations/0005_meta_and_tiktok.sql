CREATE TABLE meta_connections (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  fb_user_id TEXT NOT NULL,
  fb_user_name TEXT NOT NULL,
  access_token TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  scopes TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id),
  UNIQUE (user_id)
);

CREATE TABLE instagram_accounts (
  id TEXT PRIMARY KEY,
  connection_id TEXT NOT NULL,
  ig_user_id TEXT NOT NULL,
  ig_username TEXT NOT NULL,
  fb_page_id TEXT NOT NULL,
  fb_page_name TEXT NOT NULL,
  fb_page_access_token TEXT NOT NULL,
  profile_picture_url TEXT,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (connection_id) REFERENCES meta_connections(id) ON DELETE CASCADE,
  UNIQUE (connection_id, ig_user_id)
);
