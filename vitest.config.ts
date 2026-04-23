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
          LINKEDIN_CLIENT_ID: "test-linkedin-id",
          LINKEDIN_CLIENT_SECRET: "test-linkedin-secret",
          LINKEDIN_REDIRECT_URL: "http://test.local/api/connections/linkedin/callback",
          META_APP_ID: "test-meta-app-id",
          META_APP_SECRET: "test-meta-app-secret",
          META_REDIRECT_URL: "http://test.local/api/connections/instagram/callback",
          APP_ORIGIN: "http://test.local",
        },
        r2Buckets: { MEDIA: "test-media-bucket" },
        queueProducers: { PUBLISH_QUEUE: "publish-jobs" },
        queueConsumers: { "publish-jobs": { maxBatchSize: 1 } },
      },
    }),
  ],
  test: {},
});
