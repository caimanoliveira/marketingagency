import { Hono } from "hono";
import type { Env } from "../index";
import type { HealthResponse } from "../../shared/types";

export const health = new Hono<{ Bindings: Env }>();

health.get("/", (c) => {
  const body: HealthResponse = { ok: true, app: c.env.APP_NAME };
  return c.json(body);
});
