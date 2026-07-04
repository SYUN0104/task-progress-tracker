// Tauri v2 platform adapter. All `@tauri-apps/api` imports are dynamic so this
// module has no import-time side effects and never evaluates Tauri internals in
// a plain browser bundle. It maps 1:1 onto the Rust commands defined in
// src-tauri/app/src/main.rs: save_state / load_state / flush_state /
// export_json / import_json.

import type { Platform } from './index';

export function createTauriPlatform(): Platform {
  return {
    async loadState(): Promise<string | null> {
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke<string | null>('load_state');
    },

    async saveState(json: string): Promise<void> {
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('save_state', { json });
    },

    async exportJson(json: string): Promise<void> {
      const { invoke } = await import('@tauri-apps/api/core');
      // Rust maps camelCase args to snake_case (`default_file_name`).
      await invoke('export_json', { json, defaultFileName: 'task-tracker-export.json' });
    },

    async importJson(): Promise<string | null> {
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke<string | null>('import_json');
    },

    onVisibilityChange(cb: (visible: boolean) => void): () => void {
      let disposed = false;
      const unlisteners: Array<() => void> = [];

      // D1: native minimize/restore is the PRIMARY signal (WebView2's
      // `visibilitychange` cannot be trusted for the minimize transition).
      // On any window resize we re-query `isMinimized()`; `document`
      // visibility is folded in as corroboration.
      void (async () => {
        const { getCurrentWindow } = await import('@tauri-apps/api/window');
        const win = getCurrentWindow();

        const emit = async () => {
          const minimized = await win.isMinimized();
          const docHidden =
            typeof document !== 'undefined' && document.visibilityState === 'hidden';
          cb(!minimized && !docHidden);
        };

        const unResize = await win.listen('tauri://resize', () => {
          void emit();
        });
        if (disposed) {
          unResize();
          return;
        }
        unlisteners.push(unResize);

        if (typeof document !== 'undefined') {
          const onVis = () => {
            void emit();
          };
          document.addEventListener('visibilitychange', onVis);
          unlisteners.push(() => document.removeEventListener('visibilitychange', onVis));
        }
      })();

      return () => {
        disposed = true;
        for (const un of unlisteners) un();
        unlisteners.length = 0;
      };
    },

    onCloseRequested(cb: () => Promise<void>): void {
      // D10: intercept the close, flush the pending save, then destroy the
      // window so the last-debounce-window mutation is never lost.
      void (async () => {
        const { getCurrentWindow } = await import('@tauri-apps/api/window');
        const win = getCurrentWindow();
        await win.onCloseRequested(async (event) => {
          event.preventDefault();
          try {
            await cb();
          } finally {
            await win.destroy();
          }
        });
      })();
    },
  };
}
