import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import {
  addTrendFeed, listTrendFeeds, removeTrendFeed, setTrendFeedEnabled,
  upsertTrendItem, listTrendItems, deleteTrendItem, pruneTrendItems,
} from "../../src/worker/db/queries";

const USER = "u_trends";
const OTHER = "u_trends_other";

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL, created_at INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS trend_feeds (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, url TEXT NOT NULL, title TEXT, enabled INTEGER NOT NULL DEFAULT 1, added_at INTEGER NOT NULL, UNIQUE(user_id, url))`,
  `CREATE TABLE IF NOT EXISTS trend_items (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, title TEXT NOT NULL, url TEXT NOT NULL, source TEXT, summary TEXT, published_at INTEGER, hook_potential TEXT, hook_angle TEXT, fetched_at INTEGER NOT NULL, UNIQUE(user_id, url))`,
];

beforeAll(async () => {
  for (const sql of SCHEMA) await env.DB.prepare(sql).run();
  for (const u of [USER, OTHER]) {
    await env.DB.prepare("INSERT OR IGNORE INTO users (id, email, password_hash, created_at) VALUES (?, ?, ?, ?)")
      .bind(u, `${u}@test.dev`, "x", Date.now()).run();
  }
});

beforeEach(async () => {
  await env.DB.prepare("DELETE FROM trend_feeds").run();
  await env.DB.prepare("DELETE FROM trend_items").run();
});

describe("trend feeds", () => {
  it("adds, lists, toggles, and removes; re-adding re-enables", async () => {
    await addTrendFeed(env.DB, { id: "f1", userId: USER, url: "https://a.com/feed", title: "A" });
    await addTrendFeed(env.DB, { id: "f2", userId: USER, url: "https://b.com/feed", title: null });
    expect((await listTrendFeeds(env.DB, USER)).map((f) => f.url)).toEqual(["https://a.com/feed", "https://b.com/feed"]);

    expect(await setTrendFeedEnabled(env.DB, USER, "f1", false)).toBe(true);
    expect((await listTrendFeeds(env.DB, USER)).find((f) => f.id === "f1")!.enabled).toBe(0);

    // Re-adding the same url re-enables (ON CONFLICT) and keeps a title.
    await addTrendFeed(env.DB, { id: "f1b", userId: USER, url: "https://a.com/feed", title: null });
    expect((await listTrendFeeds(env.DB, USER)).find((f) => f.url === "https://a.com/feed")!.enabled).toBe(1);

    expect(await removeTrendFeed(env.DB, USER, "f2")).toBe(true);
    expect(await listTrendFeeds(env.DB, USER)).toHaveLength(1);
  });

  it("scopes feeds by user", async () => {
    await addTrendFeed(env.DB, { id: "fo", userId: OTHER, url: "https://x.com/feed", title: null });
    expect(await listTrendFeeds(env.DB, USER)).toHaveLength(0);
    expect(await removeTrendFeed(env.DB, USER, "fo")).toBe(false);
    expect(await setTrendFeedEnabled(env.DB, USER, "fo", false)).toBe(false);
  });
});

describe("trend items", () => {
  it("upserts by url, orders by published date desc, and filters by potential", async () => {
    await upsertTrendItem(env.DB, { id: "i1", userId: USER, title: "old", url: "https://n/1", source: "N", summary: null, publishedAt: 1000, hookPotential: "low", hookAngle: "a" });
    await upsertTrendItem(env.DB, { id: "i2", userId: USER, title: "new", url: "https://n/2", source: "N", summary: null, publishedAt: 2000, hookPotential: "high", hookAngle: "b" });

    const all = await listTrendItems(env.DB, USER, {});
    expect(all.map((i) => i.url)).toEqual(["https://n/2", "https://n/1"]); // newest first

    const high = await listTrendItems(env.DB, USER, { hookPotential: "high" });
    expect(high.map((i) => i.url)).toEqual(["https://n/2"]);

    // Upsert same url updates title; does not duplicate.
    await upsertTrendItem(env.DB, { id: "i1b", userId: USER, title: "updated", url: "https://n/1", source: "N", summary: null, publishedAt: 1000, hookPotential: null, hookAngle: null });
    const after = await listTrendItems(env.DB, USER, {});
    expect(after).toHaveLength(2);
    const updated = after.find((i) => i.url === "https://n/1")!;
    expect(updated.title).toBe("updated");
    expect(updated.hook_potential).toBe("low"); // COALESCE keeps prior score when new is null
  });

  it("dismiss deletes one item; prune removes stale items", async () => {
    const now = Date.now();
    await upsertTrendItem(env.DB, { id: "i1", userId: USER, title: "t", url: "https://n/1", source: null, summary: null, publishedAt: now, hookPotential: null, hookAngle: null });
    expect(await deleteTrendItem(env.DB, USER, "i1")).toBe(true);
    expect(await listTrendItems(env.DB, USER, {})).toHaveLength(0);

    // Insert then backdate fetched_at so prune removes it.
    await upsertTrendItem(env.DB, { id: "i2", userId: USER, title: "t2", url: "https://n/2", source: null, summary: null, publishedAt: now, hookPotential: null, hookAngle: null });
    await env.DB.prepare("UPDATE trend_items SET fetched_at = ? WHERE id = 'i2'").bind(now - 30 * 24 * 3600 * 1000).run();
    await pruneTrendItems(env.DB, USER, now - 7 * 24 * 3600 * 1000);
    expect(await listTrendItems(env.DB, USER, {})).toHaveLength(0);
  });
});
