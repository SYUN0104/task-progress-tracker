// The app's ONLY periodic work (D1). A readable `now` store ticks at 1 Hz, but
// exclusively while the window is visible AND something is subscribed. When the
// window is minimized/hidden the interval is cleared entirely — zero periodic
// work in the background (AC18/19). Elapsed time is derived elsewhere from
// timestamps, so a stopped clock never loses time; on restore we recompute once
// immediately and resume ticking.

import { readable, type Readable } from 'svelte/store';
import type { Platform } from '../platform';

export interface Clock {
  /** Current wall-clock time (ms), updated at ~1 Hz while visible. */
  now: Readable<number>;
  /** Detach the visibility listener and stop any interval. */
  destroy(): void;
}

export function createClock(platform: Platform, intervalMs = 1000): Clock {
  // The interval runs only when BOTH hold: there is a live subscriber AND the
  // window is visible. We assume the app opens visible (the always-on usage
  // pattern); `onVisibilityChange` corrects the flag on the first transition.
  let visible = true;
  let timer: ReturnType<typeof setInterval> | null = null;
  let set: ((value: number) => void) | null = null;

  const tick = () => {
    if (set) set(Date.now());
  };

  const startTimer = () => {
    if (timer !== null || set === null || !visible) return;
    tick(); // immediate recompute on (re)start
    timer = setInterval(tick, intervalMs);
  };

  const stopTimer = () => {
    if (timer !== null) {
      clearInterval(timer);
      timer = null;
    }
  };

  const unsubscribeVisibility = platform.onVisibilityChange((isVisible) => {
    visible = isVisible;
    if (isVisible) startTimer();
    else stopTimer();
  });

  const now = readable<number>(Date.now(), (setter) => {
    set = setter;
    startTimer();
    return () => {
      stopTimer();
      set = null;
    };
  });

  return {
    now,
    destroy() {
      stopTimer();
      unsubscribeVisibility();
    },
  };
}

/**
 * Register a global Ctrl+Z (⌘Z) handler that triggers `onUndo`. Keystrokes are
 * ignored while focus is inside a text field so native text-editing undo keeps
 * working (D6). Returns an unregister function.
 */
export function registerUndoShortcut(
  onUndo: () => void,
  target: Document = document,
): () => void {
  const handler = (event: KeyboardEvent) => {
    const isUndoChord =
      (event.ctrlKey || event.metaKey) &&
      !event.shiftKey &&
      !event.altKey &&
      (event.key === 'z' || event.key === 'Z');
    if (!isUndoChord) return;

    const active = target.activeElement as HTMLElement | null;
    if (
      active &&
      (active.tagName === 'INPUT' ||
        active.tagName === 'TEXTAREA' ||
        active.isContentEditable)
    ) {
      return; // let the text field handle its own undo
    }

    event.preventDefault();
    onUndo();
  };

  target.addEventListener('keydown', handler as EventListener);
  return () => target.removeEventListener('keydown', handler as EventListener);
}
