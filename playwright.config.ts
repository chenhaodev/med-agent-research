import { defineConfig, devices } from '@playwright/test';

/* Phase 0 e2e: drive the real static pages against the running mock backend.
   Two web servers are started automatically — the Fastify mock (:8787) and a
   static file server for the repo root (:8731). STREAM_STEP_MS is lowered so
   the SSE pipeline completes quickly under test. */
export default defineConfig({
  testDir: 'tests/e2e',
  // These are integration tests against a single, stateful in-memory mock that
  // serves Server-Sent Event streams. Run them serially so concurrent SSE load
  // on the dev server can't introduce timing flakiness.
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: 'http://localhost:8731',
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: [
    {
      command: 'npm --prefix server run mock',
      url: 'http://localhost:8787/api/v1/facets',
      reuseExistingServer: !process.env.CI,
      env: { PORT: '8787', STREAM_STEP_MS: '30' },
      timeout: 60_000,
    },
    {
      command: 'python3 -m http.server 8731',
      url: 'http://localhost:8731/index.html',
      reuseExistingServer: !process.env.CI,
      timeout: 30_000,
    },
  ],
});
