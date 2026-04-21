import { defineConfig } from "vitest/config";
import { cloudflareTest } from "@cloudflare/vitest-pool-workers";

export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: "./wrangler.toml" },
      miniflare: {
        bindings: {
          JWT_SECRET: "test-secret-at-least-32-chars-long-xxxxxx",
          R2_ACCOUNT_ID: "testacct",
          R2_BUCKET: "social-command-media-test",
          R2_PUBLIC_HOST: "",
          R2_ACCESS_KEY_ID: "AKIATEST",
          R2_SECRET_ACCESS_KEY: "testsecret",
          ANTHROPIC_API_KEY: "test-anthropic-key",
        },
        r2Buckets: { MEDIA: "test-media-bucket" },
      },
    }),
  ],
  test: {},
});
