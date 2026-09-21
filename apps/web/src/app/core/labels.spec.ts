import { describe, expect, it } from 'vitest';
import { label } from './labels';

describe('label (Roadmap UX-03a)', () => {
  it('names the values the API sends, in Spanish, for every dictionary', () => {
    expect(label('operation', 'COMPLETE_VIA_ROADMAP_REMOVAL')).toBe(
      'Completada al salir del Roadmap',
    );
    expect(label('operation', 'SYNC_RUN')).toBe('Sincronización');
    expect(label('origin', 'UI')).toBe('Aplicación');
    expect(label('entity', 'ProjectMember')).toBe('Miembro');
    expect(label('conflictKind', 'CONCURRENT_FIELD_EDIT')).toBe('Edición simultánea');
    expect(label('resolution', 'KEEP_LOCAL')).toBe('se conservó el valor de PM Hub');
    expect(label('revisionSource', 'SYNC')).toBe('Sincronización');
    expect(label('documentKind', 'AGENTS_RULES')).toBe('Reglas para agentes');
    expect(label('roadmapTable', 'NEAR_TERM')).toBe('Próximamente');
    expect(label('priority', 'HIGH')).toBe('Alta');
    expect(label('entryType', 'GAP')).toBe('Carencia');
    // A type a project made up is still readable.
    expect(label('entryType', 'RESEARCH')).toBe('Research');
    expect(label('taskField', 'externalId')).toBe('ID del Roadmap');
    expect(label('taskField', 'acceptanceCriteria')).toBe('Criterio de aceptación');
    expect(label('ledgerState', 'IN_PROGRESS')).toBe('En curso');
  });

  it('reads a code nobody has named as a sentence, never as SCREAMING_SNAKE', () => {
    expect(label('operation', 'SOMETHING_NEW_HAPPENED')).toBe('Something new happened');
    expect(label('origin', 'ROBOT')).toBe('Robot');
    // camelCase field names too: never `Externalid`.
    expect(label('taskField', 'lastSyncedAt')).toBe('Last synced at');
  });

  it('reads an empty value as a dash', () => {
    expect(label('priority', null)).toBe('—');
    expect(label('priority', undefined)).toBe('—');
    expect(label('origin', '')).toBe('—');
  });

  it('never leaves a dictionary value in code form (no underscores, no all-caps words)', () => {
    const samples: [Parameters<typeof label>[0], string][] = [
      ['operation', 'WRITE_BACK_DEFERRED'],
      ['operation', 'ROLE_PERMISSIONS_UPDATE'],
      ['conflictKind', 'ROADMAP_ROW_DISAPPEARED_NO_TERMINAL_LOG'],
      ['ledgerState', 'REASSIGNED'],
    ];
    for (const [kind, code] of samples) {
      expect(label(kind, code)).not.toMatch(/[A-Z]{3,}|_/);
    }
  });
});
