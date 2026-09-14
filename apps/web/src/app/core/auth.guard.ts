import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service.js';

/**
 * Real guard for FASE-04 (replaces the FASE-03 permissive stub). If there's
 * no in-memory access token, tries one silent refresh (covers a page
 * reload, since the access token is intentionally not persisted — ADR-006)
 * before redirecting to /login.
 */
export const authGuard: CanActivateFn = async () => {
  const authService = inject(AuthService);
  const router = inject(Router);

  if (authService.isAuthenticated()) {
    return true;
  }

  const refreshed = await authService.refresh();
  if (refreshed) {
    return true;
  }

  return router.createUrlTree(['/login']);
};
