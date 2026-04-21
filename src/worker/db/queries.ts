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
