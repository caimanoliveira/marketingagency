# Marketing Team — Personal Brand + Mentoria (LinkedIn)

Owner: Caiman (Senior PM @ Amazon + coach de transição/aceleração de carreira tech)
Surface: LinkedIn personal profile (PT-BR primary, occasional EN)
Goal: Inbound qualified leads for 1:1 mentoria + group cohorts

## What this is

Pipeline of 5 sub-agents that run weekly to produce LinkedIn content + measure performance. NOT a DTC ad ops setup — this is personal brand content.

## The 5 agents

| # | Agent | Input | Output |
|---|-------|-------|--------|
| 1 | Competitor Researcher | `inputs/competitor-content/` | `outputs/competitive-brief.md` |
| 2 | Creative Brief Writer | competitive-brief + `inputs/post-performance.csv` + `inputs/granola-context.md` + `brand/` | `outputs/creative-brief.md` |
| 3 | Hook Generator | creative-brief + `brand/hooks-history.md` | `outputs/hooks.md` (20 hooks × 10 frameworks) |
| 4 | Content Writer | creative-brief + winning hooks + `brand/` | `outputs/content-variations.md` (long-form posts, carousels, comments) |
| 5 | Performance Reporter | `inputs/post-performance.csv` + last cycle outputs | `outputs/performance-report.md` + "Research Focus for Next Week" |

Pipeline runs sequentially. Each agent reads the previous output + the `brand/` files.

## Hard rules (apply to EVERY agent)

1. **No fabricated data.** If a metric, quote, or source is not in the input files, write `[unknown]` or `TBD`. Never invent impressions, lead counts, or competitor performance numbers.
2. **Source every claim.** Cite file + line or a URL. Competitor analysis without a link is invalid.
3. **PT-BR by default.** English only for posts targeting global PM audience and only when input explicitly says so.
4. **No emoji in body copy.** Headlines/CTAs can use 1 max if it matches `brand/brand-voice.md`. Default: zero.
5. **No corporate/AI tells.** Banned phrases live in `brand/brand-voice.md`. If a draft contains them, rewrite.
6. **Decisions, not options.** Brief gives ONE recommended angle. Hook agent gives 20 — but creative-brief commits to the topic of the week.
7. **Real mentee patterns only.** Stories/examples come from `inputs/granola-context.md` or `inputs/reviews/`. Don't fabricate mentee anecdotes. Anonymize names (use "PM Pleno em fintech", not real names).

## Voice (summary; full version in `brand/brand-voice.md`)

- Brief. Blunt. Fact-focused.
- Decision-oriented. End every post with what the reader should DO or DECIDE.
- Flag assumptions explicitly ("assumindo que…").
- No padding. Cut adjectives. Cut hedging.
- Sound like a senior PM giving a peer the honest take, not a coach selling a course.

## Cadence

- **Sunday evening:** update `inputs/` (post-performance CSV refresh, dump new competitor screenshots, run SOP-01 for granola-context).
- **Monday AM:** run pipeline via `lead-agent-prompt.md`.
- **Monday PM:** human review. Edit. Schedule 3-5 posts for the week.
- **Friday:** read `outputs/performance-report.md`. Decide next week's research focus.

## What NOT to do

- Don't auto-publish. Every post is human-reviewed before going live.
- Don't run agents out of order. Performance Reporter needs the cycle's posts to have shipped.
- Don't expand scope to ads, email, or other channels without updating this CLAUDE.md first.
- Don't optimize for vanity metrics (impressions alone). Lead inquiries > engagement > impressions.
