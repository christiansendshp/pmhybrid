import { describe, expect, it } from 'vitest';
import { describeAuditChanges, formatAuditValue } from './audit-format.js';

describe('describeAuditChanges', () => {
  it('pairs previous and new values per changed field', () => {
    expect(
      describeAuditChanges({
        previousValue: { title: 'Old', progressPercent: 10 },
        newValue: { title: 'New', progressPercent: 60 },
      }),
    ).toEqual([
      { field: 'title', from: 'Old', to: 'New' },
      { field: 'progressPercent', from: '10', to: '60' },
    ]);
  });

  it('renders a creation (no previous value) with an empty "from"', () => {
    expect(describeAuditChanges({ previousValue: null, newValue: { title: 'Created' } })).toEqual([
      { field: 'title', from: '—', to: 'Created' },
    ]);
  });

  it('keeps fields that only exist on the previous side', () => {
    expect(
      describeAuditChanges({
        previousValue: { status: 'QA' },
        newValue: { strategy: 'KEEP_LOCAL' },
      }),
    ).toEqual([
      { field: 'strategy', from: '—', to: 'KEEP_LOCAL' },
      { field: 'status', from: 'QA', to: '—' },
    ]);
  });

  it('returns nothing for an event without values', () => {
    expect(describeAuditChanges({ previousValue: null, newValue: null })).toEqual([]);
  });
});

describe('formatAuditValue', () => {
  it('shows an em dash for empty values and JSON for objects', () => {
    expect(formatAuditValue(null)).toBe('—');
    expect(formatAuditValue('')).toBe('—');
    expect(formatAuditValue({ title: 'x' })).toBe('{"title":"x"}');
    expect(formatAuditValue(false)).toBe('false');
  });
});
