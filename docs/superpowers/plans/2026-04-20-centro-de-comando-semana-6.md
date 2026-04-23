# Centro de Comando — Semana 6: Calendário + Kanban + Polish — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development.

**Goal:** Visual editorial views (calendário mensal + kanban por status com drag-drop), notificações in-app de publicações falhas com retry, e polish geral (skeletons, error boundaries, estados vazios).

**Architecture:**
- **Calendar:** view-only mensal lightweight (sem lib — grid CSS de 7 colunas). Posts agendados aparecem em suas células. Clique no post → vai pro editor.
- **Kanban:** 4 colunas por status do post (draft / scheduled / published / failed). Drag-drop entre colunas atualiza status via PATCH. Lib: `@dnd-kit/core` (acessível, leve).
- **Failure UI:** novo endpoint `GET /api/posts/failures` retorna targets com status='failed'. Banner global no Layout. Botão "Tentar de novo" em cada target falho → POST `/api/posts/:id/targets/:network/retry` → status volta pra 'scheduled' (cron pega na próxima passagem) ou 'publishing' + enqueue imediato.
- **Polish:** skeletons enquanto carrega, ErrorBoundary global, estados vazios mais amigáveis em todas as páginas.

**Tech additions:** `@dnd-kit/core`, `@dnd-kit/sortable`.

---

## DB additions
Nenhuma — toda a info necessária já existe (`scheduled_at`, `status`, `last_error` em `post_targets`; `status` em `posts`).

---

## File structure (week 6 deltas)

```
src/
  worker/
    routes/
      posts.ts                 # MODIFY: add /failures, /retry endpoint, /by-month
  web/
    pages/
      Calendar.tsx             # NEW
      Kanban.tsx               # NEW
    components/
      CalendarGrid.tsx         # NEW
      KanbanBoard.tsx          # NEW
      FailureBanner.tsx        # NEW
      Skeleton.tsx             # NEW
      ErrorBoundary.tsx        # NEW
      EmptyState.tsx           # NEW
    App.tsx                    # MODIFY: add /calendar, /kanban routes + ErrorBoundary
    components/Layout.tsx      # MODIFY: sidebar links + FailureBanner
    lib/api.ts                 # MODIFY: failures, retry, byMonth methods
    styles.css                 # MODIFY: calendar grid + kanban + skeleton styles
tests/
  worker/
    routes-failures.test.ts    # NEW
    routes-retry.test.ts       # NEW
    routes-bymonth.test.ts     # NEW
```

---

## Task 1: Backend — `/api/posts/by-month`, `/failures`, `/retry` (TDD)

Backend additions are small. TDD: tests first, fail, implement, green.

- [ ] **Step 1:** Add 3 queries to `src/worker/db/queries.ts`:
  ```ts
  export async function listPostsByMonth(db: D1Database, userId: string, fromMs: number, toMs: number)
  ```
  Returns posts with at least one target whose `scheduled_at` falls in `[from, to)`. Each row includes networks (group_concat) + earliest scheduled_at.

  ```ts
  export async function listFailures(db: D1Database, userId: string)
  ```
  Returns targets where `status = 'failed'`. Joined with post body for context.

  ```ts
  export async function resetTargetForRetry(db: D1Database, userId: string, postId: string, network: string)
  ```
  Verifies ownership, sets `status = 'scheduled'`, sets `scheduled_at = max(scheduled_at, now)` so cron picks it up immediately, clears `last_error`. Returns true/false.

- [ ] **Step 2:** Write failing tests in `tests/worker/routes-failures.test.ts`, `routes-retry.test.ts`, `routes-bymonth.test.ts`. Run, confirm RED.

- [ ] **Step 3:** Add 3 routes to `src/worker/routes/posts.ts`:
  - `GET /api/posts/by-month?from=ms&to=ms` → `{ items: PostListItem[] }` (PostListItem extended with `scheduledAt: number`)
  - `GET /api/posts/failures` → `{ items: Array<{ postId; postBody; network; lastError; attempts; scheduledAt }> }`
  - `POST /api/posts/:id/targets/:network/retry` → calls `resetTargetForRetry` → 200 / 404

- [ ] **Step 4:** Run tests, expect GREEN. Commit `feat(week6): backend endpoints for calendar, failures, retry`.

---

## Task 2: Frontend — Calendar view

- [ ] **Step 1:** Install nothing — built-in CSS grid.
- [ ] **Step 2:** Create `src/web/components/CalendarGrid.tsx`. Props: `year`, `month` (0-indexed), `items: Array<{ id, body, status, networks, scheduledAt }>`, `onPostClick(id)`.
  Render: header row (Dom/Seg/Ter/.../Sáb), grid of 6 weeks × 7 days. Each cell shows day number + posts scheduled on that day (compact: small badges with first 20 chars + network color dots). Click on post → onPostClick.
- [ ] **Step 3:** Create `src/web/pages/Calendar.tsx`. State: `month`, `year` (default current). Buttons "← Mês anterior" / "Próximo mês →". Calls `api.postsByMonth(year, month)`. Renders `<CalendarGrid />`.
- [ ] **Step 4:** Add CSS to `styles.css`: `.calendar { display: grid; grid-template-columns: repeat(7, 1fr); gap: 4px }`, `.cal-day { background; min-height: 100px; padding: 4px }`, etc.
- [ ] **Step 5:** Add route `/calendar` in `App.tsx` + sidebar link "Calendário" in `Layout.tsx`.
- [ ] Build + commit: `feat(week6): calendar view`

---

## Task 3: Frontend — Kanban view with drag-drop

- [ ] **Step 1:** Install `npm install @dnd-kit/core @dnd-kit/sortable`
- [ ] **Step 2:** Create `src/web/components/KanbanBoard.tsx`. Uses `DndContext` with `closestCorners` collision. 4 droppable columns: draft / scheduled / published / failed. Each post is a `useDraggable` card.
  On `onDragEnd`: if dropped in different column, call `api.updatePost(id, { /* set status via new endpoint */ })`.

  **Caveat:** `updatePost` doesn't currently change status. We need a new endpoint OR extend updatePost. Simplest: extend `UpdatePostSchema` and `updatePost` to accept `status: PostStatus` (validated to allowed values). Add this in Task 1 actually:

  Add to Task 1 query layer:
  ```ts
  // already have updatePost — extend signature to accept status
  export async function updatePost(db, userId, id, patch: { body?; mediaId?; status? })
  ```

  Schema:
  ```ts
  UpdatePostSchema.extend({ status: z.enum(["draft","scheduled","published","failed"]).optional() })
  ```

- [ ] **Step 3:** Create `src/web/pages/Kanban.tsx`. Calls `api.listPosts()`. Groups by status. Renders `<KanbanBoard />`.
- [ ] **Step 4:** CSS: `.kanban { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px }`, `.kanban-col { background; border-radius; min-height: 400px }`, `.kanban-card { background; border; padding; cursor: grab }`.
- [ ] **Step 5:** Route `/kanban` + sidebar link.
- [ ] Build + commit: `feat(week6): kanban view with drag-drop`

---

## Task 4: Frontend — Failure banner + retry

- [ ] **Step 1:** Add API methods `listFailures` + `retryTarget` in `lib/api.ts`.
- [ ] **Step 2:** Create `src/web/components/FailureBanner.tsx`:
  - Polls `["failures"]` query every 30s
  - If items > 0, render fixed-top red banner: "X publicações falharam — ver detalhes" → opens panel
  - Panel lists each failure with `lastError`, "Tentar de novo" button (calls `retryTarget` mutation), "Ir pro post" link
- [ ] **Step 3:** Render `<FailureBanner />` inside `Layout.tsx` above the `<Outlet />`.
- [ ] **Step 4:** CSS for banner + panel.
- [ ] Commit: `feat(week6): failure banner with retry`

---

## Task 5: Polish — skeletons, error boundary, empty states

- [ ] **Step 1:** Create `src/web/components/Skeleton.tsx` — generic shimmer block:
  ```tsx
  export function Skeleton({ width, height }: { width?: string; height?: string }) {
    return <div className="skeleton" style={{ width, height }} />;
  }
  ```
  CSS animation `@keyframes shimmer` already in styles.

- [ ] **Step 2:** Replace `Carregando...` text in PostsList, Editor, Settings, Calendar, Kanban with appropriate skeleton placeholders.

- [ ] **Step 3:** Create `src/web/components/ErrorBoundary.tsx` — class component catching render errors, displays "Algo deu errado" + reload button.

- [ ] **Step 4:** Wrap `<App />` content in ErrorBoundary in `main.tsx` or `App.tsx`.

- [ ] **Step 5:** Create `src/web/components/EmptyState.tsx`:
  ```tsx
  export function EmptyState({ icon, title, description, action }: Props) { ... }
  ```
  Use in PostsList ("Nenhum post ainda — cria o primeiro"), Media ("Biblioteca vazia"), Calendar (mês sem posts), etc.

- [ ] Commit: `feat(week6): skeletons, error boundary, empty states`

---

## Task 6: E2E + deploy

- [ ] Run full test suite — expect ~110+ tests pass.
- [ ] `npm run deploy` (no new secrets).
- [ ] Manual test:
  - `/calendar` mostra mês atual com posts agendados
  - `/kanban` permite arrastar post entre colunas — status atualiza
  - Force a publish failure (e.g., disconnect LinkedIn then publish) → banner aparece → clicar retry funciona
  - Quebrar uma página propositalmente → ErrorBoundary captura
- [ ] Tag `week-6-done`, push.

---

## Verification checklist

- [ ] `npx tsc -b` clean
- [ ] `npm test` — todos passam
- [ ] `/calendar` funciona — navegação por mês, posts visíveis
- [ ] `/kanban` funciona — drag-drop persiste
- [ ] Failures banner aparece quando há falha; retry funciona
- [ ] Skeletons aparecem em vez de "Carregando..." em todas páginas
- [ ] ErrorBoundary captura erros de render
- [ ] Tag `week-6-done` pushada

---

## Known limitations

- **Calendar é só view** (não cria post arrastando, não move post entre dias por drag) — adicionar em iteração futura
- **Kanban não persiste ordem** dentro da coluna — só status
- **FailureBanner polling 30s** — não tempo real (sem WebSocket)
- **ErrorBoundary não envia telemetria** — só renderiza fallback
