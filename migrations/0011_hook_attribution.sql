ALTER TABLE posts ADD COLUMN hook_id TEXT;
CREATE INDEX idx_posts_hook ON posts(hook_id);
