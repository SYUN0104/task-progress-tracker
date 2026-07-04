import { describe, it, expect } from 'vitest';
import { canComplete, canDeleteWorkUnit, canDeleteArchived } from '../../src/lib/domain';
import { Builder } from './_helpers';

describe('rules.canComplete', () => {
  it('allows completing a leaf', () => {
    const b = new Builder().createBlock('r', 'w');
    expect(canComplete(b.state, 'r')).toBe(true);
  });

  it('blocks a parent while any descendant is still active', () => {
    const b = new Builder().createBlock('r', 'w').createChild('c', 'r');
    expect(canComplete(b.state, 'r')).toBe(false);
  });

  it('blocks a parent while a descendant is held (held blocks completion)', () => {
    const b = new Builder()
      .createBlock('r', 'w')
      .createChild('c', 'r')
      .hold('c', { title: 'note' });
    expect(canComplete(b.state, 'r')).toBe(false);
  });

  it('allows a parent once every descendant is completed', () => {
    const b = new Builder()
      .createBlock('r', 'w')
      .createChild('c', 'r')
      .complete('c');
    expect(canComplete(b.state, 'r')).toBe(true);
  });

  it('refuses a non-active block', () => {
    const b = new Builder().createBlock('r', 'w').complete('r');
    expect(canComplete(b.state, 'r')).toBe(false);
  });
});

describe('rules.canDeleteWorkUnit', () => {
  it('true for an empty column', () => {
    const b = new Builder().createWorkUnit('w');
    expect(canDeleteWorkUnit(b.state, 'w')).toBe(true);
  });

  it('false while an active block occupies it', () => {
    const b = new Builder().createBlock('r', 'w');
    expect(canDeleteWorkUnit(b.state, 'w')).toBe(false);
  });

  it('true when the column only holds held blocks (they live in Hold)', () => {
    const b = new Builder().createBlock('r', 'w').hold('r', { title: 'n' });
    expect(canDeleteWorkUnit(b.state, 'w')).toBe(true);
  });

  it('true when the column only holds completed blocks (they live in Archive)', () => {
    const b = new Builder().createBlock('r', 'w').complete('r');
    expect(canDeleteWorkUnit(b.state, 'w')).toBe(true);
  });

  it('false for a non-existent column', () => {
    const b = new Builder();
    expect(canDeleteWorkUnit(b.state, 'nope')).toBe(false);
  });
});

describe('rules.canDeleteArchived', () => {
  it('true only for completed blocks', () => {
    const b = new Builder().createBlock('r', 'w').createChild('c', 'r').complete('c');
    expect(canDeleteArchived(b.state, 'c')).toBe(true);
    expect(canDeleteArchived(b.state, 'r')).toBe(false); // dimmed context node
  });
});
