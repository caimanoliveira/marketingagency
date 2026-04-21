import { defineConfig } from "vitest/config";
import { cloudflarePool } from "@cloudflare/vitest-pool-workers";

export default defineConfig({
  test: {
    pool: cloudflarePool({
      wrangler: { configPath: "./wrangler.toml" },
      miniflare: {
        bindings: { JWT_SECRET: "test-secret-at-least-32-chars-long-xxxxxx" },
      },
    }),
  },
});
