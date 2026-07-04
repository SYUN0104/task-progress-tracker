import { describe, it, expect, vi, afterEach } from 'vitest';
import { get } from 'svelte/store';
import { createTaskStore } from '../../src/lib/store';
import { createEmptyState, type Action } from '../../src/lib/domain';
import type { Platform } from '../../src/lib/platform';

function mockPlatform(overrides: Partial<Platform> = {}): Platform {
  return {
    loadState: vi.fn().mockResolvedValue(null),
    saveState: vi.fn().mockResolvedValue(undefined),
    exportJson: vi.fn().mockResolvedValue(undefined),
    importJson: vi.fn().mockResolvedValue(null),
    onVisibilityChange: vi.fn().mockReturnValue(() => {}),
    onCloseRequested: vi.fn(),
    ...overrides,
  };
}

const createBlock = (blockId: string, workUnitId: string): Action => ({
  type: 'createBlock',
  blockId,
  workUnitId,
  text: blockId,
  now: 0,
});

afterEach(() => {
  vi.useRealTimers();
});

describe('dispatch undo-gating', () => {
  it('domain actions push an undo snapshot; undo restores', () => {
    const store = createTaskStore(mockPlatform());
    expect(get(store.canUndo)).toBe(false);

    store.dispatch(createBlock('r', 'w'));
    expect(get(store.appState).blocks).toHaveLength(1);
    expect(get(store.canUndo)).toBe(true);

    store.undo();
    expect(get(store.appState).blocks).toHaveLength(0);
    expect(get(store.canUndo)).toBe(false);
  });

  it('view-state actions persist but BYPASS the undo stack', () => {
    const store = createTaskStore(mockPlatform());

    store.dispatch({ type: 'setTheme', theme: 'light' });
    expect(get(store.appState).theme).toBe('light');
    expect(get(store.canUndo)).toBe(false);

    store.dispatch(createBlock('r', 'w'));
    store.dispatch({ type: 'toggleCollapse', blockId: 'r' });
    expect(get(store.appState).blocks[0].collapsed).toBe(true);

    // Undo skips the collapse (view-state) and reverts the block creation.
    store.undo();
    expect(get(store.appState).blocks).toHaveLength(0);
  });

  it('a guarded no-op neither snapshots nor changes the state reference', () => {
    const store = createTaskStore(mockPlatform());
    store.dispatch(createBlock('r', 'w'));
    store.dispatch({ type: 'createChildBlock', blockId: 'c', parentId: 'r', text: 'c', now: 0 });

    const before = get(store.appState);
    // Completing a parent with an incomplete child is rejected by the reducer.
    store.dispatch({ type: 'complete', blockId: 'r', now: 0 });
    expect(get(store.appState)).toBe(before);
  });
});

describe('debounced persistence', () => {
  it('saves once after the debounce window', () => {
    vi.useFakeTimers();
    const platform = mockPlatform();
    const store = createTaskStore(platform, { debounceMs: 500 });

    store.dispatch(createBlock('r', 'w'));
    expect(platform.saveState).not.toHaveBeenCalled();

    vi.advanceTimersByTime(499);
    expect(platform.saveState).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(platform.saveState).toHaveBeenCalledTimes(1);
    expect(JSON.parse((platform.saveState as any).mock.calls[0][0]).blocks).toHaveLength(1);
  });

  it('coalesces rapid dispatches into a single save', () => {
    vi.useFakeTimers();
    const platform = mockPlatform();
    const store = createTaskStore(platform, { debounceMs: 500 });

    store.dispatch(createBlock('r1', 'w1'));
    store.dispatch(createBlock('r2', 'w2'));
    store.dispatch(createBlock('r3', 'w3'));

    vi.advanceTimersByTime(500);
    expect(platform.saveState).toHaveBeenCalledTimes(1);
  });

  it('a no-op does not schedule a save', () => {
    vi.useFakeTimers();
    const platform = mockPlatform();
    const store = createTaskStore(platform, { debounceMs: 500 });

    store.dispatch(createBlock('r', 'w'));
    store.dispatch({ type: 'createChildBlock', blockId: 'c', parentId: 'r', text: 'c', now: 0 });
    vi.advanceTimersByTime(500);
    (platform.saveState as any).mockClear();

    store.dispatch({ type: 'complete', blockId: 'r', now: 0 }); // rejected no-op
    vi.advanceTimersByTime(1000);
    expect(platform.saveState).not.toHaveBeenCalled();
  });

  it('flush() forces the pending save now and clears the timer', async () => {
    vi.useFakeTimers();
    const platform = mockPlatform();
    const store = createTaskStore(platform, { debounceMs: 500 });

    store.dispatch(createBlock('r', 'w'));
    await store.flush();
    expect(platform.saveState).toHaveBeenCalledTimes(1);

    // The debounced timer must have been cancelled by the flush.
    vi.advanceTimersByTime(1000);
    expect(platform.saveState).toHaveBeenCalledTimes(1);
  });
});

describe('load / import / export', () => {
  it('load() hydrates state from the platform without touching undo', async () => {
    const source = createEmptyState('light');
    source.workUnits.push({ id: 'w', order: 0 });
    const store = createTaskStore(
      mockPlatform({ loadState: vi.fn().mockResolvedValue(JSON.stringify(source)) }),
    );

    await store.load();
    expect(get(store.appState).theme).toBe('light');
    expect(get(store.appState).workUnits).toHaveLength(1);
    expect(get(store.canUndo)).toBe(false);
  });

  it('load() ignores corrupt JSON and keeps the empty state', async () => {
    const store = createTaskStore(
      mockPlatform({ loadState: vi.fn().mockResolvedValue('{not json') }),
    );
    await store.load();
    expect(get(store.appState).blocks).toHaveLength(0);
  });

  it('importJson() applies the file as a single undoable action', async () => {
    const source = createEmptyState();
    source.workUnits.push({ id: 'w', order: 0 });
    const store = createTaskStore(
      mockPlatform({ importJson: vi.fn().mockResolvedValue(JSON.stringify(source)) }),
    );

    await store.importJson();
    expect(get(store.appState).workUnits).toHaveLength(1);
    expect(get(store.canUndo)).toBe(true);
  });

  it('exportJson() hands the serialized state to the platform', async () => {
    const platform = mockPlatform();
    const store = createTaskStore(platform);
    store.dispatch(createBlock('r', 'w'));

    await store.exportJson();
    expect(platform.exportJson).toHaveBeenCalledTimes(1);
    const arg = (platform.exportJson as any).mock.calls[0][0];
    expect(JSON.parse(arg).blocks).toHaveLength(1);
  });
});
