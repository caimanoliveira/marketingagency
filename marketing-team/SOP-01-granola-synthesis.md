# SOP-01 — Granola → Mentee Pattern Synthesis

Generates the structured block that gets pasted into `inputs/granola-context.md`. Run weekly (Sunday PM) before the content pipeline. Pure synthesis — no raw transcripts leave this step, no real names survive it.

## Inputs

Last 30 days of Granola mentoria notes. Two ways to get them:

- **Via Granola MCP** (preferred): list meetings in the window, then pull each transcript/summary. Filter to mentoria/coaching sessions only — drop internal/personal meetings.
- **Manual**: paste session notes below the prompt.

## How to run

Open a Claude Code session and paste the prompt below, followed by the notes (or let Claude pull them via the Granola MCP).

---

### PROMPT

```
You are synthesizing recurring patterns across my last 30 days of 1:1 career-mentoria sessions (PMs and tech-transition professionals, PT-BR). Input is a set of Granola meeting notes.

TASK — extract cross-cutting patterns, NOT per-session summaries:

1. Top 5 recurring QUESTIONS mentees asked (ranked by frequency across sessions).
2. Top 5 recurring BLOCKERS / DECISIONS mentees were stuck on (ranked by frequency).
3. EMERGING themes — topics that appear this cycle but were rare/absent before. Only list if you have signal; otherwise write "nenhum tema novo claro este ciclo".
4. QUOTABLE phrasing — 3-6 verbatim mentee lines that capture real language (for the Content Writer to mirror). Anonymize the attribution.
5. SIGNALS to Content Writer — 2-4 bullets: which patterns are hot (build content) vs fading (deprioritize), mapped to the ICPs in brand/icp-cards.md when possible.

HARD RULES:
- ANONYMIZE everything. No real names, companies, or identifying details. Use composites like "PM Pleno em fintech série B", "ex-Director de banco médio", "CS querendo pivotar". Mentees consented to mentoria, not to being content.
- Frequency over vividness. A pattern in 1 session is an anecdote, not a pattern — only promote it to the top-5 if it recurs OR is a strong emerging signal (flag which).
- No fabrication. If fewer than 5 real recurring items exist, list what's real and write "[sem mais padrões recorrentes claros]". Don't pad to hit 5.
- PT-BR output.
- Output ONLY the structured block below — ready to paste into inputs/granola-context.md.

OUTPUT FORMAT (fill exactly this structure):

### Refresh date: <YYYY-MM-DD>
### Sessions covered: <N sessions, <date range>>

### Top recurring questions
1. ...
(up to 5)

### Top recurring blockers/decisions
1. ...
(up to 5)

### Emerging themes (new this cycle)
- ...

### Quotable mentee phrasing (anonymized)
> "..." — <perfil anonimizado>
(3-6 quotes)

### Signals to flag to Content Writer
- ...
(2-4 bullets, reference ICP-0X where it applies)
```

---

## After running

1. Replace everything under "## Structured output (paste here)" in `inputs/granola-context.md` with the generated block.
2. Sanity-check anonymization before saving — one pass for any name/company that slipped through.
3. The Lead Agent aborts if `granola-context.md` is >7 days old, so the refresh date must be current.
