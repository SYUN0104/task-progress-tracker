<script lang="ts">
  // Recursive block renderer shared by Active/Hold/Archive (AC5-7, 15, 26, 43-46).
  //
  // DnD contract (task #6): completion-by-left-click is intentionally NOT
  // wired to a native `onclick` here. Once the DnD engine disambiguates a
  // plain click (pointerdown -> pointerup with <5px movement) on an element
  // resolved via `closest('[data-block-id]')`, it should dispatch:
  //   element.dispatchEvent(new CustomEvent('tpt-block-activate', { bubbles: true }))
  // We listen for that event and route it through the same completion guard
  // used by the keyboard Enter/Space path below.
  //
  // Interactive sub-controls (chevron, quick-add, inline-edit inputs) carry
  // `data-dnd-ignore`: a suggested (additive, optional) convention for the
  // engine to bail out of click/drag disambiguation when `pointerdown`
  // originates inside `closest('[data-dnd-ignore]')`, so toggling collapse or
  // adding a child is never misread as "complete this block".
  import { get } from 'svelte/store';
  import type { BlockTreeNode } from '../domain';
  import { canComplete, elapsedMs, formatElapsed } from '../domain';
  import { useUi } from './context';
  import { focusOnMount } from './actions';
  import { staleLevel } from './stale';
  // Recursive self-import (the modern replacement for <svelte:self>).
  import BlockNode from './BlockNode.svelte';

  let { node, sectionContext }: { node: BlockTreeNode; sectionContext: 'active' | 'hold' | 'archive' } =
    $props();

  const ui = useUi();
  const { store, clock } = ui;
  const now = clock.now;

  let editing = $state(false);
  let editValue = $state('');
  let addingChild = $state(false);
  let addChildValue = $state('');
  let hovering = $state(false);

  const block = $derived(node.block);
  const isDimmed = $derived(node.dimmed === true);
  const hasChildren = $derived(node.children.length > 0);
  const elapsed = $derived(elapsedMs(block, $now));
  const stale = $derived(
    sectionContext === 'active' && block.status === 'active' ? staleLevel(elapsed) : 'none',
  );

  function attemptComplete() {
    if (sectionContext !== 'active') return;
    const state = get(store.appState);
    if (!canComplete(state, block.id)) {
      ui.openModal({
        kind: 'warning',
        message: '하위 작업이 모두 완료되어야 이 블럭을 완료할 수 있습니다.',
      });
      return;
    }
    store.dispatch({ type: 'complete', blockId: block.id, now: Date.now() });
    ui.showSnackbar('완료됨', { label: '실행취소', onClick: () => store.undo() });
  }

  function handleActivate() {
    attemptComplete();
  }

  // The DnD engine's contract event is a hyphenated custom event name, which
  // Svelte's typed `on*` attributes don't recognize — an action wired to
  // addEventListener is the clean way to listen for it regardless.
  function onActivateEvent(node: HTMLElement, handler: () => void) {
    const listener = () => handler();
    node.addEventListener('tpt-block-activate', listener);
    return {
      destroy() {
        node.removeEventListener('tpt-block-activate', listener);
      },
    };
  }

  function handleKeydown(e: KeyboardEvent) {
    if (sectionContext !== 'active' || editing || addingChild) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      attemptComplete();
    }
  }

  function startEdit() {
    editValue = block.text;
    editing = true;
  }

  function openHoldModal() {
    ui.openModal({
      kind: 'annotation',
      heading: '홀드로 이동',
      submitLabel: '홀드',
      onSubmit: (annotation) => {
        store.dispatch({ type: 'hold', blockId: block.id, annotation, now: Date.now() });
      },
    });
  }

  function openAnnotationModal() {
    ui.openModal({
      kind: 'annotation',
      heading: block.annotation ? '주석 수정' : '주석 추가',
      initial: block.annotation,
      submitLabel: '저장',
      onSubmit: (annotation) => {
        store.dispatch({ type: 'editAnnotation', blockId: block.id, annotation });
      },
    });
  }

  function openDeleteConfirm() {
    ui.openModal({
      kind: 'confirm',
      message: '이 작업과 하위 항목이 모두 삭제됩니다 (Ctrl+Z로 복구 가능). 계속할까요?',
      confirmLabel: '삭제',
      onConfirm: () => store.dispatch({ type: 'deleteArchivedSubtree', blockId: block.id }),
    });
  }

  function handleContextMenu(e: MouseEvent) {
    e.preventDefault();
    // BlockNode nests recursively and `contextmenu` bubbles: without this, a
    // right-click on a CHILD block also reaches every ancestor BlockNode's own
    // oncontextmenu handler, and since each just overwrites the same
    // `menuRequest`, the LAST (outermost) handler to run would silently
    // replace the child's menu with the parent's — right-clicking a nested
    // block would open the wrong (ancestor's) context menu.
    e.stopPropagation();
    if (sectionContext === 'hold' || isDimmed) return; // no menu for these (AC26)
    const items =
      sectionContext === 'active'
        ? [
            { label: '텍스트 수정', onSelect: startEdit },
            { label: '홀드로 이동', onSelect: openHoldModal },
          ]
        : [
            { label: block.annotation ? '주석 수정' : '주석 추가', onSelect: openAnnotationModal },
            { label: '블럭 삭제', danger: true, onSelect: openDeleteConfirm },
          ];
    ui.openMenu({ x: e.clientX, y: e.clientY, items });
  }

  function commitEdit() {
    const text = editValue.trim();
    editing = false;
    if (text && text !== block.text) {
      store.dispatch({ type: 'editText', blockId: block.id, text });
    }
  }

  function handleEditKeydown(e: KeyboardEvent) {
    // Stop the Enter/Escape from bubbling to the root's keydown handler,
    // which would otherwise reinterpret it as a completion attempt.
    e.stopPropagation();
    if (e.key === 'Enter') commitEdit();
    if (e.key === 'Escape') editing = false;
  }

  function commitAddChild() {
    const text = addChildValue.trim();
    addingChild = false;
    addChildValue = '';
    if (text) {
      store.dispatch({
        type: 'createChildBlock',
        blockId: crypto.randomUUID(),
        parentId: block.id,
        text,
        now: Date.now(),
      });
    }
  }

  function handleAddChildKeydown(e: KeyboardEvent) {
    e.stopPropagation();
    if (e.key === 'Enter') commitAddChild();
    if (e.key === 'Escape') {
      addingChild = false;
      addChildValue = '';
    }
  }

  function toggleCollapse() {
    store.dispatch({ type: 'toggleCollapse', blockId: block.id });
  }
</script>

<div
  class="block-node"
  class:dimmed={isDimmed}
  class:stale-warn={stale === 'warn'}
  class:stale-danger={stale === 'danger'}
  data-block-id={block.id}
  role={sectionContext === 'active' ? 'button' : 'listitem'}
  tabindex={sectionContext === 'active' ? 0 : -1}
  oncontextmenu={handleContextMenu}
  use:onActivateEvent={handleActivate}
  onkeydown={handleKeydown}
  onmouseenter={() => (hovering = true)}
  onmouseleave={() => (hovering = false)}
>
  <div class="block-row">
    {#if hasChildren}
      <button
        class="chevron"
        class:collapsed={block.collapsed}
        data-dnd-ignore
        onclick={toggleCollapse}
        aria-label="접기/펼치기"
      >▸</button>
    {:else}
      <span class="chevron-spacer"></span>
    {/if}

    {#if editing}
      <input
        class="text-edit"
        data-dnd-ignore
        use:focusOnMount
        bind:value={editValue}
        onblur={commitEdit}
        onkeydown={handleEditKeydown}
      />
    {:else}
      <span class="text">{block.text}</span>
    {/if}

    <span class="elapsed" class:frozen={block.status === 'held'}>{formatElapsed(elapsed)}</span>
    {#if stale === 'danger'}
      <span class="stale-badge" title="24시간 이상 진행 중">!</span>
    {/if}

    {#if sectionContext === 'active' && hovering && !editing}
      <button
        class="quick-add"
        data-dnd-ignore
        onclick={() => (addingChild = true)}
        aria-label="하위 블럭 추가"
      >+</button>
    {/if}
  </div>

  {#if addingChild}
    <div class="quick-add-row">
      <input
        class="text-edit"
        data-dnd-ignore
        use:focusOnMount
        placeholder="하위 작업..."
        bind:value={addChildValue}
        onblur={commitAddChild}
        onkeydown={handleAddChildKeydown}
      />
    </div>
  {/if}

  {#if block.annotation}
    <div class="annotation">
      <div class="annotation-title">{block.annotation.title}</div>
      {#if block.annotation.body}<div class="annotation-body">{block.annotation.body}</div>{/if}
    </div>
  {/if}

  {#if hasChildren && !block.collapsed}
    <div class="children">
      {#each node.children as child (child.block.id)}
        <BlockNode node={child} {sectionContext} />
      {/each}
    </div>
  {/if}
</div>

<style>
  .block-node {
    border-radius: var(--radius-sm);
    padding: 4px 6px;
    outline: none;
    transition: background var(--transition-fast), border-color var(--transition-fast);
  }

  .block-node:focus-visible {
    box-shadow: 0 0 0 2px var(--color-accent);
  }

  .block-node.stale-warn {
    background: var(--color-stale-warn-bg);
    border: 1px solid var(--color-stale-warn-border);
  }

  .block-node.stale-danger {
    background: var(--color-stale-danger-bg);
    border: 1px solid var(--color-stale-danger-border);
  }

  .block-node.dimmed {
    opacity: 0.55;
  }

  .block-node.dimmed > .block-row {
    border: 1px dashed var(--color-border-strong);
    border-radius: var(--radius-sm);
    padding: 4px 6px;
  }

  .block-row {
    display: flex;
    align-items: center;
    gap: 6px;
    min-height: 24px;
  }

  .chevron,
  .chevron-spacer {
    flex: 0 0 auto;
    width: 16px;
    height: 16px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }

  .chevron {
    background: none;
    border: none;
    cursor: pointer;
    color: var(--color-text-muted);
    transform: rotate(90deg);
    transition: transform var(--transition-fast);
  }

  .chevron.collapsed {
    transform: rotate(0deg);
  }

  .text {
    flex: 1 1 auto;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .text-edit {
    flex: 1 1 auto;
    min-width: 0;
    background: var(--color-bg-elevated);
    border: 1px solid var(--color-accent);
    border-radius: var(--radius-sm);
    padding: 2px 6px;
    color: var(--color-text);
  }

  .elapsed {
    flex: 0 0 auto;
    font-variant-numeric: tabular-nums;
    font-size: 12px;
    color: var(--color-text-faint);
  }

  .elapsed.frozen {
    color: var(--color-text-muted);
  }

  .stale-badge {
    flex: 0 0 auto;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 14px;
    height: 14px;
    border-radius: 50%;
    background: var(--color-danger);
    color: var(--color-danger-fg);
    font-size: 10px;
    line-height: 1;
  }

  .quick-add {
    flex: 0 0 auto;
    width: 18px;
    height: 18px;
    border-radius: var(--radius-sm);
    border: 1px solid var(--color-border-strong);
    background: var(--color-bg-elevated);
    color: var(--color-text-muted);
    cursor: pointer;
    line-height: 1;
  }

  .quick-add:hover {
    background: var(--color-bg-hover);
  }

  .quick-add-row {
    padding: 2px 0 2px 22px;
  }

  .quick-add-row .text-edit {
    width: 100%;
  }

  .annotation {
    margin: 2px 0 2px 22px;
    padding: 4px 8px;
    background: var(--color-bg-elevated);
    border-radius: var(--radius-sm);
    font-size: 12px;
  }

  .annotation-title {
    font-weight: 600;
    color: var(--color-text-muted);
  }

  .annotation-body {
    color: var(--color-text-faint);
    white-space: pre-wrap;
  }

  .children {
    margin-left: 18px;
    padding-left: 10px;
    border-left: 1px solid var(--color-border);
  }
</style>
