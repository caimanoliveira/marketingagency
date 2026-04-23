# Centro de Comando — Semana 7: Analytics Foundation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development.

**Goal:** Puxar métricas do LinkedIn + Instagram + TikTok (onde possível), guardar em D1 como snapshots diários + por post, renderizar dashboard com cards de KPI, gráficos de engajamento semanal, mix de conteúdo, e coluna de performance na lista de posts.

**Architecture:**
- **Collection:** cron diário (`0 3 * * *` — 3h UTC) chama `collectMetrics(env)` que itera connections ativas e puxa:
  - **Instagram Business:** `/{ig-user-id}/insights` (follower_count, impressions, reach, profile_views) + per-post via `/{media-id}/insights` (likes, comments, saved, reach, shares) — requires `instagram_manage_insights` scope
  - **LinkedIn:** per-post via `/socialActions/{ugc-urn}` (likes, comments count) — limited by available scopes
  - **TikTok:** out of scope — Display API stats too limited without Business API approval. Deixa campo pronto na DB mas não coleta.
- **Storage:**
  - `account_metrics` — uma linha por (user_id, network, account_ref, date) com colunas flex
  - `post_metrics` — uma linha por (post_id, network, snapshot_at) com likes/comments/reach/etc
- **Dashboard:** nova página `/analytics` com:
  - 4 KPI cards (alcance 30d, engajamento 30d, crescimento 30d, total posts publicados)
  - Gráfico de barras: engajamento semanal últimas 4 semanas
  - Pie chart: mix de conteúdo por rede (# posts publicados)
  - Toggle de período (7d / 30d / 90d)
- **Posts list:** nova coluna "Performance" mostrando likes+comments do último snapshot (se published).

**Tech additions:** `recharts` (charts), reuso de meta/linkedin integrations já existentes.

**Out of scope Week 7:**
- TikTok metrics (Week 9+ — precisa Business API)
- Benchmarks / competidores (Week 8)
- Exportação de relatórios
- Alerts por queda de performance
- Audience insights (demographics)

---

## DB schema — `migrations/0006_analytics.sql`

```sql
CREATE TABLE account_metrics (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  network TEXT NOT NULL,                    -- instagram | linkedin | tiktok
  account_ref TEXT NOT NULL,                -- ig_user_id, linkedin member urn, etc.
  snapshot_date TEXT NOT NULL,              -- YYYY-MM-DD
  followers INTEGER,
  following INTEGER,
  impressions INTEGER,
  reach INTEGER,
  profile_views INTEGER,
  extra_json TEXT,                          -- raw payload for debugging
  created_at INTEGER NOT NULL,
  UNIQUE (user_id, network, account_ref, snapshot_date)
);

CREATE INDEX idx_account_metrics_user_net_date ON account_metrics(user_id, network, snapshot_date DESC);

CREATE TABLE post_metrics (
  id TEXT PRIMARY KEY,
  post_id TEXT NOT NULL,
  target_id TEXT NOT NULL,
  network TEXT NOT NULL,
  snapshot_at INTEGER NOT NULL,             -- epoch ms
  likes INTEGER,
  comments INTEGER,
  shares INTEGER,
  saved INTEGER,
  reach INTEGER,
  impressions INTEGER,
  engagement_rate REAL,                     -- (likes+comments+shares+saved)/reach
  extra_json TEXT,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE,
  FOREIGN KEY (target_id) REFERENCES post_targets(id) ON DELETE CASCADE
);

CREATE INDEX idx_post_metrics_target_snap ON post_metrics(target_id, snapshot_at DESC);
CREATE INDEX idx_post_metrics_post ON post_metrics(post_id, snapshot_at DESC);
```

---

## Task 1: Schema + types + query layer (TDD for queries)

- [ ] Write migration `0006_analytics.sql` + apply locally.
- [ ] Add types to `src/shared/types.ts`:
```ts
export interface AccountMetricsSnapshot {
  date: string;               // YYYY-MM-DD
  network: Network;
  accountRef: string;
  followers: number | null;
  impressions: number | null;
  reach: number | null;
  profileViews: number | null;
}

export interface PostMetricsSnapshot {
  postId: string;
  targetId: string;
  network: Network;
  snapshotAt: number;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  saved: number | null;
  reach: number | null;
  impressions: number | null;
  engagementRate: number | null;
}

export interface AnalyticsSummary {
  periodDays: 7 | 30 | 90;
  totalReach: number;
  totalEngagement: number;     // likes + comments + shares + saved across posts in period
  followerGrowth: number;      // delta from period start → end
  postsPublished: number;
  weeklyEngagement: Array<{ weekStart: string; likes: number; comments: number; shares: number }>;
  contentMix: Array<{ network: Network; count: number }>;
}
```
- [ ] Add queries to `db/queries.ts` (TDD style — write failing tests first in `tests/worker/analytics-queries.test.ts`):
  - `upsertAccountMetrics(db, params)` — INSERT OR REPLACE on unique (user_id, network, account_ref, snapshot_date)
  - `insertPostMetrics(db, params)` — simple insert (append-only)
  - `latestPostMetrics(db, userId, targetId)` — most recent snapshot
  - `summaryForPeriod(db, userId, days)` — aggregates for dashboard
- [ ] Run tests, confirm GREEN. Commit: `feat(week7): analytics schema and queries`.

---

## Task 2: Metric collectors (Instagram + LinkedIn) + cron wiring

- [ ] Create `src/worker/analytics/collect.ts` with:
```ts
export async function collectMetrics(env: Env): Promise<{ usersProcessed: number; errors: string[] }>;
```
  - Queries all users (just 1 for now) with active connections
  - For each IG account: fetch `/{ig-user-id}?fields=followers_count,media_count`, fetch `/{ig-user-id}/insights?metric=impressions,reach,profile_views&period=day`, upsert `account_metrics`
  - For each published IG post (status='published', network='instagram'): fetch `/{media-id}/insights?metric=likes,comments,saved,reach`, insert `post_metrics`
  - For each published LinkedIn post: fetch `/socialActions/{ugc-urn}?count=0` for like/comment counts, insert `post_metrics`
  - Log errors, continue
- [ ] Add a Hono POST endpoint `/api/analytics/collect-now` (behind auth) that triggers `collectMetrics` immediately — for manual testing.
- [ ] Wire into `src/worker/index.ts` `scheduled` handler — on daily trigger (3 UTC), call `collectMetrics`. The existing cron is `*/1 * * * *` (every minute); add a check: `if event.cron === "*/1 * * * *"` → publisher, `if event.cron === "0 3 * * *"` → metrics. Add both crons to `wrangler.toml [triggers]`.
- [ ] Tests (mocked fetch):
  - `tests/worker/collect-metrics.test.ts` — mocks fetch, verifies each network branch upserts correct snapshot rows
- [ ] Commit: `feat(week7): metric collectors for Instagram and LinkedIn`.

---

## Task 3: Analytics API routes

- [ ] Create `src/worker/routes/analytics.ts` with:
  - `GET /api/analytics/summary?period=7|30|90` → `AnalyticsSummary`
  - `GET /api/analytics/account-timeseries?network=X&field=followers|reach|impressions&days=N` → `Array<{ date: string; value: number }>`
  - `GET /api/analytics/post-performance` → list of published posts with latest metrics joined
- [ ] Mount `app.route("/api/analytics", analytics)`.
- [ ] TDD tests in `tests/worker/routes-analytics.test.ts` — seed snapshots, call endpoints, assert shapes.
- [ ] Commit: `feat(week7): analytics API endpoints`.

---

## Task 4: Dashboard UI (`/analytics` page)

- [ ] `npm install recharts`
- [ ] Create `src/web/pages/Analytics.tsx`:
  - Period toggle (7d / 30d / 90d) at top
  - 4 KPI cards row: alcance, engajamento, crescimento seguidores, posts publicados
  - Chart block 1: `<BarChart>` engajamento semanal (4 barras, stacked: likes/comments/shares)
  - Chart block 2: `<PieChart>` content mix por rede
- [ ] Create `src/web/components/KpiCard.tsx` — label, value (big), delta arrow if applicable.
- [ ] Add `/analytics` route + sidebar link between Kanban and Configurações.
- [ ] Reuse `Skeleton` during loading.
- [ ] Commit: `feat(week7): analytics dashboard with KPI cards and charts`.

---

## Task 5: Post performance column in PostsList

- [ ] Extend `GET /api/posts` list to include `latestMetrics: { likes, comments } | null` — join post_metrics on latest snapshot per published post.
- [ ] In `PostsList.tsx`, add a "Performance" column showing `❤️ X · 💬 Y` (or "—" if not published or no metrics).
- [ ] Commit: `feat(week7): post performance column in list`.

---

## Task 6: Deploy

- [ ] Apply migration remote: `yes | npx wrangler d1 migrations apply social_command --remote`
- [ ] Update `wrangler.toml [triggers]` to include the 3 UTC cron:
```toml
[triggers]
crons = ["*/1 * * * *", "0 3 * * *"]
```
- [ ] `npm run deploy`
- [ ] Manual test:
  1. `POST /api/analytics/collect-now` — se tiver IG connection ativa, deve coletar
  2. `/analytics` renderiza cards + charts (vazios ou com dados)
  3. `/posts` mostra coluna Performance
- [ ] Commit + tag `week-7-done` + push.

---

## Verification checklist

- [ ] `npx tsc -b` clean
- [ ] `npm test` — todos passam (~120+)
- [ ] `/analytics` renderiza sem crash mesmo sem dados
- [ ] `POST /api/analytics/collect-now` (com IG conectado) preenche snapshots
- [ ] Coluna Performance aparece em `/posts`
- [ ] Cron 3 UTC registrado

---

## Known limitations

- **TikTok metrics não coletadas** — Display API limita muito; Business API exige aprovação
- **LinkedIn org page analytics** limitado sem Marketing Developer Platform
- **IG insights exigem `instagram_manage_insights`** — scope não foi solicitado na Semana 5; precisa reconectar IG após Semana 7 Task 2
- **Sem alertas** — queda brusca não notifica
- **Retenção ilimitada** — snapshots crescem pra sempre; adicionar prune depois
- **Sem cache** — dashboard sempre bate no D1; bom até ~milhares de snapshots
