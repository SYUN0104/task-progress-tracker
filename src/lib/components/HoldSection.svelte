<script lang="ts">
  // Grid of hold-unit cards (AC20-24): frozen elapsed, mandatory annotation
  // already shown by BlockNode itself, plus [주석 수정] / [작업 재개] actions.
  import { holdGrid } from '../domain';
  import BlockNode from './BlockNode.svelte';
  import { useUi } from './context';
  import type { Annotation } from '../domain';

  const ui = useUi();
  const appState = ui.store.appState;
  const cards = $derived(holdGrid($appState));

  function resume(rootId: string) {
    // D3: the store always supplies a fresh id for the (possibly-needed) new
    // right-end column; the reducer ignores it when the original column still
    // exists.
    ui.store.dispatch({
      type: 'resume',
      blockId: rootId,
      now: Date.now(),
      newWorkUnitId: crypto.randomUUID(),
    });
  }

  function editAnnotation(rootId: string, current?: Annotation) {
    ui.openModal({
      kind: 'annotation',
      heading: '주석 수정',
      initial: current,
      submitLabel: '저장',
      onSubmit: (annotation) => ui.store.dispatch({ type: 'editAnnotation', blockId: rootId, annotation }),
    });
  }
</script>

<div class="hold-section">
  {#if cards.length === 0}
    <div class="empty-state"><p>보류 중인 작업이 없습니다.</p></div>
  {:else}
    <div class="grid">
      {#each cards as card (card.root.id)}
        <div class="hold-card">
          <div class="card-body">
            <BlockNode node={card.tree} sectionContext="hold" />
          </div>
          <div class="card-actions">
            <button onclick={() => editAnnotation(card.root.id, card.root.annotation)}>주석 수정</button>
            <button class="primary" onclick={() => resume(card.root.id)}>작업 재개</button>
          </div>
        </div>
      {/each}
    </div>
  {/if}
</div>

<style>
  .hold-section {
    height: 100%;
    overflow-y: auto;
    padding: 16px 20px;
  }

  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
    gap: 1px;
    background: var(--color-border);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    overflow: hidden;
  }

  .hold-card {
    display: flex;
    flex-direction: column;
    background: var(--color-bg-card);
    padding: 12px;
    gap: 8px;
  }

  .card-body {
    flex: 1 1 auto;
  }

  .card-actions {
    display: flex;
    justify-content: flex-end;
    gap: 6px;
  }

  .card-actions button {
    padding: 5px 10px;
    border-radius: var(--radius-sm);
    border: 1px solid var(--color-border-strong);
    background: var(--color-bg-elevated);
    cursor: pointer;
    transition: background var(--transition-fast);
  }

  .card-actions button:hover {
    background: var(--color-bg-hover);
  }

  .card-actions button.primary {
    background: var(--color-accent);
    border-color: var(--color-accent);
    color: var(--color-accent-fg);
  }

  .empty-state {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 60px 20px;
    color: var(--color-text-muted);
  }
</style>
