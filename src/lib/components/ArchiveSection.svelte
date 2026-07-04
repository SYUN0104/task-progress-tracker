<script lang="ts">
  // Grid of archive cards, one per top-level ancestor (D4, AC25/26/30).
  import { archiveTrees } from '../domain';
  import ArchiveTree from './ArchiveTree.svelte';
  import { useUi } from './context';

  const ui = useUi();
  const appState = ui.store.appState;
  const cards = $derived(archiveTrees($appState));
</script>

<div class="archive-section">
  {#if cards.length === 0}
    <div class="empty-state"><p>완료된 작업이 아직 없습니다.</p></div>
  {:else}
    <div class="grid">
      {#each cards as card (card.rootId)}
        <ArchiveTree {card} />
      {/each}
    </div>
  {/if}
</div>

<style>
  .archive-section {
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

  .empty-state {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 60px 20px;
    color: var(--color-text-muted);
  }
</style>
