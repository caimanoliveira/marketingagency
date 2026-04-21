# Centro de Comando — Semana 2: Posts CRUD + Editor + Midia — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the core content operation: create/edit/list/delete posts, attach media (images + videos up to 500MB), and preview how each post will look on each network (Instagram, TikTok, LinkedIn). No publishing, no AI, no scheduling yet — just a working editorial surface.

**Architecture:** Add `posts`, `post_targets`, and `media` tables to D1. Media lives in R2; the client uploads directly via presigned URLs (so the Worker does not ingest the bytes and we're not limited by Worker body size). Posts are multi-target: one post body + per-network target rows with custom copy overrides. Editor is a single route with left panel (copy + media) and right panel (per-network previews + target toggles). List view is a table sorted by `updated_at`.

**Tech Stack additions:** R2 binding, `aws4fetch` for R2 S3-compatible presigned URLs (tiny, works in Workers), Zod for request validation, React Query (`@tanstack/react-query`) for SPA data fetching/caching.

**Reference spec:** [docs/superpowers/plans/2026-04-20-centro-de-comando-semana-1.md](docs/superpowers/plans/2026-04-20-centro-de-comando-semana-1.md) and the project-level plan at [/Users/caimanoliveira/.claude/plans/eu-quero-criar-um-floofy-sutherland.md](/Users/caimanoliveira/.claude/plans/eu-quero-criar-um-floofy-sutherland.md)

**Out of scope for Week 2 (do NOT build):**
- Kanban (moved to Week 6 per user decision)
- Calendar/scheduling UI
- AI assistance (Week 3)
- OAuth or publishing to networks (Week 4-5)
- Drafts auto-save (acceptable: explicit "Save" button)
- Collaborative editing

---

## File Structure for Week 2

```
/Users/caimanoliveira/Marketing agency/
├── migrations/
│   └── 0002_posts_and_media.sql          # NEW
├── src/
│   ├── shared/
│   │   └── types.ts                      # MODIFY: add Post, PostTarget, Media, Network types
│   ├── worker/
│   │   ├── index.ts                      # MODIFY: mount posts + media routes, R2 binding to Env
│   │   ├── routes/
│   │   │   ├── posts.ts                  # NEW: CRUD /api/posts
│   │   │   └── media.ts                  # NEW: presigned upload + GET list/:id, DELETE
│   │   ├── db/
│   │   │   └── queries.ts                # MODIFY: add post + media queries
│   │   ├── r2/
│   │   │   └── presigned.ts              # NEW: generate S3-compat presigned URLs via aws4fetch
│   │   └── validation.ts                 # NEW: Zod schemas for post/media requests
│   └── web/
│       ├── App.tsx                       # MODIFY: new routes + QueryClientProvider + Layout
│       ├── components/
│       │   ├── Layout.tsx                # NEW: sidebar nav + content area
│       │   ├── MediaUploader.tsx         # NEW: drag-drop uploader with progress
│       │   ├── MediaPicker.tsx           # NEW: grid picker from /api/media
│       │   ├── NetworkSelector.tsx       # NEW: toggle Instagram/TikTok/LinkedIn on a post
│       │   ├── NetworkPreview.tsx        # NEW: renders the mock preview card per network
│       │   └── CharCounter.tsx           # NEW: per-network char limit indicator
│       ├── pages/
│       │   ├── Home.tsx                  # DELETE (replaced by Layout + redirect)
│       │   ├── PostsList.tsx             # NEW
│       │   ├── Editor.tsx                # NEW
│       │   └── Media.tsx                 # NEW: library
│       ├── lib/
│       │   ├── api.ts                    # MODIFY: add posts + media clients
│       │   ├── queryClient.ts            # NEW
│       │   └── networks.ts               # NEW: per-network config (char limit, mime types, max size)
│       └── styles.css                    # MODIFY: add editor/layout styles
└── tests/
    └── worker/
        ├── routes-posts.test.ts          # NEW: integration tests
        └── routes-media.test.ts          # NEW: integration tests
```

---

## Domain model (reference for all tasks)

**Post** — one creative unit. Has a base `body` (copy), optional `media_id`, and fan-out to multiple `post_targets` (one per network). The base `body` is the default copy for each target, but each target can override it (e.g., same image, different caption for LinkedIn).

**Network constants:**
- `instagram`: max chars 2200, mime types image/jpeg, image/png, video/mp4, max size 100MB
- `tiktok`: max chars 2200, mime types video/mp4, video/quicktime, max size 500MB
- `linkedin`: max chars 3000, mime types image/jpeg, image/png, video/mp4, max size 200MB

**D1 tables (0002_posts_and_media.sql):**

```sql
CREATE TABLE posts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  media_id TEXT,
  status TEXT NOT NULL DEFAULT 'draft',  -- draft | scheduled | published | failed
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (media_id) REFERENCES media(id)
);

CREATE TABLE post_targets (
  id TEXT PRIMARY KEY,
  post_id TEXT NOT NULL,
  network TEXT NOT NULL,           -- instagram | tiktok | linkedin
  body_override TEXT,              -- NULL = use post.body
  scheduled_at INTEGER,
  published_at INTEGER,
  external_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE,
  UNIQUE (post_id, network)
);

CREATE TABLE media (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  r2_key TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  original_name TEXT NOT NULL,
  width INTEGER,
  height INTEGER,
  duration_ms INTEGER,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE INDEX idx_posts_user_updated ON posts(user_id, updated_at DESC);
CREATE INDEX idx_post_targets_post ON post_targets(post_id);
CREATE INDEX idx_media_user_created ON media(user_id, created_at DESC);
```

---

## Task 1: R2 bucket + migration + env additions

**Files:**
- Create: `migrations/0002_posts_and_media.sql` (content in Domain model section above)
- Modify: `wrangler.toml`
- Modify: `src/worker/index.ts`
- Modify: `.dev.vars.example`

- [ ] **Step 1: Create R2 bucket**

Run: `npx wrangler r2 bucket create social-command-media`
Expected: "Successfully created bucket 'social-command-media'".

- [ ] **Step 2: Generate R2 API token (manual, dashboard)**

User must go to Cloudflare dashboard → R2 → Manage R2 API Tokens → Create API Token with **Object Read & Write** permission, scoped to bucket `social-command-media`. Copy the generated `Access Key ID`, `Secret Access Key`, and the S3 endpoint URL (format: `https://<account-id>.r2.cloudflarestorage.com`).

Write a placeholder in `.dev.vars` for now; real values go in before local end-to-end testing.

- [ ] **Step 3: Write `migrations/0002_posts_and_media.sql`** with the full schema from "Domain model" above.

- [ ] **Step 4: Modify `wrangler.toml`** — add after the existing `[[d1_databases]]` block:

```toml
[[r2_buckets]]
binding = "MEDIA"
bucket_name = "social-command-media"
```

And append to the existing `[vars]` block (non-secret public values):
```toml
R2_ACCOUNT_ID = ""      # fill in from `wrangler whoami` output
R2_BUCKET = "social-command-media"
R2_PUBLIC_HOST = ""     # empty for Week 2; we use presigned GETs
```

- [ ] **Step 5: Append to `.dev.vars.example`**:
```
R2_ACCESS_KEY_ID=your-r2-access-key-id
R2_SECRET_ACCESS_KEY=your-r2-secret-access-key
```

Then edit the local `.dev.vars` with real values from step 2.

- [ ] **Step 6: Apply migration locally**

Run: `npm run db:migrate:local`
Expected: "Migrations applied" (1 new migration).

- [ ] **Step 7: Extend `Env` in `src/worker/index.ts`** — replace the interface:
```ts
export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  MEDIA: R2Bucket;
  APP_NAME: string;
  JWT_SECRET: string;
  R2_ACCOUNT_ID: string;
  R2_BUCKET: string;
  R2_PUBLIC_HOST: string;
  R2_ACCESS_KEY_ID: string;
  R2_SECRET_ACCESS_KEY: string;
}
```

- [ ] **Step 8: Typecheck**: `npx tsc -p tsconfig.worker.json --noEmit`. Expected: zero errors.

- [ ] **Step 9: Commit**
```
git add wrangler.toml .dev.vars.example migrations/ src/worker/index.ts
git commit -m "feat(week2): R2 bucket binding and posts/media schema"
```

---

## Task 2: Shared types + Zod validation + network config

**Files:**
- Modify: `src/shared/types.ts`
- Create: `src/worker/validation.ts`
- Create: `src/web/lib/networks.ts`

- [ ] **Step 1: Install Zod**: `npm install zod`

- [ ] **Step 2: Replace `src/shared/types.ts`**:
```ts
export interface LoginRequest { email: string; password: string; }
export interface MeResponse { userId: string; email: string; }
export interface HealthResponse { ok: true; app: string; }

export type Network = "instagram" | "tiktok" | "linkedin";
export type PostStatus = "draft" | "scheduled" | "published" | "failed";
export type TargetStatus = "pending" | "scheduled" | "publishing" | "published" | "failed";

export interface Media {
  id: string;
  r2Key: string;
  mimeType: string;
  sizeBytes: number;
  originalName: string;
  width: number | null;
  height: number | null;
  durationMs: number | null;
  createdAt: number;
  url: string;          // signed GET URL valid ~1h
}

export interface PostTarget {
  id: string;
  postId: string;
  network: Network;
  bodyOverride: string | null;
  scheduledAt: number | null;
  publishedAt: number | null;
  externalId: string | null;
  status: TargetStatus;
}

export interface Post {
  id: string;
  body: string;
  mediaId: string | null;
  media: Media | null;
  status: PostStatus;
  createdAt: number;
  updatedAt: number;
  targets: PostTarget[];
}

export interface PostListItem {
  id: string;
  body: string;
  status: PostStatus;
  mediaId: string | null;
  mediaThumb: string | null;
  networks: Network[];
  updatedAt: number;
}

export interface CreatePostRequest {
  body?: string;
  mediaId?: string | null;
  networks?: Network[];
}
export interface UpdatePostRequest {
  body?: string;
  mediaId?: string | null;
}
export interface UpdateTargetRequest {
  bodyOverride?: string | null;
}
export interface PresignedUploadRequest {
  filename: string;
  mimeType: string;
  sizeBytes: number;
}
export interface PresignedUploadResponse {
  mediaId: string;
  uploadUrl: string;
  r2Key: string;
  expiresIn: number;
}
```

- [ ] **Step 3: Create `src/worker/validation.ts`**:
```ts
import { z } from "zod";

export const NetworkSchema = z.enum(["instagram", "tiktok", "linkedin"]);

export const CreatePostSchema = z.object({
  body: z.string().max(5000).default(""),
  mediaId: z.string().nullable().optional(),
  networks: z.array(NetworkSchema).optional().default([]),
});

export const UpdatePostSchema = z.object({
  body: z.string().max(5000).optional(),
  mediaId: z.string().nullable().optional(),
});

export const UpdateTargetSchema = z.object({
  bodyOverride: z.string().max(5000).nullable().optional(),
});

export const PresignedUploadSchema = z.object({
  filename: z.string().min(1).max(256),
  mimeType: z.string().min(1).max(128),
  sizeBytes: z.number().int().positive().max(500 * 1024 * 1024),
});

export const ALLOWED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "video/mp4",
  "video/quicktime",
]);
```

- [ ] **Step 4: Create `src/web/lib/networks.ts`**:
```ts
import type { Network } from "../../shared/types";

export interface NetworkConfig {
  id: Network;
  label: string;
  charLimit: number;
  acceptedMime: string[];
  maxSizeBytes: number;
  color: string;
}

export const NETWORKS: Record<Network, NetworkConfig> = {
  instagram: {
    id: "instagram",
    label: "Instagram",
    charLimit: 2200,
    acceptedMime: ["image/jpeg", "image/png", "image/webp", "video/mp4"],
    maxSizeBytes: 100 * 1024 * 1024,
    color: "#E1306C",
  },
  tiktok: {
    id: "tiktok",
    label: "TikTok",
    charLimit: 2200,
    acceptedMime: ["video/mp4", "video/quicktime"],
    maxSizeBytes: 500 * 1024 * 1024,
    color: "#69C9D0",
  },
  linkedin: {
    id: "linkedin",
    label: "LinkedIn",
    charLimit: 3000,
    acceptedMime: ["image/jpeg", "image/png", "video/mp4"],
    maxSizeBytes: 200 * 1024 * 1024,
    color: "#0A66C2",
  },
};

export const NETWORK_LIST: NetworkConfig[] = [
  NETWORKS.instagram,
  NETWORKS.tiktok,
  NETWORKS.linkedin,
];
```

- [ ] **Step 5: Typecheck + commit**
```
npx tsc -b
git add src/shared/types.ts src/worker/validation.ts src/web/lib/networks.ts package.json
git commit -m "feat(week2): shared types, validation, network config"
```

---

## Task 3: R2 presigned URL helper + media routes (TDD)

**Files:**
- Create: `src/worker/r2/presigned.ts`
- Create: `src/worker/routes/media.ts`
- Modify: `src/worker/db/queries.ts` (append media queries)
- Modify: `src/worker/index.ts` (mount media route)
- Modify: `vitest.config.ts` (add R2 test bindings)
- Create: `tests/worker/routes-media.test.ts`

- [ ] **Step 1: Install aws4fetch**: `npm install aws4fetch`

- [ ] **Step 2: Write `src/worker/r2/presigned.ts`**:
```ts
import { AwsClient } from "aws4fetch";

interface R2Creds {
  accountId: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
}

function endpoint(creds: R2Creds) {
  return `https://${creds.accountId}.r2.cloudflarestorage.com`;
}

function objectUrl(creds: R2Creds, key: string) {
  return `${endpoint(creds)}/${creds.bucket}/${encodeURIComponent(key).replace(/%2F/g, "/")}`;
}

function client(creds: R2Creds) {
  return new AwsClient({
    accessKeyId: creds.accessKeyId,
    secretAccessKey: creds.secretAccessKey,
    service: "s3",
    region: "auto",
  });
}

export async function presignPut(
  creds: R2Creds,
  key: string,
  mimeType: string,
  expiresInSeconds = 900
): Promise<string> {
  const aws = client(creds);
  const url = new URL(objectUrl(creds, key));
  url.searchParams.set("X-Amz-Expires", String(expiresInSeconds));
  const signed = await aws.sign(
    new Request(url.toString(), { method: "PUT", headers: { "content-type": mimeType } }),
    { aws: { signQuery: true } }
  );
  return signed.url;
}

export async function presignGet(
  creds: R2Creds,
  key: string,
  expiresInSeconds = 3600
): Promise<string> {
  const aws = client(creds);
  const url = new URL(objectUrl(creds, key));
  url.searchParams.set("X-Amz-Expires", String(expiresInSeconds));
  const signed = await aws.sign(
    new Request(url.toString(), { method: "GET" }),
    { aws: { signQuery: true } }
  );
  return signed.url;
}
```

- [ ] **Step 3: Append media queries to `src/worker/db/queries.ts`**:
```ts
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
```

- [ ] **Step 4: Update `vitest.config.ts`** — add R2 test bindings to the miniflare `bindings` block:
```ts
bindings: {
  JWT_SECRET: "test-secret-at-least-32-chars-long-xxxxxx",
  R2_ACCOUNT_ID: "testacct",
  R2_BUCKET: "social-command-media-test",
  R2_PUBLIC_HOST: "",
  R2_ACCESS_KEY_ID: "AKIATEST",
  R2_SECRET_ACCESS_KEY: "testsecret",
},
```

- [ ] **Step 5: Write `tests/worker/routes-media.test.ts`** (TDD — expects FAIL first):
```ts
import { describe, it, expect, beforeAll } from "vitest";
import { env, createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import worker from "../../src/worker/index";
import { hashPassword, signToken } from "../../src/worker/auth";

const TEST_USER = "u_media_test";
const TEST_EMAIL = "media@test.dev";

async function setup() {
  await env.DB.exec("CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL, created_at INTEGER NOT NULL)");
  await env.DB.exec("CREATE TABLE IF NOT EXISTS media (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, r2_key TEXT NOT NULL, mime_type TEXT NOT NULL, size_bytes INTEGER NOT NULL, original_name TEXT NOT NULL, width INTEGER, height INTEGER, duration_ms INTEGER, created_at INTEGER NOT NULL)");
  const hash = await hashPassword("irrelevant");
  await env.DB.prepare("INSERT OR REPLACE INTO users (id, email, password_hash, created_at) VALUES (?, ?, ?, ?)").bind(TEST_USER, TEST_EMAIL, hash, Date.now()).run();
}

async function authedCall(path: string, init?: RequestInit) {
  const token = await signToken({ userId: TEST_USER }, env.JWT_SECRET);
  const ctx = createExecutionContext();
  const headers = new Headers(init?.headers);
  headers.set("cookie", `session=${token}`);
  const res = await worker.fetch(new Request(`http://x${path}`, { ...init, headers }), env, ctx);
  await waitOnExecutionContext(ctx);
  return res;
}

beforeAll(setup);

describe("POST /api/media/presigned-upload", () => {
  it("401 without auth", async () => {
    const ctx = createExecutionContext();
    const res = await worker.fetch(new Request("http://x/api/media/presigned-upload", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ filename: "a.jpg", mimeType: "image/jpeg", sizeBytes: 1000 }),
    }), env, ctx);
    await waitOnExecutionContext(ctx);
    expect(res.status).toBe(401);
  });

  it("400 on invalid mime type", async () => {
    const res = await authedCall("/api/media/presigned-upload", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ filename: "evil.exe", mimeType: "application/x-msdownload", sizeBytes: 1000 }),
    });
    expect(res.status).toBe(400);
  });

  it("400 when sizeBytes exceeds 500MB", async () => {
    const res = await authedCall("/api/media/presigned-upload", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ filename: "huge.mp4", mimeType: "video/mp4", sizeBytes: 600 * 1024 * 1024 }),
    });
    expect(res.status).toBe(400);
  });

  it("200 returns mediaId + uploadUrl + r2Key", async () => {
    const res = await authedCall("/api/media/presigned-upload", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ filename: "photo.jpg", mimeType: "image/jpeg", sizeBytes: 1024 * 1024 }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { mediaId: string; uploadUrl: string; r2Key: string; expiresIn: number; };
    expect(body.mediaId).toMatch(/^m_/);
    expect(body.r2Key).toContain(TEST_USER);
    expect(body.uploadUrl).toContain("X-Amz-Signature");
    expect(body.expiresIn).toBeGreaterThan(0);
    const row = await env.DB.prepare("SELECT id, mime_type FROM media WHERE id = ?").bind(body.mediaId).first<{ id: string; mime_type: string }>();
    expect(row?.mime_type).toBe("image/jpeg");
  });
});

describe("GET /api/media", () => {
  it("returns signed URLs for each media item", async () => {
    const res = await authedCall("/api/media");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { items: Array<{ id: string; url: string }> };
    expect(Array.isArray(body.items)).toBe(true);
    expect(body.items.length).toBeGreaterThanOrEqual(1);
    for (const m of body.items) expect(m.url).toContain("X-Amz-Signature");
  });
});

describe("DELETE /api/media/:id", () => {
  it("200 deletes own media", async () => {
    const id = "m_todelete";
    await env.DB.prepare("INSERT INTO media (id, user_id, r2_key, mime_type, size_bytes, original_name, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .bind(id, TEST_USER, `media/${TEST_USER}/${id}.jpg`, "image/jpeg", 100, "x.jpg", Date.now()).run();
    const res = await authedCall(`/api/media/${id}`, { method: "DELETE" });
    expect(res.status).toBe(200);
    const row = await env.DB.prepare("SELECT id FROM media WHERE id = ?").bind(id).first();
    expect(row).toBeNull();
  });

  it("404 for another user's media", async () => {
    const id = "m_other";
    await env.DB.prepare("INSERT INTO media (id, user_id, r2_key, mime_type, size_bytes, original_name, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .bind(id, "u_someone_else", `media/other/${id}.jpg`, "image/jpeg", 100, "x.jpg", Date.now()).run();
    const res = await authedCall(`/api/media/${id}`, { method: "DELETE" });
    expect(res.status).toBe(404);
  });
});
```

- [ ] **Step 6: Run tests to confirm FAIL**: `npx vitest run tests/worker/routes-media.test.ts`

- [ ] **Step 7: Write `src/worker/routes/media.ts`**:
```ts
import { Hono } from "hono";
import type { Env } from "../index";
import { requireAuth } from "../middleware/requireAuth";
import { PresignedUploadSchema, ALLOWED_MIME_TYPES } from "../validation";
import { presignPut, presignGet } from "../r2/presigned";
import { createMedia, getMediaById, listMedia, deleteMedia, type MediaRow } from "../db/queries";
import type { PresignedUploadResponse, Media } from "../../shared/types";

export const media = new Hono<{ Bindings: Env; Variables: { userId: string } }>();
media.use("*", requireAuth);

function randomId(prefix: string) {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  const hex = Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
  return `${prefix}_${hex}`;
}

function extFromMime(mime: string) {
  switch (mime) {
    case "image/jpeg": return "jpg";
    case "image/png": return "png";
    case "image/webp": return "webp";
    case "video/mp4": return "mp4";
    case "video/quicktime": return "mov";
    default: return "bin";
  }
}

function r2Creds(env: Env) {
  return {
    accountId: env.R2_ACCOUNT_ID,
    bucket: env.R2_BUCKET,
    accessKeyId: env.R2_ACCESS_KEY_ID,
    secretAccessKey: env.R2_SECRET_ACCESS_KEY,
  };
}

async function rowToMedia(row: MediaRow, env: Env): Promise<Media> {
  const url = await presignGet(r2Creds(env), row.r2_key);
  return {
    id: row.id,
    r2Key: row.r2_key,
    mimeType: row.mime_type,
    sizeBytes: row.size_bytes,
    originalName: row.original_name,
    width: row.width,
    height: row.height,
    durationMs: row.duration_ms,
    createdAt: row.created_at,
    url,
  };
}

media.post("/presigned-upload", async (c) => {
  const userId = c.get("userId");
  let parsed;
  try { parsed = PresignedUploadSchema.parse(await c.req.json()); }
  catch { return c.json({ error: "invalid_request" }, 400); }
  if (!ALLOWED_MIME_TYPES.has(parsed.mimeType)) return c.json({ error: "mime_not_allowed" }, 400);
  const mediaId = randomId("m");
  const ext = extFromMime(parsed.mimeType);
  const r2Key = `media/${userId}/${mediaId}.${ext}`;
  await createMedia(c.env.DB, { id: mediaId, userId, r2Key, mimeType: parsed.mimeType, sizeBytes: parsed.sizeBytes, originalName: parsed.filename });
  const uploadUrl = await presignPut(r2Creds(c.env), r2Key, parsed.mimeType, 900);
  const body: PresignedUploadResponse = { mediaId, uploadUrl, r2Key, expiresIn: 900 };
  return c.json(body);
});

media.get("/", async (c) => {
  const userId = c.get("userId");
  const rows = await listMedia(c.env.DB, userId);
  const items = await Promise.all(rows.map((r) => rowToMedia(r, c.env)));
  return c.json({ items });
});

media.get("/:id", async (c) => {
  const userId = c.get("userId");
  const row = await getMediaById(c.env.DB, userId, c.req.param("id"));
  if (!row) return c.json({ error: "not_found" }, 404);
  return c.json(await rowToMedia(row, c.env));
});

media.delete("/:id", async (c) => {
  const userId = c.get("userId");
  const id = c.req.param("id");
  const row = await getMediaById(c.env.DB, userId, id);
  if (!row) return c.json({ error: "not_found" }, 404);
  try { await c.env.MEDIA.delete(row.r2_key); } catch { /* best-effort */ }
  await deleteMedia(c.env.DB, userId, id);
  return c.json({ ok: true });
});
```

- [ ] **Step 8: Mount in `src/worker/index.ts`** — after auth route:
```ts
import { media } from "./routes/media";
app.route("/api/media", media);
```

- [ ] **Step 9: Run tests — expect PASS**: `npx vitest run tests/worker/routes-media.test.ts`

- [ ] **Step 10: Commit**
```
git add src/worker/r2/ src/worker/routes/media.ts src/worker/db/queries.ts src/worker/index.ts src/worker/validation.ts tests/worker/routes-media.test.ts vitest.config.ts package.json
git commit -m "feat(week2): media upload via R2 presigned URLs"
```

---

## Task 4: Posts queries + CRUD routes (TDD)

**Files:**
- Modify: `src/worker/db/queries.ts`
- Create: `src/worker/routes/posts.ts`
- Modify: `src/worker/index.ts`
- Create: `tests/worker/routes-posts.test.ts`

See the plan's GitHub companion for full code. Steps:

- [ ] Append post queries to `src/worker/db/queries.ts`: `createPost`, `getPostById`, `updatePost`, `deletePost`, `listPosts` (with GROUP_CONCAT of networks), `listTargetsForPost`, `setPostTargets` (delete-then-batch-insert), `updateTarget`.

- [ ] Write `tests/worker/routes-posts.test.ts` covering: create (no networks / with networks), list sorted desc, get by id (with targets), get 404, patch body bumps updated_at, PUT /targets replaces, PATCH target sets override, DELETE cascades, user-isolation 404. Run tests, confirm failure.

- [ ] Implement `src/worker/routes/posts.ts`:
  - POST `/` → CreatePostSchema → `createPost` + `setPostTargets` + `hydratePost` → 201
  - GET `/` → `listPosts` → `PostListItem[]` with signed thumb for image media
  - GET `/:id` → `getPostById` + `hydratePost`
  - PATCH `/:id` → `UpdatePostSchema` → `updatePost`
  - DELETE `/:id` → `deletePost`
  - PUT `/:id/targets` → `{ networks: Network[] }` → `setPostTargets`
  - PATCH `/:id/targets/:network` → `UpdateTargetSchema` → `updateTarget`

  `hydratePost` loads targets and (if `media_id`) also loads the media row and generates a signed GET URL.

- [ ] Mount in `src/worker/index.ts`: `import { posts } from "./routes/posts"; app.route("/api/posts", posts);`

- [ ] Run full test suite. All ~17 tests pass.

- [ ] Commit: `git commit -m "feat(week2): posts CRUD with target management"`

**Detailed code for this task** is reproduced in full in the spec companion file. Implementer should follow the TDD red/green/commit cycle strictly.

---

## Task 5: SPA layout + React Query wiring

**Files:**
- Create: `src/web/lib/queryClient.ts`
- Create: `src/web/components/Layout.tsx`
- Modify: `src/web/App.tsx`
- Delete: `src/web/pages/Home.tsx`
- Modify: `src/web/styles.css`
- Modify: `src/web/lib/api.ts`
- Create stubs: `PostsList.tsx`, `Editor.tsx`, `Media.tsx`

- [ ] Install: `npm install @tanstack/react-query`

- [ ] `src/web/lib/queryClient.ts`:
```ts
import { QueryClient } from "@tanstack/react-query";
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 15_000, refetchOnWindowFocus: false, retry: 1 },
  },
});
```

- [ ] Replace `src/web/lib/api.ts` with a full client covering auth/posts/media using a shared `req<T>` fetch helper with `credentials: "include"` and JSON headers. Include methods: `login`, `logout`, `me`, `listPosts`, `getPost`, `createPost`, `updatePost`, `deletePost`, `setTargets`, `updateTarget`, `listMedia`, `deleteMedia`, `presignUpload`. (Types from `src/shared/types.ts`.)

- [ ] `src/web/components/Layout.tsx`: sidebar with NavLinks to `/posts`, `/posts/new`, `/media`; footer shows `me.email` + Sair button; uses `useQuery(["me"], api.me)` and navigates to `/login` on error; renders `<Outlet />` in main content.

- [ ] Rewrite `src/web/App.tsx` with `QueryClientProvider` wrapping `BrowserRouter`; routes: `/login` → `Login`, then `Layout` with nested `/` → Navigate to `/posts`, `/posts` → `PostsList`, `/posts/new` → `Editor`, `/posts/:id` → `Editor`, `/media` → `MediaPage`.

- [ ] Delete `src/web/pages/Home.tsx`; remove any import.

- [ ] Append layout/editor/table/preview CSS to `src/web/styles.css` (see full CSS block in the task-4 companion doc / or open PR).

- [ ] Create stub pages so the app builds:
  - `src/web/pages/PostsList.tsx`: `export function PostsList() { return <div>Posts list (Task 6)</div>; }`
  - `src/web/pages/Editor.tsx`: `export function Editor() { return <div>Editor (Task 7)</div>; }`
  - `src/web/pages/Media.tsx`: `export function MediaPage() { return <div>Media library (Task 8)</div>; }`

- [ ] `npx tsc -b` and `npm run build` both clean.

- [ ] Commit: `git commit -m "feat(week2): SPA layout, react-query, routing, API client"`

---

## Task 6: Posts list page

**File:** Overwrite `src/web/pages/PostsList.tsx`.

Component uses:
- `useQuery({ queryKey: ["posts"], queryFn: api.listPosts })`
- `useMutation` for creating a new empty draft (on success → navigate to `/posts/${post.id}`)
- `useMutation` for `api.deletePost` (on success → invalidate `["posts"]`)

Table columns: thumbnail (mediaThumb img or blank box), copy excerpt (link to `/posts/${id}`), network badges (using `NETWORKS[n].color`), status (colored span), updated date (formatted pt-BR), delete button (confirm + mutate).

Empty state text: "Nenhum post ainda. Clique em '+ Novo post' pra começar."

- [ ] Overwrite the file.
- [ ] `npm run build` succeeds.
- [ ] Manual check in browser: empty state renders, `+ Novo post` creates and navigates, list updates after create.
- [ ] Commit: `git commit -m "feat(week2): posts list page"`

---

## Task 7: Media uploader + library page

**Files:**
- Create `src/web/components/MediaUploader.tsx` — drag-drop + click-to-pick input; on file selected:
  1. Validate `size <= 500MB`
  2. `api.presignUpload({filename, mimeType, sizeBytes})`
  3. `XMLHttpRequest` PUT to `uploadUrl` with `content-type` header (so Cloudflare signature validates)
  4. Progress bar tracks `xhr.upload.onprogress`
  5. On 2xx → `queryClient.invalidateQueries(["media"])` + callback `onUploaded(mediaId)`
  6. On error → display message

- Create `src/web/components/MediaPicker.tsx` — grid of `media-tile` items from `api.listMedia`; first tile is "Sem mídia" (null selection); uses `selected` outline on matching id; calls `onSelect(id | null)`.

- Overwrite `src/web/pages/Media.tsx` — renders `<MediaUploader />` at top, list below showing each media with thumbnail/video preview and delete button. React Query key `["media"]`.

- [ ] `npm run build` clean.
- [ ] Commit: `git commit -m "feat(week2): media uploader and library page"`

---

## Task 8: Editor page with network preview

**Files:**
- Create `src/web/components/CharCounter.tsx` — `value / limit`, red when over.
- Create `src/web/components/NetworkSelector.tsx` — pill-style checkboxes for 3 networks.
- Create `src/web/components/NetworkPreview.tsx` — per-network preview card with:
  - Network badge (colored pill)
  - "Customizar"/"Usar base" toggle (null = inherit body, non-null = override)
  - Media preview (img or video)
  - Body preview OR textarea when editing override
  - `<CharCounter>` at bottom
- Overwrite `src/web/pages/Editor.tsx`:
  - Reads `:id` param; if absent, redirect to PostsList (or create-on-mount, see Task 6 flow)
  - Local state: `body`, `mediaId`, `networks: Network[]`, `overrides: Record<Network, string|null>`
  - On load (`useQuery(["post", id])`) hydrates local state from response
  - "Salvar" runs two sequential mutations:
    1. `api.updatePost(id, { body, mediaId })`
    2. `api.setTargets(id, networks)` then `api.updateTarget(id, n, { bodyOverride: overrides[n] })` for each selected network
  - Invalidates `["post", id]` and `["posts"]` on success
  - Right panel renders one `<NetworkPreview>` per selected network
  - Includes `<MediaUploader onUploaded={mid => setMediaId(mid)} />` and a toggle to open `<MediaPicker>`

- [ ] `npx tsc -b` + `npm run build` clean.
- [ ] Commit: `git commit -m "feat(week2): editor with multi-network preview"`

---

## Task 9: Deploy + end-to-end verification

- [ ] **Remote migration**: `yes | npx wrangler d1 migrations apply social_command --remote`. Expected: `0002_posts_and_media.sql` applied.

- [ ] **R2 production secrets** — user must have generated R2 API token (Task 1 Step 2). Upload via:
```
npx wrangler secret put R2_ACCESS_KEY_ID   # paste key when prompted
npx wrangler secret put R2_SECRET_ACCESS_KEY   # paste secret when prompted
```
Also confirm `R2_ACCOUNT_ID` is set in `wrangler.toml [vars]`.

- [ ] **Local smoke test** — `npm run build && npm run dev` in background; via curl:
  - Login → `{"ok":true}`
  - `POST /api/posts` with `{"body":"teste","networks":["linkedin","instagram"]}` → 201 with targets
  - `GET /api/posts` includes the new post
  - `POST /api/media/presigned-upload` with a valid JPEG body returns mediaId+uploadUrl+r2Key

- [ ] **Deploy**: `npm run deploy`

- [ ] **Browser smoke test** on the deployed URL:
  1. Login
  2. Sidebar shows Posts / Novo post / Biblioteca
  3. Click + Novo post → editor opens with a new draft
  4. Write copy, select Instagram + LinkedIn, drag an image, see previews update live
  5. Customize LinkedIn copy, save, reopen → override persists
  6. /media: upload 50MB video, progress shows, appears in library
  7. Delete media: removes from list

- [ ] **Tag + push**
```
git add -A
git commit --allow-empty -m "chore: week 2 deployed"
git tag week-2-done
git push origin main --tags
```

---

## Verification checklist (end of Week 2)

- [ ] `npx tsc -b` clean
- [ ] `npm test` — all tests pass (auth + media + posts = ~17 tests)
- [ ] Local dev: create post with media + 3 networks, see previews, save, list shows it
- [ ] Upload 50MB video via drag-drop — progress bar advances, appears in library
- [ ] Per-network override: customize LinkedIn copy, save, reopen — override persists
- [ ] Delete post: row disappears from list, targets cascaded
- [ ] Deploy works; remote has posts/media/post_targets tables; presigned uploads work against real R2
- [ ] `git tag week-2-done` present, pushed to GitHub

---

## Known limitations carried to later weeks

- **No AI yet** (Week 3)
- **No scheduling** — `scheduled_at` column exists but isn't used; posts stay in `draft` status
- **No publishing** — `status` never leaves `draft`
- **No media dimensions/duration** extraction — `width`, `height`, `duration_ms` stay NULL. Needs client-side probing or server-side ffprobe; punted.
- **No thumbnail generation** — video tiles use the browser's default first-frame
- **No per-network media constraints enforcement at save time** — e.g., TikTok target with an image-only media will fail at publish time; we surface a warning in Week 4
- **Presigned GET URL** expires in 1h — React Query's 15s staleTime on `posts`/`media` mostly hides this; if the editor is left open >1h, images may need refresh
- **R2 delete is best-effort** — if R2 delete fails, DB row is still removed. A reconcile sweep can be added later.
