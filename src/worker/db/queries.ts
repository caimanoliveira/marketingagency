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
  pillar_id: string | null;
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
  target_ref: string | null;
  last_error: string | null;
  attempts: number;
}

export async function createPost(
  db: D1Database,
  params: { id: string; userId: string; body: string; mediaId: string | null; pillarId?: string | null }
): Promise<void> {
  const now = Date.now();
  await db
    .prepare("INSERT INTO posts (id, user_id, body, media_id, pillar_id, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 'draft', ?, ?)")
    .bind(params.id, params.userId, params.body, params.mediaId, params.pillarId ?? null, now, now)
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
  patch: { body?: string; mediaId?: string | null; pillarId?: string | null; status?: string }
): Promise<boolean> {
  const sets: string[] = [];
  const vals: unknown[] = [];
  if (patch.body !== undefined) { sets.push("body = ?"); vals.push(patch.body); }
  if (patch.mediaId !== undefined) { sets.push("media_id = ?"); vals.push(patch.mediaId); }
  if (patch.pillarId !== undefined) { sets.push("pillar_id = ?"); vals.push(patch.pillarId); }
  if (patch.status !== undefined) { sets.push("status = ?"); vals.push(patch.status); }
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

export async function listPosts(
  db: D1Database,
  userId: string
): Promise<Array<PostRow & { networks: string; total_likes: number | null; total_comments: number | null }>> {
  const { results } = await db
    .prepare(
      `SELECT p.*,
         COALESCE(GROUP_CONCAT(DISTINCT t.network), '') AS networks,
         SUM(lm.likes) AS total_likes,
         SUM(lm.comments) AS total_comments
       FROM posts p
       LEFT JOIN post_targets t ON t.post_id = p.id
       LEFT JOIN post_metrics lm ON lm.id = (
         SELECT id FROM post_metrics WHERE target_id = t.id ORDER BY snapshot_at DESC LIMIT 1
       )
       WHERE p.user_id = ?
       GROUP BY p.id
       ORDER BY p.updated_at DESC
       LIMIT 200`
    )
    .bind(userId)
    .all<PostRow & { networks: string; total_likes: number | null; total_comments: number | null }>();
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
  patch: { bodyOverride?: string | null; scheduledAt?: number | null; targetRef?: string | null }
): Promise<boolean> {
  const sets: string[] = [];
  const vals: unknown[] = [];
  if (patch.bodyOverride !== undefined) { sets.push("body_override = ?"); vals.push(patch.bodyOverride); }
  if (patch.scheduledAt !== undefined) {
    sets.push("scheduled_at = ?");
    vals.push(patch.scheduledAt);
    // Auto-set status based on scheduled_at
    if (patch.scheduledAt !== null) {
      sets.push("status = 'scheduled'");
    } else {
      sets.push("status = 'pending'");
    }
  }
  if (patch.targetRef !== undefined) { sets.push("target_ref = ?"); vals.push(patch.targetRef); }
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

export interface MetaConnectionRow {
  id: string;
  user_id: string;
  fb_user_id: string;
  fb_user_name: string;
  access_token: string;
  expires_at: number;
  scopes: string;
  created_at: number;
  updated_at: number;
}

export interface InstagramAccountRow {
  id: string;
  connection_id: string;
  ig_user_id: string;
  ig_username: string;
  fb_page_id: string;
  fb_page_name: string;
  fb_page_access_token: string;
  profile_picture_url: string | null;
  created_at: number;
}

export async function upsertMetaConnection(
  db: D1Database,
  params: { id: string; userId: string; fbUserId: string; fbUserName: string; accessToken: string; expiresAt: number; scopes: string }
): Promise<void> {
  const now = Date.now();
  await db.prepare(
    `INSERT INTO meta_connections (id, user_id, fb_user_id, fb_user_name, access_token, expires_at, scopes, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET
       fb_user_id = excluded.fb_user_id,
       fb_user_name = excluded.fb_user_name,
       access_token = excluded.access_token,
       expires_at = excluded.expires_at,
       scopes = excluded.scopes,
       updated_at = excluded.updated_at`
  ).bind(params.id, params.userId, params.fbUserId, params.fbUserName, params.accessToken, params.expiresAt, params.scopes, now, now).run();
}

export async function getMetaConnection(db: D1Database, userId: string): Promise<MetaConnectionRow | null> {
  return (await db.prepare("SELECT * FROM meta_connections WHERE user_id = ?").bind(userId).first<MetaConnectionRow>()) ?? null;
}

export async function replaceInstagramAccounts(
  db: D1Database,
  connectionId: string,
  accounts: Array<{ igUserId: string; igUsername: string; fbPageId: string; fbPageName: string; fbPageAccessToken: string; profilePictureUrl: string | null }>
): Promise<void> {
  const now = Date.now();
  await db.prepare("DELETE FROM instagram_accounts WHERE connection_id = ?").bind(connectionId).run();
  if (accounts.length === 0) return;
  const stmts = accounts.map((a, i) =>
    db.prepare("INSERT INTO instagram_accounts (id, connection_id, ig_user_id, ig_username, fb_page_id, fb_page_name, fb_page_access_token, profile_picture_url, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .bind(`iga_${connectionId}_${i}`, connectionId, a.igUserId, a.igUsername, a.fbPageId, a.fbPageName, a.fbPageAccessToken, a.profilePictureUrl, now)
  );
  await db.batch(stmts);
}

export async function listInstagramAccounts(db: D1Database, connectionId: string): Promise<InstagramAccountRow[]> {
  const { results } = await db.prepare("SELECT * FROM instagram_accounts WHERE connection_id = ? ORDER BY ig_username").bind(connectionId).all<InstagramAccountRow>();
  return results ?? [];
}

export async function getInstagramAccountByUserId(db: D1Database, connectionId: string, igUserId: string): Promise<InstagramAccountRow | null> {
  return (await db.prepare("SELECT * FROM instagram_accounts WHERE connection_id = ? AND ig_user_id = ?").bind(connectionId, igUserId).first<InstagramAccountRow>()) ?? null;
}

export async function deleteMetaConnection(db: D1Database, userId: string): Promise<void> {
  await db.prepare("DELETE FROM meta_connections WHERE user_id = ?").bind(userId).run();
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

export async function listPendingManual(db: D1Database, userId: string): Promise<Array<{
  post_id: string;
  post_body: string;
  media_id: string | null;
  target_id: string;
  network: string;
  body_override: string | null;
  scheduled_at: number | null;
}>> {
  const { results } = await db.prepare(
    `SELECT p.id AS post_id, p.body AS post_body, p.media_id, t.id AS target_id, t.network, t.body_override, t.scheduled_at
     FROM post_targets t
     JOIN posts p ON p.id = t.post_id
     WHERE p.user_id = ? AND t.status = 'ready_to_post'
     ORDER BY t.scheduled_at ASC
     LIMIT 100`
  ).bind(userId).all<{
    post_id: string;
    post_body: string;
    media_id: string | null;
    target_id: string;
    network: string;
    body_override: string | null;
    scheduled_at: number | null;
  }>();
  return results ?? [];
}

export async function markTargetPublished(
  db: D1Database,
  userId: string,
  postId: string,
  targetId: string,
  externalUrl: string | null
): Promise<boolean> {
  // Verify ownership
  const check = await db.prepare(
    "SELECT 1 FROM post_targets t JOIN posts p ON p.id = t.post_id WHERE t.id = ? AND p.user_id = ? AND t.post_id = ?"
  ).bind(targetId, userId, postId).first();
  if (!check) return false;
  const now = Date.now();
  await db.prepare(
    "UPDATE post_targets SET status = 'published', external_id = ?, published_at = ? WHERE id = ?"
  ).bind(externalUrl, now, targetId).run();
  // Don't force post status to 'published' — other targets may still be pending
  return true;
}

export async function listPostsByMonth(
  db: D1Database,
  userId: string,
  fromMs: number,
  toMs: number
): Promise<Array<{
  id: string;
  body: string;
  status: string;
  media_id: string | null;
  networks: string;
  scheduled_at: number;
  updated_at: number;
}>> {
  const { results } = await db.prepare(
    `SELECT p.id, p.body, p.status, p.media_id, p.updated_at,
            COALESCE(GROUP_CONCAT(t2.network), '') AS networks,
            MIN(t.scheduled_at) AS scheduled_at
     FROM posts p
     JOIN post_targets t ON t.post_id = p.id
     LEFT JOIN post_targets t2 ON t2.post_id = p.id
     WHERE p.user_id = ?
       AND t.scheduled_at >= ? AND t.scheduled_at < ?
     GROUP BY p.id
     ORDER BY scheduled_at ASC
     LIMIT 500`
  ).bind(userId, fromMs, toMs).all<{
    id: string; body: string; status: string; media_id: string | null;
    networks: string; scheduled_at: number; updated_at: number;
  }>();
  return results ?? [];
}

export async function listFailures(
  db: D1Database,
  userId: string
): Promise<Array<{
  post_id: string; post_body: string; network: string;
  last_error: string | null; attempts: number; scheduled_at: number | null;
}>> {
  const { results } = await db.prepare(
    `SELECT p.id AS post_id, p.body AS post_body, t.network, t.last_error, t.attempts, t.scheduled_at
     FROM post_targets t
     JOIN posts p ON p.id = t.post_id
     WHERE p.user_id = ? AND t.status = 'failed'
     ORDER BY t.attempts DESC
     LIMIT 100`
  ).bind(userId).all<{
    post_id: string; post_body: string; network: string;
    last_error: string | null; attempts: number; scheduled_at: number | null;
  }>();
  return results ?? [];
}

export async function resetTargetForRetry(
  db: D1Database,
  userId: string,
  postId: string,
  network: string
): Promise<boolean> {
  // Verify ownership
  const target = await db.prepare(
    "SELECT t.id FROM post_targets t JOIN posts p ON p.id = t.post_id WHERE t.post_id = ? AND t.network = ? AND p.user_id = ?"
  ).bind(postId, network, userId).first<{ id: string }>();
  if (!target) return false;
  const now = Date.now();
  await db.prepare(
    `UPDATE post_targets SET status = 'scheduled',
       scheduled_at = CASE WHEN scheduled_at IS NULL OR scheduled_at < ? THEN ? ELSE scheduled_at END,
       last_error = NULL
     WHERE id = ?`
  ).bind(now, now, target.id).run();
  return true;
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

export async function upsertAccountMetrics(
  db: D1Database,
  params: {
    id: string; userId: string; network: string; accountRef: string; snapshotDate: string;
    followers: number | null; impressions: number | null; reach: number | null; profileViews: number | null;
    extra: unknown | null;
  }
): Promise<void> {
  await db.prepare(
    `INSERT INTO account_metrics (id, user_id, network, account_ref, snapshot_date, followers, impressions, reach, profile_views, extra_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(user_id, network, account_ref, snapshot_date) DO UPDATE SET
       followers = excluded.followers,
       impressions = excluded.impressions,
       reach = excluded.reach,
       profile_views = excluded.profile_views,
       extra_json = excluded.extra_json`
  ).bind(
    params.id, params.userId, params.network, params.accountRef, params.snapshotDate,
    params.followers, params.impressions, params.reach, params.profileViews,
    params.extra ? JSON.stringify(params.extra) : null,
    Date.now()
  ).run();
}

export async function insertPostMetrics(
  db: D1Database,
  params: {
    id: string; postId: string; targetId: string; network: string; snapshotAt: number;
    likes: number | null; comments: number | null; shares: number | null; saved: number | null;
    reach: number | null; impressions: number | null; engagementRate: number | null;
    extra: unknown | null;
  }
): Promise<void> {
  await db.prepare(
    `INSERT INTO post_metrics (id, post_id, target_id, network, snapshot_at, likes, comments, shares, saved, reach, impressions, engagement_rate, extra_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    params.id, params.postId, params.targetId, params.network, params.snapshotAt,
    params.likes, params.comments, params.shares, params.saved,
    params.reach, params.impressions, params.engagementRate,
    params.extra ? JSON.stringify(params.extra) : null,
    Date.now()
  ).run();
}

export interface PostMetricsRow {
  id: string;
  post_id: string;
  target_id: string;
  network: string;
  snapshot_at: number;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  saved: number | null;
  reach: number | null;
  impressions: number | null;
  engagement_rate: number | null;
}

export async function latestPostMetrics(db: D1Database, targetId: string): Promise<PostMetricsRow | null> {
  return (await db.prepare(
    "SELECT * FROM post_metrics WHERE target_id = ? ORDER BY snapshot_at DESC LIMIT 1"
  ).bind(targetId).first<PostMetricsRow>()) ?? null;
}

interface AnalyticsSummaryResult {
  periodDays: number;
  totalReach: number;
  totalEngagement: number;
  followerGrowth: number;
  postsPublished: number;
  weeklyEngagement: Array<{ weekStart: string; likes: number; comments: number; shares: number }>;
  contentMix: Array<{ network: string; count: number }>;
}

export async function summaryForPeriod(
  db: D1Database,
  userId: string,
  days: number
): Promise<AnalyticsSummaryResult> {
  const now = Date.now();
  const windowStart = now - days * 24 * 3600 * 1000;

  // Posts published in window + content mix
  const mixRes = await db.prepare(
    `SELECT t.network, COUNT(DISTINCT t.post_id) AS c
     FROM post_targets t
     JOIN posts p ON p.id = t.post_id
     WHERE p.user_id = ? AND t.status = 'published' AND t.published_at >= ?
     GROUP BY t.network`
  ).bind(userId, windowStart).all<{ network: string; c: number }>();
  const contentMix = (mixRes.results ?? []).map((r) => ({ network: r.network, count: r.c }));
  const postsPublished = contentMix.reduce((s, r) => s + r.count, 0);

  // Aggregate latest metrics per target (not the sum across snapshots — we want latest per post to represent current state)
  // For simplicity: sum latest snapshot per target for posts published in window
  const engRes = await db.prepare(
    `SELECT
       COALESCE(SUM(COALESCE(pm.likes, 0)), 0) AS likes,
       COALESCE(SUM(COALESCE(pm.comments, 0)), 0) AS comments,
       COALESCE(SUM(COALESCE(pm.shares, 0)), 0) AS shares,
       COALESCE(SUM(COALESCE(pm.saved, 0)), 0) AS saved,
       COALESCE(SUM(COALESCE(pm.reach, 0)), 0) AS reach
     FROM post_targets t
     JOIN posts p ON p.id = t.post_id
     LEFT JOIN post_metrics pm ON pm.id = (
       SELECT id FROM post_metrics WHERE target_id = t.id ORDER BY snapshot_at DESC LIMIT 1
     )
     WHERE p.user_id = ? AND t.status = 'published' AND t.published_at >= ?`
  ).bind(userId, windowStart).first<{ likes: number; comments: number; shares: number; saved: number; reach: number }>();

  const totalEngagement = (engRes?.likes ?? 0) + (engRes?.comments ?? 0) + (engRes?.shares ?? 0) + (engRes?.saved ?? 0);
  const totalReach = engRes?.reach ?? 0;

  // Follower growth — diff latest vs earliest snapshot in window per network, sum deltas
  const windowStartDate = new Date(windowStart).toISOString().slice(0, 10);
  const followerRes = await db.prepare(
    `SELECT network, account_ref,
       MIN(snapshot_date) AS first_date, MAX(snapshot_date) AS last_date
     FROM account_metrics
     WHERE user_id = ? AND snapshot_date >= ? AND followers IS NOT NULL
     GROUP BY network, account_ref`
  ).bind(userId, windowStartDate).all<{ network: string; account_ref: string; first_date: string; last_date: string }>();

  let followerGrowth = 0;
  for (const row of followerRes.results ?? []) {
    const first = await db.prepare("SELECT followers FROM account_metrics WHERE user_id = ? AND network = ? AND account_ref = ? AND snapshot_date = ?")
      .bind(userId, row.network, row.account_ref, row.first_date).first<{ followers: number }>();
    const last = await db.prepare("SELECT followers FROM account_metrics WHERE user_id = ? AND network = ? AND account_ref = ? AND snapshot_date = ?")
      .bind(userId, row.network, row.account_ref, row.last_date).first<{ followers: number }>();
    followerGrowth += (last?.followers ?? 0) - (first?.followers ?? 0);
  }

  // Weekly engagement bars for last 4 weeks (fixed — independent of period for consistent chart)
  const weeklyEngagement: Array<{ weekStart: string; likes: number; comments: number; shares: number }> = [];
  for (let w = 3; w >= 0; w--) {
    const weekEnd = now - w * 7 * 24 * 3600 * 1000;
    const weekStartMs = weekEnd - 7 * 24 * 3600 * 1000;
    const weekRes = await db.prepare(
      `SELECT
         COALESCE(SUM(pm.likes), 0) AS likes,
         COALESCE(SUM(pm.comments), 0) AS comments,
         COALESCE(SUM(pm.shares), 0) AS shares
       FROM post_metrics pm
       JOIN post_targets t ON t.id = pm.target_id
       JOIN posts p ON p.id = t.post_id
       WHERE p.user_id = ? AND pm.snapshot_at >= ? AND pm.snapshot_at < ?`
    ).bind(userId, weekStartMs, weekEnd).first<{ likes: number; comments: number; shares: number }>();
    const d = new Date(weekStartMs);
    const weekStart = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    weeklyEngagement.push({
      weekStart,
      likes: weekRes?.likes ?? 0,
      comments: weekRes?.comments ?? 0,
      shares: weekRes?.shares ?? 0,
    });
  }

  return {
    periodDays: days,
    totalReach,
    totalEngagement,
    followerGrowth,
    postsPublished,
    weeklyEngagement,
    contentMix,
  };
}

export interface CompetitorRow {
  id: string;
  user_id: string;
  network: string;
  username: string;
  display_name: string | null;
  profile_picture_url: string | null;
  added_at: number;
  last_snapshot_at: number | null;
}

export interface CompetitorSnapshotRow {
  id: string;
  competitor_id: string;
  snapshot_date: string;
  followers: number | null;
  media_count: number | null;
  recent_avg_likes: number | null;
  recent_avg_comments: number | null;
  recent_posts_sampled: number | null;
}

export async function addCompetitor(
  db: D1Database,
  params: { id: string; userId: string; network: string; username: string; displayName: string | null; profilePictureUrl: string | null }
): Promise<void> {
  await db.prepare(
    `INSERT INTO competitors (id, user_id, network, username, display_name, profile_picture_url, added_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(user_id, network, username) DO UPDATE SET
       display_name = excluded.display_name,
       profile_picture_url = excluded.profile_picture_url`
  ).bind(params.id, params.userId, params.network, params.username, params.displayName, params.profilePictureUrl, Date.now()).run();
}

export async function listCompetitors(db: D1Database, userId: string): Promise<CompetitorRow[]> {
  const { results } = await db.prepare("SELECT * FROM competitors WHERE user_id = ? ORDER BY username ASC").bind(userId).all<CompetitorRow>();
  return results ?? [];
}

export async function getCompetitor(db: D1Database, userId: string, id: string): Promise<CompetitorRow | null> {
  return (await db.prepare("SELECT * FROM competitors WHERE id = ? AND user_id = ?").bind(id, userId).first<CompetitorRow>()) ?? null;
}

export async function removeCompetitor(db: D1Database, userId: string, id: string): Promise<boolean> {
  const existing = await db.prepare("SELECT id FROM competitors WHERE id = ? AND user_id = ?").bind(id, userId).first();
  if (!existing) return false;
  await db.prepare("DELETE FROM competitor_snapshots WHERE competitor_id = ?").bind(id).run();
  await db.prepare("DELETE FROM competitors WHERE id = ?").bind(id).run();
  return true;
}

export async function upsertCompetitorSnapshot(
  db: D1Database,
  params: { id: string; competitorId: string; snapshotDate: string; followers: number | null; mediaCount: number | null; recentAvgLikes: number | null; recentAvgComments: number | null; recentPostsSampled: number | null; extra?: unknown }
): Promise<void> {
  await db.prepare(
    `INSERT INTO competitor_snapshots (id, competitor_id, snapshot_date, followers, media_count, recent_avg_likes, recent_avg_comments, recent_posts_sampled, extra_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(competitor_id, snapshot_date) DO UPDATE SET
       followers = excluded.followers,
       media_count = excluded.media_count,
       recent_avg_likes = excluded.recent_avg_likes,
       recent_avg_comments = excluded.recent_avg_comments,
       recent_posts_sampled = excluded.recent_posts_sampled,
       extra_json = excluded.extra_json`
  ).bind(
    params.id, params.competitorId, params.snapshotDate,
    params.followers, params.mediaCount, params.recentAvgLikes, params.recentAvgComments, params.recentPostsSampled,
    params.extra ? JSON.stringify(params.extra) : null,
    Date.now()
  ).run();
  await db.prepare("UPDATE competitors SET last_snapshot_at = ? WHERE id = ?").bind(Date.now(), params.competitorId).run();
}

export async function listCompetitorSnapshots(
  db: D1Database,
  competitorId: string,
  days: number
): Promise<Array<{ date: string; followers: number | null; mediaCount: number | null; recentAvgLikes: number | null; recentAvgComments: number | null; recentPostsSampled: number | null }>> {
  const windowStart = new Date(Date.now() - days * 24 * 3600 * 1000).toISOString().slice(0, 10);
  const { results } = await db.prepare(
    `SELECT snapshot_date AS date, followers, media_count AS mediaCount,
       recent_avg_likes AS recentAvgLikes, recent_avg_comments AS recentAvgComments,
       recent_posts_sampled AS recentPostsSampled
     FROM competitor_snapshots
     WHERE competitor_id = ? AND snapshot_date >= ?
     ORDER BY snapshot_date ASC`
  ).bind(competitorId, windowStart).all<{ date: string; followers: number | null; mediaCount: number | null; recentAvgLikes: number | null; recentAvgComments: number | null; recentPostsSampled: number | null }>();
  return results ?? [];
}

export async function topPosts(
  db: D1Database,
  userId: string,
  opts: { limit: number; by: "likes" | "engagement_rate" }
): Promise<Array<{ postId: string; body: string; network: string; publishedAt: number | null; likes: number | null; comments: number | null; shares: number | null; saved: number | null; reach: number | null; engagementRate: number | null; score: number }>> {
  const scoreExpr = opts.by === "engagement_rate" ? "COALESCE(pm.engagement_rate, 0)" : "COALESCE(pm.likes, 0) + COALESCE(pm.comments, 0)";
  const { results } = await db.prepare(
    `SELECT
       p.id AS postId, p.body, t.network, t.published_at AS publishedAt,
       pm.likes, pm.comments, pm.shares, pm.saved, pm.reach, pm.engagement_rate AS engagementRate,
       (${scoreExpr}) AS score
     FROM post_targets t
     JOIN posts p ON p.id = t.post_id
     LEFT JOIN post_metrics pm ON pm.id = (
       SELECT id FROM post_metrics WHERE target_id = t.id ORDER BY snapshot_at DESC LIMIT 1
     )
     WHERE p.user_id = ? AND t.status = 'published'
     ORDER BY score DESC
     LIMIT ?`
  ).bind(userId, opts.limit).all<{ postId: string; body: string; network: string; publishedAt: number | null; likes: number | null; comments: number | null; shares: number | null; saved: number | null; reach: number | null; engagementRate: number | null; score: number }>();
  return results ?? [];
}

/**
 * Aggregate summary for an explicit [from, to) millisecond range.
 * Same shape as `summaryForPeriod` but with explicit bounds — used for WoW comparisons.
 */
export async function summaryForRange(
  db: D1Database,
  userId: string,
  fromMs: number,
  toMs: number
): Promise<{
  periodDays: number;
  totalReach: number;
  totalEngagement: number;
  followerGrowth: number;
  postsPublished: number;
  weeklyEngagement: Array<{ weekStart: string; likes: number; comments: number; shares: number }>;
  contentMix: Array<{ network: string; count: number }>;
}> {
  const days = Math.max(1, Math.round((toMs - fromMs) / (24 * 3600 * 1000)));

  const mixRes = await db.prepare(
    `SELECT t.network, COUNT(DISTINCT t.post_id) AS c
     FROM post_targets t JOIN posts p ON p.id = t.post_id
     WHERE p.user_id = ? AND t.status = 'published' AND t.published_at >= ? AND t.published_at < ?
     GROUP BY t.network`
  ).bind(userId, fromMs, toMs).all<{ network: string; c: number }>();
  const contentMix = (mixRes.results ?? []).map((r) => ({ network: r.network, count: r.c }));
  const postsPublished = contentMix.reduce((s, r) => s + r.count, 0);

  const engRes = await db.prepare(
    `SELECT
       COALESCE(SUM(COALESCE(pm.likes, 0)), 0) AS likes,
       COALESCE(SUM(COALESCE(pm.comments, 0)), 0) AS comments,
       COALESCE(SUM(COALESCE(pm.shares, 0)), 0) AS shares,
       COALESCE(SUM(COALESCE(pm.saved, 0)), 0) AS saved,
       COALESCE(SUM(COALESCE(pm.reach, 0)), 0) AS reach
     FROM post_targets t JOIN posts p ON p.id = t.post_id
     LEFT JOIN post_metrics pm ON pm.id = (
       SELECT id FROM post_metrics WHERE target_id = t.id ORDER BY snapshot_at DESC LIMIT 1
     )
     WHERE p.user_id = ? AND t.status = 'published' AND t.published_at >= ? AND t.published_at < ?`
  ).bind(userId, fromMs, toMs).first<{ likes: number; comments: number; shares: number; saved: number; reach: number }>();

  const totalEngagement = (engRes?.likes ?? 0) + (engRes?.comments ?? 0) + (engRes?.shares ?? 0) + (engRes?.saved ?? 0);
  const totalReach = engRes?.reach ?? 0;

  return {
    periodDays: days,
    totalReach,
    totalEngagement,
    followerGrowth: 0,       // week 8 TODO: reuse follower-growth logic on explicit date range
    postsPublished,
    weeklyEngagement: [],    // not populated on explicit range — dashboard uses period-based for this
    contentMix,
  };
}

// ---- Content Pillars ----

export interface ContentPillarRow {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  color: string | null;
  position: number;
  created_at: number;
}

export async function upsertPillar(
  db: D1Database,
  params: { id: string; userId: string; title: string; description: string | null; color: string | null; position: number }
): Promise<void> {
  await db.prepare(
    `INSERT INTO content_pillars (id, user_id, title, description, color, position, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       title = excluded.title,
       description = excluded.description,
       color = excluded.color,
       position = excluded.position`
  ).bind(params.id, params.userId, params.title, params.description, params.color, params.position, Date.now()).run();
}

export async function listPillars(db: D1Database, userId: string): Promise<ContentPillarRow[]> {
  const { results } = await db.prepare(
    "SELECT * FROM content_pillars WHERE user_id = ? ORDER BY position ASC, created_at ASC"
  ).bind(userId).all<ContentPillarRow>();
  return results ?? [];
}

export async function deletePillar(db: D1Database, userId: string, id: string): Promise<boolean> {
  const existing = await db.prepare("SELECT id FROM content_pillars WHERE id = ? AND user_id = ?").bind(id, userId).first();
  if (!existing) return false;
  await db.prepare("DELETE FROM content_pillars WHERE id = ?").bind(id).run();
  return true;
}

// ---- Pillar Performance ----

export interface PillarPerformanceRow {
  pillar_id: string;
  title: string;
  color: string | null;
  position: number;
  post_count: number;
  avg_engagement_rate: number | null;
  total_reach: number | null;
  total_likes: number | null;
  total_comments: number | null;
}

export async function getPillarPerformance(
  db: D1Database,
  userId: string,
  windowDays: number
): Promise<PillarPerformanceRow[]> {
  // Include all pillars (LEFT JOIN) so empty pillars render with zeros.
  // Aggregates from the latest metrics snapshot per target for posts in the window.
  const cutoff = Date.now() - windowDays * 86_400_000;
  const { results } = await db
    .prepare(
      `SELECT
         cp.id AS pillar_id,
         cp.title,
         cp.color,
         cp.position,
         COUNT(DISTINCT p.id) AS post_count,
         AVG(lm.engagement_rate) AS avg_engagement_rate,
         SUM(lm.reach) AS total_reach,
         SUM(lm.likes) AS total_likes,
         SUM(lm.comments) AS total_comments
       FROM content_pillars cp
       LEFT JOIN posts p
         ON p.pillar_id = cp.id
        AND p.user_id = cp.user_id
        AND p.updated_at >= ?
       LEFT JOIN post_targets t ON t.post_id = p.id
       LEFT JOIN post_metrics lm ON lm.id = (
         SELECT id FROM post_metrics WHERE target_id = t.id ORDER BY snapshot_at DESC LIMIT 1
       )
       WHERE cp.user_id = ?
       GROUP BY cp.id
       ORDER BY cp.position ASC, cp.created_at ASC`
    )
    .bind(cutoff, userId)
    .all<PillarPerformanceRow>();
  return results ?? [];
}

export interface PillarWeeklyPerformanceRow {
  pillar_id: string;
  week_start: string;
  avg_engagement_rate: number | null;
  post_count: number;
}

export async function getPillarPerformanceWeekly(
  db: D1Database,
  userId: string,
  weeks: number
): Promise<PillarWeeklyPerformanceRow[]> {
  const cutoff = Date.now() - weeks * 7 * 86_400_000;
  // week_start is Monday of the week (UTC), ISO date.
  const { results } = await db
    .prepare(
      `SELECT
         p.pillar_id AS pillar_id,
         strftime('%Y-%m-%d', datetime(p.updated_at/1000, 'unixepoch', 'weekday 1', '-7 days')) AS week_start,
         AVG(lm.engagement_rate) AS avg_engagement_rate,
         COUNT(DISTINCT p.id) AS post_count
       FROM posts p
       LEFT JOIN post_targets t ON t.post_id = p.id
       LEFT JOIN post_metrics lm ON lm.id = (
         SELECT id FROM post_metrics WHERE target_id = t.id ORDER BY snapshot_at DESC LIMIT 1
       )
       WHERE p.user_id = ?
         AND p.pillar_id IS NOT NULL
         AND p.updated_at >= ?
       GROUP BY p.pillar_id, week_start
       ORDER BY week_start ASC`
    )
    .bind(userId, cutoff)
    .all<PillarWeeklyPerformanceRow>();
  return results ?? [];
}

export interface UnclassifiedPostRow {
  id: string;
  body: string;
}

export async function listUnclassifiedPosts(
  db: D1Database,
  userId: string,
  limit: number
): Promise<UnclassifiedPostRow[]> {
  const { results } = await db
    .prepare(
      `SELECT id, body FROM posts
       WHERE user_id = ? AND pillar_id IS NULL AND body != ''
       ORDER BY updated_at DESC
       LIMIT ?`
    )
    .bind(userId, limit)
    .all<UnclassifiedPostRow>();
  return results ?? [];
}

export async function setPostPillar(
  db: D1Database,
  userId: string,
  postId: string,
  pillarId: string | null
): Promise<boolean> {
  const res = await db
    .prepare("UPDATE posts SET pillar_id = ?, updated_at = ? WHERE id = ? AND user_id = ?")
    .bind(pillarId, Date.now(), postId, userId)
    .run();
  return res.meta.changes > 0;
}

// ---- Inspiration Sources ----

export interface InspirationSourceRow {
  id: string;
  user_id: string;
  network: string;
  username: string;
  note: string | null;
  added_at: number;
}

export async function addSource(
  db: D1Database,
  params: { id: string; userId: string; network: string; username: string; note: string | null }
): Promise<void> {
  await db.prepare(
    `INSERT INTO inspiration_sources (id, user_id, network, username, note, added_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(user_id, network, username) DO UPDATE SET note = excluded.note`
  ).bind(params.id, params.userId, params.network, params.username, params.note, Date.now()).run();
}

export async function listSources(db: D1Database, userId: string): Promise<InspirationSourceRow[]> {
  const { results } = await db.prepare(
    "SELECT * FROM inspiration_sources WHERE user_id = ? ORDER BY username ASC"
  ).bind(userId).all<InspirationSourceRow>();
  return results ?? [];
}

export async function removeSource(db: D1Database, userId: string, id: string): Promise<boolean> {
  const existing = await db.prepare("SELECT id FROM inspiration_sources WHERE id = ? AND user_id = ?").bind(id, userId).first();
  if (!existing) return false;
  await db.prepare("DELETE FROM inspiration_sources WHERE id = ?").bind(id).run();
  return true;
}

// ---- Weekly Suggestions ----

export interface WeeklySuggestionRow {
  id: string;
  user_id: string;
  week_start: string;
  theme: string | null;
  status: string;
  suggestions_json: string;
  rationale: string | null;
  model: string;
  input_tokens: number | null;
  output_tokens: number | null;
  cached_tokens: number | null;
  created_at: number;
  approved_at: number | null;
}

export interface SuggestedPostJson {
  day: string;
  time: string;
  network: string;
  pillarId: string | null;
  format: string;
  hook: string;
  body: string;
  mediaSuggestion: string;
}

export interface PublicWeeklySuggestion {
  id: string;
  weekStart: string;
  theme: string | null;
  status: string;
  rationale: string | null;
  posts: SuggestedPostJson[];
  createdAt: number;
  approvedAt: number | null;
  model: string;
  tokens: { input: number | null; output: number | null; cached: number | null };
}

export async function saveWeeklySuggestion(
  db: D1Database,
  params: {
    id: string; userId: string; weekStart: string; theme: string | null;
    posts: SuggestedPostJson[]; rationale: string | null; model: string;
    inputTokens: number | null; outputTokens: number | null; cachedTokens: number | null;
  }
): Promise<void> {
  const now = Date.now();
  await db.prepare(
    `INSERT INTO weekly_suggestions (id, user_id, week_start, theme, status, suggestions_json, rationale, model, input_tokens, output_tokens, cached_tokens, created_at)
     VALUES (?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(user_id, week_start) DO UPDATE SET
       theme = excluded.theme,
       status = 'pending',
       suggestions_json = excluded.suggestions_json,
       rationale = excluded.rationale,
       model = excluded.model,
       input_tokens = excluded.input_tokens,
       output_tokens = excluded.output_tokens,
       cached_tokens = excluded.cached_tokens,
       created_at = excluded.created_at,
       approved_at = NULL`
  ).bind(
    params.id, params.userId, params.weekStart, params.theme,
    JSON.stringify(params.posts), params.rationale, params.model,
    params.inputTokens, params.outputTokens, params.cachedTokens, now
  ).run();
}

function rowToPublicSuggestion(row: WeeklySuggestionRow): PublicWeeklySuggestion {
  let posts: SuggestedPostJson[] = [];
  try { posts = JSON.parse(row.suggestions_json) as SuggestedPostJson[]; } catch {}
  return {
    id: row.id,
    weekStart: row.week_start,
    theme: row.theme,
    status: row.status,
    rationale: row.rationale,
    posts,
    createdAt: row.created_at,
    approvedAt: row.approved_at,
    model: row.model,
    tokens: { input: row.input_tokens, output: row.output_tokens, cached: row.cached_tokens },
  };
}

export async function getWeeklySuggestion(db: D1Database, userId: string, id: string): Promise<PublicWeeklySuggestion | null> {
  const row = await db.prepare(
    "SELECT * FROM weekly_suggestions WHERE id = ? AND user_id = ?"
  ).bind(id, userId).first<WeeklySuggestionRow>();
  return row ? rowToPublicSuggestion(row) : null;
}

export async function listWeeklySuggestions(
  db: D1Database,
  userId: string,
  limit: number
): Promise<PublicWeeklySuggestion[]> {
  const { results } = await db.prepare(
    "SELECT * FROM weekly_suggestions WHERE user_id = ? ORDER BY week_start DESC LIMIT ?"
  ).bind(userId, limit).all<WeeklySuggestionRow>();
  return (results ?? []).map(rowToPublicSuggestion);
}

export async function markSuggestionApproved(db: D1Database, userId: string, id: string): Promise<boolean> {
  const existing = await db.prepare("SELECT id FROM weekly_suggestions WHERE id = ? AND user_id = ?").bind(id, userId).first();
  if (!existing) return false;
  await db.prepare("UPDATE weekly_suggestions SET status = 'approved', approved_at = ? WHERE id = ?")
    .bind(Date.now(), id).run();
  return true;
}
