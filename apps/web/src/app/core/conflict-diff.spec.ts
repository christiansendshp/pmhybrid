import { describe, expect, it } from 'vitest';
import { diffConflictVersions, isFieldEditable } from './conflict-diff.js';

describe('diffConflictVersions', () => {
  it('marks every field "changed" for CONCURRENT_FIELD_EDIT (same keys on both sides)', () => {
    const diff = diffConflictVersions({
      localVersion: { status: 'ASIGNADA' },
      externalVersion: { status: 'EN_DESARROLLO' },
    });
    expect(diff).toEqual([
      { field: 'status', local: 'ASIGNADA', external: 'EN_DESARROLLO', status: 'changed' },
    ]);
  });

  it('diffs every contested field, sorted, for a multi-field edit', () => {
    const diff = diffConflictVersions({
      localVersion: { title: 'UI title', status: 'ASIGNADA' },
      externalVersion: { title: 'Doc title', status: 'EN_DESARROLLO' },
    });
    expect(diff.map((d) => d.field)).toEqual(['status', 'title']);
    expect(diff.every((d) => d.status === 'changed')).toBe(true);
  });

  it('marks every field "local-only" when externalVersion is null (ROADMAP_ROW_DISAPPEARED_NO_TERMINAL_LOG)', () => {
    const diff = diffConflictVersions({
      localVersion: { externalId: 'PMH-3', status: 'PENDIENTE', roadmapTable: 'ACTIVE' },
      externalVersion: null,
    });
    expect(diff).toEqual([
      { field: 'externalId', local: 'PMH-3', external: '—', status: 'local-only' },
      { field: 'roadmapTable', local: 'ACTIVE', external: '—', status: 'local-only' },
      { field: 'status', local: 'PENDIENTE', external: '—', status: 'local-only' },
    ]);
  });

  it('falls back to "—" for null/undefined values, matching describeAuditChanges formatting', () => {
    const diff = diffConflictVersions({
      localVersion: { rawOwner: null },
      externalVersion: { rawOwner: 'agent-1@2026-09-15T00:00:00Z' },
    });
    expect(diff[0].local).toBe('—');
    expect(diff[0].external).toBe('agent-1@2026-09-15T00:00:00Z');
  });

  it('marks a field present on only one side accordingly, even when the other side is a non-null object', () => {
    const diff = diffConflictVersions({
      localVersion: { status: 'ASIGNADA' },
      externalVersion: { acceptanceCriteria: 'Doc check' },
    });
    expect(diff).toEqual([
      { field: 'acceptanceCriteria', local: '—', external: 'Doc check', status: 'external-only' },
      { field: 'status', local: 'ASIGNADA', external: '—', status: 'local-only' },
    ]);
  });

  it('handles an empty local/external pair (no fields to render)', () => {
    expect(diffConflictVersions({ localVersion: {}, externalVersion: {} })).toEqual([]);
  });
});

describe('isFieldEditable', () => {
  it('accepts the fields the API can actually apply a MANUAL_EDIT to', () => {
    expect(isFieldEditable('title')).toBe(true);
    expect(isFieldEditable('acceptanceCriteria')).toBe(true);
    expect(isFieldEditable('status')).toBe(true);
    expect(isFieldEditable('rawOwner')).toBe(true);
    expect(isFieldEditable('roadmapTable')).toBe(true);
  });

  it('rejects fields that are contextual-only, like externalId', () => {
    expect(isFieldEditable('externalId')).toBe(false);
    expect(isFieldEditable('dependencies')).toBe(false);
  });
});
