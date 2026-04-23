# Centro de Comando — Semana 8: Benchmarks + Radar + Top Posts — Implementation Plan

**Goal:** Acompanhar perfis concorrentes (via Instagram `business_discovery`), visualizar métricas comparativas (sua conta vs concorrentes), mostrar top posts leaderboard, e comparações week-over-week na dashboard de analytics.

**Architecture:**
- **Competitors:** usuário cadastra `username` de contas IG Business públicas. Daily cron usa `business_discovery` da API Graph (acessa qualquer IG Business pela sua própria conexão) pra puxar followers, media_count e média de engajamento dos últimos 9 posts.
- **Snapshots:** `competitor_snapshots` (daily rows) pra gerar gráficos de crescimento.
- **Top posts:** endpoint que rankeia por `engagement_rate` ou `likes + comments`.
- **WoW:** calcular esta semana vs semana anterior (mesma função já faz ranges de 7d — extender pra dois ranges consecutivos).
- **LinkedIn/TikTok benchmarks:** fora de escopo Semana 8 (LinkedIn não tem API pública para perfis de terceiros; TikTok Business API exige aprovação).

---

## DB — `migrations/0007_competitors.sql`

```sql
CREATE TABLE competitors (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  network TEXT NOT NULL,                    -- 'instagram' for MVP
  username TEXT NOT NULL,                   -- ig handle without @
  display_name TEXT,
  profile_picture_url TEXT,
  added_at INTEGER NOT NULL,
  last_snapshot_at INTEGER,
  FOREIGN KEY (user_id) REFERENCES users(id),
  UNIQUE (user_id, network, username)
);
CREATE INDEX idx_competitors_user ON competitors(user_id, network);

CREATE TABLE competitor_snapshots (
  id TEXT PRIMARY KEY,
  competitor_id TEXT NOT NULL,
  snapshot_date TEXT NOT NULL,
  followers INTEGER,
  media_count INTEGER,
  recent_avg_likes REAL,
  recent_avg_comments REAL,
  recent_posts_sampled INTEGER,
  extra_json TEXT,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (competitor_id) REFERENCES competitors(id) ON DELETE CASCADE,
  UNIQUE (competitor_id, snapshot_date)
);
CREATE INDEX idx_competitor_snapshots_comp_date ON competitor_snapshots(competitor_id, snapshot_date DESC);
```

---

## Task 1: Schema + types + competitor CRUD (TDD)

- [ ] Write migration + apply locally
- [ ] Types: `Competitor`, `CompetitorSnapshot`, `TopPostItem`, `WoWComparison`
- [ ] Queries (TDD): `addCompetitor`, `removeCompetitor`, `listCompetitors`, `upsertCompetitorSnapshot`, `listCompetitorSnapshots`, `topPosts`, `summaryForRange(from, to)` (refactor of `summaryForPeriod` to accept explicit range — needed for WoW)
- [ ] Commit

## Task 2: IG business_discovery integration + collector

- [ ] `src/worker/integrations/meta.ts` append `fetchCompetitorBasic(igUserId, pageAccessToken, username)` using `business_discovery` — parses followers_count, media_count, and last 9 media for avg likes/comments
- [ ] Extend `collect.ts` to include competitor loop: for each competitor, call business_discovery (using the first IG account's page token) and upsert snapshot
- [ ] Tests with mocked fetch

## Task 3: Competitors API routes (TDD)

- [ ] `GET /api/competitors` — list
- [ ] `POST /api/competitors` — add (validates username, fetches initial snapshot inline)
- [ ] `DELETE /api/competitors/:id` — remove
- [ ] `GET /api/competitors/:id/snapshots?days=N` — time series

## Task 4: Top Posts + WoW endpoints

- [ ] `GET /api/analytics/top-posts?limit=10&by=engagement_rate|likes` — top published posts
- [ ] `GET /api/analytics/wow` — returns `{ current: Summary, previous: Summary, delta: { totalReach, totalEngagement, followerGrowth, postsPublished } }`

## Task 5: UI — Benchmarks page + Top posts + WoW cards

- [ ] New page `/benchmarks` — list competitors, add form, each row shows followers + growth 7d/30d trend (small sparkline via recharts), remove button
- [ ] Extend Analytics page: add a "Top Posts" section below charts + WoW delta chips in KPI cards (e.g. "+15% vs semana passada")

## Task 6: Deploy

Apply migration remote, deploy, smoke test, tag `week-8-done`.

---

## Known limitations
- Só Instagram competitors (MVP)
- `business_discovery` só pega contas **IG Business/Creator** (não perfis pessoais)
- Rate limits Meta: ~200 calls/hora por token — monitorar
- Sem histograma diário — só avg dos últimos 9 posts visíveis
