// Browser platform adapter: powers `vite dev` and Playwright smoke runs in a
// plain browser (no Tauri). Persistence is localStorage; export/import use a
// Blob download and a hidden file input. Visibility uses document
// `visibilitychange` only (native minimize events are unavailable here).

import type { Platform } from './index';

const STORAGE_KEY = 'tpt-state';
const EXPORT_FILE_NAME = 'task-tracker-export.json';

export function createBrowserPlatform(): Platform {
  return {
    async loadState(): Promise<string | null> {
      try {
        return localStorage.getItem(STORAGE_KEY);
      } catch {
        // Private-mode / disabled storage: behave as "no saved state".
        return null;
      }
    },

    async saveState(json: string): Promise<void> {
      try {
        localStorage.setItem(STORAGE_KEY, json);
      } catch {
        // Quota exceeded or storage disabled: nothing more we can do in dev.
      }
    },

    async flushState(json: string): Promise<void> {
      // No separate flush path in the browser; localStorage writes synchronously.
      try {
        localStorage.setItem(STORAGE_KEY, json);
      } catch {
        // Quota exceeded or storage disabled: nothing more we can do in dev.
      }
    },

    async exportJson(json: string): Promise<void> {
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = EXPORT_FILE_NAME;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    },

    importJson(): Promise<string | null> {
      return new Promise((resolve) => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'application/json,.json';
        input.style.display = 'none';
        input.addEventListener('change', () => {
          const file = input.files?.[0];
          input.remove();
          if (!file) {
            resolve(null);
            return;
          }
          const reader = new FileReader();
          reader.onload = () =>
            resolve(typeof reader.result === 'string' ? reader.result : null);
          reader.onerror = () => resolve(null);
          reader.readAsText(file);
        });
        document.body.appendChild(input);
        input.click();
      });
    },

    onVisibilityChange(cb: (visible: boolean) => void): () => void {
      const handler = () => cb(document.visibilityState === 'visible');
      document.addEventListener('visibilitychange', handler);
      return () => document.removeEventListener('visibilitychange', handler);
    },

    onCloseRequested(cb: () => Promise<void>): void {
      // The browser has no awaitable close hook. `beforeunload` cannot await a
      // promise, but the browser adapter's saveState writes to localStorage
      // synchronously, so firing the flush still persists before unload.
      window.addEventListener('beforeunload', () => {
        void cb();
      });
    },
  };
}
