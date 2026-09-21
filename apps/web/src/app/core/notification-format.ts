import type { Notification } from './notifications.service.js';

/** The task a notification is about, or a neutral word when the payload does not say. */
function taskTitle(payload: Record<string, unknown>): string {
  return typeof payload['title'] === 'string' && payload['title'] ? payload['title'] : 'sin título';
}

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
    case 'ROADMAP_ENTRIES_INVALID': {
      const count = typeof payload['count'] === 'number' ? payload['count'] : 0;
      const entries = Array.isArray(payload['entries']) ? payload['entries'] : [];
      const ids = entries
        .map((entry) => (entry as { id?: unknown } | null)?.id)
        .filter((id): id is string => typeof id === 'string');
      const listed = ids.length > 0 ? `: ${ids.join(', ')}` : '';
      return `La sincronización no pudo leer ${count === 1 ? '1 entrada' : `${count} entradas`} del Roadmap${listed}`;
    }
    case 'TASK_ASSIGNED':
      return `Te asignaron la tarea «${taskTitle(payload)}»`;
    case 'TASK_REASSIGNED':
      return `La tarea «${taskTitle(payload)}» pasó a otra persona`;
    case 'TASK_COMMENTED':
      return `Nuevo comentario en tu tarea «${taskTitle(payload)}»`;
    default:
      return notification.type;
  }
}
