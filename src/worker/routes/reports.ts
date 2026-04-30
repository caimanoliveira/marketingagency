import { Hono } from "hono";
import { z } from "zod";
import type { Env } from "../index";
import { requireAuth } from "../middleware/requireAuth";
import {
  createReport,
  listReports,
  getReportByToken,
  deleteReport,
  summaryForPeriod,
  topPosts,
  getLinkedInConnection,
  getMetaConnection,
  listInstagramAccounts,
} from "../db/queries";
import type { ReportSnapshot, Report } from "../../shared/types";
import { randomId } from "../utils/id";

export const reports = new Hono<{ Bindings: Env; Variables: { userId: string } }>();
export const publicReports = new Hono<{ Bindings: Env }>();

const CreateReportSchema = z.object({
  title: z.string().max(120).optional(),
  periodDays: z.union([z.literal(7), z.literal(30), z.literal(90)]),
});

const REPORT_TTL_MS = 90 * 24 * 3600 * 1000;

function reportToPublic(
  row: {
    id: string;
    title: string | null;
    period_days: number;
    token: string;
    created_at: number;
    expires_at: number;
  },
  origin: string
): Report {
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

// Public route — no auth required
publicReports.get("/:token", async (c) => {
  const token = c.req.param("token");
  const row = await getReportByToken(c.env.DB, token);
  if (!row) return c.json({ error: "not_found" }, 404);
  const snapshot = JSON.parse(row.snapshot) as ReportSnapshot;
  return c.json({
    snapshot,
    title: row.title,
    periodDays: row.period_days,
    createdAt: row.created_at,
  });
});

// Auth-guarded routes
reports.use("*", requireAuth);

reports.get("/", async (c) => {
  const userId = c.get("userId");
  const rows = await listReports(c.env.DB, userId);
  const origin = c.env.APP_ORIGIN ?? "";
  return c.json({ reports: rows.map((r) => reportToPublic(r, origin)) });
});

reports.post("/", async (c) => {
  const userId = c.get("userId");
  let parsed: z.infer<typeof CreateReportSchema>;
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
    summary: summary as ReportSnapshot["summary"],
    topPosts: posts as ReportSnapshot["topPosts"],
  };

  const id = randomId("rpt");
  const token = randomId("tok");
  const now = Date.now();
  const expiresAt = now + REPORT_TTL_MS;

  await createReport(c.env.DB, {
    id,
    userId,
    title: parsed.title ?? null,
    periodDays: parsed.periodDays,
    token,
    snapshot: JSON.stringify(snapshot),
    expiresAt,
  });

  const report = reportToPublic(
    {
      id,
      title: parsed.title ?? null,
      period_days: parsed.periodDays,
      token,
      created_at: now,
      expires_at: expiresAt,
    },
    c.env.APP_ORIGIN ?? ""
  );
  return c.json({ report }, 201);
});

reports.delete("/:id", async (c) => {
  const userId = c.get("userId");
  const ok = await deleteReport(c.env.DB, userId, c.req.param("id"));
  if (!ok) return c.json({ error: "not_found" }, 404);
  return c.json({ ok: true });
});
