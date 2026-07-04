import { defineConfig, devices } from '@playwright/test';

// Fixed port, distinct from the Tauri dev port (1420), so this suite never
// collides with a `tauri dev`/`vite` instance a developer already has running.
const PORT = 5199;

export default defineConfig({
  testDir: './tests/e2e',
  // Each test gets its own browser context (Playwright Test default), which
  // means a fresh, empty localStorage per test — the browser platform adapter
  // persists to `localStorage['tpt-state']` (see src/lib/platform/browser.ts),
  // so per-test context isolation IS the storage isolation. No manual
  // localStorage.clear() is needed (and doing it via addInitScript would be
  // actively wrong for the reload-based tests below, since an init script
  // re-runs on every navigation including page.reload()).
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: 'list',
  timeout: 30_000,
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
  },
  // Chromium only: WebView2 (the shipped Windows runtime, D8) is Blink-based,
  // so the bundled Playwright Chromium is the right stand-in. Deliberately NOT
  // channel:'chrome' — there is no system Chrome in this WSL2 environment, and
  // the bundled build is already the closer match.
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    // Routed through the npm script (not a bare `vite` invocation) so
    // node_modules/.bin is guaranteed to be on PATH.
    command: `npm run dev -- --port ${PORT} --strictPort`,
    port: PORT,
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
