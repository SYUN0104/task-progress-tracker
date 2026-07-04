import { describe, it, expect } from 'vitest';
import { validateAppState, createEmptyState, type AppState, type Block } from '../../src/lib/domain';

function fullBlock(overrides: Partial<Block> = {}): Block {
  return {
    id: 'b1',
    text: 'hello',
    createdAt: 1000,
    parentId: null,
    workUnitId: 'w1',
    order: 0,
    status: 'active',
    accumulatedHeldMs: 0,
    collapsed: false,
    ...overrides,
  };
}

function stateWith(blocks: Block[], workUnits = [{ id: 'w1', order: 0 }]): AppState {
  return { blocks, workUnits, theme: 'dark' };
}

describe('validateAppState — rejects malformed input (never throws)', () => {
  it('rejects non-objects and junk', () => {
    expect(validateAppState(undefined)).toBeNull();
    expect(validateAppState(null)).toBeNull();
    expect(validateAppState(42)).toBeNull();
    expect(validateAppState('nope')).toBeNull();
    expect(validateAppState({})).toBeNull();
    expect(validateAppState([])).toBeNull();
  });

  it('rejects null arrays / wrong-typed top-level fields', () => {
    expect(validateAppState({ blocks: null, workUnits: null, theme: 'dark' })).toBeNull();
    expect(validateAppState({ blocks: [], workUnits: [], theme: 'blue' })).toBeNull();
    expect(validateAppState({ blocks: [], workUnits: [] })).toBeNull(); // missing theme
    expect(validateAppState({ blocks: {}, workUnits: [], theme: 'dark' })).toBeNull();
  });

  it('rejects a valid-but-truncated block (missing required fields)', () => {
    expect(validateAppState(stateWith([{ id: 'b1' } as unknown as Block]))).toBeNull();
    // Missing text:
    const noText = { id: 'b1', createdAt: 0, parentId: null, workUnitId: 'w1', order: 0, status: 'active' };
    expect(validateAppState(stateWith([noText as unknown as Block]))).toBeNull();
    // Bad status enum:
    expect(validateAppState(stateWith([fullBlock({ status: 'paused' as unknown as Block['status'] })]))).toBeNull();
    // parentId wrong type:
    expect(validateAppState(stateWith([fullBlock({ parentId: 5 as unknown as null })]))).toBeNull();
  });

  it('rejects a held block without a numeric heldAt', () => {
    expect(validateAppState(stateWith([fullBlock({ status: 'held' })]))).toBeNull(); // no heldAt
    expect(
      validateAppState(stateWith([fullBlock({ status: 'held', heldAt: 'soon' as unknown as number })])),
    ).toBeNull();
  });

  it('rejects a malformed annotation or workUnit', () => {
    expect(
      validateAppState(stateWith([fullBlock({ annotation: { body: 'x' } as unknown as Block['annotation'] })])),
    ).toBeNull(); // no title
    expect(validateAppState(stateWith([fullBlock()], [{ id: 'w1' } as unknown as { id: string; order: number }]))).toBeNull(); // wu missing order
  });
});

describe('validateAppState — accepts and normalizes valid input', () => {
  it('accepts a minimal empty state', () => {
    expect(validateAppState(createEmptyState())).toEqual(createEmptyState());
  });

  it('round-trips a fully-populated state through JSON', () => {
    const source: AppState = {
      theme: 'light',
      workUnits: [{ id: 'w1', order: 0, name: 'Col', color: '#abc', label: 'L' }],
      blocks: [
        fullBlock({ id: 'r', status: 'completed', completedAt: 2000 }),
        fullBlock({
          id: 'h',
          parentId: 'r',
          status: 'held',
          heldAt: 1500,
          holdRootId: 'h',
          accumulatedHeldMs: 200,
          annotation: { title: 'paused', body: 'later' },
        }),
      ],
    };
    const result = validateAppState(JSON.parse(JSON.stringify(source)));
    expect(result).toEqual(source);
    expect(result).not.toBe(source);
  });

  it('strips unknown extra fields', () => {
    const dirty = stateWith([{ ...fullBlock(), hacked: true } as unknown as Block]) as unknown as Record<
      string,
      unknown
    >;
    (dirty as { extra?: unknown }).extra = 'ignored';
    const result = validateAppState(dirty);
    expect(result).not.toBeNull();
    expect(result!.blocks[0]).not.toHaveProperty('hacked');
    expect(result).not.toHaveProperty('extra');
  });
});

describe('validateAppState — referential integrity', () => {
  it('rejects a parentId cycle (a↔b) that would spin ancestry walks forever', () => {
    const a = fullBlock({ id: 'a', parentId: 'b' });
    const b = fullBlock({ id: 'b', parentId: 'a' });
    expect(validateAppState(stateWith([a, b]))).toBeNull();
  });

  it('rejects a self-referential parentId', () => {
    expect(validateAppState(stateWith([fullBlock({ id: 'a', parentId: 'a' })]))).toBeNull();
  });

  it('rejects a dangling parentId (no such block)', () => {
    expect(validateAppState(stateWith([fullBlock({ id: 'a', parentId: 'ghost' })]))).toBeNull();
  });

  it('rejects a dangling workUnitId (no such column)', () => {
    expect(validateAppState(stateWith([fullBlock({ id: 'a', workUnitId: 'nope' })]))).toBeNull();
  });

  it('rejects duplicate block / work-unit ids', () => {
    expect(validateAppState(stateWith([fullBlock({ id: 'dup' }), fullBlock({ id: 'dup' })]))).toBeNull();
    expect(
      validateAppState(stateWith([fullBlock()], [{ id: 'w1', order: 0 }, { id: 'w1', order: 1 }])),
    ).toBeNull();
  });

  it('accepts a valid deep parent chain a→b→c→root', () => {
    const chain = [
      fullBlock({ id: 'c', parentId: null }),
      fullBlock({ id: 'b', parentId: 'c' }),
      fullBlock({ id: 'a', parentId: 'b' }),
    ];
    const result = validateAppState(stateWith(chain));
    expect(result).not.toBeNull();
    expect(result!.blocks).toHaveLength(3);
  });
});
