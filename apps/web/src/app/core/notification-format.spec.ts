import { describe, expect, it } from 'vitest';
import { describeNotification } from './notification-format.js';
import type { Notification } from './notifications.service.js';

function notification(overrides: Partial<Notification> = {}): Notification {
  return {
    id: 'n1',
    actorId: 'a1',
    projectId: 'p1',
    type: 'CONFLICTS_DETECTED',
    payload: null,
    readAt: null,
    createdAt: '2026-09-15T09:00:00.000Z',
    ...overrides,
  };
}

describe('describeNotification (brief §29)', () => {
  it('pluralizes a multi-conflict sync', () => {
    expect(
      describeNotification(
        notification({ type: 'CONFLICTS_DETECTED', payload: { conflictsRaised: 3 } }),
      ),
    ).toBe('La sincronización encontró 3 conflictos por resolver');
  });

  it('does not pluralize a single conflict', () => {
    expect(
      describeNotification(
        notification({ type: 'CONFLICTS_DETECTED', payload: { conflictsRaised: 1 } }),
      ),
    ).toBe('La sincronización encontró 1 conflicto por resolver');
  });

  it('names the unreadable Roadmap entries (Roadmap BUG-05)', () => {
    expect(
      describeNotification(
        notification({
          type: 'ROADMAP_ENTRIES_INVALID',
          payload: {
            count: 2,
            entries: [
              { id: 'F1-T104', reason: 'x' },
              { id: 'F1-T105', reason: 'y' },
            ],
          },
        }),
      ),
    ).toBe('La sincronización no pudo leer 2 entradas del Roadmap: F1-T104, F1-T105');
    expect(
      describeNotification(
        notification({
          type: 'ROADMAP_ENTRIES_INVALID',
          payload: { count: 1, entries: [{ id: 'F1-T104' }] },
        }),
      ),
    ).toBe('La sincronización no pudo leer 1 entrada del Roadmap: F1-T104');
  });

  it('surfaces the sync failure message', () => {
    expect(
      describeNotification(
        notification({ type: 'SYNC_FAILED', payload: { error: 'ENOENT: no such file' } }),
      ),
    ).toBe('Falló la sincronización: ENOENT: no such file');
  });

  it('says what happened to a task the person holds (Roadmap GAP-36c)', () => {
    const about = (type: string, title?: string) =>
      describeNotification(notification({ type, payload: title ? { title } : {} }));

    expect(about('TASK_ASSIGNED', 'Write docs')).toBe('Te asignaron la tarea «Write docs»');
    expect(about('TASK_REASSIGNED', 'Write docs')).toBe(
      'La tarea «Write docs» pasó a otra persona',
    );
    expect(about('TASK_COMMENTED', 'Write docs')).toBe('Nuevo comentario en tu tarea «Write docs»');
    // A payload with no title never renders a hole.
    expect(about('TASK_ASSIGNED')).toBe('Te asignaron la tarea «sin título»');
  });

  it('falls back to the raw type for an unknown notification type, instead of rendering empty', () => {
    expect(describeNotification(notification({ type: 'SOMETHING_NEW', payload: {} }))).toBe(
      'SOMETHING_NEW',
    );
  });

  it('handles a null payload without throwing', () => {
    expect(describeNotification(notification({ type: 'SYNC_FAILED', payload: null }))).toBe(
      'Falló la sincronización: Error desconocido',
    );
  });
});
