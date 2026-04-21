import { Hono } from "hono";
import { health } from "./routes/health";

export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  APP_NAME: string;
  JWT_SECRET: string;
}

const app = new Hono<{ Bindings: Env }>();

app.route("/api/health", health);

app.all("/api/*", (c) => c.json({ error: "not_found" }, 404));

app.all("*", (c) => c.env.ASSETS.fetch(c.req.raw));

export default app;
