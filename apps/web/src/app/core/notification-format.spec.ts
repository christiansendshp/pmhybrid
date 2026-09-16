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

  it('surfaces the sync failure message', () => {
    expect(
      describeNotification(
        notification({ type: 'SYNC_FAILED', payload: { error: 'ENOENT: no such file' } }),
      ),
    ).toBe('Falló la sincronización: ENOENT: no such file');
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
