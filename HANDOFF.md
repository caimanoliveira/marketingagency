# Handoff — session state (2026-07-13)

Pick-up doc for continuing in the terminal (Claude Code CLI). Everything below is the live state as of this session. Nothing here is committed to git unless noted — this file itself is uncommitted; commit it if you want it to travel.

---

## 1. Code — shipped & merged

Two feature PRs are **merged to `main`** (branch `claude/viraliz-ai-offer-694bog`):

- **PR #11 — Estúdio Viral** (`/viral`): 5 AI tools behind `/api/viral/*` — hooks, reels-script, carousel, remodel, score — powered by the app's own `ANTHROPIC_API_KEY`. New `viral_generations` table + history. Files: `migrations/0011_viral_studio.sql`, `src/worker/ai/viral-prompts.ts`, `src/worker/routes/viral.ts`, `src/web/pages/ViralStudio.tsx`, plus wiring in `index.ts`, `validation.ts`, `shared/types.ts`, `db/queries.ts`, `web/lib/api.ts`, `web/App.tsx`, `web/components/Layout.tsx`.
- **PR #12 — competitor remodel + "minha voz"**: `GET /api/competitors/:id/top-posts` (business_discovery captions) + Benchmarks "♻️ Remodelar" flow; `useMyVoice` flag feeds top-5 posts (by engagement rate) into hooks/reels/carousel/remodel prompts. Files: `integrations/meta.ts` (`fetchCompetitorRecentPosts`), `routes/competitors.ts`, `routes/viral.ts` (`maybeVoice`/`withVoice`), `ViralStudio.tsx`, `Benchmarks.tsx`, tests.

Verification last run: `tsc -b` clean on `src/`; `vitest` — new suites pass (routes-viral 14, routes-competitor-top-posts 5); **6 pre-existing failures** (auth/competitors/strategy-approval) confirmed to fail identically on clean `main` — not ours. `vite build` ok. Run `git status` first — a couple of test files may show as modified in the working tree.

## 2. Deploy — NOT done yet (needs you)

Nothing is deployed. `wrangler` is unauthenticated in the cloud env. From your terminal:

```bash
git pull origin main
npm ci
# Cloudflare creds (token needs Workers + D1 + R2 edit):
export CLOUDFLARE_API_TOKEN=...        # create at dash.cloudflare.com/profile/api-tokens
export CLOUDFLARE_ACCOUNT_ID=ca5c50fef93a22d0e7a3e131ba42c589
npm run db:migrate:remote   # ⚠️ applies migration 0011 (viral_generations) — REQUIRED, still pending
npm run deploy              # vite build + wrangler deploy
```

Uses the existing `ANTHROPIC_API_KEY` secret. Sanity-check `/api/health` and the `/viral` page after.

## 3. Content pipeline (Notion) — state

**Queue** = Notion DB "📋 Calendário de Conteúdo" (`collection://accbbe1e-642c-4c85-a647-8362f0e13758`). **Standards** = `marketing-team/brand/` (`brand-voice.md`, `brand-dna.md`, `hooks-history.md`, `icp-cards.md`). Hard rules: no fabricated data/metrics; no fabricated mentee cases; zero emoji in body; banned-phrase list; decisions not options; PT-BR.

### July wave (worked this session)
| Item | State |
|---|---|
| S13 IG carrossel — Mercado Livre R$57bi/28k vagas | **Pronto** ✅ |
| S14 BIG DROP LinkedIn — iFood R$17bi (Nubank template) | **Pronto** ✅ |
| S14 reel finale — "Produto, time ou empresa?" | **Pronto** ✅ |
| S12 reel Ep1 (10X) | **Em produção** — needs real numbers (below) |
| S12 IG carrossel Ep1 (10X) | **Em produção** — needs real numbers |
| S15 carrossel-recap "8 semanas, 4 vencedores" | **Parked** — needs Onda 2 metrics |

### Backlog re-date (you chose option 3: +100 days, resume 2026-07-29, preserves cadence, no collisions)
**13 of 86 applied** before the Notion connector degraded. Confirmed done:

| New date | Items |
|---|---|
| 07-29 | LI-01, RT-01 |
| 07-30 | IG-01 |
| 07-31 | LI-03, RT-02 |
| 08-01 | IG-02, LI-04 |
| 08-02 | RT-03, LI-05 |
| 08-03 | IG-03 |
| 08-05 | RT-04, LI-06 |
| 08-06 | IG-04 |

**Next up: LI-07 → 08-06**, then the rest. The **complete +100-day mapping for all 86 items** is in the chat thread (message titled "The complete mapping"). Rule is simply: `new_date = original_date + 100 days`.

Fastest way to finish from terminal: pull the pending rows via the Notion API and PATCH each `Data` property (`+100d`), or bulk-edit in the Notion UI using the mapping. The MCP write path was flapping badly all session (1 write per several turns) — **re-authing the Notion connector** is the single biggest unblock.

## 4. Data I need from you to close the two blocked items

- **S12 (10X series):** starting year · starting salary · year of first job exit · role/company (or category if confidential) · months you delayed the decision. Unblocks reel + carousel Ep1 (structure & voice already written, just placeholders).
- **S15 recap:** the Onda 2 `inputs/post-performance.csv` (jun–jul) + which 4 formats/themes actually won, with metrics. It's a "what won" retrospective — the value IS the real data, so it stays parked until then.

## 5. MoneyPrinterV2 evaluation (from end of session)

Verdict: borrow **one** idea — the local **Shorts assembler** (script → TTS voiceover → auto-captions → stitched video), which fits your 10X/Anti-guru reel series. **Avoid:** its code (AGPL-3.0 network copyleft would force open-sourcing your hosted app), `gpt4free` (ToS-violating, you already have a real Anthropic key), and the scrape-businesses/cold-email + auto-post-to-Twitter/YouTube modules (LGPD/CAN-SPAM + platform-ban risk, off-brand for the mentoria positioning). If you want, next step = spec the Shorts-assembler as a clean feature on your own stack (Worker + Anthropic + a TTS/caption step), no AGPL code.

## 6. Infra note

The Notion MCP connector (both `mcp__Notion__` and the UUID variant) cycled connect/disconnect on nearly every turn this session; single writes landed intermittently, batches never did. Re-auth/reconnect it before any bulk Notion work.
