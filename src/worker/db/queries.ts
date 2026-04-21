export interface UserRow {
  id: string;
  email: string;
  password_hash: string;
  created_at: number;
}

export async function getUserByEmail(db: D1Database, email: string): Promise<UserRow | null> {
  const row = await db
    .prepare("SELECT id, email, password_hash, created_at FROM users WHERE email = ?")
    .bind(email.toLowerCase())
    .first<UserRow>();
  return row ?? null;
}

export async function getUserById(db: D1Database, id: string): Promise<UserRow | null> {
  const row = await db
    .prepare("SELECT id, email, password_hash, created_at FROM users WHERE id = ?")
    .bind(id)
    .first<UserRow>();
  return row ?? null;
}

export async function createUser(
  db: D1Database,
  params: { id: string; email: string; passwordHash: string }
): Promise<void> {
  await db
    .prepare("INSERT INTO users (id, email, password_hash, created_at) VALUES (?, ?, ?, ?)")
    .bind(params.id, params.email.toLowerCase(), params.passwordHash, Date.now())
    .run();
}

export interface MediaRow {
  id: string;
  user_id: string;
  r2_key: string;
  mime_type: string;
  size_bytes: number;
  original_name: string;
  width: number | null;
  height: number | null;
  duration_ms: number | null;
  created_at: number;
}

export async function createMedia(
  db: D1Database,
  params: { id: string; userId: string; r2Key: string; mimeType: string; sizeBytes: number; originalName: string; }
): Promise<void> {
  await db
    .prepare("INSERT INTO media (id, user_id, r2_key, mime_type, size_bytes, original_name, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .bind(params.id, params.userId, params.r2Key, params.mimeType, params.sizeBytes, params.originalName, Date.now())
    .run();
}

export async function getMediaById(db: D1Database, userId: string, id: string): Promise<MediaRow | null> {
  const row = await db.prepare("SELECT * FROM media WHERE id = ? AND user_id = ?").bind(id, userId).first<MediaRow>();
  return row ?? null;
}

export async function listMedia(db: D1Database, userId: string): Promise<MediaRow[]> {
  const { results } = await db.prepare("SELECT * FROM media WHERE user_id = ? ORDER BY created_at DESC LIMIT 200").bind(userId).all<MediaRow>();
  return results ?? [];
}

export async function deleteMedia(db: D1Database, userId: string, id: string): Promise<boolean> {
  const res = await db.prepare("DELETE FROM media WHERE id = ? AND user_id = ?").bind(id, userId).run();
  return res.meta.changes > 0;
}

export interface PostRow {
  id: string;
  user_id: string;
  body: string;
  media_id: string | null;
  status: string;
  created_at: number;
  updated_at: number;
}

export interface PostTargetRow {
  id: string;
  post_id: string;
  network: string;
  body_override: string | null;
  scheduled_at: number | null;
  published_at: number | null;
  external_id: string | null;
  status: string;
}

export async function createPost(
  db: D1Database,
  params: { id: string; userId: string; body: string; mediaId: string | null }
): Promise<void> {
  const now = Date.now();
  await db
    .prepare("INSERT INTO posts (id, user_id, body, media_id, status, created_at, updated_at) VALUES (?, ?, ?, ?, 'draft', ?, ?)")
    .bind(params.id, params.userId, params.body, params.mediaId, now, now)
    .run();
}

export async function getPostById(db: D1Database, userId: string, id: string): Promise<PostRow | null> {
  const row = await db.prepare("SELECT * FROM posts WHERE id = ? AND user_id = ?").bind(id, userId).first<PostRow>();
  return row ?? null;
}

export async function updatePost(
  db: D1Database,
  userId: string,
  id: string,
  patch: { body?: string; mediaId?: string | null }
): Promise<boolean> {
  const sets: string[] = [];
  const vals: unknown[] = [];
  if (patch.body !== undefined) { sets.push("body = ?"); vals.push(patch.body); }
  if (patch.mediaId !== undefined) { sets.push("media_id = ?"); vals.push(patch.mediaId); }
  if (sets.length === 0) return true;
  sets.push("updated_at = ?");
  vals.push(Date.now(), id, userId);
  const res = await db
    .prepare(`UPDATE posts SET ${sets.join(", ")} WHERE id = ? AND user_id = ?`)
    .bind(...vals)
    .run();
  return res.meta.changes > 0;
}

export async function deletePost(db: D1Database, userId: string, id: string): Promise<boolean> {
  const existing = await db.prepare("SELECT id FROM posts WHERE id = ? AND user_id = ?").bind(id, userId).first();
  if (!existing) return false;
  await db.batch([
    db.prepare("DELETE FROM post_targets WHERE post_id = ?").bind(id),
    db.prepare("DELETE FROM posts WHERE id = ? AND user_id = ?").bind(id, userId),
  ]);
  return true;
}

export async function listPosts(db: D1Database, userId: string): Promise<Array<PostRow & { networks: string }>> {
  const { results } = await db
    .prepare(
      `SELECT p.*, COALESCE(GROUP_CONCAT(t.network), '') AS networks
       FROM posts p
       LEFT JOIN post_targets t ON t.post_id = p.id
       WHERE p.user_id = ?
       GROUP BY p.id
       ORDER BY p.updated_at DESC
       LIMIT 200`
    )
    .bind(userId)
    .all<PostRow & { networks: string }>();
  return results ?? [];
}

export async function listTargetsForPost(db: D1Database, postId: string): Promise<PostTargetRow[]> {
  const { results } = await db
    .prepare("SELECT * FROM post_targets WHERE post_id = ? ORDER BY network")
    .bind(postId)
    .all<PostTargetRow>();
  return results ?? [];
}

export async function setPostTargets(db: D1Database, postId: string, networks: string[]): Promise<void> {
  await db.prepare("DELETE FROM post_targets WHERE post_id = ?").bind(postId).run();
  if (networks.length === 0) return;
  const stmts = networks.map((n) =>
    db.prepare("INSERT INTO post_targets (id, post_id, network, status) VALUES (?, ?, ?, 'pending')")
      .bind(`t_${postId}_${n}`, postId, n)
  );
  await db.batch(stmts);
}

export async function updateTarget(
  db: D1Database,
  postId: string,
  network: string,
  patch: { bodyOverride?: string | null }
): Promise<boolean> {
  const sets: string[] = [];
  const vals: unknown[] = [];
  if (patch.bodyOverride !== undefined) {
    sets.push("body_override = ?");
    vals.push(patch.bodyOverride);
  }
  if (sets.length === 0) return true;
  vals.push(postId, network);
  const res = await db
    .prepare(`UPDATE post_targets SET ${sets.join(", ")} WHERE post_id = ? AND network = ?`)
    .bind(...vals)
    .run();
  return res.meta.changes > 0;
}
