import { Hono } from "hono";
import { setCookie, deleteCookie } from "hono/cookie";
import type { Env } from "../index";
import type { LoginRequest, MeResponse } from "../../shared/types";
import { verifyPassword, signToken } from "../auth";
import { getUserByEmail, getUserById } from "../db/queries";
import { requireAuth } from "../middleware/requireAuth";

export const auth = new Hono<{ Bindings: Env; Variables: { userId: string } }>();

const RATE_LIMIT_MAX = 10;
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;

auth.post("/login", async (c) => {
  let body: LoginRequest;
  try {
    body = await c.req.json<LoginRequest>();
  } catch {
    return c.json({ error: "invalid_json" }, 400);
  }
  if (!body?.email || !body?.password) {
    return c.json({ error: "missing_fields" }, 400);
  }

  const ip =
    c.req.header("CF-Connecting-IP") ??
    c.req.header("X-Forwarded-For")?.split(",")[0].trim() ??
    "unknown";
  const windowStart = Date.now() - RATE_LIMIT_WINDOW_MS;

  const rateRow = await c.env.DB.prepare(
    "SELECT COUNT(*) AS cnt FROM login_attempts WHERE ip = ? AND attempted_at > ?"
  ).bind(ip, windowStart).first<{ cnt: number }>();

  if ((rateRow?.cnt ?? 0) >= RATE_LIMIT_MAX) {
    return c.json({ error: "too_many_attempts" }, 429);
  }

  await c.env.DB.prepare("INSERT INTO login_attempts (ip, attempted_at) VALUES (?, ?)")
    .bind(ip, Date.now()).run();

  // Clean up entries older than 1h (best-effort, non-blocking)
  c.env.DB.prepare("DELETE FROM login_attempts WHERE attempted_at < ?")
    .bind(Date.now() - 60 * 60 * 1000).run().catch(() => {});

  const user = await getUserByEmail(c.env.DB, body.email);
  if (!user) return c.json({ error: "invalid_credentials" }, 401);
  const ok = await verifyPassword(body.password, user.password_hash);
  if (!ok) return c.json({ error: "invalid_credentials" }, 401);
  const token = await signToken({ userId: user.id }, c.env.JWT_SECRET);
  setCookie(c, "session", token, {
    httpOnly: true,
    secure: true,
    sameSite: "Lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
  return c.json({ ok: true });
});

auth.post("/logout", (c) => {
  deleteCookie(c, "session", { path: "/" });
  return c.json({ ok: true });
});

auth.get("/me", requireAuth, async (c) => {
  const userId = c.get("userId");
  const user = await getUserById(c.env.DB, userId);
  if (!user) return c.json({ error: "unauthorized" }, 401);
  const body: MeResponse = { userId: user.id, email: user.email };
  return c.json(body);
});
