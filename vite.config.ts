import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

// Tauri exposes the dev-server host to bind to (mobile targets, remote hosts).
// See: https://v2.tauri.app/start/frontend/vite/
const host = process.env.TAURI_DEV_HOST;

export default defineConfig({
  plugins: [svelte()],

  // Vitest (via `npm test`) reads its config from this file by default and
  // would otherwise also collect tests/e2e/*.spec.ts — those import `test`
  // from @playwright/test, not Vitest, and are already run separately via
  // `npx playwright test` (see playwright.config.ts).
  test: {
    exclude: ['tests/e2e/**', 'node_modules/**'],
  },

  // Vite options tailored for Tauri development.
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: 'ws',
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // Tell Vite to ignore watching the Rust workspace.
      ignored: ['**/src-tauri/**'],
    },
  },
});
