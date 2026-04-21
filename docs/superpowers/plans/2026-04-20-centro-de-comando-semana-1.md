# Centro de Comando — Semana 1: Shell + Auth + DB — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Scaffold a Hono + React (Vite) app deployed on Cloudflare Workers with D1 database, single-user password auth, and a working "hello authenticated user" flow ready to build features on top of.

**Architecture:** Single Cloudflare Worker serves both the Hono API and the built React SPA as static assets (Workers Assets). D1 holds all data. Auth is a PBKDF2-hashed password plus a signed HttpOnly JWT cookie. Vite builds the SPA into `dist/client`; Wrangler bundles the Worker entrypoint at `src/worker/index.ts`.

**Tech Stack:** Cloudflare Workers, Wrangler v3, D1, Hono, Vite, React 18, TypeScript, Vitest, `@tsndr/cloudflare-worker-jwt`, WebCrypto PBKDF2 for password hashing.

**Reference plan (spec):** [/Users/caimanoliveira/.claude/plans/eu-quero-criar-um-floofy-sutherland.md](/Users/caimanoliveira/.claude/plans/eu-quero-criar-um-floofy-sutherland.md)

---

## File Structure for Week 1

```
/Users/caimanoliveira/Marketing agency/
├── package.json
├── wrangler.toml                      # Cloudflare config: D1 binding, assets, vars
├── tsconfig.json                      # Base TS config (references below)
├── tsconfig.worker.json               # Worker-only TS config
├── tsconfig.web.json                  # SPA-only TS config
├── vite.config.ts                     # Builds SPA to dist/client
├── vitest.config.ts                   # Worker unit tests (pool=workerd)
├── .gitignore
├── .dev.vars.example                  # Template for local secrets
├── migrations/
│   └── 0001_init.sql                  # users table
├── src/
│   ├── worker/
│   │   ├── index.ts                   # Hono app + asset fallback + env types
│   │   ├── auth.ts                    # hashPassword, verifyPassword, sign/verify JWT
│   │   ├── middleware/
│   │   │   └── requireAuth.ts         # Hono middleware: reads cookie, sets c.var.userId
│   │   ├── routes/
│   │   │   ├── auth.ts                # POST /api/auth/login, /logout, GET /me
│   │   │   └── health.ts              # GET /api/health
│   │   └── db/
│   │       └── queries.ts             # getUserByEmail, getUserById, createUser
│   ├── web/
│   │   ├── index.html
│   │   ├── main.tsx                   # React entry
│   │   ├── App.tsx                    # Router: /login, /
│   │   ├── pages/
│   │   │   ├── Login.tsx
│   │   │   └── Home.tsx               # "Olá, {email}"
│   │   ├── lib/
│   │   │   └── api.ts                 # fetch wrapper with credentials:'include'
│   │   └── styles.css
│   └── shared/
│       └── types.ts                   # Shared request/response types
├── tests/
│   └── worker/
│       ├── auth.test.ts               # Tests for hashPassword/verifyPassword/JWT
│       └── routes-auth.test.ts        # Tests for /api/auth/* endpoints
└── scripts/
    └── create-user.ts                 # CLI: cria usuário inicial no D1 (uso local)
```

---

## Task 1: Project scaffold & dependencies

**Files:**
- Create: `package.json`
- Create: `.gitignore`
- Create: `tsconfig.json`
- Create: `tsconfig.worker.json`
- Create: `tsconfig.web.json`

- [ ] **Step 1: Init npm project**

```bash
cd "/Users/caimanoliveira/Marketing agency"
npm init -y
git init
```

- [ ] **Step 2: Install runtime + dev dependencies**

```bash
npm install hono @tsndr/cloudflare-worker-jwt
npm install -D wrangler@latest typescript @cloudflare/workers-types @cloudflare/vitest-pool-workers \
  vite @vitejs/plugin-react react react-dom @types/react @types/react-dom \
  vitest react-router-dom tsx
```

- [ ] **Step 3: Write `.gitignore`**

```
node_modules
dist
.wrangler
.dev.vars
*.log
.DS_Store
```

- [ ] **Step 4: Write `tsconfig.json` (root, references only)**

```json
{
  "files": [],
  "references": [
    { "path": "./tsconfig.worker.json" },
    { "path": "./tsconfig.web.json" }
  ]
}
```

- [ ] **Step 5: Write `tsconfig.worker.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ES2022",
    "moduleResolution": "Bundler",
    "lib": ["ES2022"],
    "types": ["@cloudflare/workers-types"],
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "composite": true
  },
  "include": ["src/worker/**/*", "src/shared/**/*", "tests/worker/**/*", "scripts/**/*"]
}
```

- [ ] **Step 6: Write `tsconfig.web.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "jsx": "react-jsx",
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "composite": true
  },
  "include": ["src/web/**/*", "src/shared/**/*"]
}
```

- [ ] **Step 7: Update `package.json` scripts**

Edit `package.json` to set `"type": "module"` and add scripts:

```json
{
  "type": "module",
  "scripts": {
    "dev": "wrangler dev",
    "build": "vite build",
    "deploy": "npm run build && wrangler deploy",
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc -b",
    "db:migrate:local": "wrangler d1 migrations apply social_command --local",
    "db:migrate:remote": "wrangler d1 migrations apply social_command --remote",
    "create-user": "tsx scripts/create-user.ts"
  }
}
```

- [ ] **Step 8: Commit**

```bash
git add .
git commit -m "chore: init project with deps and tsconfig"
```

---

## Task 2: Wrangler config + D1 database + migrations

**Files:**
- Create: `wrangler.toml`
- Create: `.dev.vars.example`
- Create: `migrations/0001_init.sql`

- [ ] **Step 1: Create local D1 database**

```bash
npx wrangler d1 create social_command
```

Expected output: prints a `database_id`. **Copy that UUID** — you'll paste it into `wrangler.toml` next.

- [ ] **Step 2: Write `wrangler.toml`** (replace `YOUR_DB_ID` with the UUID from step 1)

```toml
name = "social-command"
main = "src/worker/index.ts"
compatibility_date = "2026-04-01"
compatibility_flags = ["nodejs_compat"]

[assets]
directory = "./dist/client"
binding = "ASSETS"
not_found_handling = "single-page-application"

[[d1_databases]]
binding = "DB"
database_name = "social_command"
database_id = "YOUR_DB_ID"

[vars]
APP_NAME = "social-command"
# Secrets (JWT_SECRET) go in .dev.vars locally and `wrangler secret put` in prod
```

- [ ] **Step 3: Write `.dev.vars.example`**

```
JWT_SECRET=change-me-to-a-long-random-string
```

- [ ] **Step 4: Create real `.dev.vars` locally** (not committed)

```bash
cp .dev.vars.example .dev.vars
node -e "console.log('JWT_SECRET=' + require('crypto').randomBytes(48).toString('hex'))" > .dev.vars
cat .dev.vars
```

Expected: a single line `JWT_SECRET=<96 hex chars>`.

- [ ] **Step 5: Write `migrations/0001_init.sql`**

```sql
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX idx_users_email ON users(email);
```

- [ ] **Step 6: Apply migration locally**

```bash
npm run db:migrate:local
```

Expected: "Migrations applied successfully".

- [ ] **Step 7: Verify schema**

```bash
npx wrangler d1 execute social_command --local --command "SELECT name FROM sqlite_master WHERE type='table'"
```

Expected: rows include `users`.

- [ ] **Step 8: Commit**

```bash
git add wrangler.toml .dev.vars.example migrations/
git commit -m "feat: cloudflare config and initial D1 schema"
```

---

## Task 3: Hono worker skeleton + health endpoint

**Files:**
- Create: `src/worker/index.ts`
- Create: `src/worker/routes/health.ts`
- Create: `src/shared/types.ts`
- Create: `src/web/index.html`
- Create: `src/web/main.tsx` (placeholder; replaced in Task 8)
- Create: `vite.config.ts`

- [ ] **Step 1: Write `src/shared/types.ts`**

```ts
export interface LoginRequest {
  email: string;
  password: string;
}

export interface MeResponse {
  userId: string;
  email: string;
}

export interface HealthResponse {
  ok: true;
  app: string;
}
```

- [ ] **Step 2: Write `src/worker/routes/health.ts`**

```ts
import { Hono } from "hono";
import type { Env } from "../index";
import type { HealthResponse } from "../../shared/types";

export const health = new Hono<{ Bindings: Env }>();

health.get("/", (c) => {
  const body: HealthResponse = { ok: true, app: c.env.APP_NAME };
  return c.json(body);
});
```

- [ ] **Step 3: Write `src/worker/index.ts`**

```ts
import { Hono } from "hono";
import { health } from "./routes/health";

export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  APP_NAME: string;
  JWT_SECRET: string;
}

const app = new Hono<{ Bindings: Env }>();

app.route("/api/health", health);

app.all("/api/*", (c) => c.json({ error: "not_found" }, 404));

app.all("*", (c) => c.env.ASSETS.fetch(c.req.raw));

export default app;
```

- [ ] **Step 4: Write placeholder `src/web/index.html`**

```html
<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="UTF-8" />
    <title>Centro de Comando</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 5: Write placeholder `src/web/main.tsx`**

```tsx
const root = document.getElementById("root");
if (root) root.textContent = "Building...";
```

- [ ] **Step 6: Write `vite.config.ts`**

```ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  root: "src/web",
  build: {
    outDir: path.resolve(__dirname, "dist/client"),
    emptyOutDir: true,
  },
});
```

- [ ] **Step 7: Build SPA so `dist/client` exists before `wrangler dev`**

```bash
npm run build
```

Expected: creates `dist/client/index.html` + asset bundle.

- [ ] **Step 8: Start dev server and hit `/api/health`**

```bash
npm run dev &
sleep 3
curl -s http://localhost:8787/api/health
kill %1
```

Expected output:
```json
{"ok":true,"app":"social-command"}
```

- [ ] **Step 9: Commit**

```bash
git add src/ vite.config.ts
git commit -m "feat: hono worker skeleton with health endpoint and SPA shell"
```

---

## Task 4: Auth helpers (hashing + JWT) — tests first

**Files:**
- Create: `vitest.config.ts`
- Create: `tests/worker/auth.test.ts`
- Create: `src/worker/auth.ts`

- [ ] **Step 1: Write `vitest.config.ts`**

```ts
import { defineWorkersConfig } from "@cloudflare/vitest-pool-workers/config";

export default defineWorkersConfig({
  test: {
    poolOptions: {
      workers: {
        wrangler: { configPath: "./wrangler.toml" },
        miniflare: {
          bindings: { JWT_SECRET: "test-secret-at-least-32-chars-long-xxxxxx" },
        },
      },
    },
  },
});
```

- [ ] **Step 2: Write `tests/worker/auth.test.ts` (failing)**

```ts
import { describe, it, expect } from "vitest";
import { hashPassword, verifyPassword, signToken, verifyToken } from "../../src/worker/auth";

describe("hashPassword / verifyPassword", () => {
  it("hashes differently each call and verifies correctly", async () => {
    const h1 = await hashPassword("hunter2");
    const h2 = await hashPassword("hunter2");
    expect(h1).not.toEqual(h2);
    expect(await verifyPassword("hunter2", h1)).toBe(true);
    expect(await verifyPassword("hunter2", h2)).toBe(true);
    expect(await verifyPassword("wrong", h1)).toBe(false);
  });
});

describe("signToken / verifyToken", () => {
  const SECRET = "test-secret-at-least-32-chars-long-xxxxxx";

  it("signs and verifies a token with userId payload", async () => {
    const token = await signToken({ userId: "u_123" }, SECRET);
    const payload = await verifyToken(token, SECRET);
    expect(payload?.userId).toBe("u_123");
  });

  it("returns null for tampered token", async () => {
    const token = await signToken({ userId: "u_123" }, SECRET);
    const tampered = token.slice(0, -2) + "xx";
    const payload = await verifyToken(tampered, SECRET);
    expect(payload).toBeNull();
  });

  it("returns null for wrong secret", async () => {
    const token = await signToken({ userId: "u_123" }, SECRET);
    const payload = await verifyToken(token, "different-secret-xxxxxxxxxxxxxxxxxxxx");
    expect(payload).toBeNull();
  });
});
```

- [ ] **Step 3: Run tests to confirm failure**

```bash
npx vitest run tests/worker/auth.test.ts
```

Expected: FAIL with "Cannot find module '../../src/worker/auth'".

- [ ] **Step 4: Implement `src/worker/auth.ts`**

```ts
import jwt from "@tsndr/cloudflare-worker-jwt";

const encoder = new TextEncoder();

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(hex.substr(i * 2, 2), 16);
  }
  return out;
}

async function pbkdf2(password: string, salt: Uint8Array, iterations = 100_000): Promise<Uint8Array> {
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    { name: "PBKDF2" },
    false,
    ["deriveBits"]
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations, hash: "SHA-256" },
    keyMaterial,
    256
  );
  return new Uint8Array(bits);
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await pbkdf2(password, salt);
  return `pbkdf2$100000$${bytesToHex(salt)}$${bytesToHex(hash)}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 4 || parts[0] !== "pbkdf2") return false;
  const iterations = parseInt(parts[1], 10);
  const salt = hexToBytes(parts[2]);
  const expected = hexToBytes(parts[3]);
  const actual = await pbkdf2(password, salt, iterations);
  if (actual.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < actual.length; i++) diff |= actual[i] ^ expected[i];
  return diff === 0;
}

export interface TokenPayload {
  userId: string;
  exp?: number;
}

export async function signToken(payload: TokenPayload, secret: string): Promise<string> {
  const exp = Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7;
  return await jwt.sign({ ...payload, exp }, secret);
}

export async function verifyToken(token: string, secret: string): Promise<TokenPayload | null> {
  const ok = await jwt.verify(token, secret);
  if (!ok) return null;
  const { payload } = jwt.decode(token);
  if (!payload || typeof payload.userId !== "string") return null;
  return { userId: payload.userId, exp: payload.exp };
}
```

- [ ] **Step 5: Run tests to confirm pass**

```bash
npx vitest run tests/worker/auth.test.ts
```

Expected: all 4 tests PASS.

- [ ] **Step 6: Commit**

```bash
git add src/worker/auth.ts tests/worker/auth.test.ts vitest.config.ts
git commit -m "feat: password hashing (PBKDF2) and JWT signing with tests"
```

---

## Task 5: DB queries + auth middleware

**Files:**
- Create: `src/worker/db/queries.ts`
- Create: `src/worker/middleware/requireAuth.ts`

- [ ] **Step 1: Write `src/worker/db/queries.ts`**

```ts
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
```

- [ ] **Step 2: Write `src/worker/middleware/requireAuth.ts`**

```ts
import type { MiddlewareHandler } from "hono";
import { getCookie } from "hono/cookie";
import { verifyToken } from "../auth";
import type { Env } from "../index";

export const requireAuth: MiddlewareHandler<{
  Bindings: Env;
  Variables: { userId: string };
}> = async (c, next) => {
  const token = getCookie(c, "session");
  if (!token) return c.json({ error: "unauthorized" }, 401);
  const payload = await verifyToken(token, c.env.JWT_SECRET);
  if (!payload) return c.json({ error: "unauthorized" }, 401);
  c.set("userId", payload.userId);
  await next();
};
```

- [ ] **Step 3: Commit**

```bash
git add src/worker/db/queries.ts src/worker/middleware/requireAuth.ts
git commit -m "feat: user D1 queries and requireAuth middleware"
```

---

## Task 6: Auth routes (login, logout, me) — tests first

**Files:**
- Create: `tests/worker/routes-auth.test.ts`
- Create: `src/worker/routes/auth.ts`
- Modify: `src/worker/index.ts`

- [ ] **Step 1: Write failing integration tests**

`tests/worker/routes-auth.test.ts`:

```ts
import { describe, it, expect, beforeAll } from "vitest";
import { env, createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import worker from "../../src/worker/index";
import { hashPassword } from "../../src/worker/auth";

const TEST_EMAIL = "caiman@test.dev";
const TEST_PASSWORD = "hunter2hunter2";

beforeAll(async () => {
  await env.DB.exec(
    "CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL, created_at INTEGER NOT NULL)"
  );
  const hash = await hashPassword(TEST_PASSWORD);
  await env.DB.prepare(
    "INSERT OR REPLACE INTO users (id, email, password_hash, created_at) VALUES (?, ?, ?, ?)"
  )
    .bind("u_test", TEST_EMAIL, hash, Date.now())
    .run();
});

async function call(path: string, init?: RequestInit) {
  const ctx = createExecutionContext();
  const res = await worker.fetch(new Request(`http://x${path}`, init), env, ctx);
  await waitOnExecutionContext(ctx);
  return res;
}

describe("POST /api/auth/login", () => {
  it("400 when body missing fields", async () => {
    const res = await call("/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "x" }),
    });
    expect(res.status).toBe(400);
  });

  it("401 on wrong password", async () => {
    const res = await call("/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: TEST_EMAIL, password: "wrong" }),
    });
    expect(res.status).toBe(401);
  });

  it("200 + Set-Cookie on correct credentials", async () => {
    const res = await call("/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: TEST_EMAIL, password: TEST_PASSWORD }),
    });
    expect(res.status).toBe(200);
    const setCookie = res.headers.get("set-cookie") ?? "";
    expect(setCookie).toMatch(/session=/);
    expect(setCookie).toMatch(/HttpOnly/i);
  });
});

describe("GET /api/auth/me", () => {
  it("401 without cookie", async () => {
    const res = await call("/api/auth/me");
    expect(res.status).toBe(401);
  });

  it("200 with valid cookie after login", async () => {
    const login = await call("/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: TEST_EMAIL, password: TEST_PASSWORD }),
    });
    const setCookie = login.headers.get("set-cookie") ?? "";
    const cookie = setCookie.split(";")[0];
    const me = await call("/api/auth/me", { headers: { cookie } });
    expect(me.status).toBe(200);
    const body = (await me.json()) as { userId: string; email: string };
    expect(body.email).toBe(TEST_EMAIL);
  });
});

describe("POST /api/auth/logout", () => {
  it("clears cookie", async () => {
    const res = await call("/api/auth/logout", { method: "POST" });
    expect(res.status).toBe(200);
    const setCookie = res.headers.get("set-cookie") ?? "";
    expect(setCookie).toMatch(/session=;/);
  });
});
```

- [ ] **Step 2: Run tests to confirm failure**

```bash
npx vitest run tests/worker/routes-auth.test.ts
```

Expected: FAIL (routes return 404 — not wired yet).

- [ ] **Step 3: Implement `src/worker/routes/auth.ts`**

```ts
import { Hono } from "hono";
import { setCookie, deleteCookie } from "hono/cookie";
import type { Env } from "../index";
import type { LoginRequest, MeResponse } from "../../shared/types";
import { verifyPassword, signToken } from "../auth";
import { getUserByEmail, getUserById } from "../db/queries";
import { requireAuth } from "../middleware/requireAuth";

export const auth = new Hono<{ Bindings: Env; Variables: { userId: string } }>();

auth.post("/login", async (c) => {
  let body: LoginRequest;
  try {
    body = await c.req.json<LoginRequest>();
  } catch {
    return c.json({ error: "invalid_json" }, 400);
  }
  if (!body?.email || !body?.password) {
    return c.json({ error: "missing_fields" }, 400);
  }
  const user = await getUserByEmail(c.env.DB, body.email);
  if (!user) return c.json({ error: "invalid_credentials" }, 401);
  const ok = await verifyPassword(body.password, user.password_hash);
  if (!ok) return c.json({ error: "invalid_credentials" }, 401);
  const token = await signToken({ userId: user.id }, c.env.JWT_SECRET);
  setCookie(c, "session", token, {
    httpOnly: true,
    secure: true,
    sameSite: "Lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
  return c.json({ ok: true });
});

auth.post("/logout", (c) => {
  deleteCookie(c, "session", { path: "/" });
  return c.json({ ok: true });
});

auth.get("/me", requireAuth, async (c) => {
  const userId = c.get("userId");
  const user = await getUserById(c.env.DB, userId);
  if (!user) return c.json({ error: "unauthorized" }, 401);
  const body: MeResponse = { userId: user.id, email: user.email };
  return c.json(body);
});
```

- [ ] **Step 4: Wire routes into `src/worker/index.ts`**

Overwrite with:

```ts
import { Hono } from "hono";
import { health } from "./routes/health";
import { auth } from "./routes/auth";

export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  APP_NAME: string;
  JWT_SECRET: string;
}

const app = new Hono<{ Bindings: Env }>();

app.route("/api/health", health);
app.route("/api/auth", auth);

app.all("/api/*", (c) => c.json({ error: "not_found" }, 404));

app.all("*", (c) => c.env.ASSETS.fetch(c.req.raw));

export default app;
```

- [ ] **Step 5: Run tests to confirm pass**

```bash
npx vitest run tests/worker/routes-auth.test.ts
```

Expected: all tests PASS.

- [ ] **Step 6: Commit**

```bash
git add src/worker/routes/auth.ts src/worker/index.ts tests/worker/routes-auth.test.ts
git commit -m "feat: auth routes (login/logout/me) with integration tests"
```

---

## Task 7: User creation CLI script

**Files:**
- Create: `scripts/create-user.ts`

This script generates a PBKDF2 hash (same format as `src/worker/auth.ts`), writes a single-statement SQL file to `/tmp`, then invokes `wrangler d1 execute --file` via `execFileSync` (NO shell string interpolation — the SQL file path is the only argument, and user-supplied values are written into the file, not the command line).

- [ ] **Step 1: Write `scripts/create-user.ts`**

```ts
import { execFileSync } from "node:child_process";
import { writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const encoder = new TextEncoder();

async function pbkdf2(password: string, salt: Uint8Array, iterations = 100_000) {
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    { name: "PBKDF2" },
    false,
    ["deriveBits"]
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations, hash: "SHA-256" },
    keyMaterial,
    256
  );
  return new Uint8Array(bits);
}

function hex(bytes: Uint8Array) {
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function hashPassword(password: string) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await pbkdf2(password, salt);
  return `pbkdf2$100000$${hex(salt)}$${hex(hash)}`;
}

function randomId(prefix = "u") {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return `${prefix}_${hex(bytes)}`;
}

function sqlEscape(s: string) {
  return s.replace(/'/g, "''");
}

const [, , email, password, whereArg] = process.argv;
if (!email || !password) {
  console.error("Usage: npm run create-user -- <email> <password> [--remote]");
  process.exit(1);
}

const remote = whereArg === "--remote";
const hash = await hashPassword(password);
const id = randomId();
const sql = `INSERT INTO users (id, email, password_hash, created_at) VALUES ('${sqlEscape(id)}', '${sqlEscape(email.toLowerCase())}', '${sqlEscape(hash)}', ${Date.now()});\n`;

const dir = mkdtempSync(path.join(tmpdir(), "sc-seed-"));
const file = path.join(dir, "seed.sql");
writeFileSync(file, sql, "utf8");

const args = [
  "wrangler",
  "d1",
  "execute",
  "social_command",
  remote ? "--remote" : "--local",
  "--file",
  file,
];
execFileSync("npx", args, { stdio: "inherit" });

console.log(`User created: ${email} (id=${id})`);
```

- [ ] **Step 2: Create a local user for manual testing**

```bash
npm run create-user -- caiman@test.dev hunter2hunter2
```

Expected: prints `User created: caiman@test.dev (id=u_...)` after wrangler output.

- [ ] **Step 3: Manual verification — login roundtrip**

```bash
npm run build
npm run dev &
sleep 3
curl -s -c /tmp/cookies.txt -X POST http://localhost:8787/api/auth/login \
  -H "content-type: application/json" \
  -d '{"email":"caiman@test.dev","password":"hunter2hunter2"}'
echo
curl -s -b /tmp/cookies.txt http://localhost:8787/api/auth/me
echo
kill %1
```

Expected output:
```json
{"ok":true}
{"userId":"u_...","email":"caiman@test.dev"}
```

- [ ] **Step 4: Commit**

```bash
git add scripts/create-user.ts package.json
git commit -m "feat: CLI to seed initial user in D1"
```

---

## Task 8: React SPA with login + home

**Files:**
- Overwrite: `src/web/index.html`
- Overwrite: `src/web/main.tsx`
- Create: `src/web/App.tsx`
- Create: `src/web/pages/Login.tsx`
- Create: `src/web/pages/Home.tsx`
- Create: `src/web/lib/api.ts`
- Create: `src/web/styles.css`

- [ ] **Step 1: Write `src/web/lib/api.ts`**

```ts
import type { LoginRequest, MeResponse } from "../../shared/types";

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, { credentials: "include", ...init });
  if (!res.ok) throw new Error(String(res.status));
  return (await res.json()) as T;
}

export const api = {
  login: (body: LoginRequest) =>
    req<{ ok: true }>("/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  logout: () => req<{ ok: true }>("/api/auth/logout", { method: "POST" }),
  me: () => req<MeResponse>("/api/auth/me"),
};
```

- [ ] **Step 2: Write `src/web/styles.css`**

```css
:root { font-family: system-ui, sans-serif; color-scheme: dark; }
body { margin: 0; background: #0b0b0f; color: #eaeaea; }
.wrap { max-width: 420px; margin: 10vh auto; padding: 24px; }
h1 { font-size: 20px; margin: 0 0 16px; }
label { display: block; margin: 12px 0 4px; font-size: 14px; color: #aaa; }
input { width: 100%; padding: 10px; border-radius: 8px; border: 1px solid #333; background: #15151c; color: #fff; font-size: 14px; box-sizing: border-box; }
button { margin-top: 16px; width: 100%; padding: 10px; border-radius: 8px; border: 0; background: #6e56cf; color: white; font-size: 14px; cursor: pointer; }
button:disabled { opacity: 0.5; cursor: wait; }
.err { color: #ff6b6b; font-size: 13px; margin-top: 8px; }
.home { padding: 32px; }
.home button { width: auto; }
```

- [ ] **Step 3: Write `src/web/pages/Login.tsx`**

```tsx
import { useState, FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";

export function Login() {
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setErr("");
    setBusy(true);
    try {
      await api.login({ email, password });
      nav("/");
    } catch {
      setErr("Credenciais inválidas");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="wrap">
      <h1>Centro de Comando — Login</h1>
      <form onSubmit={onSubmit}>
        <label>Email</label>
        <input value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required />
        <label>Senha</label>
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        <button disabled={busy}>{busy ? "Entrando..." : "Entrar"}</button>
        {err && <div className="err">{err}</div>}
      </form>
    </div>
  );
}
```

- [ ] **Step 4: Write `src/web/pages/Home.tsx`**

```tsx
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import type { MeResponse } from "../../shared/types";

export function Home() {
  const nav = useNavigate();
  const [me, setMe] = useState<MeResponse | null>(null);

  useEffect(() => {
    api.me().then(setMe).catch(() => nav("/login"));
  }, [nav]);

  async function logout() {
    await api.logout();
    nav("/login");
  }

  if (!me) return <div className="wrap">Carregando...</div>;

  return (
    <div className="home">
      <h1>Olá, {me.email}</h1>
      <p>Semana 1 concluída. Próximo: Posts CRUD + Editor + Mídia.</p>
      <button onClick={logout}>Sair</button>
    </div>
  );
}
```

- [ ] **Step 5: Write `src/web/App.tsx`**

```tsx
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Login } from "./pages/Login";
import { Home } from "./pages/Home";
import "./styles.css";

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/" element={<Home />} />
      </Routes>
    </BrowserRouter>
  );
}
```

- [ ] **Step 6: Overwrite `src/web/main.tsx`**

```tsx
import { createRoot } from "react-dom/client";
import { App } from "./App";

const root = document.getElementById("root");
if (root) createRoot(root).render(<App />);
```

- [ ] **Step 7: Overwrite `src/web/index.html`**

```html
<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Centro de Comando</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 8: Build and smoke test in browser**

```bash
npm run build
npm run dev
```

Open http://localhost:8787 in a browser. Expected flow:
1. `/` redirects to `/login` (because `/api/auth/me` returns 401)
2. Enter `caiman@test.dev` / `hunter2hunter2` → click Entrar
3. Lands on `/` showing "Olá, caiman@test.dev"
4. Refresh page → still logged in
5. Click "Sair" → back to `/login`

Stop the server with Ctrl-C.

- [ ] **Step 9: Commit**

```bash
git add src/web/ package.json
git commit -m "feat: react SPA with login and authenticated home"
```

---

## Task 9: Deploy to Cloudflare

- [ ] **Step 1: Login to Cloudflare**

```bash
npx wrangler login
```

Browser opens; authorize. Expected: "Successfully logged in."

- [ ] **Step 2: Set production JWT secret**

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))" | npx wrangler secret put JWT_SECRET
```

Expected: "Success! Uploaded secret JWT_SECRET".

- [ ] **Step 3: Apply migrations to remote D1**

```bash
npm run db:migrate:remote
```

Expected: "Migrations applied".

- [ ] **Step 4: Seed production user** (replace email/password with real values)

```bash
npm run create-user -- caiman@your-real-email.com YOUR_REAL_PASSWORD --remote
```

Expected: prints new user id.

- [ ] **Step 5: Deploy**

```bash
npm run deploy
```

Expected: prints deployed URL like `https://social-command.<account>.workers.dev`.

- [ ] **Step 6: End-to-end verification in browser**

Open the deployed URL. Repeat the smoke test from Task 8 Step 8 (login → home → logout). Expected: all green.

- [ ] **Step 7: Tag**

```bash
git add -A
git commit --allow-empty -m "chore: week 1 deployed"
git tag week-1-done
```

---

## Verification checklist (end of Week 1)

- [ ] `npm run typecheck` passes with zero errors
- [ ] `npm test` runs and all tests pass (auth unit + auth routes integration)
- [ ] `wrangler dev` serves SPA + API on localhost:8787
- [ ] Login with seeded user succeeds; `/api/auth/me` returns user
- [ ] Logout clears cookie; refresh bounces to `/login`
- [ ] Production deploy reachable; same flow works live
- [ ] `wrangler d1 execute social_command --remote --command "SELECT COUNT(*) FROM users"` returns ≥1

---

## Scope explicitly NOT in Week 1

- Posts table, post CRUD, editor UI (Week 2)
- R2 media upload (Week 2)
- Claude API integration (Week 3)
- OAuth flows, publishing to networks (Week 4–5)
- Kanban, calendar drag-drop (Week 6)
- Rate limiting, observability, Sentry (post-Week 6 polish)
