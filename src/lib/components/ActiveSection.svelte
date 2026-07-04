<script lang="ts">
  // Horizontal-only layout (AC13): columns never wrap, the section scrolls
  // sideways, and a vertical mouse wheel is converted to horizontal scroll.
  import { get } from 'svelte/store';
  import { activeColumns } from '../domain';
  import WorkUnitColumn from './WorkUnitColumn.svelte';
  import { useUi } from './context';
  import { dndEngine } from '../dnd/engine';

  const ui = useUi();
  const appState = ui.store.appState;
  const columns = $derived(activeColumns($appState));

  // The DnD engine owns pointer gestures inside this scroll container: click =
  // complete (dispatched back to BlockNode), drag = move/reorder. It attaches a
  // single delegated pointerdown here and does nothing until a drag begins.
  const dndParams = {
    getState: () => get(appState),
    dispatch: ui.store.dispatch,
  };

  let scrollEl: HTMLDivElement | undefined = $state();

  function handleWheel(e: WheelEvent) {
    if (!scrollEl) return;
    // Only hijack a predominantly-vertical wheel gesture; a trackpad's native
    // horizontal swipe (deltaX already dominant) is left alone.
    if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
      e.preventDefault();
      scrollEl.scrollLeft += e.deltaY;
    }
  }

  function addColumn() {
    ui.store.dispatch({ type: 'createWorkUnit', workUnitId: crypto.randomUUID() });
  }
</script>

<div class="active-section">
  <div class="columns-scroll" bind:this={scrollEl} onwheel={handleWheel} use:dndEngine={dndParams}>
    {#if columns.length === 0}
      <div class="empty-state">
        <p>아직 작업이 없습니다.</p>
        <p class="hint">상단 입력창에서 Enter로 첫 블럭을 만들어보세요.</p>
      </div>
    {/if}

    {#each columns as column (column.workUnit.id)}
      <WorkUnitColumn {column} />
    {/each}

    <button class="add-column" onclick={addColumn} aria-label="새 작업단위 추가">+</button>
  </div>
</div>

<style>
  .active-section {
    height: 100%;
    overflow: hidden;
  }

  .columns-scroll {
    height: 100%;
    display: flex;
    align-items: flex-start;
    overflow-x: auto;
    overflow-y: hidden;
    padding: 16px 20px;
  }

  .add-column {
    flex: 0 0 auto;
    align-self: stretch;
    width: 36px;
    min-height: 80px;
    border: 1px dashed var(--color-border-strong);
    border-radius: var(--radius-md);
    background: none;
    color: var(--color-text-faint);
    cursor: pointer;
    font-size: 16px;
    transition: background var(--transition-fast), color var(--transition-fast);
  }

  .add-column:hover {
    background: var(--color-bg-hover);
    color: var(--color-text);
  }

  .empty-state {
    flex: 1 1 auto;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 4px;
    padding: 60px 20px;
    color: var(--color-text-muted);
  }

  .empty-state .hint {
    font-size: 12px;
    color: var(--color-text-faint);
  }

  /* ---- DnD engine visuals (applied to elements owned by other components,
     hence :global). The engine adds/removes these classes during a drag. ---- */

  /* Floating drag ghost (appended to <body>). */
  :global(.tpt-dnd-ghost) {
    position: fixed;
    top: 0;
    left: 0;
    pointer-events: none;
    z-index: 9999;
    opacity: 0.9;
    box-shadow: var(--shadow-md);
    border-radius: var(--radius-sm);
    background: var(--color-bg-card);
    padding: 4px 8px;
    will-change: transform;
  }
  :global(.tpt-dnd-ghost-column) {
    font-weight: 600;
    color: var(--color-text);
    padding: 6px 12px;
  }

  /* Global cursor + selection lock while a drag is in progress. */
  :global(body.tpt-dnd-active) {
    cursor: grabbing;
    user-select: none;
  }
  /* Dim the original block/handle being dragged (kept in layout so coordinates
     stay stable). */
  :global(.tpt-dnd-source-dragging) {
    opacity: 0.4;
  }

  /* Block target (center band): highlight the target block's row. */
  :global(.block-node.tpt-dnd-target-child > .block-row) {
    box-shadow: inset 0 0 0 2px var(--color-accent);
    border-radius: var(--radius-sm);
  }

  /* Sibling insert (top/bottom bands): a 2px accent line before/after the block. */
  :global(.block-node.tpt-dnd-insert-before),
  :global(.block-node.tpt-dnd-insert-after) {
    position: relative;
  }
  :global(.block-node.tpt-dnd-insert-before)::before,
  :global(.block-node.tpt-dnd-insert-after)::after {
    content: '';
    position: absolute;
    left: 0;
    right: 0;
    height: 2px;
    background: var(--color-accent);
    border-radius: 1px;
    pointer-events: none;
    z-index: 5;
  }
  :global(.block-node.tpt-dnd-insert-before)::before {
    top: -1px;
  }
  :global(.block-node.tpt-dnd-insert-after)::after {
    bottom: -1px;
  }

  /* Column empty area target (toColumnTopLevel): highlight the whole column. */
  :global(.column.tpt-dnd-col-target) {
    background: var(--color-bg-hover);
    border-radius: var(--radius-md);
  }
  :global(.column.tpt-dnd-col-target .column-drop-area) {
    outline: 2px dashed var(--color-accent);
    outline-offset: -2px;
  }

  /* Column reorder: a vertical accent bar on the target column's left/right edge. */
  :global(.column.tpt-dnd-col-insert-before),
  :global(.column.tpt-dnd-col-insert-after) {
    position: relative;
  }
  :global(.column.tpt-dnd-col-insert-before)::before,
  :global(.column.tpt-dnd-col-insert-after)::after {
    content: '';
    position: absolute;
    top: 0;
    bottom: 0;
    width: 3px;
    background: var(--color-accent);
    border-radius: 2px;
    pointer-events: none;
    z-index: 5;
  }
  :global(.column.tpt-dnd-col-insert-before)::before {
    left: -2px;
  }
  :global(.column.tpt-dnd-col-insert-after)::after {
    right: -2px;
  }
</style>
