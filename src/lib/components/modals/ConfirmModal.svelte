<script lang="ts">
  // Used for the cascade-delete confirmation on archived blocks (AC27/29/D4).
  import ModalShell from './ModalShell.svelte';

  let {
    message,
    confirmLabel,
    onConfirm,
    onCancel,
  }: { message: string; confirmLabel: string; onConfirm: () => void; onCancel: () => void } = $props();
</script>

<ModalShell {onCancel} labelledBy="confirm-modal-heading">
  <h2 id="confirm-modal-heading">확인 필요</h2>
  <p>{message}</p>
  <div class="modal-actions">
    <button onclick={onCancel}>취소</button>
    <button class="danger" onclick={onConfirm}>{confirmLabel}</button>
  </div>
</ModalShell>
