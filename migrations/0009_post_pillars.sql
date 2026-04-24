ALTER TABLE posts ADD COLUMN pillar_id TEXT REFERENCES content_pillars(id);
CREATE INDEX idx_posts_pillar ON posts(pillar_id) WHERE pillar_id IS NOT NULL;
