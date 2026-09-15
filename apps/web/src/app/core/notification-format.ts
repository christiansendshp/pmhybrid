import type { Notification } from './notifications.service.js';

/** A short, human sentence for a notification's type + payload (brief §29). Unknown types fall back to the raw type string, so a new backend event never renders as empty. */
export function describeNotification(notification: Notification): string {
  const payload = notification.payload ?? {};
  switch (notification.type) {
    case 'CONFLICTS_DETECTED': {
      const count =
        typeof payload['conflictsRaised'] === 'number' ? payload['conflictsRaised'] : '';
      return `Sync found ${count} conflict${count === 1 ? '' : 's'} to resolve`;
    }
    case 'SYNC_FAILED': {
      const error = typeof payload['error'] === 'string' ? payload['error'] : 'Unknown error';
      return `Sync failed: ${error}`;
    }
    default:
      return notification.type;
  }
}
