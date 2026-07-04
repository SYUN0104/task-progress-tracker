<script lang="ts">
  // Shared backdrop + panel chrome for the three modal kinds (AnnotationModal,
  // WarningModal, ConfirmModal). Handles Esc-to-cancel and backdrop click.
  import type { Snippet } from 'svelte';

  let { onCancel, labelledBy, children }: {
    onCancel: () => void;
    labelledBy?: string;
    children: Snippet;
  } = $props();

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') onCancel();
  }
</script>

<svelte:window onkeydown={handleKeydown} />

<div class="modal-overlay">
  <!-- Keyboard-operable backdrop: a real <button> covering the overlay,
       painted behind the panel (later siblings hit-test on top by default,
       so clicks inside the panel never reach this). -->
  <button type="button" class="modal-backdrop" aria-label="닫기" onclick={onCancel}></button>
  <div class="modal-panel" role="dialog" aria-modal="true" aria-labelledby={labelledBy} tabindex="-1">
    {@render children()}
  </div>
</div>

<style>
  .modal-overlay {
    position: fixed;
    inset: 0;
    z-index: 150;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .modal-backdrop {
    position: absolute;
    inset: 0;
    padding: 0;
    border: none;
    background: rgba(0, 0, 0, 0.45);
    cursor: default;
  }

  .modal-panel {
    position: relative;
    width: 360px;
    max-width: calc(100vw - 32px);
    padding: 20px;
    background: var(--color-bg-card);
    border: 1px solid var(--color-border-strong);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-md);
    outline: none;
  }

  .modal-panel :global(h2) {
    margin: 0 0 12px;
    font-size: 15px;
  }

  .modal-panel :global(.field) {
    display: flex;
    flex-direction: column;
    gap: 4px;
    margin-bottom: 12px;
    font-size: 12px;
    color: var(--color-text-muted);
  }

  .modal-panel :global(.field input),
  .modal-panel :global(.field textarea) {
    background: var(--color-bg-elevated);
    border: 1px solid var(--color-border-strong);
    border-radius: var(--radius-sm);
    padding: 6px 8px;
    color: var(--color-text);
    resize: vertical;
  }

  .modal-panel :global(.field input:focus),
  .modal-panel :global(.field textarea:focus) {
    outline: none;
    border-color: var(--color-accent);
  }

  .modal-panel :global(p) {
    margin: 0 0 16px;
    color: var(--color-text-muted);
    font-size: 13px;
  }

  .modal-panel :global(.modal-actions) {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
  }

  .modal-panel :global(.modal-actions button) {
    padding: 6px 14px;
    border-radius: var(--radius-sm);
    border: 1px solid var(--color-border-strong);
    background: var(--color-bg-elevated);
    cursor: pointer;
    transition: background var(--transition-fast);
  }

  .modal-panel :global(.modal-actions button:hover) {
    background: var(--color-bg-hover);
  }

  .modal-panel :global(.modal-actions button.primary) {
    background: var(--color-accent);
    border-color: var(--color-accent);
    color: var(--color-accent-fg);
  }

  .modal-panel :global(.modal-actions button.danger) {
    background: var(--color-danger);
    border-color: var(--color-danger);
    color: var(--color-danger-fg);
  }

  .modal-panel :global(.modal-actions button:disabled) {
    opacity: 0.5;
    cursor: not-allowed;
  }
</style>
