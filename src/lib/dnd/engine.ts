// Pointer-based drag-and-drop engine (plan D5).
//
// Framework-agnostic: `createDndEngine` attaches a SINGLE delegated
// `pointerdown` listener to a container (the Active section's horizontal
// scroll element) and wires up everything else — click/drag disambiguation,
// a live `elementFromPoint` hit-test, a floating ghost, drop indicators and
// edge auto-scroll — only for the lifetime of an actual drag. When idle it
// holds exactly one listener and does no work (idle-zero, plan D5).
//
// A thin Svelte action (`dndEngine`) at the bottom adapts it to `use:` syntax.

import type { Action, AppState } from '../domain';
import {
  classify,
  type Classification,
  type DragSource,
  type DropTarget,
} from './classify';

export interface DndParams {
  /** Current application state (read fresh on every hit-test / drop). */
  getState: () => AppState;
  /** Dispatch a domain action through the store gate. */
  dispatch: (action: Action) => void;
}

/** Total pointer travel (px) that separates a click from a drag. */
const DRAG_THRESHOLD = 5;
/** Distance from a scroll edge (px) within which auto-scroll engages. */
const EDGE = 48;
/** Max auto-scroll speed (px per frame) at the very edge. */
const MAX_SCROLL_SPEED = 20;

interface Tracking {
  kind: 'block' | 'handle';
  /** The block-node (block drag) or the handle button (column drag). */
  sourceEl: HTMLElement;
  /** For handle drags: the owning `.column` (used for the ghost label). */
  columnEl?: HTMLElement;
  sourceBlockId?: string;
  sourceWorkUnitId?: string;
  pointerId: number;
  startX: number;
  startY: number;
  grabDX: number;
  grabDY: number;
  dragging: boolean;
}

interface ResolvedTarget {
  pure: DropTarget;
  blockEl: HTMLElement | null;
  columnEl: HTMLElement | null;
}

export function createDndEngine(container: HTMLElement, params: DndParams) {
  let p = params;
  let track: Tracking | null = null;

  // Drag-time transient state (only meaningful while track.dragging === true).
  let ghost: HTMLElement | null = null;
  let rafId = 0;
  let lastX = 0;
  let lastY = 0;
  let needHitTest = false;
  const indicators: Array<[HTMLElement, string]> = [];

  // ---- indicators ---------------------------------------------------------
  function addIndicator(el: HTMLElement | null, cls: string): void {
    if (!el) return;
    el.classList.add(cls);
    indicators.push([el, cls]);
  }
  function clearIndicators(): void {
    for (const [el, cls] of indicators) el.classList.remove(cls);
    indicators.length = 0;
  }

  // ---- hit-testing (live, never cached) -----------------------------------
  function resolveTarget(x: number, y: number): ResolvedTarget {
    const pure: DropTarget = {};
    let blockEl: HTMLElement | null = null;
    let columnEl: HTMLElement | null = null;

    const el = document.elementFromPoint(x, y) as HTMLElement | null;
    if (el && container.contains(el)) {
      const b = el.closest('[data-block-id]') as HTMLElement | null;
      if (b && container.contains(b)) {
        blockEl = b;
        pure.blockId = b.dataset.blockId;
        // Measure against the block's OWN row, not the whole nested subtree,
        // so the band math reflects the visible header the pointer is over.
        const row = b.querySelector(':scope > .block-row') as HTMLElement | null;
        const rect = (row ?? b).getBoundingClientRect();
        pure.relativeY = rect.height > 0 ? (y - rect.top) / rect.height : 0.5;
      }
      const w = el.closest('[data-workunit-id]') as HTMLElement | null;
      if (w && container.contains(w)) {
        pure.workUnitId = w.dataset.workunitId;
        // Both `.column` and its trailing `.column-drop-area` carry the id;
        // use the enclosing `.column` for the horizontal band (reorder side).
        columnEl = (w.closest('.column') as HTMLElement | null) ?? w;
        const crect = columnEl.getBoundingClientRect();
        pure.relativeX = crect.width > 0 ? (x - crect.left) / crect.width : 0.5;
      }
    }
    return { pure, blockEl, columnEl };
  }

  function currentSource(): DragSource {
    return {
      kind: track!.kind,
      sourceBlockId: track!.sourceBlockId,
      sourceWorkUnitId: track!.sourceWorkUnitId,
    };
  }

  // ---- ghost --------------------------------------------------------------
  function createGhost(): void {
    const g = document.createElement('div');
    g.className = 'tpt-dnd-ghost';
    if (track!.kind === 'block') {
      const row = track!.sourceEl.querySelector(':scope > .block-row') as HTMLElement | null;
      const base = row ?? track!.sourceEl;
      g.style.width = `${base.getBoundingClientRect().width}px`;
      g.appendChild(base.cloneNode(true) as HTMLElement);
    } else {
      const name = track!.columnEl?.querySelector('.name')?.textContent?.trim();
      g.textContent = name && name.length > 0 ? name : '작업단위';
      g.classList.add('tpt-dnd-ghost-column');
    }
    document.body.appendChild(g);
    ghost = g;
    positionGhost();
  }
  function positionGhost(): void {
    if (!ghost || !track) return;
    ghost.style.transform = `translate(${lastX - track.grabDX}px, ${lastY - track.grabDY}px) scale(1.02)`;
  }

  // ---- edge auto-scroll ---------------------------------------------------
  function autoScroll(): void {
    const rect = container.getBoundingClientRect();
    let dx = 0;
    if (lastX < rect.left + EDGE) {
      dx = -MAX_SCROLL_SPEED * proximity(rect.left + EDGE - lastX);
    } else if (lastX > rect.right - EDGE) {
      dx = MAX_SCROLL_SPEED * proximity(lastX - (rect.right - EDGE));
    }
    if (dx !== 0) {
      const before = container.scrollLeft;
      container.scrollLeft += dx;
      // Content moved under a possibly-stationary pointer: re-hit-test.
      if (container.scrollLeft !== before) needHitTest = true;
    }
  }
  function proximity(d: number): number {
    const t = d / EDGE;
    return t < 0 ? 0 : t > 1 ? 1 : t;
  }

  // ---- drag lifecycle -----------------------------------------------------
  function beginDrag(): void {
    track!.dragging = true;
    document.body.classList.add('tpt-dnd-active');
    track!.sourceEl.classList.add('tpt-dnd-source-dragging');
    createGhost();
    needHitTest = true;
    rafId = requestAnimationFrame(frame);
  }

  function frame(): void {
    if (!track || !track.dragging) return;
    autoScroll();
    positionGhost();
    if (needHitTest) {
      const resolved = resolveTarget(lastX, lastY);
      const cls = classify(currentSource(), resolved.pure, p.getState().blocks);
      clearIndicators();
      renderIndicators(cls, resolved);
      needHitTest = false;
    }
    rafId = requestAnimationFrame(frame);
  }

  function renderIndicators(cls: Classification, r: ResolvedTarget): void {
    switch (cls.type) {
      case 'child':
        addIndicator(r.blockEl, 'tpt-dnd-target-child');
        break;
      case 'siblingBefore':
        addIndicator(r.blockEl, 'tpt-dnd-insert-before');
        break;
      case 'siblingAfter':
        addIndicator(r.blockEl, 'tpt-dnd-insert-after');
        break;
      case 'toColumnTopLevel':
        addIndicator(r.columnEl, 'tpt-dnd-col-target');
        break;
      case 'reorderColumn':
        addIndicator(
          r.columnEl,
          cls.before ? 'tpt-dnd-col-insert-before' : 'tpt-dnd-col-insert-after',
        );
        break;
      case 'none':
        break;
    }
  }

  // ---- drop ---------------------------------------------------------------
  function performDrop(): void {
    const resolved = resolveTarget(lastX, lastY);
    const source = currentSource();
    const state = p.getState();
    const cls = classify(source, resolved.pure, state.blocks);

    switch (cls.type) {
      case 'child': {
        if (!resolved.pure.blockId || !source.sourceBlockId) return;
        p.dispatch({
          type: 'moveBlock',
          blockId: source.sourceBlockId,
          mode: 'asChild',
          targetId: resolved.pure.blockId,
        });
        return;
      }
      case 'siblingBefore':
      case 'siblingAfter': {
        if (!resolved.pure.blockId || !source.sourceBlockId) return;
        p.dispatch({
          type: 'moveBlock',
          blockId: source.sourceBlockId,
          mode: cls.type,
          targetId: resolved.pure.blockId,
        });
        return;
      }
      case 'toColumnTopLevel': {
        if (!resolved.pure.workUnitId || !source.sourceBlockId) return;
        p.dispatch({
          type: 'moveBlock',
          blockId: source.sourceBlockId,
          mode: 'toColumnTopLevel',
          targetId: resolved.pure.workUnitId,
        });
        return;
      }
      case 'reorderColumn': {
        const targetWuId = resolved.pure.workUnitId;
        const movedId = source.sourceWorkUnitId;
        if (!targetWuId || !movedId) return;
        // Translate (target column, side) into the reducer's `toIndex`, which
        // indexes into the column list AFTER the moved column is removed.
        const ordered = [...state.workUnits]
          .sort((a, b) => a.order - b.order)
          .filter((w) => w.id !== movedId);
        const idx = ordered.findIndex((w) => w.id === targetWuId);
        if (idx === -1) return;
        const toIndex = cls.before ? idx : idx + 1;
        p.dispatch({ type: 'reorderWorkUnit', workUnitId: movedId, toIndex });
        return;
      }
      case 'none':
        return;
    }
  }

  // ---- teardown -----------------------------------------------------------
  function endTracking(commit: boolean): { wasDragging: boolean } | null {
    if (!track) return null;
    const wasDragging = track.dragging;
    if (wasDragging) {
      if (rafId) cancelAnimationFrame(rafId);
      rafId = 0;
      if (commit) performDrop();
      ghost?.remove();
      ghost = null;
      clearIndicators();
      document.body.classList.remove('tpt-dnd-active');
      track.sourceEl.classList.remove('tpt-dnd-source-dragging');
    }
    try {
      container.releasePointerCapture(track.pointerId);
    } catch {
      /* capture may already be released */
    }
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', onPointerUp);
    window.removeEventListener('pointercancel', onPointerCancel);
    window.removeEventListener('keydown', onKeyDown, true);
    track = null;
    return { wasDragging };
  }

  // ---- pointer / key handlers ---------------------------------------------
  function onPointerDown(e: PointerEvent): void {
    if (e.button !== 0) return; // left button only (right-click is the UI's)
    if (track) return; // ignore secondary pointers mid-gesture
    const t = e.target as HTMLElement;

    // Column handle takes priority: it intentionally ALSO carries
    // data-dnd-ignore (so block interactions ignore it) but IS the initiator
    // of a column reorder, so it must be checked before the ignore bail-out.
    const handleEl = t.closest('[data-column-handle]') as HTMLElement | null;
    if (handleEl && container.contains(handleEl)) {
      const columnEl = handleEl.closest('.column') as HTMLElement | null;
      startTracking(
        {
          kind: 'handle',
          sourceEl: handleEl,
          columnEl: columnEl ?? undefined,
          sourceWorkUnitId: handleEl.dataset.columnHandle,
        },
        e,
        handleEl,
      );
      return;
    }

    // Any other interactive control opts out of click/drag handling.
    if (t.closest('[data-dnd-ignore]')) return;

    const blockEl = t.closest('[data-block-id]') as HTMLElement | null;
    if (blockEl && container.contains(blockEl)) {
      startTracking(
        { kind: 'block', sourceEl: blockEl, sourceBlockId: blockEl.dataset.blockId },
        e,
        blockEl,
      );
    }
  }

  function startTracking(
    base: Pick<
      Tracking,
      'kind' | 'sourceEl' | 'columnEl' | 'sourceBlockId' | 'sourceWorkUnitId'
    >,
    e: PointerEvent,
    rectEl: HTMLElement,
  ): void {
    const rect = rectEl.getBoundingClientRect();
    track = {
      ...base,
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      grabDX: e.clientX - rect.left,
      grabDY: e.clientY - rect.top,
      dragging: false,
    };
    lastX = e.clientX;
    lastY = e.clientY;
    try {
      container.setPointerCapture(e.pointerId);
    } catch {
      /* pointer capture is best-effort */
    }
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerCancel);
    window.addEventListener('keydown', onKeyDown, true);
  }

  function onPointerMove(e: PointerEvent): void {
    if (!track || e.pointerId !== track.pointerId) return;
    lastX = e.clientX;
    lastY = e.clientY;
    if (!track.dragging) {
      if (Math.hypot(e.clientX - track.startX, e.clientY - track.startY) >= DRAG_THRESHOLD) {
        beginDrag();
      }
      return;
    }
    e.preventDefault(); // suppress native text selection while dragging
    needHitTest = true;
  }

  function onPointerUp(e: PointerEvent): void {
    if (!track || e.pointerId !== track.pointerId) return;
    const { kind, sourceEl } = track;
    const result = endTracking(true);
    // A plain click (no drag) on a block completes it (AC5/AC12). Dispatch the
    // engine's contract event on the exact block-node that owns the listener.
    // It is deliberately NON-bubbling: a click on a nested block must not
    // cascade an activation up its ancestor chain (each ancestor block-node
    // also listens for tpt-block-activate). See report note for worker-4.
    if (result && !result.wasDragging && kind === 'block') {
      sourceEl.dispatchEvent(new CustomEvent('tpt-block-activate', { bubbles: false }));
    }
  }

  function onPointerCancel(e: PointerEvent): void {
    if (!track || e.pointerId !== track.pointerId) return;
    endTracking(false);
  }

  function onKeyDown(e: KeyboardEvent): void {
    // Escape cancels an in-flight drag (restore, no dispatch).
    if (track && track.dragging && e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      endTracking(false);
    }
  }

  container.addEventListener('pointerdown', onPointerDown);

  return {
    setParams(next: DndParams): void {
      p = next;
    },
    destroy(): void {
      if (track) endTracking(false);
      container.removeEventListener('pointerdown', onPointerDown);
    },
  };
}

/** Svelte action: `<div use:dndEngine={{ getState, dispatch }}>`. */
export function dndEngine(node: HTMLElement, params: DndParams) {
  const engine = createDndEngine(node, params);
  return {
    update(next: DndParams): void {
      engine.setParams(next);
    },
    destroy(): void {
      engine.destroy();
    },
  };
}
