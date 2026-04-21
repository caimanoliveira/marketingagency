import { Hono } from "hono";
import { health } from "./routes/health";
import { auth } from "./routes/auth";

export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  MEDIA: R2Bucket;
  APP_NAME: string;
  JWT_SECRET: string;
  R2_ACCOUNT_ID: string;
  R2_BUCKET: string;
  R2_PUBLIC_HOST: string;
  R2_ACCESS_KEY_ID: string;
  R2_SECRET_ACCESS_KEY: string;
}

const app = new Hono<{ Bindings: Env }>();

app.route("/api/health", health);
app.route("/api/auth", auth);

app.all("/api/*", (c) => c.json({ error: "not_found" }, 404));

app.all("*", (c) => c.env.ASSETS.fetch(c.req.raw));

export default app;
