# Centro de Comando — Semana 9: Agente Autônomo de Estratégia — Implementation Plan

**Goal:** Agente que toda segunda gera uma agenda editorial semanal (5-7 posts) baseada em pilares de conteúdo, radar de inspiração, top posts passados e tema opcional. Usuário aprova → vira drafts editáveis.

**Architecture:**
- **Pilares:** tabela simples, usuário cadastra 3-5 temas com descrição.
- **Radar:** contas IG inspiracionais (mesma mecânica de competitors, mas intent diferente — coletar ideias, não benchmark).
- **Weekly plan:** cron às segundas 6h UTC chama Claude API com contexto (pilares + radar samples + top posts) → salva `weekly_suggestions` com array de `suggested_posts` (JSON).
- **Approval:** endpoint converte sugestão em múltiplos posts `status=draft` (reusa existing posts table).
- **Tema:** string opcional passada na geração, persistida.

---

## DB — `migrations/0008_strategy_agent.sql`

```sql
CREATE TABLE content_pillars (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  color TEXT,
  position INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id)
);
CREATE INDEX idx_pillars_user ON content_pillars(user_id, position);

CREATE TABLE inspiration_sources (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  network TEXT NOT NULL,
  username TEXT NOT NULL,
  note TEXT,
  added_at INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id),
  UNIQUE(user_id, network, username)
);

CREATE TABLE weekly_suggestions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  week_start TEXT NOT NULL,
  theme TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  suggestions_json TEXT NOT NULL,
  rationale TEXT,
  model TEXT NOT NULL,
  input_tokens INTEGER,
  output_tokens INTEGER,
  cached_tokens INTEGER,
  created_at INTEGER NOT NULL,
  approved_at INTEGER,
  FOREIGN KEY (user_id) REFERENCES users(id),
  UNIQUE(user_id, week_start)
);
CREATE INDEX idx_weekly_user_week ON weekly_suggestions(user_id, week_start DESC);
```

---

## Task 1: Schema + types + pillars CRUD (TDD)

- [ ] Write migration + apply
- [ ] Types: `ContentPillar`, `InspirationSource`, `WeeklySuggestion`, `SuggestedPost`
- [ ] Queries (TDD): `upsertPillar`, `deletePillar`, `listPillars` (ordered by position), `addSource`, `removeSource`, `listSources`, `saveWeeklySuggestion`, `getWeeklySuggestion`, `listWeeklySuggestions`, `markSuggestionApproved`
- [ ] Tests cover CRUD + isolation between users
- [ ] Commit

## Task 2: Pillars + Radar API routes

- [ ] Hono router `strategy.ts`:
  - `GET/POST/DELETE /api/strategy/pillars` + `PATCH /api/strategy/pillars/:id`
  - `GET/POST/DELETE /api/strategy/sources`
- [ ] Tests
- [ ] Commit

## Task 3: Weekly plan generation (AI + radar fetch)

- [ ] `src/worker/ai/strategy-prompts.ts` — system + user prompt builders. Output schema:
  ```json
  {
    "rationale": "...",
    "posts": [
      {
        "day": "seg|ter|qua|qui|sex|sab|dom",
        "time": "09:00",
        "network": "linkedin|instagram|tiktok",
        "pillarId": "...",
        "format": "post|reels|carousel|short-video",
        "hook": "gancho da primeira linha",
        "body": "copy completo",
        "media_suggestion": "descrição do que a mídia deveria ser"
      }
    ]
  }
  ```
- [ ] `src/worker/ai/strategy.ts` `generateWeeklyPlan(env, userId, theme?)`:
  - Load pillars, top posts last 30d, fetch radar samples (business_discovery last 3 posts each), fetch recent own post history
  - Build input context, call Claude Sonnet 4.6 with prompt caching
  - Parse JSON, validate, save to `weekly_suggestions`
- [ ] `POST /api/strategy/generate` endpoint (body: `{ theme?: string; weekStart?: YYYY-MM-DD }`)
- [ ] `GET /api/strategy/weekly-suggestions?limit=N`
- [ ] `GET /api/strategy/weekly-suggestions/:id`
- [ ] Tests (mock Claude)
- [ ] Commit

## Task 4: Approval — convert suggestion → drafts

- [ ] `POST /api/strategy/weekly-suggestions/:id/approve` — body optional `{ acceptPostIndices?: number[] }`. For each accepted suggested post:
  - Create a `posts` row with body + status `draft`
  - Create `post_targets` row for selected network with `scheduled_at` = computed from day+time of week_start
  - Returns `{ createdPostIds: string[] }`
- [ ] Mark suggestion `status=approved`, `approved_at=now`
- [ ] Tests
- [ ] Commit

## Task 5: Monday cron auto-generation

- [ ] Extend existing scheduled handler to detect Monday 6am UTC and call `generateWeeklyPlan` for each active user
- [ ] OR simpler: add a dedicated cron trigger in wrangler.toml: `"0 6 * * 1"` (Mondays 6am UTC) — but Workers only allow one crons array; merge into existing array
- [ ] Inside `scheduled`, dispatch by cron pattern. Current pattern is `*/1 * * * *` (every minute for publishing). Add `0 6 * * 1`. The `event.cron` string tells which fired.
- [ ] Tests
- [ ] Commit

## Task 6: UI — Strategy page (pillars + radar + weekly plan)

- [ ] New page `/strategy`:
  - Section 1: Pilares (lista editável, drag-drop reorder, colors, descrição inline)
  - Section 2: Radar (lista de contas IG inspiracionais, add/remove)
  - Section 3: Agenda da semana (última `weekly_suggestion` ou botão "Gerar agora" com input de tema opcional)
    - Cards dos posts sugeridos agrupados por dia
    - Cada card mostra: dia/hora, rede, pilar, hook, body, sugestão de mídia
    - Botão "Usar esse post" (1 post) ou "Aprovar todos" (batch)
- [ ] Sidebar link "Estratégia"
- [ ] Commit

## Task 7: Deploy

- [ ] Apply migration remote
- [ ] Deploy
- [ ] Smoke test
- [ ] Tag `week-9-done`

---

## Known limitations
- Agente usa snapshot dos últimos 30d — pra histórico mais longo, precisa refinar prompt
- Radar busca apenas IG (business_discovery) — LinkedIn/TikTok radar sem API pública
- Não aprende com aceites/rejeições — feedback loop fica pra iteração futura
- Sem geração de imagem — apenas sugestão textual de mídia
