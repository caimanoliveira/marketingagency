import { Hono } from "hono";
import { health } from "./routes/health";
import { auth } from "./routes/auth";
import { media } from "./routes/media";
import { posts } from "./routes/posts";
import { ai } from "./routes/ai";
import { connections } from "./routes/connections";
import { publish } from "./routes/publish";
import type { PublishJob } from "../shared/types";

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
  ANTHROPIC_API_KEY: string;
  LINKEDIN_CLIENT_ID: string;
  LINKEDIN_CLIENT_SECRET: string;
  LINKEDIN_REDIRECT_URL: string;
  APP_ORIGIN: string;
  PUBLISH_QUEUE: Queue<PublishJob>;
}

const app = new Hono<{ Bindings: Env }>();

app.route("/api/health", health);
app.route("/api/auth", auth);
app.route("/api/media", media);
app.route("/api/posts", posts);
app.route("/api/ai", ai);
app.route("/api/connections", connections);
app.route("/api/publish", publish);

app.all("/api/*", (c) => c.json({ error: "not_found" }, 404));

app.all("*", (c) => c.env.ASSETS.fetch(c.req.raw));

export default app;
