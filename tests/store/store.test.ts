import { describe, it, expect, vi, afterEach } from 'vitest';
import { get } from 'svelte/store';
import { createTaskStore } from '../../src/lib/store';
import { createEmptyState, type Action } from '../../src/lib/domain';
import type { Platform } from '../../src/lib/platform';

function mockPlatform(overrides: Partial<Platform> = {}): Platform {
  return {
    loadState: vi.fn().mockResolvedValue(null),
    saveState: vi.fn().mockResolvedValue(undefined),
    flushState: vi.fn().mockResolvedValue(undefined),
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
  vi.restoreAllMocks();
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

describe('undo preserves later view-state (finding #4)', () => {
  it('keeps a theme change made after the undone snapshot', () => {
    const store = createTaskStore(mockPlatform());

    store.dispatch(createBlock('r', 'w')); // domain: snapshot captures theme=dark
    store.dispatch({ type: 'setTheme', theme: 'light' }); // view-state, bypasses undo

    store.undo(); // revert the block creation
    expect(get(store.appState).blocks).toHaveLength(0); // domain change reverted
    expect(get(store.appState).theme).toBe('light'); // theme NOT reverted
  });

  it('keeps a collapse change made after the undone snapshot', () => {
    const store = createTaskStore(mockPlatform());

    store.dispatch(createBlock('r', 'w'));
    store.dispatch({ type: 'createChildBlock', blockId: 'c', parentId: 'r', text: 'c', now: 0 }); // snapshot: r not collapsed
    store.dispatch({ type: 'toggleCollapse', blockId: 'r' }); // view-state → r.collapsed = true

    store.undo(); // revert the child creation
    expect(get(store.appState).blocks.map((b) => b.id)).toEqual(['r']); // child gone
    expect(get(store.appState).blocks[0].collapsed).toBe(true); // collapse preserved
  });
});

describe('debounced persistence', () => {
  // Persistence is serialized through a promise chain, so the actual platform
  // call runs on a microtask — use the async timer API to flush it.
  it('saves once after the debounce window', async () => {
    vi.useFakeTimers();
    const platform = mockPlatform();
    const store = createTaskStore(platform, { debounceMs: 500 });

    store.dispatch(createBlock('r', 'w'));
    expect(platform.saveState).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(499);
    expect(platform.saveState).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(platform.saveState).toHaveBeenCalledTimes(1);
    expect(JSON.parse((platform.saveState as any).mock.calls[0][0]).blocks).toHaveLength(1);
  });

  it('coalesces rapid dispatches into a single save', async () => {
    vi.useFakeTimers();
    const platform = mockPlatform();
    const store = createTaskStore(platform, { debounceMs: 500 });

    store.dispatch(createBlock('r1', 'w1'));
    store.dispatch(createBlock('r2', 'w2'));
    store.dispatch(createBlock('r3', 'w3'));

    await vi.advanceTimersByTimeAsync(500);
    expect(platform.saveState).toHaveBeenCalledTimes(1);
  });

  it('a no-op does not schedule a save', async () => {
    vi.useFakeTimers();
    const platform = mockPlatform();
    const store = createTaskStore(platform, { debounceMs: 500 });

    store.dispatch(createBlock('r', 'w'));
    store.dispatch({ type: 'createChildBlock', blockId: 'c', parentId: 'r', text: 'c', now: 0 });
    await vi.advanceTimersByTimeAsync(500);
    (platform.saveState as any).mockClear();

    store.dispatch({ type: 'complete', blockId: 'r', now: 0 }); // rejected no-op
    await vi.advanceTimersByTimeAsync(1000);
    expect(platform.saveState).not.toHaveBeenCalled();
  });

  it('flush() forces a flush_state write now and clears the timer', async () => {
    vi.useFakeTimers();
    const platform = mockPlatform();
    const store = createTaskStore(platform, { debounceMs: 500 });

    store.dispatch(createBlock('r', 'w'));
    await store.flush();
    // Close path uses flushState (flush_state), not the debounced saveState.
    expect(platform.flushState).toHaveBeenCalledTimes(1);
    expect(platform.saveState).not.toHaveBeenCalled();

    // The debounced timer must have been cancelled by the flush.
    await vi.advanceTimersByTimeAsync(1000);
    expect(platform.flushState).toHaveBeenCalledTimes(1);
    expect(platform.saveState).not.toHaveBeenCalled();
  });

  it('serializes an in-flight save and a close flush (finding #5)', async () => {
    vi.useFakeTimers();
    const order: string[] = [];
    let resolveSave!: () => void;

    const platform = mockPlatform({
      saveState: vi.fn().mockImplementation(
        () =>
          new Promise<void>((resolve) => {
            order.push('save-start');
            resolveSave = () => {
              order.push('save-end');
              resolve();
            };
          }),
      ),
      flushState: vi.fn().mockImplementation(async () => {
        order.push('flush-start');
        order.push('flush-end');
      }),
    });
    const store = createTaskStore(platform, { debounceMs: 500 });

    store.dispatch(createBlock('r', 'w'));
    await vi.advanceTimersByTimeAsync(500); // debounced save starts, then hangs
    expect(order).toEqual(['save-start']);

    const flushPromise = store.flush(); // enqueued behind the in-flight save
    await Promise.resolve();
    expect(order).toEqual(['save-start']); // flush must wait

    resolveSave();
    await flushPromise;
    expect(order).toEqual(['save-start', 'save-end', 'flush-start', 'flush-end']);
  });
});

describe('load / import / export', () => {
  it('load() hydrates state from the platform without touching undo', async () => {
    const source = createEmptyState('light');
    source.workUnits.push({ id: 'w', order: 0 });
    const store = createTaskStore(
      mockPlatform({ loadState: vi.fn().mockResolvedValue(JSON.stringify(source)) }),
    );

    expect(await store.load()).toBe('loaded');
    expect(get(store.appState).theme).toBe('light');
    expect(get(store.appState).workUnits).toHaveLength(1);
    expect(get(store.canUndo)).toBe(false);
  });

  it('load() returns empty when nothing is persisted', async () => {
    const store = createTaskStore(mockPlatform({ loadState: vi.fn().mockResolvedValue(null) }));
    expect(await store.load()).toBe('empty');
  });

  it('load() ignores corrupt JSON, keeps empty state, and surfaces an error', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const store = createTaskStore(
      mockPlatform({ loadState: vi.fn().mockResolvedValue('{not json') }),
    );
    expect(await store.load()).toBe('invalid');
    expect(get(store.appState).blocks).toHaveLength(0);
    expect(errorSpy).toHaveBeenCalled();
  });

  it('load() rejects valid JSON that fails the schema, keeping empty state', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const store = createTaskStore(
      mockPlatform({
        loadState: vi.fn().mockResolvedValue(JSON.stringify({ blocks: null, workUnits: null, theme: 'dark' })),
      }),
    );
    expect(await store.load()).toBe('invalid');
    expect(get(store.appState).blocks).toHaveLength(0);
    expect(get(store.appState).workUnits).toHaveLength(0);
    expect(errorSpy).toHaveBeenCalled();
  });

  it('importJson() applies the file as a single undoable action', async () => {
    const source = createEmptyState();
    source.workUnits.push({ id: 'w', order: 0 });
    const store = createTaskStore(
      mockPlatform({ importJson: vi.fn().mockResolvedValue(JSON.stringify(source)) }),
    );

    expect(await store.importJson()).toBe('imported');
    expect(get(store.appState).workUnits).toHaveLength(1);
    expect(get(store.canUndo)).toBe(true);
  });

  it('importJson() rejects an invalid file and leaves state untouched', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const store = createTaskStore(
      mockPlatform({ importJson: vi.fn().mockResolvedValue(JSON.stringify({ nope: true })) }),
    );
    store.dispatch(createBlock('keep', 'w'));

    expect(await store.importJson()).toBe('invalid');
    expect(get(store.appState).blocks.map((b) => b.id)).toEqual(['keep']);
    expect(errorSpy).toHaveBeenCalled();
  });

  it('importJson() reports a cancelled dialog', async () => {
    const store = createTaskStore(mockPlatform({ importJson: vi.fn().mockResolvedValue(null) }));
    expect(await store.importJson()).toBe('cancelled');
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
