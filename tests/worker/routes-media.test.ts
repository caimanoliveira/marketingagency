import { describe, it, expect, beforeAll } from "vitest";
import { env, createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import worker from "../../src/worker/index";
import { hashPassword, signToken } from "../../src/worker/auth";

const TEST_USER = "u_media_test";
const TEST_EMAIL = "media@test.dev";

async function setup() {
  await env.DB.exec("CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL, created_at INTEGER NOT NULL)");
  await env.DB.exec("CREATE TABLE IF NOT EXISTS media (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, r2_key TEXT NOT NULL, mime_type TEXT NOT NULL, size_bytes INTEGER NOT NULL, original_name TEXT NOT NULL, width INTEGER, height INTEGER, duration_ms INTEGER, created_at INTEGER NOT NULL)");
  const hash = await hashPassword("irrelevant");
  await env.DB.prepare("INSERT OR REPLACE INTO users (id, email, password_hash, created_at) VALUES (?, ?, ?, ?)").bind(TEST_USER, TEST_EMAIL, hash, Date.now()).run();
}

async function authedCall(path: string, init?: RequestInit) {
  const token = await signToken({ userId: TEST_USER }, env.JWT_SECRET);
  const ctx = createExecutionContext();
  const headers = new Headers(init?.headers);
  headers.set("cookie", `session=${token}`);
  const res = await worker.fetch(new Request(`http://x${path}`, { ...init, headers }), env, ctx);
  await waitOnExecutionContext(ctx);
  return res;
}

beforeAll(setup);

describe("POST /api/media/presigned-upload", () => {
  it("401 without auth", async () => {
    const ctx = createExecutionContext();
    const res = await worker.fetch(new Request("http://x/api/media/presigned-upload", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ filename: "a.jpg", mimeType: "image/jpeg", sizeBytes: 1000 }),
    }), env, ctx);
    await waitOnExecutionContext(ctx);
    expect(res.status).toBe(401);
  });

  it("400 on invalid mime type", async () => {
    const res = await authedCall("/api/media/presigned-upload", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ filename: "evil.exe", mimeType: "application/x-msdownload", sizeBytes: 1000 }),
    });
    expect(res.status).toBe(400);
  });

  it("400 when sizeBytes exceeds 500MB", async () => {
    const res = await authedCall("/api/media/presigned-upload", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ filename: "huge.mp4", mimeType: "video/mp4", sizeBytes: 600 * 1024 * 1024 }),
    });
    expect(res.status).toBe(400);
  });

  it("200 returns mediaId + uploadUrl + r2Key", async () => {
    const res = await authedCall("/api/media/presigned-upload", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ filename: "photo.jpg", mimeType: "image/jpeg", sizeBytes: 1024 * 1024 }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { mediaId: string; uploadUrl: string; r2Key: string; expiresIn: number; };
    expect(body.mediaId).toMatch(/^m_/);
    expect(body.r2Key).toContain(TEST_USER);
    expect(body.uploadUrl).toContain("X-Amz-Signature");
    expect(body.expiresIn).toBeGreaterThan(0);
    const row = await env.DB.prepare("SELECT id, mime_type FROM media WHERE id = ?").bind(body.mediaId).first<{ id: string; mime_type: string }>();
    expect(row?.mime_type).toBe("image/jpeg");
  });
});

describe("GET /api/media", () => {
  it("returns signed URLs for each media item", async () => {
    const res = await authedCall("/api/media");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { items: Array<{ id: string; url: string }> };
    expect(Array.isArray(body.items)).toBe(true);
    expect(body.items.length).toBeGreaterThanOrEqual(1);
    for (const m of body.items) expect(m.url).toContain("X-Amz-Signature");
  });
});

describe("DELETE /api/media/:id", () => {
  it("200 deletes own media", async () => {
    const id = "m_todelete";
    await env.DB.prepare("INSERT INTO media (id, user_id, r2_key, mime_type, size_bytes, original_name, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .bind(id, TEST_USER, `media/${TEST_USER}/${id}.jpg`, "image/jpeg", 100, "x.jpg", Date.now()).run();
    const res = await authedCall(`/api/media/${id}`, { method: "DELETE" });
    expect(res.status).toBe(200);
    const row = await env.DB.prepare("SELECT id FROM media WHERE id = ?").bind(id).first();
    expect(row).toBeNull();
  });

  it("404 for another user's media", async () => {
    const id = "m_other";
    await env.DB.prepare("INSERT INTO media (id, user_id, r2_key, mime_type, size_bytes, original_name, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .bind(id, "u_someone_else", `media/other/${id}.jpg`, "image/jpeg", 100, "x.jpg", Date.now()).run();
    const res = await authedCall(`/api/media/${id}`, { method: "DELETE" });
    expect(res.status).toBe(404);
  });
});
