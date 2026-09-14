import { CanActivateFn } from '@angular/router';

/**
 * Stub for FASE-05. Will read a required permission key from route data
 * (e.g. `data: { permission: 'task.reassign.locked' }`) and check it
 * against the current actor's ActorRole grants for the project.
 */
export const permissionGuard: CanActivateFn = () => {
  return true;
};
