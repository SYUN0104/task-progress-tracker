<script lang="ts">
  // Positioned custom menu (AC6/AC27). Closes on outside click/Esc; native
  // context menu is suppressed by the caller (BlockNode.handleContextMenu).
  //
  // Closes on `pointerdown` (not `click`) so that opening a NEW menu with a
  // right-click on a different block works correctly: pointerdown fires
  // before `contextmenu`, so the old menu is closed first and the new one
  // (opened by the target block's own contextmenu handler) is not immediately
  // clobbered by a stale window listener.
  import type { MenuRequest } from './context';

  let { request, onClose }: { request: MenuRequest; onClose: () => void } = $props();

  let menuEl: HTMLDivElement | undefined = $state();

  function handlePointerDown(e: PointerEvent) {
    if (menuEl && e.target instanceof Node && menuEl.contains(e.target)) return;
    onClose();
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') onClose();
  }

  function select(onSelect: () => void) {
    onSelect();
    onClose();
  }
</script>

<svelte:window onpointerdown={handlePointerDown} onkeydown={handleKeydown} />

<div
  class="context-menu"
  bind:this={menuEl}
  style={`left:${request.x}px; top:${request.y}px;`}
>
  {#each request.items as item (item.label)}
    <button class="menu-item" class:danger={item.danger} onclick={() => select(item.onSelect)}>
      {item.label}
    </button>
  {/each}
</div>

<style>
  .context-menu {
    position: fixed;
    z-index: 100;
    min-width: 160px;
    display: flex;
    flex-direction: column;
    padding: 4px;
    background: var(--color-bg-card);
    border: 1px solid var(--color-border-strong);
    border-radius: var(--radius-md);
    box-shadow: var(--shadow-md);
  }

  .menu-item {
    text-align: left;
    padding: 6px 10px;
    border: none;
    background: none;
    border-radius: var(--radius-sm);
    cursor: pointer;
    color: var(--color-text);
    transition: background var(--transition-fast);
  }

  .menu-item:hover {
    background: var(--color-bg-hover);
  }

  .menu-item.danger {
    color: var(--color-danger);
  }
</style>
