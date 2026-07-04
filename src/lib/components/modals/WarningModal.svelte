<script lang="ts">
  // D2: shown when a completion attempt is blocked by an incomplete/held
  // descendant (AC15).
  import ModalShell from './ModalShell.svelte';

  let { message, onClose }: { message: string; onClose: () => void } = $props();
</script>

<ModalShell onCancel={onClose} labelledBy="warning-modal-heading">
  <h2 id="warning-modal-heading">완료할 수 없습니다</h2>
  <p>{message}</p>
  <div class="modal-actions">
    <button class="primary" onclick={onClose}>확인</button>
  </div>
</ModalShell>
