import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import {
  createHook,
  listHooks,
  getHook,
  deleteHook,
  incrementHookUse,
} from "../../src/worker/db/queries";

const USER = "u_hooks";
const OTHER = "u_other";

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL, created_at INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS hooks (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, template TEXT NOT NULL, hook_type TEXT, niche TEXT, source_handle TEXT, network TEXT, view_count INTEGER, use_count INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL)`,
];

beforeAll(async () => {
  for (const sql of SCHEMA) await env.DB.prepare(sql).run();
  for (const u of [USER, OTHER]) {
    await env.DB.prepare("INSERT OR IGNORE INTO users (id, email, password_hash, created_at) VALUES (?, ?, ?, ?)")
      .bind(u, `${u}@test.dev`, "x", Date.now()).run();
  }
});

beforeEach(async () => {
  await env.DB.prepare("DELETE FROM hooks").run();
});

function seed(id: string, userId: string, overrides: Partial<{ template: string; hookType: string | null; niche: string | null; sourceHandle: string | null; network: string | null; viewCount: number | null }> = {}) {
  return createHook(env.DB, {
    id, userId,
    template: overrides.template ?? "Pare de fazer [X]. Comece [Y].",
    hookType: overrides.hookType ?? "swap",
    niche: overrides.niche ?? null,
    sourceHandle: overrides.sourceHandle ?? null,
    network: overrides.network ?? null,
    viewCount: overrides.viewCount ?? null,
  });
}

describe("hooks CRUD", () => {
  it("creates, lists newest-first, and deletes", async () => {
    await seed("h1", USER, { template: "primeiro" });
    await seed("h2", USER, { template: "segundo" });
    const list = await listHooks(env.DB, USER);
    expect(list).toHaveLength(2);
    expect(list[0].id).toBe("h2"); // newest first

    expect(await deleteHook(env.DB, USER, "h1")).toBe(true);
    expect(await listHooks(env.DB, USER)).toHaveLength(1);
  });

  it("scopes by user — cannot read or delete another user's hook", async () => {
    await seed("ho", OTHER);
    expect(await getHook(env.DB, USER, "ho")).toBeNull();
    expect(await deleteHook(env.DB, USER, "ho")).toBe(false);
    expect(await listHooks(env.DB, USER)).toHaveLength(0);
  });
});

describe("hooks filters", () => {
  it("filters by type and network", async () => {
    await seed("h1", USER, { hookType: "swap", network: "instagram" });
    await seed("h2", USER, { hookType: "list", network: "linkedin" });
    await seed("h3", USER, { hookType: "list", network: "instagram" });

    expect((await listHooks(env.DB, USER, { hookType: "list" })).map((h) => h.id).sort()).toEqual(["h2", "h3"]);
    expect((await listHooks(env.DB, USER, { network: "instagram" })).map((h) => h.id).sort()).toEqual(["h1", "h3"]);
    expect((await listHooks(env.DB, USER, { hookType: "list", network: "instagram" })).map((h) => h.id)).toEqual(["h3"]);
  });

  it("matches free-text query against template, niche, and source", async () => {
    await seed("h1", USER, { template: "Ninguém fala sobre [TREND]" });
    await seed("h2", USER, { template: "outro", niche: "fitness" });
    await seed("h3", USER, { template: "qualquer", sourceHandle: "dankoe" });

    expect((await listHooks(env.DB, USER, { q: "TREND" })).map((h) => h.id)).toEqual(["h1"]);
    expect((await listHooks(env.DB, USER, { q: "fitness" })).map((h) => h.id)).toEqual(["h2"]);
    expect((await listHooks(env.DB, USER, { q: "dankoe" })).map((h) => h.id)).toEqual(["h3"]);
  });
});

describe("incrementHookUse", () => {
  it("increments use_count and returns the new value", async () => {
    await seed("h1", USER);
    expect(await incrementHookUse(env.DB, USER, "h1")).toBe(1);
    expect(await incrementHookUse(env.DB, USER, "h1")).toBe(2);
    const row = await getHook(env.DB, USER, "h1");
    expect(row?.use_count).toBe(2);
  });

  it("returns null for nonexistent or other user's hook", async () => {
    await seed("ho", OTHER);
    expect(await incrementHookUse(env.DB, USER, "ho")).toBeNull();
    expect(await incrementHookUse(env.DB, USER, "missing")).toBeNull();
  });
});
