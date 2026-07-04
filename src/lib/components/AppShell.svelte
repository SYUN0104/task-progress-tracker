<script lang="ts">
  // Top bar (create input, section tabs, undo/export/import/theme) + the
  // active section + the shared context-menu/modal/snackbar overlays. Mounted
  // once App.svelte has a live store+clock (see App.svelte).
  import { onMount } from 'svelte';
  import type { TaskStore } from '../store';
  import type { Clock } from '../ui/clock';
  import { registerUndoShortcut } from '../ui/clock';
  import { activeColumns, holdGrid, archiveTrees } from '../domain';
  import { setUiContext, type MenuRequest, type ModalRequest, type SnackbarAction } from './context';
  import ActiveSection from './ActiveSection.svelte';
  import HoldSection from './HoldSection.svelte';
  import ArchiveSection from './ArchiveSection.svelte';
  import ContextMenu from './ContextMenu.svelte';
  import Snackbar from './Snackbar.svelte';
  import AnnotationModal from './modals/AnnotationModal.svelte';
  import WarningModal from './modals/WarningModal.svelte';
  import ConfirmModal from './modals/ConfirmModal.svelte';

  let { store, clock }: { store: TaskStore; clock: Clock } = $props();

  const appState = store.appState;
  const canUndoStore = store.canUndo;

  type Tab = 'active' | 'hold' | 'archive';
  let tab = $state<Tab>('active');
  let inputValue = $state('');

  let menuRequest = $state<MenuRequest | null>(null);
  let modalRequest = $state<ModalRequest | null>(null);
  let snackbar = $state<{ message: string; action?: SnackbarAction } | null>(null);
  let snackbarTimer: ReturnType<typeof setTimeout> | null = null;

  setUiContext({
    store,
    clock,
    openMenu: (req) => (menuRequest = req),
    closeMenu: () => (menuRequest = null),
    openModal: (req) => (modalRequest = req),
    closeModal: () => (modalRequest = null),
    showSnackbar: (message, action) => {
      if (snackbarTimer) clearTimeout(snackbarTimer);
      snackbar = { message, action };
      snackbarTimer = setTimeout(() => {
        snackbar = null;
      }, 5000);
    },
  });

  // Reflect the persisted theme on <html> so app.css's `[data-theme]`
  // variable overrides apply (D9/AC47).
  $effect(() => {
    document.documentElement.dataset.theme = $appState.theme;
  });

  onMount(() => {
    return registerUndoShortcut(() => store.undo());
  });

  function submitCreate() {
    const text = inputValue.trim();
    if (!text) return;
    store.dispatch({
      type: 'createBlock',
      blockId: crypto.randomUUID(),
      workUnitId: crypto.randomUUID(),
      text,
      now: Date.now(),
    });
    inputValue = '';
    tab = 'active';
  }

  function toggleTheme() {
    store.dispatch({ type: 'setTheme', theme: $appState.theme === 'dark' ? 'light' : 'dark' });
  }

  const activeCount = $derived(activeColumns($appState).length);
  const holdCount = $derived(holdGrid($appState).length);
  const archiveCount = $derived(archiveTrees($appState).length);
</script>

<div class="app-shell">
  <header class="top-bar">
    <div class="brand">Task Progress Tracker</div>

    <div class="quick-create">
      <input
        class="quick-input"
        placeholder="새 작업 입력 후 Enter"
        bind:value={inputValue}
        onkeydown={(e) => {
          if (e.key === 'Enter') submitCreate();
        }}
      />
      <button class="primary" onclick={submitCreate}>추가</button>
    </div>

    <nav class="tabs">
      <button class:active={tab === 'active'} onclick={() => (tab = 'active')}>
        Active <span class="count">{activeCount}</span>
      </button>
      <button class:active={tab === 'hold'} onclick={() => (tab = 'hold')}>
        Hold <span class="count">{holdCount}</span>
      </button>
      <button class:active={tab === 'archive'} onclick={() => (tab = 'archive')}>
        Archive <span class="count">{archiveCount}</span>
      </button>
    </nav>

    <div class="toolbar">
      <button
        class="icon-btn"
        title="실행 취소 (Ctrl+Z)"
        disabled={!$canUndoStore}
        onclick={() => store.undo()}
      >↺</button>
      <button class="icon-btn" title="내보내기" onclick={() => store.exportJson()}>⬆</button>
      <button class="icon-btn" title="가져오기" onclick={() => store.importJson()}>⬇</button>
      <button class="icon-btn" title="테마 전환" onclick={toggleTheme}>
        {$appState.theme === 'dark' ? '☾' : '☀'}
      </button>
    </div>
  </header>

  <main class="content">
    {#if tab === 'active'}
      <ActiveSection />
    {:else if tab === 'hold'}
      <HoldSection />
    {:else}
      <ArchiveSection />
    {/if}
  </main>

  {#if menuRequest}
    <ContextMenu request={menuRequest} onClose={() => (menuRequest = null)} />
  {/if}

  {#if modalRequest}
    {#if modalRequest.kind === 'annotation'}
      {@const req = modalRequest}
      <AnnotationModal
        heading={req.heading}
        initial={req.initial}
        submitLabel={req.submitLabel}
        onSubmit={(a) => {
          req.onSubmit(a);
          modalRequest = null;
        }}
        onCancel={() => {
          req.onCancel?.();
          modalRequest = null;
        }}
      />
    {:else if modalRequest.kind === 'warning'}
      {@const req = modalRequest}
      <WarningModal message={req.message} onClose={() => (modalRequest = null)} />
    {:else if modalRequest.kind === 'confirm'}
      {@const req = modalRequest}
      <ConfirmModal
        message={req.message}
        confirmLabel={req.confirmLabel}
        onConfirm={() => {
          req.onConfirm();
          modalRequest = null;
        }}
        onCancel={() => (modalRequest = null)}
      />
    {/if}
  {/if}

  {#if snackbar}
    <Snackbar message={snackbar.message} action={snackbar.action} onDismiss={() => (snackbar = null)} />
  {/if}
</div>

<style>
  .app-shell {
    display: flex;
    flex-direction: column;
    height: 100vh;
  }

  .top-bar {
    flex: 0 0 auto;
    display: flex;
    align-items: center;
    gap: 20px;
    padding: 10px 16px;
    border-bottom: 1px solid var(--color-border);
    background: var(--color-bg-elevated);
  }

  .brand {
    flex: 0 0 auto;
    font-weight: 600;
    color: var(--color-text-muted);
    font-size: 12px;
    white-space: nowrap;
  }

  .quick-create {
    flex: 1 1 auto;
    display: flex;
    gap: 8px;
    max-width: 420px;
  }

  .quick-input {
    flex: 1 1 auto;
    min-width: 0;
    background: var(--color-bg-card);
    border: 1px solid var(--color-border-strong);
    border-radius: var(--radius-md);
    padding: 6px 10px;
    color: var(--color-text);
  }

  .quick-input:focus {
    outline: none;
    border-color: var(--color-accent);
  }

  .quick-create button.primary {
    padding: 6px 14px;
    border-radius: var(--radius-md);
    border: 1px solid var(--color-accent);
    background: var(--color-accent);
    color: var(--color-accent-fg);
    cursor: pointer;
    white-space: nowrap;
  }

  .tabs {
    flex: 0 0 auto;
    display: flex;
    gap: 2px;
    background: var(--color-bg-card);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    padding: 2px;
  }

  .tabs button {
    border: none;
    background: none;
    padding: 5px 12px;
    border-radius: var(--radius-sm);
    color: var(--color-text-muted);
    cursor: pointer;
    transition: background var(--transition-fast), color var(--transition-fast);
  }

  .tabs button.active {
    background: var(--color-bg-active);
    color: var(--color-text);
  }

  .tabs .count {
    font-size: 11px;
    color: var(--color-text-faint);
  }

  .toolbar {
    flex: 0 0 auto;
    margin-left: auto;
    display: flex;
    gap: 2px;
  }

  .icon-btn {
    width: 28px;
    height: 28px;
    border: none;
    background: none;
    border-radius: var(--radius-sm);
    color: var(--color-text-muted);
    cursor: pointer;
    transition: background var(--transition-fast);
  }

  .icon-btn:hover {
    background: var(--color-bg-hover);
  }

  .icon-btn:disabled {
    opacity: 0.35;
    cursor: not-allowed;
  }

  .content {
    flex: 1 1 auto;
    min-height: 0;
  }
</style>
