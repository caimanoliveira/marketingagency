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

export interface LinkedInConnectionRow {
  id: string;
  user_id: string;
  linkedin_member_id: string;
  linkedin_member_name: string;
  access_token: string;
  refresh_token: string | null;
  expires_at: number;
  scopes: string;
  created_at: number;
  updated_at: number;
}

export interface LinkedInOrgRow {
  id: string;
  connection_id: string;
  org_urn: string;
  org_name: string;
  org_logo_url: string | null;
  created_at: number;
}

export async function upsertLinkedInConnection(
  db: D1Database,
  params: { id: string; userId: string; memberId: string; memberName: string; accessToken: string; refreshToken: string | null; expiresAt: number; scopes: string }
): Promise<void> {
  const now = Date.now();
  await db.prepare(
    `INSERT INTO linkedin_connections (id, user_id, linkedin_member_id, linkedin_member_name, access_token, refresh_token, expires_at, scopes, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET
       linkedin_member_id = excluded.linkedin_member_id,
       linkedin_member_name = excluded.linkedin_member_name,
       access_token = excluded.access_token,
       refresh_token = excluded.refresh_token,
       expires_at = excluded.expires_at,
       scopes = excluded.scopes,
       updated_at = excluded.updated_at`
  ).bind(
    params.id, params.userId, params.memberId, params.memberName,
    params.accessToken, params.refreshToken, params.expiresAt, params.scopes,
    now, now
  ).run();
}

export async function getLinkedInConnection(db: D1Database, userId: string): Promise<LinkedInConnectionRow | null> {
  return (await db.prepare("SELECT * FROM linkedin_connections WHERE user_id = ?").bind(userId).first<LinkedInConnectionRow>()) ?? null;
}

export async function replaceLinkedInOrgs(
  db: D1Database,
  connectionId: string,
  orgs: Array<{ orgUrn: string; orgName: string; orgLogoUrl: string | null }>
): Promise<void> {
  const now = Date.now();
  await db.prepare("DELETE FROM linkedin_orgs WHERE connection_id = ?").bind(connectionId).run();
  if (orgs.length === 0) return;
  const stmts = orgs.map((o, i) =>
    db.prepare("INSERT INTO linkedin_orgs (id, connection_id, org_urn, org_name, org_logo_url, created_at) VALUES (?, ?, ?, ?, ?, ?)")
      .bind(`lio_${connectionId}_${i}`, connectionId, o.orgUrn, o.orgName, o.orgLogoUrl, now)
  );
  await db.batch(stmts);
}

export async function listLinkedInOrgs(db: D1Database, connectionId: string): Promise<LinkedInOrgRow[]> {
  const { results } = await db.prepare("SELECT * FROM linkedin_orgs WHERE connection_id = ? ORDER BY org_name").bind(connectionId).all<LinkedInOrgRow>();
  return results ?? [];
}

export async function deleteLinkedInConnection(db: D1Database, userId: string): Promise<void> {
  await db.prepare("DELETE FROM linkedin_connections WHERE user_id = ?").bind(userId).run();
}

export async function saveOauthState(
  db: D1Database,
  params: { state: string; userId: string; network: string; redirectTo: string | null }
): Promise<void> {
  await db.prepare("INSERT INTO oauth_states (state, user_id, network, redirect_to, created_at) VALUES (?, ?, ?, ?, ?)")
    .bind(params.state, params.userId, params.network, params.redirectTo, Date.now()).run();
}

export async function consumeOauthState(db: D1Database, state: string): Promise<{ userId: string; network: string; redirectTo: string | null } | null> {
  const row = await db.prepare("SELECT user_id, network, redirect_to FROM oauth_states WHERE state = ? AND created_at > ?")
    .bind(state, Date.now() - 10 * 60 * 1000).first<{ user_id: string; network: string; redirect_to: string | null }>();
  if (!row) return null;
  await db.prepare("DELETE FROM oauth_states WHERE state = ?").bind(state).run();
  return { userId: row.user_id, network: row.network, redirectTo: row.redirect_to };
}

export async function logAiGeneration(
  db: D1Database,
  params: {
    id: string;
    userId: string;
    kind: string;
    input: unknown;
    output: unknown;
    inputTokens: number;
    outputTokens: number;
    cachedTokens: number;
    model: string;
    durationMs: number;
  }
): Promise<void> {
  await db
    .prepare("INSERT INTO ai_generations (id, user_id, kind, input_json, output_json, input_tokens, output_tokens, cached_tokens, model, duration_ms, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
    .bind(
      params.id, params.userId, params.kind,
      JSON.stringify(params.input), JSON.stringify(params.output),
      params.inputTokens, params.outputTokens, params.cachedTokens,
      params.model, params.durationMs, Date.now()
    )
    .run();
}
