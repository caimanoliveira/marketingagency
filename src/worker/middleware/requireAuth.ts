import type { MiddlewareHandler } from "hono";
import { getCookie } from "hono/cookie";
import { verifyToken } from "../auth";
import type { Env } from "../index";

export const requireAuth: MiddlewareHandler<{
  Bindings: Env;
  Variables: { userId: string };
}> = async (c, next) => {
  const token = getCookie(c, "session");
  if (!token) return c.json({ error: "unauthorized" }, 401);
  const payload = await verifyToken(token, c.env.JWT_SECRET);
  if (!payload) return c.json({ error: "unauthorized" }, 401);
  c.set("userId", payload.userId);
  await next();
};
