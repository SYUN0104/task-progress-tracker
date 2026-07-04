<script lang="ts">
  // Title-required / body-optional note. Used for the mandatory hold
  // annotation (AC20 — cancel aborts the hold) and archive annotation
  // add/edit (AC28 — pre-filled from `initial` in edit mode).
  import ModalShell from './ModalShell.svelte';
  import { focusOnMount } from '../actions';
  import type { Annotation } from '../../domain';

  let {
    heading,
    initial,
    submitLabel,
    onSubmit,
    onCancel,
  }: {
    heading: string;
    initial?: Annotation;
    submitLabel: string;
    onSubmit: (annotation: Annotation) => void;
    onCancel: () => void;
  } = $props();

  let title = $state(initial?.title ?? '');
  let body = $state(initial?.body ?? '');

  const canSubmit = $derived(title.trim().length > 0);

  function submit() {
    if (!canSubmit) return;
    const trimmedBody = body.trim();
    onSubmit({ title: title.trim(), body: trimmedBody || undefined });
  }
</script>

<ModalShell {onCancel} labelledBy="annotation-modal-heading">
  <h2 id="annotation-modal-heading">{heading}</h2>
  <label class="field">
    <span>제목 *</span>
    <input
      use:focusOnMount
      bind:value={title}
      maxlength="80"
      onkeydown={(e) => {
        if (e.key === 'Enter') submit();
      }}
    />
  </label>
  <label class="field">
    <span>내용</span>
    <textarea bind:value={body} rows="3"></textarea>
  </label>
  <div class="modal-actions">
    <button onclick={onCancel}>취소</button>
    <button class="primary" disabled={!canSubmit} onclick={submit}>{submitLabel}</button>
  </div>
</ModalShell>
