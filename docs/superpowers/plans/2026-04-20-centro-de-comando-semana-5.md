# Centro de Comando — Semana 5: Instagram + TikTok — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development.

**Goal:** Instagram Business auto-publishing (via Meta Graph API) + TikTok reminder flow (in-app "Pendente" panel — user copy/pastes manually).

**Architecture:**
- **Instagram OAuth:** Facebook Login → token → `/me/accounts` → find pages with `instagram_business_account` → store IG User ID.
- **IG Publishing:** two-step: `POST /{ig-user-id}/media` with presigned URL from R2 → container_id → `POST /{ig-user-id}/media_publish` with container_id.
- **TikTok reminder:** when `scheduled_at <= now` for a `tiktok` target, cron moves status to `ready_to_post` (new status). Editor + Home page show a list of these. User clicks "Marcar como publicado".

**Tech:** Meta Graph API v20+, same Cloudflare stack.

---

## DB additions

`migrations/0005_meta_and_tiktok.sql`:
```sql
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

-- No status column change needed — 'scheduled' → 'ready_to_post' uses existing status column,
-- but we extend TargetStatus to include this state.
```

Target status extension: add `"ready_to_post"` to the TargetStatus enum in shared types.

---

## Task 1: Meta schema + env + types

- [ ] Write `migrations/0005_meta_and_tiktok.sql`, apply locally.
- [ ] Extend `Env` in `src/worker/index.ts`:
```ts
META_APP_ID: string;
META_APP_SECRET: string;
META_REDIRECT_URL: string;  // uses APP_ORIGIN if not set
```
- [ ] Extend `wrangler.toml` `[vars]`:
```toml
META_REDIRECT_URL = "https://social-command.caimanvinicius.workers.dev/api/connections/instagram/callback"
```
- [ ] Append `META_APP_ID`/`META_APP_SECRET` to `.dev.vars.example` and `.dev.vars` (placeholders).
- [ ] Extend `TargetStatus` type in `src/shared/types.ts`:
```ts
export type TargetStatus = "pending" | "scheduled" | "publishing" | "published" | "failed" | "ready_to_post";
```
- [ ] Add Instagram-specific types:
```ts
export interface InstagramAccount {
  id: string;
  igUserId: string;
  igUsername: string;
  fbPageId: string;
  fbPageName: string;
  profilePictureUrl: string | null;
}

export interface InstagramConnectionStatus {
  connected: boolean;
  member?: { fbUserId: string; fbUserName: string; expiresAt: number; scopes: string[] };
  accounts?: InstagramAccount[];
}
```
- [ ] Commit: `feat(week5): Meta schema, env, types`

---

## Task 2: Instagram OAuth flow

Similar pattern to LinkedIn but through Facebook Login.

- [ ] Append Meta queries to `db/queries.ts`: `upsertMetaConnection`, `getMetaConnection`, `replaceInstagramAccounts`, `listInstagramAccounts`, `deleteMetaConnection`.
- [ ] Create `src/worker/integrations/meta.ts` with:
  - `exchangeCodeForToken(appId, appSecret, redirectUri, code)` → short-lived token
  - `exchangeForLongLivedToken(appId, appSecret, shortLivedToken)` → ~60 days
  - `fetchUserInfo(accessToken)` → { id, name }
  - `fetchPages(accessToken)` → array of pages with access_tokens
  - `fetchInstagramBusinessAccount(pageId, pageToken)` → IG user id + username + profile_picture_url (or null if page has no IG connected)
- [ ] Scopes to request:
```
public_profile,email,pages_show_list,pages_read_engagement,business_management,instagram_basic,instagram_content_publish
```
- [ ] Add routes to `src/worker/routes/connections.ts`:
  - `GET /instagram/start` → redirect to Facebook Login
  - `GET /instagram/callback` → exchange code, fetch pages, derive IG accounts, save
  - `GET /instagram` → status (connected + accounts list)
  - `POST /instagram/refresh` → re-fetch pages + IG accounts
  - `DELETE /instagram` → disconnect
- [ ] Commit: `feat(week5): Instagram OAuth via Facebook Login`

---

## Task 3: Instagram Settings + target picker UI

- [ ] Extend `Settings.tsx` with an Instagram section: shows connected IG accounts, "Conectar Instagram" button, disconnect.
- [ ] Create `InstagramTargetPicker.tsx` analogous to `LinkedInTargetPicker.tsx`: dropdown of connected IG accounts.
- [ ] In `Editor.tsx`, show Instagram picker when `n === "instagram"` (analogous to the LinkedIn block).
- [ ] Commit: `feat(week5): Instagram settings and target picker`

---

## Task 4: Instagram publish integration

- [ ] In `src/worker/integrations/meta.ts`:
  - `publishInstagram({ pageToken, igUserId, caption, mediaUrl, mediaType })` — calls:
    1. `POST https://graph.facebook.com/v20.0/{ig-user-id}/media` with `image_url` or `video_url` + `caption` → returns `container_id`
    2. Poll `GET /{container_id}?fields=status_code` until `FINISHED` (for video); for images usually instant
    3. `POST /{ig-user-id}/media_publish` with `creation_id` → returns `{ id }` (IG media id)
- [ ] In `publishOnce.ts`, add branch for `network === "instagram"`:
  - Resolve IG account from `target.target_ref` (the IG User ID)
  - Resolve page access token from `instagram_accounts` table
  - Get media presigned GET URL (same R2 presign helper, longer TTL — 2h)
  - Call `publishInstagram(...)` → get IG media id → save as `external_id`
- [ ] Commit: `feat(week5): Instagram auto publish`

---

## Task 5: TikTok reminder flow

- [ ] In `scheduler/cron.ts`, extend `scanAndEnqueue`:
  - For `network != 'tiktok'`, current behavior (move to publishing + enqueue)
  - For `network == 'tiktok'`, move status to `ready_to_post` instead (no queue)
- [ ] Create `GET /api/posts/pending-manual` endpoint: returns list of posts with at least one target where `status = 'ready_to_post'`.
- [ ] Create `POST /api/posts/:id/targets/:network/mark-published` endpoint: sets target status to `published`, accepts optional `externalUrl`.
- [ ] In SPA:
  - Home page (`/posts` list or a new `/pending` route) shows a "Pendentes manuais" section at top
  - Each card: copy text, media thumbnail, "Copiar copy" button (navigator.clipboard.writeText), "Baixar mídia" link (presigned GET), "Marcar como publicado" button (with input for TikTok URL)
- [ ] Commit: `feat(week5): TikTok reminder flow`

---

## Task 6: Wire scheduling UI to Instagram + tests

- [ ] In `Editor.tsx`, the existing `schedules` and `targetRefs` state already works for IG. The `<InstagramTargetPicker />` just needs to plug into `targetRefs.instagram` like LinkedIn does.
- [ ] Write tests:
  - `tests/worker/routes-instagram.test.ts` — OAuth callback flow (mocked), status endpoint, account listing
  - `tests/worker/meta-integration.test.ts` — mock fetch + test `publishInstagram` container→publish sequence
  - `tests/worker/tiktok-ready.test.ts` — `scanAndEnqueue` moves tiktok targets to ready_to_post, GET /pending-manual returns them, mark-published flips status
- [ ] Run full test suite. Commit.

---

## Task 7: Deploy

- [ ] Apply migration remote.
- [ ] Upload `META_APP_ID` and `META_APP_SECRET` as wrangler secrets.
- [ ] `npm run deploy`.
- [ ] Manual test:
  1. /settings → Conectar Instagram → OAuth → accounts shown
  2. Create post with Instagram + TikTok selected
  3. Publish now → IG feed shows post
  4. Schedule TikTok for 2 min ahead → after 2 min, /posts shows "Pendentes manuais" card → mark as published
- [ ] Commit + tag `week-5-done` + push

---

## Known limitations carried forward

- **IG video publishing status polling** — for videos, IG requires polling the container's `status_code` until `FINISHED`. We implement this inline with max 30s polling. Very large videos can take longer — may fail with "container_not_ready".
- **Single IG account per user preferred** — multi-account works but each target ref must specify IG user id.
- **TikTok no programmatic publish** — would require TikTok Content Posting API approval.
- **Meta token expiry** — long-lived tokens last ~60 days. We don't auto-refresh yet; user must reconnect. Add a warning when `expires_at - now < 7 days`.
- **IG caption hashtag limit** — 30 hashtags max per post. Not enforced in UI.
