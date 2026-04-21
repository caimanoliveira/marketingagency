import { defineConfig } from "vitest/config";
import { cloudflareTest } from "@cloudflare/vitest-pool-workers";

export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: "./wrangler.toml" },
      miniflare: {
        bindings: { JWT_SECRET: "test-secret-at-least-32-chars-long-xxxxxx" },
      },
    }),
  ],
  test: {},
});
