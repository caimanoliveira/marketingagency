# Centro de Comando — Semana 4: LinkedIn OAuth + Publicação — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Conectar conta LinkedIn via OAuth (perfil pessoal + páginas de empresa que o usuário administra), publicar posts (manual "agora" e agendado via Cron + Queue), com retry automático.

**Architecture:**
- **OAuth:** Standard LinkedIn OAuth 2.0 with PKCE-less (auth code) flow. State param for CSRF. Tokens stored in new `linkedin_connections` and `linkedin_orgs` tables.
- **Target selection:** Each `post_target` where `network = 'linkedin'` gets a new `target_ref` column: NULL = self, or `urn:li:organization:123` for an org page.
- **Publishing:** LinkedIn UGC Posts API (`POST /v2/ugcPosts`). Media uploaded to LinkedIn's CDN first, then referenced in the post. For now, text-only + single image. Video publishing deferred.
- **Scheduling:** Cron Trigger every minute → queries `post_targets` with `scheduled_at <= now() AND status = 'scheduled'` → enqueues to Cloudflare Queue → consumer calls LinkedIn API → updates status.
- **Retries:** Queue's built-in retry (3 attempts with exponential backoff). On terminal failure, status → `failed` and error saved.

**Tech stack additions:** Cloudflare Queues binding, Cron Triggers, LinkedIn UGC Posts API.

**Out of scope:**
- Instagram/TikTok (Week 5)
- Video publishing to LinkedIn
- Multiple LinkedIn accounts per user
- Post editing after publish
- Unpublish / delete from LinkedIn
- Notifications UI for scheduled publishes (just status in post list)

---

## File Structure for Week 4

```
migrations/
  0004_linkedin_and_scheduling.sql       # NEW
src/
  shared/types.ts                         # MODIFY
  worker/
    index.ts                              # MODIFY: LinkedIn env + queue handler + scheduled handler
    routes/
      connections.ts                      # NEW: OAuth flows
      publish.ts                          # NEW: manual publish endpoint
      posts.ts                            # MODIFY: accept scheduled_at and target_ref on targets
    integrations/
      linkedin.ts                         # NEW: token refresh, publish UGC post, upload media
    scheduler/
      cron.ts                             # NEW: scan scheduled targets
      queue-consumer.ts                   # NEW: dequeue and publish
    db/
      queries.ts                          # MODIFY: LinkedIn tables queries + scheduled ops
    validation.ts                         # MODIFY: add schedule/target_ref schemas
  web/
    pages/
      Settings.tsx                        # NEW: "Conectar LinkedIn" + list connected
      Editor.tsx                          # MODIFY: date-time picker + per-target LinkedIn selector
    components/
      LinkedInTargetPicker.tsx            # NEW: dropdown of self + orgs for a target
      Schedule.tsx                        # NEW: date-time input helper
    lib/api.ts                            # MODIFY: connections + publish + scheduling methods
tests/worker/
  routes-connections.test.ts              # NEW
  routes-publish.test.ts                  # NEW
  scheduler.test.ts                       # NEW
```

---

## DB schema additions

`migrations/0004_linkedin_and_scheduling.sql`:
```sql
-- OAuth connections (one row per user per network)
CREATE TABLE linkedin_connections (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  linkedin_member_id TEXT NOT NULL,        -- urn:li:person:...
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

-- Organizations the user can post to
CREATE TABLE linkedin_orgs (
  id TEXT PRIMARY KEY,
  connection_id TEXT NOT NULL,
  org_urn TEXT NOT NULL,                   -- urn:li:organization:123
  org_name TEXT NOT NULL,
  org_logo_url TEXT,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (connection_id) REFERENCES linkedin_connections(id) ON DELETE CASCADE,
  UNIQUE (connection_id, org_urn)
);

-- OAuth state tokens (CSRF protection for callback)
CREATE TABLE oauth_states (
  state TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  network TEXT NOT NULL,
  redirect_to TEXT,
  created_at INTEGER NOT NULL
);

-- Add fields to post_targets (already exists from week 2)
ALTER TABLE post_targets ADD COLUMN target_ref TEXT;
ALTER TABLE post_targets ADD COLUMN last_error TEXT;
ALTER TABLE post_targets ADD COLUMN attempts INTEGER NOT NULL DEFAULT 0;

CREATE INDEX idx_post_targets_scheduled ON post_targets(status, scheduled_at);
```

---

## Task 1: LinkedIn app setup + migration + env + types

**Manual step for user:** Create a LinkedIn Developer app at https://www.linkedin.com/developers/apps:
1. App name: "Centro de Comando (dev)" (or whatever)
2. LinkedIn Page: your company page (required — any company page you admin will do)
3. Products: "Sign In with LinkedIn using OpenID Connect" + "Share on LinkedIn" + "Marketing Developer Platform" (the last requires approval but request anyway — for org posting)
4. Auth settings → Redirect URLs: add:
   - `http://localhost:8787/api/connections/linkedin/callback`
   - `https://social-command.caimanvinicius.workers.dev/api/connections/linkedin/callback`
5. Copy **Client ID** and **Client Secret** — user will paste these when asked.

- [ ] Install `arctic` (OAuth helper, works in Workers): `npm install arctic`
- [ ] Write migration `0004_linkedin_and_scheduling.sql` (content above)
- [ ] `npm run db:migrate:local`
- [ ] Add to `Env` interface in `src/worker/index.ts`:
```ts
LINKEDIN_CLIENT_ID: string;
LINKEDIN_CLIENT_SECRET: string;
LINKEDIN_REDIRECT_URL: string;
APP_ORIGIN: string;                       // e.g. "https://social-command.caimanvinicius.workers.dev"
PUBLISH_QUEUE: Queue<PublishJob>;         // defined below
```
- [ ] Extend `[vars]` in `wrangler.toml`:
```toml
LINKEDIN_REDIRECT_URL = "https://social-command.caimanvinicius.workers.dev/api/connections/linkedin/callback"
APP_ORIGIN = "https://social-command.caimanvinicius.workers.dev"
```
For local dev, `wrangler dev` reads these same vars but we override at runtime via .dev.vars if needed. (Local callback is hardcoded in the LinkedIn app, the redirect_uri is passed in the OAuth request — we conditionally use the localhost URL when running locally by inspecting `URL(c.req.url).origin` instead of `APP_ORIGIN`. See Task 2.)
- [ ] Append to `.dev.vars.example`:
```
LINKEDIN_CLIENT_ID=your-linkedin-client-id
LINKEDIN_CLIENT_SECRET=your-linkedin-client-secret
```
- [ ] User supplies real values → `.dev.vars` updated
- [ ] Add shared types to `src/shared/types.ts`:
```ts
export interface LinkedInConnection {
  memberId: string;
  memberName: string;
  expiresAt: number;
  scopes: string[];
}
export interface LinkedInOrg {
  id: string;
  orgUrn: string;
  orgName: string;
  orgLogoUrl: string | null;
}
export type LinkedInTargetRef = string | null;  // null = self, or urn:li:organization:123

export interface SchedulePostTargetRequest {
  scheduledAt: number | null;    // epoch ms; null clears schedule (sets pending)
  targetRef?: LinkedInTargetRef; // only for LinkedIn
}

export interface PublishNowRequest {
  network: Network;
  targetRef?: LinkedInTargetRef;
}

export interface PublishJob {
  postId: string;
  targetId: string;
  network: Network;
  attempt: number;
}
```
- [ ] Commit: `feat(week4): LinkedIn schema, env, types`

---

## Task 2: OAuth flow (connect + callback)

**Files:**
- Create: `src/worker/routes/connections.ts`
- Modify: `src/worker/db/queries.ts` (add LinkedIn queries)
- Modify: `src/worker/index.ts` (mount /api/connections)

**Library choice:** Use `arctic` for the OAuth URL construction + token exchange. It supports LinkedIn natively and works in Workers.

- [ ] Append to `src/worker/db/queries.ts`:
```ts
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
```

- [ ] Create `src/worker/integrations/linkedin.ts` (token refresh, fetch member info, fetch orgs):
```ts
const LINKEDIN_API = "https://api.linkedin.com";

export interface LinkedInMemberInfo {
  sub: string;    // urn:li:person:... — LinkedIn uses "sub" as member id in OIDC
  name: string;
}

export async function fetchMemberInfo(accessToken: string): Promise<LinkedInMemberInfo> {
  const res = await fetch(`${LINKEDIN_API}/v2/userinfo`, {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`linkedin_userinfo_${res.status}`);
  const data = await res.json() as { sub: string; name: string };
  return { sub: data.sub, name: data.name };
}

export interface LinkedInOrgItem { urn: string; name: string; logoUrl: string | null; }

export async function fetchAdminOrgs(accessToken: string): Promise<LinkedInOrgItem[]> {
  // Step 1: list ACLs where user is an admin
  const aclsRes = await fetch(
    `${LINKEDIN_API}/v2/organizationalEntityAcls?q=roleAssignee&role=ADMINISTRATOR&projection=(elements*(organizationalTarget~(id,localizedName,logoV2(original~:playableStreams))))`,
    { headers: { authorization: `Bearer ${accessToken}`, "X-Restli-Protocol-Version": "2.0.0" } }
  );
  if (!aclsRes.ok) {
    // Permission may be missing — return empty list rather than erroring
    return [];
  }
  const body = await aclsRes.json() as {
    elements?: Array<{
      "organizationalTarget~"?: {
        id: number;
        localizedName: string;
        logoV2?: { "original~"?: { elements?: Array<{ identifiers?: Array<{ identifier: string }> }> } };
      };
    }>;
  };
  const out: LinkedInOrgItem[] = [];
  for (const el of body.elements ?? []) {
    const org = el["organizationalTarget~"];
    if (!org) continue;
    const logo = org.logoV2?.["original~"]?.elements?.[0]?.identifiers?.[0]?.identifier ?? null;
    out.push({
      urn: `urn:li:organization:${org.id}`,
      name: org.localizedName,
      logoUrl: logo,
    });
  }
  return out;
}
```

- [ ] Create `src/worker/routes/connections.ts`:
```ts
import { Hono } from "hono";
import { LinkedIn } from "arctic";
import type { Env } from "../index";
import { requireAuth } from "../middleware/requireAuth";
import {
  saveOauthState, consumeOauthState,
  upsertLinkedInConnection, replaceLinkedInOrgs,
  getLinkedInConnection, listLinkedInOrgs, deleteLinkedInConnection,
} from "../db/queries";
import { fetchMemberInfo, fetchAdminOrgs } from "../integrations/linkedin";

export const connections = new Hono<{ Bindings: Env; Variables: { userId: string } }>();

const SCOPES = ["openid", "profile", "email", "w_member_social", "w_organization_social", "r_organization_social", "rw_organization_admin"];

function linkedInClient(env: Env, redirectUrl: string) {
  return new LinkedIn(env.LINKEDIN_CLIENT_ID, env.LINKEDIN_CLIENT_SECRET, redirectUrl);
}

function redirectUrl(c: { env: Env; req: { url: string } }) {
  // Prefer explicit env; fallback to request origin (useful in local dev)
  if (c.env.LINKEDIN_REDIRECT_URL) return c.env.LINKEDIN_REDIRECT_URL;
  return new URL("/api/connections/linkedin/callback", c.req.url).toString();
}

// Start OAuth
connections.get("/linkedin/start", requireAuth, async (c) => {
  const userId = c.get("userId");
  const state = crypto.randomUUID();
  await saveOauthState(c.env.DB, { state, userId, network: "linkedin", redirectTo: "/settings" });
  const li = linkedInClient(c.env, redirectUrl(c));
  const url = await li.createAuthorizationURL(state, SCOPES);
  return c.redirect(url.toString());
});

// Callback (no auth middleware — user is landing from LinkedIn)
connections.get("/linkedin/callback", async (c) => {
  const code = c.req.query("code");
  const state = c.req.query("state");
  if (!code || !state) return c.text("missing_params", 400);

  const ctx = await consumeOauthState(c.env.DB, state);
  if (!ctx || ctx.network !== "linkedin") return c.text("invalid_state", 400);

  const li = linkedInClient(c.env, redirectUrl(c));
  let tokens;
  try { tokens = await li.validateAuthorizationCode(code); }
  catch { return c.text("token_exchange_failed", 400); }

  const accessToken = tokens.accessToken();
  const expiresAtDate = tokens.accessTokenExpiresAt();
  const refreshToken = tokens.hasRefreshToken() ? tokens.refreshToken() : null;

  // Fetch member info
  const me = await fetchMemberInfo(accessToken);

  // Upsert connection
  const connId = `lic_${ctx.userId}`;
  await upsertLinkedInConnection(c.env.DB, {
    id: connId,
    userId: ctx.userId,
    memberId: `urn:li:person:${me.sub}`,
    memberName: me.name,
    accessToken,
    refreshToken,
    expiresAt: expiresAtDate.getTime(),
    scopes: SCOPES.join(" "),
  });

  // Fetch and cache admin orgs
  const orgs = await fetchAdminOrgs(accessToken);
  await replaceLinkedInOrgs(c.env.DB, connId, orgs.map((o) => ({
    orgUrn: o.urn, orgName: o.name, orgLogoUrl: o.logoUrl,
  })));

  const redirectTo = ctx.redirectTo || "/";
  return c.redirect(redirectTo);
});

connections.use("*", requireAuth);

connections.get("/linkedin", async (c) => {
  const userId = c.get("userId");
  const conn = await getLinkedInConnection(c.env.DB, userId);
  if (!conn) return c.json({ connected: false });
  const orgs = await listLinkedInOrgs(c.env.DB, conn.id);
  return c.json({
    connected: true,
    member: { memberId: conn.linkedin_member_id, memberName: conn.linkedin_member_name, expiresAt: conn.expires_at, scopes: conn.scopes.split(" ") },
    orgs: orgs.map((o) => ({ id: o.id, orgUrn: o.org_urn, orgName: o.org_name, orgLogoUrl: o.org_logo_url })),
  });
});

connections.post("/linkedin/refresh-orgs", async (c) => {
  const userId = c.get("userId");
  const conn = await getLinkedInConnection(c.env.DB, userId);
  if (!conn) return c.json({ error: "not_connected" }, 400);
  const orgs = await fetchAdminOrgs(conn.access_token);
  await replaceLinkedInOrgs(c.env.DB, conn.id, orgs.map((o) => ({ orgUrn: o.urn, orgName: o.name, orgLogoUrl: o.logoUrl })));
  return c.json({ ok: true, count: orgs.length });
});

connections.delete("/linkedin", async (c) => {
  const userId = c.get("userId");
  await deleteLinkedInConnection(c.env.DB, userId);
  return c.json({ ok: true });
});
```

- [ ] Mount in `src/worker/index.ts`: `import { connections } from "./routes/connections"; app.route("/api/connections", connections);`

- [ ] Commit: `feat(week4): LinkedIn OAuth connect/callback/status`

---

## Task 3: Settings page + LinkedIn target picker

**Files:**
- Create: `src/web/pages/Settings.tsx`
- Create: `src/web/components/LinkedInTargetPicker.tsx`
- Modify: `src/web/App.tsx` (route `/settings`)
- Modify: `src/web/components/Layout.tsx` (sidebar link)
- Modify: `src/web/lib/api.ts` (connection methods)

- [ ] Append to `api.ts`:
```ts
  getLinkedIn: () => req<{
    connected: boolean;
    member?: { memberId: string; memberName: string; expiresAt: number; scopes: string[] };
    orgs?: Array<{ id: string; orgUrn: string; orgName: string; orgLogoUrl: string | null }>;
  }>("/api/connections/linkedin"),
  refreshLinkedInOrgs: () => json<{ ok: true; count: number }>("/api/connections/linkedin/refresh-orgs", "POST"),
  disconnectLinkedIn: () => json<{ ok: true }>("/api/connections/linkedin", "DELETE"),
```

- [ ] Create `src/web/pages/Settings.tsx`:
```tsx
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";

export function Settings() {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["linkedin"], queryFn: api.getLinkedIn });

  const refresh = useMutation({
    mutationFn: () => api.refreshLinkedInOrgs(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["linkedin"] }),
  });

  const disconnect = useMutation({
    mutationFn: () => api.disconnectLinkedIn(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["linkedin"] }),
  });

  return (
    <div>
      <h1>Conexões</h1>
      <section style={{ background: "#111118", border: "1px solid #1f1f28", borderRadius: 12, padding: 16, maxWidth: 640 }}>
        <h2 style={{ marginTop: 0, fontSize: 16 }}>LinkedIn</h2>
        {!data?.connected && (
          <div>
            <p style={{ color: "#aaa" }}>Não conectado. Clique pra autorizar.</p>
            <a className="btn-primary" href="/api/connections/linkedin/start">Conectar LinkedIn</a>
          </div>
        )}
        {data?.connected && (
          <div>
            <p><strong>{data.member!.memberName}</strong></p>
            <p style={{ color: "#888", fontSize: 12 }}>
              Token expira em {new Date(data.member!.expiresAt).toLocaleDateString("pt-BR")}
            </p>
            <h3 style={{ fontSize: 14, marginTop: 16 }}>Páginas de empresa ({data.orgs?.length ?? 0})</h3>
            {(data.orgs?.length ?? 0) === 0 && (
              <p style={{ color: "#888", fontSize: 13 }}>Nenhuma — você não é admin de nenhuma página. Ou falta o scope `rw_organization_admin` (requer aprovação no app LinkedIn).</p>
            )}
            {data.orgs?.map((o) => (
              <div key={o.id} style={{ display: "flex", gap: 12, alignItems: "center", padding: "6px 0" }}>
                {o.orgLogoUrl && <img src={o.orgLogoUrl} alt="" style={{ width: 28, height: 28, borderRadius: 4 }} />}
                <span>{o.orgName}</span>
                <span style={{ color: "#666", fontSize: 11 }}>{o.orgUrn}</span>
              </div>
            ))}
            <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
              <button className="btn-secondary" onClick={() => refresh.mutate()} disabled={refresh.isPending}>
                {refresh.isPending ? "Atualizando..." : "Atualizar páginas"}
              </button>
              <button className="btn-danger" onClick={() => { if (confirm("Desconectar LinkedIn?")) disconnect.mutate(); }}>
                Desconectar
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
```

- [ ] Create `src/web/components/LinkedInTargetPicker.tsx`:
```tsx
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";

interface Props {
  value: string | null;  // targetRef — null = self, or org URN
  onChange: (ref: string | null) => void;
}

export function LinkedInTargetPicker({ value, onChange }: Props) {
  const { data } = useQuery({ queryKey: ["linkedin"], queryFn: api.getLinkedIn });
  if (!data?.connected) {
    return <span style={{ color: "#ff9d4a", fontSize: 12 }}>Conecte o LinkedIn em Configurações.</span>;
  }
  return (
    <select value={value ?? "self"} onChange={(e) => onChange(e.target.value === "self" ? null : e.target.value)}>
      <option value="self">Perfil ({data.member!.memberName})</option>
      {data.orgs?.map((o) => (
        <option key={o.id} value={o.orgUrn}>Página: {o.orgName}</option>
      ))}
    </select>
  );
}
```

- [ ] Add `/settings` route to `src/web/App.tsx` inside the Layout route block.
- [ ] Add `<NavLink to="/settings">Configurações</NavLink>` to the sidebar in `Layout.tsx`.
- [ ] Build + commit: `feat(week4): settings page with LinkedIn status + target picker`

---

## Task 4: Scheduling UI + schedule API endpoint

**Files:**
- Modify: `src/worker/routes/posts.ts` — extend `PATCH /api/posts/:id/targets/:network` to accept `scheduledAt` and `targetRef`
- Modify: `src/worker/validation.ts` — extend `UpdateTargetSchema`
- Modify: `src/shared/types.ts` — extend `UpdateTargetRequest`
- Modify: `src/web/pages/Editor.tsx` — add per-target schedule+target UI
- Create: `src/web/components/Schedule.tsx` — date-time input

- [ ] Extend `UpdateTargetSchema` in `validation.ts`:
```ts
export const UpdateTargetSchema = z.object({
  bodyOverride: z.string().max(5000).nullable().optional(),
  scheduledAt: z.number().int().nullable().optional(),
  targetRef: z.string().max(256).nullable().optional(),
});
```

- [ ] Extend `UpdateTargetRequest` in `shared/types.ts`:
```ts
export interface UpdateTargetRequest {
  bodyOverride?: string | null;
  scheduledAt?: number | null;
  targetRef?: string | null;
}
```

- [ ] Extend `updateTarget` in `db/queries.ts` to accept `scheduledAt` and `targetRef` (add SET branches). Also auto-update status: when `scheduledAt` is set to a future timestamp, status → `scheduled`; when cleared, status → `pending`.

- [ ] `src/web/components/Schedule.tsx`:
```tsx
interface Props { value: number | null; onChange: (ms: number | null) => void; }

function toLocal(ms: number | null): string {
  if (!ms) return "";
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function fromLocal(s: string): number | null { return s ? new Date(s).getTime() : null; }

export function Schedule({ value, onChange }: Props) {
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
      <input
        type="datetime-local"
        value={toLocal(value)}
        onChange={(e) => onChange(fromLocal(e.target.value))}
        style={{ padding: 6, background: "#111118", color: "#eee", border: "1px solid #2a2a36", borderRadius: 6, fontSize: 13 }}
      />
      {value && (
        <button className="btn-secondary" onClick={() => onChange(null)} style={{ fontSize: 11, padding: "2px 8px" }}>
          Limpar
        </button>
      )}
    </div>
  );
}
```

- [ ] In `Editor.tsx`, extend local state to include `schedules: Record<Network, number | null>` and `targetRefs: Record<Network, string | null>`. Render a small block under each `<NetworkPreview>` with:
  - For LinkedIn only: `<LinkedInTargetPicker value={targetRefs.linkedin} onChange={...} />`
  - `<Schedule value={schedules[n]} onChange={...} />`
- In `saveTargets` mutation, after `setTargets`, iterate selected networks and call `updateTarget(id, n, { bodyOverride, scheduledAt, targetRef })`.
- Hydrate these from `post.targets` on load.

- [ ] Commit: `feat(week4): scheduling UI and per-target LinkedIn picker`

---

## Task 5: Manual publish ("publish now") — LinkedIn

**Files:**
- Create: `src/worker/routes/publish.ts`
- Create: in `src/worker/integrations/linkedin.ts`: `publishUgcPost`, `refreshAccessToken`, `uploadImage`
- Modify: `src/worker/index.ts` (mount /api/publish)
- Modify: `src/web/lib/api.ts` + Editor UI (button "Publicar agora")

- [ ] Extend `src/worker/integrations/linkedin.ts`:
```ts
export async function refreshAccessToken(
  env: { LINKEDIN_CLIENT_ID: string; LINKEDIN_CLIENT_SECRET: string },
  refreshToken: string
): Promise<{ accessToken: string; refreshToken: string | null; expiresAt: number }> {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: env.LINKEDIN_CLIENT_ID,
    client_secret: env.LINKEDIN_CLIENT_SECRET,
  });
  const res = await fetch("https://www.linkedin.com/oauth/v2/accessToken", {
    method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body,
  });
  if (!res.ok) throw new Error(`refresh_failed_${res.status}`);
  const data = await res.json() as { access_token: string; refresh_token?: string; expires_in: number };
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? null,
    expiresAt: Date.now() + data.expires_in * 1000,
  };
}

export async function uploadImageToLinkedIn(
  accessToken: string,
  authorUrn: string,
  imageBytes: ArrayBuffer,
  mimeType: string
): Promise<string> {
  // Step 1: register upload
  const regRes = await fetch("https://api.linkedin.com/v2/assets?action=registerUpload", {
    method: "POST",
    headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json", "X-Restli-Protocol-Version": "2.0.0" },
    body: JSON.stringify({
      registerUploadRequest: {
        recipes: ["urn:li:digitalmediaRecipe:feedshare-image"],
        owner: authorUrn,
        serviceRelationships: [{ relationshipType: "OWNER", identifier: "urn:li:userGeneratedContent" }],
      },
    }),
  });
  if (!regRes.ok) throw new Error(`register_upload_${regRes.status}`);
  const reg = await regRes.json() as {
    value: {
      asset: string;
      uploadMechanism: { ["com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest"]: { uploadUrl: string } };
    };
  };
  const asset = reg.value.asset;
  const uploadUrl = reg.value.uploadMechanism["com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest"].uploadUrl;

  // Step 2: upload bytes
  const upRes = await fetch(uploadUrl, {
    method: "PUT",
    headers: { authorization: `Bearer ${accessToken}`, "content-type": mimeType },
    body: imageBytes,
  });
  if (!upRes.ok) throw new Error(`upload_${upRes.status}`);

  return asset;
}

export interface PublishUgcArgs {
  accessToken: string;
  authorUrn: string;       // person or organization URN
  text: string;
  imageAsset?: string;     // urn:li:digitalmediaAsset:...
}

export async function publishUgcPost(args: PublishUgcArgs): Promise<{ ugcUrn: string }> {
  const media = args.imageAsset
    ? [{ status: "READY", description: { text: "" }, media: args.imageAsset, title: { text: "" } }]
    : [];
  const body = {
    author: args.authorUrn,
    lifecycleState: "PUBLISHED",
    specificContent: {
      "com.linkedin.ugc.ShareContent": {
        shareCommentary: { text: args.text },
        shareMediaCategory: media.length ? "IMAGE" : "NONE",
        ...(media.length ? { media } : {}),
      },
    },
    visibility: { "com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC" },
  };
  const res = await fetch("https://api.linkedin.com/v2/ugcPosts", {
    method: "POST",
    headers: { authorization: `Bearer ${args.accessToken}`, "content-type": "application/json", "X-Restli-Protocol-Version": "2.0.0" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`publish_${res.status}_${t.slice(0, 200)}`);
  }
  const location = res.headers.get("x-restli-id") ?? res.headers.get("location") ?? "";
  return { ugcUrn: location || "unknown" };
}
```

- [ ] Create `src/worker/routes/publish.ts` — POST `/api/publish/:postId/:network`:
```ts
import { Hono } from "hono";
import type { Env } from "../index";
import { requireAuth } from "../middleware/requireAuth";
import {
  getPostById, getMediaById, listTargetsForPost,
  getLinkedInConnection, upsertLinkedInConnection,
} from "../db/queries";
import { NetworkSchema } from "../validation";
import {
  publishUgcPost, uploadImageToLinkedIn, refreshAccessToken,
} from "../integrations/linkedin";

export const publish = new Hono<{ Bindings: Env; Variables: { userId: string } }>();
publish.use("*", requireAuth);

async function ensureFreshLinkedInToken(env: Env, userId: string): Promise<{ accessToken: string; authorUrn: string }> {
  const conn = await getLinkedInConnection(env.DB, userId);
  if (!conn) throw new Error("not_connected");
  let accessToken = conn.access_token;
  if (conn.expires_at - 60_000 < Date.now() && conn.refresh_token) {
    const refreshed = await refreshAccessToken(env, conn.refresh_token);
    accessToken = refreshed.accessToken;
    await upsertLinkedInConnection(env.DB, {
      id: conn.id, userId,
      memberId: conn.linkedin_member_id, memberName: conn.linkedin_member_name,
      accessToken: refreshed.accessToken,
      refreshToken: refreshed.refreshToken ?? conn.refresh_token,
      expiresAt: refreshed.expiresAt,
      scopes: conn.scopes,
    });
  }
  return { accessToken, authorUrn: conn.linkedin_member_id };
}

publish.post("/:postId/:network", async (c) => {
  const userId = c.get("userId");
  const postId = c.req.param("postId");
  const net = NetworkSchema.safeParse(c.req.param("network"));
  if (!net.success) return c.json({ error: "invalid_network" }, 400);

  const post = await getPostById(c.env.DB, userId, postId);
  if (!post) return c.json({ error: "not_found" }, 404);
  const targets = await listTargetsForPost(c.env.DB, postId);
  const target = targets.find((t) => t.network === net.data);
  if (!target) return c.json({ error: "target_not_selected" }, 400);

  if (net.data !== "linkedin") return c.json({ error: "network_not_supported_yet" }, 501);

  try {
    const { accessToken, authorUrn } = await ensureFreshLinkedInToken(c.env, userId);
    const finalAuthor = target.body_override || target.target_ref ? (target.target_ref ?? authorUrn) : authorUrn;
    const text = target.body_override ?? post.body;

    let imageAsset: string | undefined;
    if (post.media_id) {
      const media = await getMediaById(c.env.DB, userId, post.media_id);
      if (media && media.mime_type.startsWith("image/")) {
        const obj = await c.env.MEDIA.get(media.r2_key);
        if (obj) {
          const bytes = await obj.arrayBuffer();
          imageAsset = await uploadImageToLinkedIn(accessToken, finalAuthor, bytes, media.mime_type);
        }
      }
    }

    const result = await publishUgcPost({ accessToken, authorUrn: finalAuthor, text, imageAsset });

    // Mark target published
    await c.env.DB.prepare(
      "UPDATE post_targets SET status = 'published', external_id = ?, published_at = ? WHERE id = ?"
    ).bind(result.ugcUrn, Date.now(), target.id).run();
    await c.env.DB.prepare("UPDATE posts SET status = 'published', updated_at = ? WHERE id = ?")
      .bind(Date.now(), postId).run();

    return c.json({ ok: true, ugcUrn: result.ugcUrn });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown";
    await c.env.DB.prepare(
      "UPDATE post_targets SET status = 'failed', last_error = ?, attempts = attempts + 1 WHERE id = ?"
    ).bind(msg, target.id).run();
    return c.json({ error: "publish_failed", detail: msg }, 502);
  }
});
```

- [ ] Mount: `app.route("/api/publish", publish)`.

- [ ] Add API client method + button in Editor: "Publicar agora" (per selected network).

- [ ] Commit: `feat(week4): manual publish to LinkedIn (profile and org pages)`

---

## Task 6: Cron Trigger + Queue + scheduled publishing

**Files:**
- Modify: `wrangler.toml` (cron + queue binding)
- Create: `src/worker/scheduler/cron.ts`
- Create: `src/worker/scheduler/queue-consumer.ts`
- Modify: `src/worker/index.ts` — add `scheduled(event)` handler + `queue(batch)` handler; extract `publishOnce(env, postId, targetId)` so both manual and scheduled use the same code path

- [ ] Create Queue:
```bash
npx wrangler queues create publish-jobs
```

- [ ] Extend `wrangler.toml`:
```toml
[triggers]
crons = ["*/1 * * * *"]   # every minute

[[queues.producers]]
binding = "PUBLISH_QUEUE"
queue = "publish-jobs"

[[queues.consumers]]
queue = "publish-jobs"
max_batch_size = 10
max_batch_timeout = 5
max_retries = 3
dead_letter_queue = "publish-jobs-dlq"
```

Also create the DLQ: `npx wrangler queues create publish-jobs-dlq`.

- [ ] Refactor `src/worker/index.ts` to export a default object with `fetch`, `scheduled`, `queue` handlers:
```ts
export default {
  fetch: app.fetch,
  scheduled: (async (event: ScheduledEvent, env: Env, ctx: ExecutionContext) => {
    const { scanAndEnqueue } = await import("./scheduler/cron");
    ctx.waitUntil(scanAndEnqueue(env));
  }) satisfies ExportedHandlerScheduledHandler<Env>,
  queue: (async (batch: MessageBatch<PublishJob>, env: Env) => {
    const { handlePublishBatch } = await import("./scheduler/queue-consumer");
    await handlePublishBatch(batch, env);
  }) satisfies ExportedHandlerQueueHandler<Env, PublishJob>,
};
```

- [ ] `src/worker/scheduler/cron.ts`:
```ts
import type { Env } from "../index";
import type { PublishJob } from "../../shared/types";

export async function scanAndEnqueue(env: Env): Promise<void> {
  const now = Date.now();
  const { results } = await env.DB.prepare(
    `SELECT t.id AS target_id, t.post_id, t.network, t.attempts, p.user_id
     FROM post_targets t
     JOIN posts p ON p.id = t.post_id
     WHERE t.status = 'scheduled' AND t.scheduled_at <= ?
     LIMIT 100`
  ).bind(now).all<{ target_id: string; post_id: string; network: string; attempts: number; user_id: string }>();

  for (const row of results ?? []) {
    await env.DB.prepare("UPDATE post_targets SET status = 'publishing' WHERE id = ?").bind(row.target_id).run();
    const msg: PublishJob = {
      postId: row.post_id,
      targetId: row.target_id,
      network: row.network as PublishJob["network"],
      attempt: row.attempts,
    };
    await env.PUBLISH_QUEUE.send(msg);
  }
}
```

- [ ] `src/worker/scheduler/queue-consumer.ts`:
```ts
import type { Env } from "../index";
import type { PublishJob } from "../../shared/types";
import { publishOnce } from "../publishOnce";

export async function handlePublishBatch(
  batch: MessageBatch<PublishJob>,
  env: Env
): Promise<void> {
  for (const msg of batch.messages) {
    try {
      await publishOnce(env, msg.body.postId, msg.body.targetId);
      msg.ack();
    } catch (e) {
      const err = e instanceof Error ? e.message : "unknown";
      // On final retry, set status failed
      if (msg.attempts >= 3) {
        await env.DB.prepare(
          "UPDATE post_targets SET status = 'failed', last_error = ?, attempts = ? WHERE id = ?"
        ).bind(err, msg.attempts, msg.body.targetId).run();
        msg.ack();  // stop retrying
      } else {
        await env.DB.prepare(
          "UPDATE post_targets SET last_error = ?, attempts = attempts + 1 WHERE id = ?"
        ).bind(err, msg.body.targetId).run();
        msg.retry({ delaySeconds: Math.min(300, 30 * Math.pow(2, msg.attempts)) });
      }
    }
  }
}
```

- [ ] Extract `publishOnce(env, postId, targetId)` into `src/worker/publishOnce.ts` — same logic as the manual publish handler but not Hono-scoped. Both `routes/publish.ts` and `scheduler/queue-consumer.ts` call it. Returns `{ ugcUrn }` on success, throws on error.

- [ ] Commit: `feat(week4): cron + queue + scheduled publishing`

---

## Task 7: Tests for scheduler + queue (mocked LinkedIn)

**Files:**
- Create: `tests/worker/scheduler.test.ts`
- Create: `tests/worker/routes-publish.test.ts`

- [ ] `routes-publish.test.ts` — mock `publishOnce` or mock `publishUgcPost`, test:
  - 401 without auth
  - 400 invalid network
  - 404 post not found
  - 400 target not selected for the network
  - 200 success marks target published + records external_id
  - 502 on LinkedIn error marks target failed

- [ ] `scheduler.test.ts` — test `scanAndEnqueue`:
  - Inserts a post + target with `scheduled_at = past`
  - Mocks `env.PUBLISH_QUEUE.send` to capture calls
  - Asserts: target status became `publishing`, queue received message with correct postId/targetId/network

- [ ] Run full test suite — expect ~46 tests pass (36 prior + 10 new).

- [ ] Commit: `test(week4): scheduler and publish route tests`

---

## Task 8: Deploy

- [ ] Apply migration: `yes | npx wrangler d1 migrations apply social_command --remote`
- [ ] Create remote queue: `npx wrangler queues create publish-jobs` + DLQ
- [ ] Upload LinkedIn secrets:
```
grep '^LINKEDIN_CLIENT_ID=' .dev.vars | cut -d= -f2- | npx wrangler secret put LINKEDIN_CLIENT_ID
grep '^LINKEDIN_CLIENT_SECRET=' .dev.vars | cut -d= -f2- | npx wrangler secret put LINKEDIN_CLIENT_SECRET
```
- [ ] Verify secrets list includes LINKEDIN_CLIENT_ID, LINKEDIN_CLIENT_SECRET alongside previous.
- [ ] `npm run deploy`
- [ ] Manual end-to-end:
  1. Open `/settings`, click "Conectar LinkedIn" → LinkedIn consent → redirect back → profile shown
  2. Create a post with only LinkedIn selected, save
  3. Click "Publicar agora" → check real LinkedIn feed
  4. Create another post, schedule for `now + 2min` → wait → verify status → `published` and visible on LinkedIn
  5. Disconnect LinkedIn from Settings → reconnect
- [ ] Commit + tag + push:
```
git add -A
git commit --allow-empty -m "chore: week 4 deployed"
git tag week-4-done
git push origin main --tags
```

---

## Verification checklist (end of Week 4)

- [ ] `npx tsc -b` clean
- [ ] `npm test` — all tests pass
- [ ] `/settings` shows LinkedIn connection state + orgs list
- [ ] OAuth roundtrip works locally AND in production (redirect URLs both registered in LinkedIn app)
- [ ] Manual publish puts a post on a real LinkedIn profile
- [ ] Manual publish to an org page works (if user is admin)
- [ ] Scheduled publish via cron+queue works — `scheduled_at` ≤ now → `status=published` within ~1-2min
- [ ] Failed publish: status=failed, last_error populated
- [ ] Retries on transient failure: attempts increment, final failure after 3 tries
- [ ] Token refresh: if expires_at is past, next publish refreshes before calling API

---

## Known limitations

- **Video not supported yet** — LinkedIn UGC API supports video (recipe `feedshare-video`) but with a different multipart upload flow. Add in Week 5.
- **No unpublish** — clicking delete on a `published` post only deletes it locally, not from LinkedIn.
- **Single LinkedIn account** — one connection per user; can't have two personal accounts.
- **Marketing Developer Platform approval** — for org posting, LinkedIn requires you to apply for MDP access. Without it, the `r_organization_social` + `w_organization_social` scopes may return a limited response. User sees empty orgs list until approved.
- **No analytics** — we don't read back engagement. Week 6+.
- **Token encryption at rest** — tokens stored in plaintext in D1. Fine for single-user. Add AES-GCM encryption before multi-tenant.
