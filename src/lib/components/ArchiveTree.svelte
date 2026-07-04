<script lang="ts">
  // One archive card: the completed tree plus any dimmed/dashed incomplete
  // ancestor context (AC26). Dimming/dashing itself is rendered by BlockNode
  // based on `node.dimmed`; this component just supplies the card chrome.
  import type { ArchiveCard } from '../domain';
  import BlockNode from './BlockNode.svelte';

  let { card }: { card: ArchiveCard } = $props();

  const completedDate = $derived(new Date(card.latestCompletedAt).toLocaleString());
</script>

<div class="archive-card">
  <div class="card-meta">최근 완료 · {completedDate}</div>
  <BlockNode node={card.tree} sectionContext="archive" />
</div>

<style>
  .archive-card {
    background: var(--color-bg-card);
    padding: 12px;
  }

  .card-meta {
    font-size: 11px;
    color: var(--color-text-faint);
    margin-bottom: 6px;
  }
</style>
