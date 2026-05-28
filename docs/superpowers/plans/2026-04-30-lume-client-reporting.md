# Lume Client Reporting — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add shareable client report pages — authenticated users generate a public URL from their analytics data; clients open it without logging in.

**Architecture:** Report data is snapshotted at creation time into a D1 TEXT column (JSON). A public `GET /api/reports/public/:token` endpoint returns the snapshot without auth. The SPA serves a standalone `/r/:token` page (no sidebar, no auth check) that fetches from this endpoint. All existing analytics query functions are reused.

**Tech Stack:** Cloudflare Workers, Hono, D1 (SQLite), React 18, react-router-dom, @tanstack/react-query, Recharts (already installed), TypeScript, Vitest + @cloudflare/vitest-pool-workers.

**Spec:** `docs/superpowers/specs/2026-04-30-lume-client-reporting.md`

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `migrations/0010_reports.sql` | Create | `reports` table + indexes |
| `src/worker/db/queries.ts` | Modify | Add 5 report query functions |
| `src/worker/routes/reports.ts` | Create | Auth-guarded list/create/delete routes |
| `src/worker/index.ts` | Modify | Register public token route + reports router |
| `src/shared/types.ts` | Modify | `Report`, `ReportSnapshot`, `CreateReportRequest` |
| `src/web/lib/api.ts` | Modify | `api.listReports`, `api.createReport`, `api.deleteReport`, `api.getPublicReport` |
| `src/web/pages/Reports.tsx` | Create | Reports management page (list + new modal) |
| `src/web/pages/PublicReport.tsx` | Create | Standalone public report view |
| `src/web/App.tsx` | Modify | Add `/reports` (inside Layout) + `/r/:token` (outside) |
| `src/web/components/Layout.tsx` | Modify | Add Reports nav item |
| `src/web/pages/Analytics.tsx` | Modify | Add "Compartilhar" button that opens report modal |
| `tests/worker/routes-reports.test.ts` | Create | API route tests |

---

## Task 1: Migration

**Files:**
- Create: `migrations/0010_reports.sql`

- [ ] **Step 1: Write the migration**

```sql
-- migrations/0010_reports.sql
CREATE TABLE IF NOT EXISTS reports (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title       TEXT,
  period_days INTEGER NOT NULL DEFAULT 30,
  token       TEXT NOT NULL UNIQUE,
  snapshot    TEXT NOT NULL,
  created_at  INTEGER NOT NULL,
  expires_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_reports_user  ON reports(user_id);
CREATE INDEX IF NOT EXISTS idx_reports_token ON reports(token);
```

- [ ] **Step 2: Apply locally**

```bash
cd "/Users/caimanoliveira/Marketing agency"
npm run db:migrate:local
```

Expected: `0010_reports.sql ✅`

- [ ] **Step 3: Commit**

```bash
git add migrations/0010_reports.sql
git commit -m "feat(reports): add reports table migration"
```

---

## Task 2: Shared Types

**Files:**
- Modify: `src/shared/types.ts` (append to end)

- [ ] **Step 1: Add types**

Append to the bottom of `src/shared/types.ts`:

```ts
export interface ReportSnapshot {
  generatedAt: number;
  periodDays: number;
  accountNames: string[];
  summary: AnalyticsSummary;
  topPosts: TopPostItem[];
}

export interface Report {
  id: string;
  title: string | null;
  periodDays: number;
  token: string;
  createdAt: number;
  expiresAt: number;
  shareUrl: string;
}

export interface CreateReportRequest {
  title?: string;
  periodDays: 7 | 30 | 90;
}
```

- [ ] **Step 2: Typecheck**

```bash
cd "/Users/caimanoliveira/Marketing agency"
npm run typecheck 2>&1 | grep -v "cloudflare:test\|create-user\|Cannot find module"
```

Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add src/shared/types.ts
git commit -m "feat(reports): add Report, ReportSnapshot, CreateReportRequest types"
```

---

## Task 3: DB Query Functions

**Files:**
- Modify: `src/worker/db/queries.ts` (append to end)

- [ ] **Step 1: Add the ReportRow interface and 5 query functions**

Append to the bottom of `src/worker/db/queries.ts`:

```ts
// ---- Reports ----

export interface ReportRow {
  id: string;
  user_id: string;
  title: string | null;
  period_days: number;
  token: string;
  snapshot: string;
  created_at: number;
  expires_at: number;
}

export async function createReport(
  db: D1Database,
  params: { id: string; userId: string; title: string | null; periodDays: number; token: string; snapshot: string; expiresAt: number }
): Promise<void> {
  const now = Date.now();
  await db.prepare(
    `INSERT INTO reports (id, user_id, title, period_days, token, snapshot, created_at, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(params.id, params.userId, params.title, params.periodDays, params.token, params.snapshot, now, params.expiresAt).run();
}

export async function listReports(db: D1Database, userId: string): Promise<ReportRow[]> {
  const { results } = await db.prepare(
    "SELECT * FROM reports WHERE user_id = ? ORDER BY created_at DESC"
  ).bind(userId).all<ReportRow>();
  return results ?? [];
}

export async function getReportByToken(db: D1Database, token: string): Promise<ReportRow | null> {
  return (await db.prepare(
    "SELECT * FROM reports WHERE token = ? AND expires_at > ?"
  ).bind(token, Date.now()).first<ReportRow>()) ?? null;
}

export async function getReportById(db: D1Database, userId: string, id: string): Promise<ReportRow | null> {
  return (await db.prepare(
    "SELECT * FROM reports WHERE id = ? AND user_id = ?"
  ).bind(id, userId).first<ReportRow>()) ?? null;
}

export async function deleteReport(db: D1Database, userId: string, id: string): Promise<boolean> {
  const res = await db.prepare("DELETE FROM reports WHERE id = ? AND user_id = ?").bind(id, userId).run();
  return res.meta.changes > 0;
}
```

- [ ] **Step 2: Typecheck**

```bash
cd "/Users/caimanoliveira/Marketing agency"
npm run typecheck 2>&1 | grep -v "cloudflare:test\|create-user\|Cannot find module"
```

Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add src/worker/db/queries.ts
git commit -m "feat(reports): add report DB query functions"
```

---

## Task 4: Backend Routes + Tests

**Files:**
- Create: `src/worker/routes/reports.ts`
- Create: `tests/worker/routes-reports.test.ts`

### Step 1: Write failing tests

- [ ] **Write `tests/worker/routes-reports.test.ts`**

```ts
import { SELF } from "cloudflare:test";
import { describe, it, expect, beforeAll } from "vitest";
import { env } from "cloudflare:test";

const EMAIL = "test@lume.io";
const PASSWORD = "hunter2";

async function login(): Promise<string> {
  const res = await SELF.fetch("http://x/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  const setCookie = res.headers.get("set-cookie") ?? "";
  const match = setCookie.match(/session=([^;]+)/);
  return match ? `session=${match[1]}` : "";
}

async function authed(cookie: string, path: string, init?: RequestInit) {
  return SELF.fetch(`http://x${path}`, {
    ...init,
    headers: { cookie, ...(init?.headers ?? {}) },
  });
}

describe("POST /api/reports", () => {
  let cookie = "";

  beforeAll(async () => {
    // Seed user
    const { hashPassword } = await import("../src/worker/auth");
    const hash = await hashPassword(PASSWORD);
    await env.DB.prepare("INSERT OR IGNORE INTO users (id, email, password_hash, created_at) VALUES (?, ?, ?, ?)")
      .bind("u_test", EMAIL, hash, Date.now()).run();
    cookie = await login();
  });

  it("creates a report and returns shareUrl", async () => {
    const res = await authed(cookie, "/api/reports", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ periodDays: 30, title: "April Report" }),
    });
    expect(res.status).toBe(201);
    const body = await res.json() as { report: { id: string; token: string; shareUrl: string } };
    expect(body.report.shareUrl).toMatch(/\/r\//);
  });

  it("lists created reports", async () => {
    const res = await authed(cookie, "/api/reports");
    expect(res.status).toBe(200);
    const body = await res.json() as { reports: unknown[] };
    expect(body.reports.length).toBeGreaterThan(0);
  });

  it("public token route returns snapshot without auth", async () => {
    const createRes = await authed(cookie, "/api/reports", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ periodDays: 7 }),
    });
    const { report } = await createRes.json() as { report: { token: string } };
    const pubRes = await SELF.fetch(`http://x/api/reports/public/${report.token}`);
    expect(pubRes.status).toBe(200);
    const data = await pubRes.json() as { snapshot: { periodDays: number } };
    expect(data.snapshot.periodDays).toBe(7);
  });

  it("deletes a report", async () => {
    const createRes = await authed(cookie, "/api/reports", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ periodDays: 30 }),
    });
    const { report } = await createRes.json() as { report: { id: string } };
    const delRes = await authed(cookie, `/api/reports/${report.id}`, { method: "DELETE" });
    expect(delRes.status).toBe(200);
  });

  it("returns 404 for expired or unknown token", async () => {
    const res = await SELF.fetch("http://x/api/reports/public/nonexistent-token-xyz");
    expect(res.status).toBe(404);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd "/Users/caimanoliveira/Marketing agency"
npx vitest run tests/worker/routes-reports.test.ts 2>&1 | tail -20
```

Expected: FAIL — routes don't exist yet.

### Step 2: Implement the routes

- [ ] **Create `src/worker/routes/reports.ts`**

```ts
import { Hono } from "hono";
import { z } from "zod";
import type { Env } from "../index";
import { requireAuth } from "../middleware/requireAuth";
import {
  createReport, listReports, getReportByToken, getReportById, deleteReport,
  summaryForPeriod, topPosts, getLinkedInConnection, getMetaConnection, listInstagramAccounts,
} from "../db/queries";
import type { ReportSnapshot, Report } from "../../shared/types";
import { randomId } from "../utils/id";

export const reports = new Hono<{ Bindings: Env; Variables: { userId: string } }>();

const CreateReportSchema = z.object({
  title: z.string().max(120).optional(),
  periodDays: z.union([z.literal(7), z.literal(30), z.literal(90)]),
});

const REPORT_TTL_MS = 90 * 24 * 3600 * 1000;

function reportToPublic(row: { id: string; title: string | null; period_days: number; token: string; created_at: number; expires_at: number }, origin: string): Report {
  return {
    id: row.id,
    title: row.title,
    periodDays: row.period_days,
    token: row.token,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    shareUrl: `${origin}/r/${row.token}`,
  };
}

async function buildAccountNames(env: Env, userId: string): Promise<string[]> {
  const names: string[] = [];
  const liConn = await getLinkedInConnection(env.DB, userId);
  if (liConn) names.push(liConn.linkedin_member_name);
  const metaConn = await getMetaConnection(env.DB, userId);
  if (metaConn) {
    const accts = await listInstagramAccounts(env.DB, metaConn.id);
    for (const a of accts) names.push(`@${a.ig_username}`);
  }
  return names;
}

// Public route — no auth — registered separately in index.ts
export const publicReports = new Hono<{ Bindings: Env }>();

publicReports.get("/:token", async (c) => {
  const token = c.req.param("token");
  const row = await getReportByToken(c.env.DB, token);
  if (!row) return c.json({ error: "not_found" }, 404);
  const snapshot = JSON.parse(row.snapshot) as ReportSnapshot;
  return c.json({ snapshot, title: row.title, periodDays: row.period_days, createdAt: row.created_at });
});

// Auth-guarded routes
reports.use("*", requireAuth);

reports.get("/", async (c) => {
  const userId = c.get("userId");
  const rows = await listReports(c.env.DB, userId);
  const origin = c.env.APP_ORIGIN;
  return c.json({ reports: rows.map((r) => reportToPublic(r, origin)) });
});

reports.post("/", async (c) => {
  const userId = c.get("userId");
  let parsed;
  try {
    parsed = CreateReportSchema.parse(await c.req.json());
  } catch {
    return c.json({ error: "invalid_request" }, 400);
  }

  const [summary, posts, accountNames] = await Promise.all([
    summaryForPeriod(c.env.DB, userId, parsed.periodDays),
    topPosts(c.env.DB, userId, { limit: 5, by: "likes" }),
    buildAccountNames(c.env, userId),
  ]);

  const snapshot: ReportSnapshot = {
    generatedAt: Date.now(),
    periodDays: parsed.periodDays,
    accountNames,
    summary,
    topPosts: posts,
  };

  const id = randomId("rpt");
  const token = randomId("tok");
  const expiresAt = Date.now() + REPORT_TTL_MS;

  await createReport(c.env.DB, {
    id,
    userId,
    title: parsed.title ?? null,
    periodDays: parsed.periodDays,
    token,
    snapshot: JSON.stringify(snapshot),
    expiresAt,
  });

  const report = reportToPublic({ id, title: parsed.title ?? null, period_days: parsed.periodDays, token, created_at: Date.now(), expires_at: expiresAt }, c.env.APP_ORIGIN);
  return c.json({ report }, 201);
});

reports.delete("/:id", async (c) => {
  const userId = c.get("userId");
  const ok = await deleteReport(c.env.DB, userId, c.req.param("id"));
  if (!ok) return c.json({ error: "not_found" }, 404);
  return c.json({ ok: true });
});
```

- [ ] **Step 3: Export `listInstagramAccounts` from db/queries.ts if not already**

Check: `grep -n "export.*listInstagramAccounts" src/worker/db/queries.ts`

If not exported, find the function and add `export`. It should already be exported (used in connections.ts).

- [ ] **Step 4: Register routes in `src/worker/index.ts`**

Add imports at the top of `src/worker/index.ts`:

```ts
import { reports, publicReports } from "./routes/reports";
```

Add these two lines **before** `app.all("/api/*", ...)`:

```ts
app.route("/api/reports/public", publicReports);   // must be before reports (no auth)
app.route("/api/reports", reports);
```

The full route registration block should look like:

```ts
app.route("/api/health", health);
app.route("/api/auth", auth);
app.route("/api/media", media);
app.route("/api/posts", posts);
app.route("/api/ai", ai);
app.route("/api/connections", connections);
app.route("/api/publish", publish);
app.route("/api/analytics", analytics);
app.route("/api/competitors", competitors);
app.route("/api/strategy", strategy);
app.route("/api/reports/public", publicReports);
app.route("/api/reports", reports);

app.all("/api/*", (c) => c.json({ error: "not_found" }, 404));
app.all("*", (c) => c.env.ASSETS.fetch(c.req.raw));
```

- [ ] **Step 5: Typecheck**

```bash
cd "/Users/caimanoliveira/Marketing agency"
npm run typecheck 2>&1 | grep -v "cloudflare:test\|create-user\|Cannot find module"
```

Expected: no new errors.

- [ ] **Step 6: Run tests**

```bash
cd "/Users/caimanoliveira/Marketing agency"
npx vitest run tests/worker/routes-reports.test.ts 2>&1 | tail -25
```

Expected: all 5 tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/worker/routes/reports.ts src/worker/index.ts tests/worker/routes-reports.test.ts
git commit -m "feat(reports): add report API routes (list, create, delete, public token)"
```

---

## Task 5: API Client

**Files:**
- Modify: `src/web/lib/api.ts`

- [ ] **Step 1: Add Report import and api methods**

Add `Report, CreateReportRequest` to the import from `../../shared/types` at the top of `api.ts`:

```ts
import type {
  // ... existing imports ...
  Report,
  CreateReportRequest,
} from "../../shared/types";
```

Then add these methods to the `api` object (before the closing `}`):

```ts
  listReports: () => req<{ reports: Report[] }>("/api/reports"),
  createReport: (body: CreateReportRequest) =>
    json<{ report: Report }>("/api/reports", "POST", body),
  deleteReport: (id: string) => json<{ ok: true }>(`/api/reports/${id}`, "DELETE"),
  getPublicReport: (token: string) =>
    fetch(`/api/reports/public/${token}`).then(async (res) => {
      if (!res.ok) throw new Error(`${res.status}`);
      return res.json() as Promise<{
        snapshot: import("../../shared/types").ReportSnapshot;
        title: string | null;
        periodDays: number;
        createdAt: number;
      }>;
    }),
```

- [ ] **Step 2: Typecheck**

```bash
cd "/Users/caimanoliveira/Marketing agency"
npm run typecheck 2>&1 | grep -v "cloudflare:test\|create-user\|Cannot find module"
```

Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add src/web/lib/api.ts
git commit -m "feat(reports): add report API client methods"
```

---

## Task 6: Reports Management Page

**Files:**
- Create: `src/web/pages/Reports.tsx`

- [ ] **Step 1: Create the page**

```tsx
// src/web/pages/Reports.tsx
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import type { Report, CreateReportRequest } from "../../shared/types";
import { Button } from "../ui/Button";

function formatDate(ms: number) {
  return new Date(ms).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" });
}

function NewReportModal({ onClose }: { onClose: () => void }) {
  const [title, setTitle] = useState("");
  const [periodDays, setPeriodDays] = useState<7 | 30 | 90>(30);
  const qc = useQueryClient();
  const mut = useMutation({
    mutationFn: (body: CreateReportRequest) => api.createReport(body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["reports"] }); onClose(); },
  });

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}>
      <div style={{ background: "var(--lume-surface)", borderRadius: "var(--lume-radius-lg)", padding: 32, width: 400, maxWidth: "calc(100vw - 32px)" }}>
        <h2 style={{ margin: "0 0 20px", color: "var(--lume-text)", fontSize: "var(--lume-text-xl)", fontWeight: 700 }}>
          Novo Relatório
        </h2>

        <label style={{ display: "block", marginBottom: 16 }}>
          <div style={{ fontSize: "var(--lume-text-sm)", fontWeight: 600, color: "var(--lume-text-muted)", marginBottom: 6 }}>
            Título (opcional)
          </div>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Ex: Relatório Abril 2026"
            style={{ width: "100%", padding: "8px 12px", border: "1px solid var(--lume-border)", borderRadius: "var(--lume-radius-md)", fontSize: "var(--lume-text-base)", boxSizing: "border-box", color: "var(--lume-text)", background: "var(--lume-surface)" }}
          />
        </label>

        <label style={{ display: "block", marginBottom: 24 }}>
          <div style={{ fontSize: "var(--lume-text-sm)", fontWeight: 600, color: "var(--lume-text-muted)", marginBottom: 6 }}>
            Período
          </div>
          <select
            value={periodDays}
            onChange={(e) => setPeriodDays(Number(e.target.value) as 7 | 30 | 90)}
            style={{ width: "100%", padding: "8px 12px", border: "1px solid var(--lume-border)", borderRadius: "var(--lume-radius-md)", fontSize: "var(--lume-text-base)", color: "var(--lume-text)", background: "var(--lume-surface)" }}
          >
            <option value={7}>Últimos 7 dias</option>
            <option value={30}>Últimos 30 dias</option>
            <option value={90}>Últimos 90 dias</option>
          </select>
        </label>

        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <Button variant="ghost" onClick={onClose} disabled={mut.isPending}>Cancelar</Button>
          <Button
            variant="primary"
            onClick={() => mut.mutate({ title: title.trim() || undefined, periodDays })}
            disabled={mut.isPending}
          >
            {mut.isPending ? "Gerando..." : "Gerar Relatório"}
          </Button>
        </div>

        {mut.isError && (
          <p style={{ color: "var(--lume-danger)", marginTop: 12, fontSize: "var(--lume-text-sm)" }}>
            Erro ao gerar relatório. Tente novamente.
          </p>
        )}
      </div>
    </div>
  );
}

function ReportRow({ report, onDelete }: { report: Report; onDelete: () => void }) {
  const [copied, setCopied] = useState(false);

  function copy() {
    navigator.clipboard.writeText(report.shareUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  const expired = report.expiresAt < Date.now();

  return (
    <div style={{ background: "var(--lume-surface)", border: "1px solid var(--lume-border)", borderRadius: "var(--lume-radius-md)", padding: "16px 20px", display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
      <div style={{ flex: 1, minWidth: 200 }}>
        <div style={{ fontWeight: 600, color: "var(--lume-text)", marginBottom: 2 }}>
          {report.title ?? `Relatório — ${report.periodDays} dias`}
        </div>
        <div style={{ fontSize: "var(--lume-text-sm)", color: "var(--lume-text-muted)" }}>
          Criado {formatDate(report.createdAt)} · {expired ? "Expirado" : `Expira ${formatDate(report.expiresAt)}`}
        </div>
      </div>

      <div style={{ display: "flex", gap: 8, alignItems: "center", flexShrink: 0 }}>
        <a href={report.shareUrl} target="_blank" rel="noreferrer">
          <Button variant="ghost" size="sm">Abrir ↗</Button>
        </a>
        <Button variant="secondary" size="sm" onClick={copy}>
          {copied ? "Copiado!" : "Copiar link"}
        </Button>
        <Button variant="ghost" size="sm" onClick={onDelete} style={{ color: "var(--lume-danger)" }}>
          Excluir
        </Button>
      </div>
    </div>
  );
}

export function ReportsPage() {
  const [showModal, setShowModal] = useState(false);
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["reports"], queryFn: api.listReports });
  const deleteMut = useMutation({
    mutationFn: (id: string) => api.deleteReport(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["reports"] }),
  });

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: "var(--lume-text-2xl)", fontWeight: 800, color: "var(--lume-text-inverse)" }}>
            Relatórios
          </h1>
          <p style={{ margin: "4px 0 0", color: "var(--lume-text-soft)", fontSize: "var(--lume-text-sm)" }}>
            Compartilhe resultados com clientes sem precisar de login
          </p>
        </div>
        <Button variant="primary" onClick={() => setShowModal(true)}>+ Novo Relatório</Button>
      </div>

      {isLoading && <p style={{ color: "var(--lume-text-muted)" }}>Carregando...</p>}

      {!isLoading && (!data?.reports.length) && (
        <div style={{ background: "var(--lume-surface)", border: "1px solid var(--lume-border)", borderRadius: "var(--lume-radius-lg)", padding: 48, textAlign: "center" }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>📤</div>
          <h3 style={{ color: "var(--lume-text)", margin: "0 0 8px" }}>Nenhum relatório ainda</h3>
          <p style={{ color: "var(--lume-text-muted)", marginBottom: 20 }}>Gere seu primeiro relatório para compartilhar com clientes.</p>
          <Button variant="primary" onClick={() => setShowModal(true)}>Gerar Relatório</Button>
        </div>
      )}

      {data && data.reports.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {data.reports.map((r) => (
            <ReportRow key={r.id} report={r} onDelete={() => deleteMut.mutate(r.id)} />
          ))}
        </div>
      )}

      {showModal && <NewReportModal onClose={() => setShowModal(false)} />}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

```bash
cd "/Users/caimanoliveira/Marketing agency"
npm run typecheck 2>&1 | grep -v "cloudflare:test\|create-user\|Cannot find module"
```

Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add src/web/pages/Reports.tsx
git commit -m "feat(reports): add Reports management page"
```

---

## Task 7: Public Report Page

**Files:**
- Create: `src/web/pages/PublicReport.tsx`

- [ ] **Step 1: Create the standalone public report view**

```tsx
// src/web/pages/PublicReport.tsx
import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import type { ReportSnapshot, TopPostItem } from "../../shared/types";
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend,
} from "recharts";

function KpiCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div style={{ background: "#fff", border: "1px solid #E8EDF5", borderRadius: 12, padding: "20px 24px", flex: "1 1 160px", minWidth: 140 }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>
        {label}
      </div>
      <div style={{ fontSize: 28, fontWeight: 800, color: "#111827" }}>{value}</div>
    </div>
  );
}

function fmtN(n: number | null) {
  if (n === null) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return n.toString();
}

function PostCard({ post, rank }: { post: TopPostItem; rank: number }) {
  const networkLabel: Record<string, string> = { instagram: "Instagram", linkedin: "LinkedIn", tiktok: "TikTok" };
  return (
    <div style={{ background: "#fff", border: "1px solid #E8EDF5", borderRadius: 12, padding: "16px 20px", display: "flex", gap: 16, alignItems: "flex-start" }}>
      <div style={{ width: 28, height: 28, borderRadius: "50%", background: "#FF6B35", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 13, flexShrink: 0 }}>
        {rank}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: "#FF6B35", marginBottom: 4, textTransform: "uppercase" }}>
          {networkLabel[post.network] ?? post.network}
        </div>
        <p style={{ margin: "0 0 8px", color: "#111827", fontSize: 14, lineHeight: 1.5, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical" }}>
          {post.body}
        </p>
        <div style={{ display: "flex", gap: 16, fontSize: 12, color: "#6B7280" }}>
          {post.likes !== null && <span>❤️ {fmtN(post.likes)}</span>}
          {post.comments !== null && <span>💬 {fmtN(post.comments)}</span>}
          {post.reach !== null && <span>👁️ {fmtN(post.reach)}</span>}
        </div>
      </div>
    </div>
  );
}

function ReportContent({ snapshot, title }: { snapshot: ReportSnapshot; title: string | null; createdAt: number }) {
  const { summary, topPosts, accountNames, periodDays, generatedAt } = snapshot;
  const generatedLabel = new Date(generatedAt).toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });

  return (
    <div style={{ fontFamily: "'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, sans-serif", background: "#F0F4FF", minHeight: "100vh" }}>
      {/* Header */}
      <div style={{ background: "#0D1426", color: "#fff", padding: "24px 32px", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 800, color: "#FF6B35", letterSpacing: "-0.02em" }}>Lume</div>
          <div style={{ fontSize: 13, color: "#9CA3AF", marginTop: 2 }}>Relatório de Analytics</div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontWeight: 700, fontSize: 15, color: "#fff" }}>{title ?? `Relatório — ${periodDays} dias`}</div>
          {accountNames.length > 0 && (
            <div style={{ fontSize: 12, color: "#9CA3AF", marginTop: 2 }}>{accountNames.join(" · ")}</div>
          )}
          <div style={{ fontSize: 11, color: "#6B7280", marginTop: 2 }}>Gerado em {generatedLabel}</div>
        </div>
      </div>

      <div style={{ maxWidth: 860, margin: "0 auto", padding: "32px 24px" }}>
        {/* KPIs */}
        <h2 style={{ fontSize: 18, fontWeight: 700, color: "#111827", margin: "0 0 16px" }}>
          Últimos {periodDays} dias
        </h2>
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginBottom: 32 }}>
          <KpiCard label="Alcance total" value={fmtN(summary.totalReach)} />
          <KpiCard label="Engajamento" value={fmtN(summary.totalEngagement)} />
          <KpiCard label="Crescimento" value={summary.followerGrowth >= 0 ? `+${fmtN(summary.followerGrowth)}` : fmtN(summary.followerGrowth)} />
          <KpiCard label="Posts publicados" value={summary.postsPublished} />
        </div>

        {/* Weekly Engagement Chart */}
        {summary.weeklyEngagement.length > 0 && (
          <div style={{ background: "#fff", border: "1px solid #E8EDF5", borderRadius: 12, padding: "24px", marginBottom: 24 }}>
            <h3 style={{ margin: "0 0 20px", fontSize: 15, fontWeight: 700, color: "#111827" }}>Engajamento semanal</h3>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={summary.weeklyEngagement} barCategoryGap="30%">
                <CartesianGrid strokeDasharray="3 3" stroke="#F0F4FF" />
                <XAxis dataKey="weekStart" tick={{ fontSize: 11, fill: "#6B7280" }} />
                <YAxis tick={{ fontSize: 11, fill: "#6B7280" }} />
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="likes" name="Curtidas" fill="#FF6B35" radius={[4,4,0,0]} />
                <Bar dataKey="comments" name="Comentários" fill="#1E40AF" radius={[4,4,0,0]} />
                <Bar dataKey="shares" name="Shares" fill="#10B981" radius={[4,4,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Content mix */}
        {summary.contentMix.length > 0 && (
          <div style={{ background: "#fff", border: "1px solid #E8EDF5", borderRadius: 12, padding: "24px", marginBottom: 24 }}>
            <h3 style={{ margin: "0 0 16px", fontSize: 15, fontWeight: 700, color: "#111827" }}>Mix de redes</h3>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              {summary.contentMix.map((m) => (
                <div key={m.network} style={{ background: "#F0F4FF", borderRadius: 8, padding: "10px 16px", fontSize: 14, fontWeight: 600, color: "#111827" }}>
                  {m.network} <span style={{ color: "#FF6B35" }}>{m.count}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Top posts */}
        {topPosts.length > 0 && (
          <div>
            <h3 style={{ margin: "0 0 16px", fontSize: 15, fontWeight: 700, color: "#111827" }}>Top posts</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {topPosts.map((p, i) => <PostCard key={p.postId} post={p} rank={i + 1} />)}
            </div>
          </div>
        )}

        {/* Footer */}
        <div style={{ marginTop: 40, paddingTop: 24, borderTop: "1px solid #E8EDF5", textAlign: "center", fontSize: 12, color: "#9CA3AF" }}>
          Gerado com <span style={{ color: "#FF6B35", fontWeight: 700 }}>Lume</span> · Válido por 90 dias
        </div>
      </div>

      {/* Print CSS */}
      <style>{`
        @media print {
          body { background: white !important; }
          @page { margin: 20mm; }
        }
      `}</style>
    </div>
  );
}

export function PublicReport() {
  const { token } = useParams<{ token: string }>();
  const { data, isLoading, isError } = useQuery({
    queryKey: ["public-report", token],
    queryFn: () => api.getPublicReport(token!),
    enabled: !!token,
    retry: false,
  });

  if (isLoading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh", fontFamily: "sans-serif", color: "#6B7280" }}>
        Carregando relatório...
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "100vh", fontFamily: "sans-serif" }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>🔍</div>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: "#111827", margin: "0 0 8px" }}>Relatório não encontrado</h1>
        <p style={{ color: "#6B7280" }}>Este link pode ter expirado ou não existe.</p>
      </div>
    );
  }

  return <ReportContent snapshot={data.snapshot} title={data.title} createdAt={data.createdAt} />;
}
```

- [ ] **Step 2: Typecheck**

```bash
cd "/Users/caimanoliveira/Marketing agency"
npm run typecheck 2>&1 | grep -v "cloudflare:test\|create-user\|Cannot find module"
```

Expected: no new errors. If Recharts types complain about `WebkitLineClamp` / `WebkitBoxOrient`, cast the style prop: `style={{ ... } as React.CSSProperties}`.

- [ ] **Step 3: Commit**

```bash
git add src/web/pages/PublicReport.tsx
git commit -m "feat(reports): add public report view page"
```

---

## Task 8: Wire App.tsx + Layout.tsx

**Files:**
- Modify: `src/web/App.tsx`
- Modify: `src/web/components/Layout.tsx`

- [ ] **Step 1: Add routes in App.tsx**

Add imports at the top (after existing page imports):

```ts
import { ReportsPage } from "./pages/Reports";
import { PublicReport } from "./pages/PublicReport";
```

Add two routes:

1. Inside `<Route element={<Layout />}>` (after the Strategy route):
```tsx
<Route path="/reports" element={<ReportsPage />} />
```

2. **Outside** `<Route element={<Layout />}>`, as a sibling route (standalone, no sidebar):
```tsx
<Route path="/r/:token" element={<PublicReport />} />
```

The full Routes block should be:

```tsx
<Routes>
  <Route path="/login" element={<Login />} />
  <Route path="/r/:token" element={<PublicReport />} />
  <Route element={<Layout />}>
    <Route path="/" element={<Navigate to="/posts" replace />} />
    <Route path="/posts" element={<PostsList />} />
    <Route path="/posts/new" element={<Editor />} />
    <Route path="/posts/:id" element={<Editor />} />
    <Route path="/media" element={<MediaPage />} />
    <Route path="/calendar" element={<Calendar />} />
    <Route path="/kanban" element={<Kanban />} />
    <Route path="/analytics" element={<Analytics />} />
    <Route path="/benchmarks" element={<Benchmarks />} />
    <Route path="/strategy" element={<Strategy />} />
    <Route path="/reports" element={<ReportsPage />} />
    <Route path="/settings" element={<Settings />} />
  </Route>
</Routes>
```

- [ ] **Step 2: Add Reports to sidebar in Layout.tsx**

In the `NAV_ITEMS` array, add after the Benchmarks entry:

```ts
{ to: "/reports", label: "Relatórios", icon: "📤" },
```

Full `NAV_ITEMS` should be:
```ts
const NAV_ITEMS = [
  { to: "/posts",      label: "Posts",         icon: "📝", section: "CRIAR" },
  { to: "/posts/new",  label: "Novo post",     icon: "✨" },
  { to: "/calendar",   label: "Calendário",    icon: "🗓️" },
  { to: "/kanban",     label: "Kanban",        icon: "🧭" },
  { to: "/media",      label: "Biblioteca",    icon: "🖼️" },
  { to: "/strategy",   label: "Estratégia",    icon: "🎯", section: "INTELIGÊNCIA" },
  { to: "/analytics",  label: "Analytics",     icon: "📊" },
  { to: "/benchmarks", label: "Benchmarks",    icon: "🔭" },
  { to: "/reports",    label: "Relatórios",    icon: "📤" },
  { to: "/settings",   label: "Configurações", icon: "⚙️", section: "CONTA" },
];
```

- [ ] **Step 3: Typecheck**

```bash
cd "/Users/caimanoliveira/Marketing agency"
npm run typecheck 2>&1 | grep -v "cloudflare:test\|create-user\|Cannot find module"
```

Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add src/web/App.tsx src/web/components/Layout.tsx
git commit -m "feat(reports): wire Reports page into routing and sidebar"
```

---

## Task 9: Analytics "Compartilhar" Button

**Files:**
- Modify: `src/web/pages/Analytics.tsx`

- [ ] **Step 1: Find the Analytics page header**

```bash
grep -n "Analytics\|Compartilhar\|Share\|Button\|header\|h1\|período" \
  "/Users/caimanoliveira/Marketing agency/src/web/pages/Analytics.tsx" | head -30
```

This shows the header area and any existing period selector. Note the line numbers.

- [ ] **Step 2: Add import for useNavigate and state**

At the top of `Analytics.tsx`, ensure these imports exist (add any missing):

```ts
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { Button } from "../ui/Button";
import type { CreateReportRequest } from "../../shared/types";
```

- [ ] **Step 3: Add share button logic and UI**

Inside the `Analytics` component function body, add these near the top (after existing state declarations):

```tsx
const nav = useNavigate();
const qc = useQueryClient();
const [sharing, setSharing] = useState(false);
const shareMut = useMutation({
  mutationFn: (body: CreateReportRequest) => api.createReport(body),
  onSuccess: (data) => {
    qc.invalidateQueries({ queryKey: ["reports"] });
    navigator.clipboard.writeText(data.report.shareUrl).catch(() => {});
    nav("/reports");
  },
});
```

Then find the page header (the `<h1>` or header row) and add the button alongside it. The exact placement depends on the current Analytics.tsx structure, but it should look like:

```tsx
{/* In the header row alongside the h1/period selector: */}
<Button
  variant="secondary"
  size="sm"
  disabled={shareMut.isPending}
  onClick={() => {
    // Use the currently selected period (default 30 if unavailable)
    const p = (period as 7 | 30 | 90) ?? 30;
    shareMut.mutate({ periodDays: p });
  }}
>
  {shareMut.isPending ? "Gerando..." : "📤 Compartilhar"}
</Button>
```

(`period` should be whatever state variable the Analytics page uses for the selected period. Check the existing code for the variable name and adapt accordingly.)

- [ ] **Step 4: Typecheck**

```bash
cd "/Users/caimanoliveira/Marketing agency"
npm run typecheck 2>&1 | grep -v "cloudflare:test\|create-user\|Cannot find module"
```

Expected: no new errors.

- [ ] **Step 5: Run all tests**

```bash
cd "/Users/caimanoliveira/Marketing agency"
npx vitest run 2>&1 | tail -30
```

Expected: all tests pass (no regressions).

- [ ] **Step 6: Commit**

```bash
git add src/web/pages/Analytics.tsx
git commit -m "feat(reports): add Share button to Analytics page"
```

---

## Task 10: Deploy

- [ ] **Step 1: Apply migration to remote**

```bash
cd "/Users/caimanoliveira/Marketing agency"
npm run db:migrate:remote
```

Expected: `0010_reports.sql ✅`

- [ ] **Step 2: Build and deploy**

```bash
npm run deploy
```

Expected: deployment URL printed, no build errors.

- [ ] **Step 3: Smoke test in browser**

1. Open the deployed URL, log in
2. Go to Analytics → click "Compartilhar" → should redirect to `/reports` with a new report
3. Click "Abrir ↗" on the report — should open `/r/:token` as a standalone page without login required
4. In an incognito window, open the `/r/:token` URL — should show the report
5. Test print-to-PDF from browser

---

## Self-Review

**Spec coverage:**
- ✅ Report generation with snapshot at creation time → Task 4
- ✅ Public `/api/reports/public/:token` route (no auth) → Task 4
- ✅ `/r/:token` SPA route (standalone, no sidebar) → Task 7, 8
- ✅ Report page: header, KPI row, weekly engagement bars, top 5 posts, footer → Task 7
- ✅ Reports management page: list, new modal, copy link, delete → Task 6
- ✅ "Share Report" button on Analytics page → Task 9
- ✅ Reports expire after 90 days (enforced in `getReportByToken` query) → Task 3, 4
- ✅ `reports` D1 table with token unique index → Task 1
- ✅ Account names in snapshot header → Task 4 (`buildAccountNames`)
- ✅ Print CSS → Task 7
- ✅ Responsive layout → Task 7 (flex-wrap on KPI row)

**Placeholder scan:** No TBDs, no "implement later", no "similar to task N". All code is complete.

**Type consistency:**
- `Report` (shared/types.ts) used in api.ts, Reports.tsx — ✅
- `ReportSnapshot` used in routes/reports.ts, PublicReport.tsx — ✅
- `createReport(db, params)` params match `ReportRow` fields — ✅
- `summaryForPeriod` returns type matches `AnalyticsSummary` interface — ✅ (same shape)
