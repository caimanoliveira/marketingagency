import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import {
  upsertPillar, listPillars, deletePillar,
  addSource, listSources, removeSource,
  saveWeeklySuggestion, getWeeklySuggestion, listWeeklySuggestions, markSuggestionApproved,
} from "../../src/worker/db/queries";

const USER = "u_strat";

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL, created_at INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS content_pillars (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, title TEXT NOT NULL, description TEXT, color TEXT, position INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS inspiration_sources (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, network TEXT NOT NULL, username TEXT NOT NULL, note TEXT, added_at INTEGER NOT NULL, UNIQUE(user_id, network, username))`,
  `CREATE TABLE IF NOT EXISTS weekly_suggestions (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, week_start TEXT NOT NULL, theme TEXT, status TEXT NOT NULL DEFAULT 'pending', suggestions_json TEXT NOT NULL, rationale TEXT, model TEXT NOT NULL, input_tokens INTEGER, output_tokens INTEGER, cached_tokens INTEGER, created_at INTEGER NOT NULL, approved_at INTEGER, UNIQUE(user_id, week_start))`,
];

beforeAll(async () => {
  for (const sql of SCHEMA) await env.DB.prepare(sql).run();
  await env.DB.prepare("INSERT OR IGNORE INTO users (id, email, password_hash, created_at) VALUES (?, ?, ?, ?)")
    .bind(USER, "strat@test.dev", "x", Date.now()).run();
});

beforeEach(async () => {
  await env.DB.prepare("DELETE FROM weekly_suggestions WHERE user_id = ?").bind(USER).run();
  await env.DB.prepare("DELETE FROM inspiration_sources WHERE user_id = ?").bind(USER).run();
  await env.DB.prepare("DELETE FROM content_pillars WHERE user_id = ?").bind(USER).run();
});

describe("content pillars", () => {
  it("upsert insert + update, list ordered by position, delete", async () => {
    await upsertPillar(env.DB, { id: "p1", userId: USER, title: "Bastidores", description: "Dia a dia", color: "#E1306C", position: 0 });
    await upsertPillar(env.DB, { id: "p2", userId: USER, title: "Educativo", description: null, color: "#0A66C2", position: 1 });
    await upsertPillar(env.DB, { id: "p1", userId: USER, title: "Bastidores ✨", description: "Dia a dia", color: "#E1306C", position: 2 });

    const list = await listPillars(env.DB, USER);
    expect(list).toHaveLength(2);
    expect(list[0].id).toBe("p2");
    expect(list[1].title).toBe("Bastidores ✨");

    const removed = await deletePillar(env.DB, USER, "p1");
    expect(removed).toBe(true);
    const list2 = await listPillars(env.DB, USER);
    expect(list2).toHaveLength(1);
  });

  it("delete returns false for other user's pillar", async () => {
    await env.DB.prepare("INSERT INTO content_pillars (id, user_id, title, position, created_at) VALUES (?, ?, ?, 0, ?)")
      .bind("p_other", "u_other", "x", Date.now()).run();
    const r = await deletePillar(env.DB, USER, "p_other");
    expect(r).toBe(false);
  });
});

describe("inspiration sources", () => {
  it("add + list + remove", async () => {
    await addSource(env.DB, { id: "s1", userId: USER, network: "instagram", username: "gary", note: "copywriter ref" });
    await addSource(env.DB, { id: "s2", userId: USER, network: "instagram", username: "annie", note: null });
    const list = await listSources(env.DB, USER);
    expect(list.map((s) => s.username).sort()).toEqual(["annie", "gary"]);
    const removed = await removeSource(env.DB, USER, "s1");
    expect(removed).toBe(true);
    expect((await listSources(env.DB, USER))).toHaveLength(1);
  });
});

describe("weekly_suggestions", () => {
  it("save + get + list + approve", async () => {
    const posts = [
      { day: "seg" as const, time: "09:00", network: "linkedin" as const, pillarId: null, format: "post", hook: "h1", body: "b1", mediaSuggestion: "m1" },
      { day: "ter" as const, time: "10:00", network: "instagram" as const, pillarId: null, format: "reels", hook: "h2", body: "b2", mediaSuggestion: "m2" },
    ];
    await saveWeeklySuggestion(env.DB, {
      id: "w1", userId: USER, weekStart: "2026-04-27", theme: "Lançamento Q2",
      posts, rationale: "because", model: "mock", inputTokens: 100, outputTokens: 50, cachedTokens: 80,
    });
    const got = await getWeeklySuggestion(env.DB, USER, "w1");
    expect(got).not.toBeNull();
    expect(got?.posts).toHaveLength(2);
    expect(got?.posts[0].hook).toBe("h1");
    expect(got?.theme).toBe("Lançamento Q2");
    expect(got?.status).toBe("pending");

    const list = await listWeeklySuggestions(env.DB, USER, 10);
    expect(list).toHaveLength(1);

    const approved = await markSuggestionApproved(env.DB, USER, "w1");
    expect(approved).toBe(true);
    const reread = await getWeeklySuggestion(env.DB, USER, "w1");
    expect(reread?.status).toBe("approved");
    expect(reread?.approvedAt).toBeTruthy();
  });

  it("save is idempotent per (user_id, week_start)", async () => {
    await saveWeeklySuggestion(env.DB, {
      id: "w_a", userId: USER, weekStart: "2026-05-04", theme: null,
      posts: [], rationale: "first", model: "mock", inputTokens: 10, outputTokens: 5, cachedTokens: 0,
    });
    await saveWeeklySuggestion(env.DB, {
      id: "w_b", userId: USER, weekStart: "2026-05-04", theme: "updated",
      posts: [], rationale: "second", model: "mock", inputTokens: 20, outputTokens: 10, cachedTokens: 5,
    });
    const list = await listWeeklySuggestions(env.DB, USER, 10);
    const forWeek = list.filter((s) => s.weekStart === "2026-05-04");
    expect(forWeek).toHaveLength(1);
    expect(forWeek[0].rationale).toBe("second");
    expect(forWeek[0].theme).toBe("updated");
  });
});
