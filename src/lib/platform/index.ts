// Platform adapter boundary. The store and clock depend only on this
// interface; concrete implementations (Tauri native vs. plain browser) are
// selected at runtime by `getPlatform()`. This lets the entire UI run under
// `vite dev` in a WSL2 browser (D8) while shipping against Tauri on Windows.

export interface Platform {
  /** Load the persisted state JSON, or null when none exists yet. */
  loadState(): Promise<string | null>;
  /** Persist the state JSON (atomic replace on the Tauri side, D7). */
  saveState(json: string): Promise<void>;
  /** Export the state JSON to a user-chosen location (manual backup). */
  exportJson(json: string): Promise<void>;
  /** Import a JSON file chosen by the user; null when cancelled. */
  importJson(): Promise<string | null>;
  /**
   * Subscribe to window visibility changes (minimize/restore/hide/show).
   * The callback receives `true` when the window becomes visible. Returns an
   * unsubscribe function.
   */
  onVisibilityChange(cb: (visible: boolean) => void): () => void;
  /**
   * Register a handler invoked when the window is about to close. The handler
   * is awaited so a pending debounced save can be flushed first (D10).
   */
  onCloseRequested(cb: () => Promise<void>): void;
}

/**
 * Detect whether we are running inside a Tauri webview. Tauri v2 injects
 * `__TAURI_INTERNALS__` on the global object; its absence means a plain browser
 * (dev server / Playwright).
 */
export function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

/** Resolve the concrete platform for the current runtime. */
export async function getPlatform(): Promise<Platform> {
  if (isTauri()) {
    const { createTauriPlatform } = await import('./tauri');
    return createTauriPlatform();
  }
  const { createBrowserPlatform } = await import('./browser');
  return createBrowserPlatform();
}
