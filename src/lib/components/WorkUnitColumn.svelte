<script lang="ts">
  // A single Active column (AC2-4, 9, 11, 45; column-delete guard = D10).
  import type { ActiveColumn } from '../domain';
  import { canDeleteWorkUnit } from '../domain';
  import BlockNode from './BlockNode.svelte';
  import { useUi } from './context';
  import { focusOnMount } from './actions';

  let { column }: { column: ActiveColumn } = $props();

  const ui = useUi();
  const { store } = ui;
  const appState = store.appState;

  const PALETTE = [
    '#5b8def',
    '#4fb286',
    '#d9822b',
    '#e5534b',
    '#a374db',
    '#4bb8c9',
    '#c9a24b',
    '#9a9ca3',
  ];

  let renaming = $state(false);
  let nameValue = $state('');
  let editingLabel = $state(false);
  let labelValue = $state('');
  let pickerOpen = $state(false);

  const canDelete = $derived(canDeleteWorkUnit($appState, column.workUnit.id));

  function startRename() {
    nameValue = column.workUnit.name ?? '';
    renaming = true;
  }

  function commitRename() {
    renaming = false;
    store.dispatch({
      type: 'renameWorkUnit',
      workUnitId: column.workUnit.id,
      name: nameValue.trim(),
    });
  }

  function startEditLabel() {
    labelValue = column.workUnit.label ?? '';
    editingLabel = true;
  }

  function commitLabel() {
    editingLabel = false;
    store.dispatch({
      type: 'setWorkUnitStyle',
      workUnitId: column.workUnit.id,
      label: labelValue.trim() || undefined,
    });
  }

  function pickColor(color: string) {
    pickerOpen = false;
    store.dispatch({ type: 'setWorkUnitStyle', workUnitId: column.workUnit.id, color });
  }

  function handleDelete() {
    if (!canDelete) return;
    store.dispatch({ type: 'deleteEmptyWorkUnit', workUnitId: column.workUnit.id });
  }
</script>

<div class="column" data-workunit-id={column.workUnit.id}>
  <div
    class="column-header"
    style={column.workUnit.color ? `border-top-color: ${column.workUnit.color}` : ''}
  >
    <button
      class="drag-handle"
      data-column-handle={column.workUnit.id}
      data-dnd-ignore
      aria-label="작업단위 순서 변경"
    >⠿</button>

    {#if renaming}
      <input
        class="name-edit"
        data-dnd-ignore
        use:focusOnMount
        bind:value={nameValue}
        onblur={commitRename}
        onkeydown={(e) => {
          if (e.key === 'Enter') commitRename();
          if (e.key === 'Escape') renaming = false;
        }}
      />
    {:else}
      <button class="name" data-dnd-ignore onclick={startRename}>
        {column.workUnit.name || '이름 없는 작업단위'}
      </button>
    {/if}

    {#if column.workUnit.label}
      <span class="label-chip" data-dnd-ignore>{column.workUnit.label}</span>
    {/if}

    <div class="column-actions">
      <div class="color-picker-wrap">
        <button
          class="icon-btn"
          data-dnd-ignore
          title="색상"
          style={column.workUnit.color ? `color: ${column.workUnit.color}` : ''}
          onclick={() => (pickerOpen = !pickerOpen)}
        >●</button>
        {#if pickerOpen}
          <div class="color-picker" data-dnd-ignore>
            {#each PALETTE as c (c)}
              <button
                class="swatch"
                style={`background:${c}`}
                aria-label={`색상 ${c}`}
                onclick={() => pickColor(c)}
              ></button>
            {/each}
          </div>
        {/if}
      </div>
      <button class="icon-btn" data-dnd-ignore title="라벨 편집" onclick={startEditLabel}>#</button>
      <button
        class="icon-btn danger"
        data-dnd-ignore
        title={canDelete ? '빈 작업단위 삭제' : '블럭이 있는 작업단위는 비운 뒤 삭제할 수 있습니다'}
        disabled={!canDelete}
        onclick={handleDelete}
      >✕</button>
    </div>
  </div>

  {#if editingLabel}
    <div class="label-edit-row" data-dnd-ignore>
      <input
        use:focusOnMount
        bind:value={labelValue}
        placeholder="라벨"
        maxlength="16"
        onblur={commitLabel}
        onkeydown={(e) => {
          if (e.key === 'Enter') commitLabel();
          if (e.key === 'Escape') editingLabel = false;
        }}
      />
    </div>
  {/if}

  <div class="column-body">
    {#each column.roots as root (root.block.id)}
      <BlockNode node={root} sectionContext="active" />
    {/each}

    <div class="column-drop-area" data-workunit-id={column.workUnit.id}>
      {#if column.roots.length === 0}
        <span class="empty-hint">블럭을 여기로 드래그하세요</span>
      {/if}
    </div>
  </div>
</div>

<style>
  .column {
    flex: 0 0 auto;
    width: 280px;
    display: flex;
    flex-direction: column;
    border-right: 1px solid var(--color-border);
    padding: 0 12px;
  }

  .column:first-child {
    padding-left: 0;
  }

  .column-header {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 8px 0;
    border-top: 2px solid transparent;
    position: relative;
  }

  .drag-handle {
    flex: 0 0 auto;
    background: none;
    border: none;
    cursor: grab;
    color: var(--color-text-faint);
    padding: 2px;
  }

  .name,
  .name-edit {
    flex: 1 1 auto;
    min-width: 0;
    text-align: left;
    background: none;
    border: none;
    font-weight: 600;
    color: var(--color-text);
    padding: 2px 4px;
    border-radius: var(--radius-sm);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    cursor: text;
  }

  .name:hover {
    background: var(--color-bg-hover);
  }

  .name-edit {
    background: var(--color-bg-elevated);
    border: 1px solid var(--color-accent);
    cursor: text;
  }

  .label-chip {
    flex: 0 0 auto;
    font-size: 11px;
    padding: 1px 6px;
    border-radius: 999px;
    background: var(--color-bg-elevated);
    color: var(--color-text-muted);
  }

  .column-actions {
    flex: 0 0 auto;
    display: flex;
    gap: 2px;
  }

  .icon-btn {
    width: 22px;
    height: 22px;
    border: none;
    background: none;
    border-radius: var(--radius-sm);
    color: var(--color-text-muted);
    cursor: pointer;
  }

  .icon-btn:hover {
    background: var(--color-bg-hover);
  }

  .icon-btn.danger:hover {
    color: var(--color-danger);
  }

  .icon-btn:disabled {
    opacity: 0.35;
    cursor: not-allowed;
  }

  .color-picker-wrap {
    position: relative;
  }

  .color-picker {
    position: absolute;
    top: 100%;
    right: 0;
    z-index: 20;
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 4px;
    padding: 6px;
    background: var(--color-bg-card);
    border: 1px solid var(--color-border-strong);
    border-radius: var(--radius-md);
    box-shadow: var(--shadow-md);
  }

  .swatch {
    width: 18px;
    height: 18px;
    border-radius: 50%;
    border: 1px solid var(--color-border-strong);
    cursor: pointer;
  }

  .label-edit-row {
    padding-bottom: 6px;
  }

  .label-edit-row input {
    width: 100%;
    background: var(--color-bg-elevated);
    border: 1px solid var(--color-accent);
    border-radius: var(--radius-sm);
    padding: 2px 6px;
    color: var(--color-text);
  }

  .column-body {
    flex: 1 1 auto;
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding-bottom: 12px;
  }

  .column-drop-area {
    flex: 1 1 auto;
    min-height: 32px;
    border-radius: var(--radius-sm);
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .empty-hint {
    font-size: 12px;
    color: var(--color-text-faint);
    border: 1px dashed var(--color-border-strong);
    border-radius: var(--radius-md);
    padding: 10px;
    text-align: center;
  }
</style>
