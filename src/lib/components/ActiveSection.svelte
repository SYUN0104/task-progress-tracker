<script lang="ts">
  // Horizontal-only layout (AC13): columns never wrap, the section scrolls
  // sideways, and a vertical mouse wheel is converted to horizontal scroll.
  import { activeColumns } from '../domain';
  import WorkUnitColumn from './WorkUnitColumn.svelte';
  import { useUi } from './context';

  const ui = useUi();
  const appState = ui.store.appState;
  const columns = $derived(activeColumns($appState));

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
  <div class="columns-scroll" bind:this={scrollEl} onwheel={handleWheel}>
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
</style>
