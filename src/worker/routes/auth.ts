import { Hono } from "hono";
import { setCookie, deleteCookie } from "hono/cookie";
import type { Env } from "../index";
import type { LoginRequest, MeResponse } from "../../shared/types";
import { verifyPassword, signToken } from "../auth";
import { getUserByEmail, getUserById } from "../db/queries";
import { requireAuth } from "../middleware/requireAuth";

export const auth = new Hono<{ Bindings: Env; Variables: { userId: string } }>();

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
