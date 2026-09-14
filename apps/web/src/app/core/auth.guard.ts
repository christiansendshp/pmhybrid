import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';

/**
 * Stub for FASE-04. Currently permissive (always allows) so downstream
 * routes are reachable before real auth exists; real logic redirects to
 * /login when unauthenticated.
 */
export const authGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  if (!auth.isAuthenticated()) {
    // FASE-04: return router.createUrlTree(['/login']) once login is real.
    void router;
  }
  return true;
};
