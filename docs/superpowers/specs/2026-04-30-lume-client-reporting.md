# Lume — Client Reporting (Semana 12)

**Date:** 2026-04-30
**Status:** Approved for implementation

---

## Goal

Add a shareable client report feature: generate a public URL containing a snapshot of analytics data (KPIs, top posts, follower growth, weekly engagement) for a given period. The recipient opens the link in their browser — no login required. This turns Lume from an internal tool into a client-facing deliverable.

---

## What Gets Built

### 1. Report generation (backend)
A new `reports` D1 table stores report snapshots. When a user generates a report, Lume:
1. Queries the current analytics data for the selected period (7 / 30 / 90 days)
2. Serializes it into a JSON snapshot (same data as `/api/analytics/summary` + `/api/analytics/top-posts`)
3. Creates a `reports` row with a random public token (no auth required to read by token)
4. Returns the shareable URL: `https://<app>/r/:token`

Reports expire after 90 days. Users can list and delete their reports.

### 2. Public report page (frontend)
Route `/r/:token` — served by the SPA, fetches from `GET /api/reports/:token` (no auth).
Layout:
- **Header:** Lume wordmark + "Analytics Report" + period + date generated + client's connected account names
- **KPI row:** Total Reach, Total Engagement, Follower Growth, Posts Published (same 4 cards as Analytics page)
- **Follower Growth chart:** Line chart over the period
- **Weekly Engagement bars:** 4-week bar chart (likes + comments + shares)
- **Top Posts:** Top 5 posts by engagement (network badge, body excerpt, likes/comments/reach)
- **Footer:** "Generated with Lume" + expiry notice

Responsive (desktop + mobile). Print-to-PDF works cleanly (CSS `@media print`).

### 3. Reports management page (frontend)
New sidebar entry: **Reports** (between Analytics and Settings).
- Lists all reports: title, period, created date, expiry, share link + copy button
- "New Report" button → opens a modal: period selector (7 / 30 / 90 days) + optional title field
- Delete report button

### 4. "Share" shortcut on Analytics page
"Share Report" button in the Analytics page header opens the same New Report modal pre-filled with the currently selected period.

---

## Data Model

```sql
CREATE TABLE reports (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title      TEXT,
  period_days INTEGER NOT NULL DEFAULT 30,
  token      TEXT NOT NULL UNIQUE,
  snapshot   TEXT NOT NULL,   -- JSON blob: { summary, topPosts, generatedAt, accountNames }
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX idx_reports_user ON reports(user_id);
CREATE INDEX idx_reports_token ON reports(token);
```

`snapshot` JSON shape:
```ts
{
  generatedAt: number;       // unix ms
  periodDays: number;
  accountNames: string[];    // connected account display names
  summary: AnalyticsSummaryResult;
  topPosts: TopPostItem[];
}
```

---

## API

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/reports` | required | List user's reports |
| POST | `/api/reports` | required | Create report (snapshot now) |
| DELETE | `/api/reports/:id` | required | Delete report |
| GET | `/api/reports/:token` | **none** | Fetch report by public token |

`POST /api/reports` body: `{ title?: string, periodDays: 7 | 30 | 90 }`

---

## Architecture Notes

- Report data is snapshotted at creation time — it doesn't change when underlying posts/metrics update. Clients see a stable document.
- The public `GET /api/reports/:token` route must be registered **before** the `requireAuth` middleware blanket. In `index.ts`, mount a separate `publicReports` router at `/api/reports` with only the token GET, then mount the auth-guarded `reports` router for the rest.
- The snapshot size will typically be 5–30 KB. D1's TEXT column handles this fine.
- No pagination on reports list; users will have at most a few dozen reports.

---

## UI / Visual Design

Follows the Semana 11 dark shell + light cards system:
- Report management page: standard Lume page layout (dark shell, light card per report row)
- Public report page: fully light (no dark shell — it's a standalone document view with white background). Use `--lume-primary` orange for accent, Plus Jakarta Sans, same KPI card and chart styles as the Analytics page.
- Print CSS: hide header nav, set all surfaces to white, ensure charts render without dark borders.

---

## Out of Scope

- PDF generation server-side (print-to-PDF from browser is sufficient)
- Password-protected reports
- Custom branding / logo upload
- Scheduled report delivery via email
- Report comparison (two periods side by side)
