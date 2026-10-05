import { inject } from '@angular/core';
import { ActivatedRouteSnapshot, CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service.js';

/**
 * Reads a required global permission key from route data
 * (`data: { globalPermission: 'settings.manage' }`) and sends everyone else to
 * the dashboard. The server enforces it regardless; this only spares a page that
 * could never load (Roadmap GAP-39b). No key in the route data = no check. Runs
 * after `authGuard`, which has loaded the actor and its permissions.
 */
export const globalPermissionGuard: CanActivateFn = (route: ActivatedRouteSnapshot) => {
  const required = route.data['globalPermission'] as string | undefined;
  if (!required) {
    return true;
  }
  return (
    inject(AuthService).hasGlobalPermission(required) ||
    inject(Router).createUrlTree(['/dashboard'])
  );
};
