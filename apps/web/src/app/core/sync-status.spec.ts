import { describe, expect, it } from 'vitest';
import { syncNeedsAttention, syncStatusLabel } from './sync-status.js';

describe('sync status (Roadmap UX-01)', () => {
  it('names every status in plain Spanish, and does not hide one it does not know', () => {
    expect(['SUCCESS', 'PARTIAL', 'FAILED', 'RUNNING'].map(syncStatusLabel)).toEqual([
      'correcta',
      'con avisos',
      'fallida',
      'en curso',
    ]);
    expect(syncStatusLabel('MYSTERY')).toBe('mystery');
  });

  it('flags the runs that need a person', () => {
    expect(syncNeedsAttention('FAILED')).toBe(true);
    expect(syncNeedsAttention('PARTIAL')).toBe(true);
    expect(syncNeedsAttention('SUCCESS')).toBe(false);
  });
});
