<script lang="ts">
  // Completion snackbar with an undo shortcut (D6 UX mitigation for the
  // left-click-completes gesture). AppShell owns the auto-dismiss timer.
  import type { SnackbarAction } from './context';

  let { message, action, onDismiss }: { message: string; action?: SnackbarAction; onDismiss: () => void } =
    $props();
</script>

<div class="snackbar" role="status">
  <span>{message}</span>
  {#if action}
    <button
      class="snackbar-action"
      onclick={() => {
        action.onClick();
        onDismiss();
      }}
    >{action.label}</button>
  {/if}
</div>

<style>
  .snackbar {
    position: fixed;
    left: 50%;
    bottom: 24px;
    transform: translateX(-50%);
    z-index: 200;
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px 14px;
    background: var(--color-bg-card);
    border: 1px solid var(--color-border-strong);
    border-radius: var(--radius-md);
    box-shadow: var(--shadow-md);
  }

  .snackbar-action {
    background: none;
    border: none;
    color: var(--color-accent);
    font-weight: 600;
    cursor: pointer;
    padding: 2px 4px;
  }
</style>
