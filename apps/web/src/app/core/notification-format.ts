import type { Notification } from './notifications.service.js';

/** A short, human sentence for a notification's type + payload (brief §29). Unknown types fall back to the raw type string, so a new backend event never renders as empty. */
export function describeNotification(notification: Notification): string {
  const payload = notification.payload ?? {};
  switch (notification.type) {
    case 'CONFLICTS_DETECTED': {
      const count =
        typeof payload['conflictsRaised'] === 'number' ? payload['conflictsRaised'] : '';
      return `La sincronización encontró ${count} conflicto${count === 1 ? '' : 's'} por resolver`;
    }
    case 'SYNC_FAILED': {
      const error = typeof payload['error'] === 'string' ? payload['error'] : 'Error desconocido';
      return `Falló la sincronización: ${error}`;
    }
    default:
      return notification.type;
  }
}
