import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, from, switchMap, throwError } from 'rxjs';
import { AuthService } from './auth.service.js';

const AUTH_ENDPOINTS = ['/auth/login', '/auth/refresh'];

/**
 * Attaches the current access token to every request, and on a 401
 * attempts exactly one silent refresh before retrying — never loops.
 */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const authService = inject(AuthService);
  const router = inject(Router);

  const token = authService.accessToken();
  const authedReq = token ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }) : req;

  return next(authedReq).pipe(
    catchError((error: unknown) => {
      const isAuthEndpoint = AUTH_ENDPOINTS.some((path) => req.url.includes(path));
      if (!(error instanceof HttpErrorResponse) || error.status !== 401 || isAuthEndpoint) {
        return throwError(() => error);
      }

      return from(authService.refresh()).pipe(
        switchMap((refreshed) => {
          if (!refreshed) {
            void router.navigate(['/login']);
            return throwError(() => error);
          }
          const retryToken = authService.accessToken();
          const retryReq = retryToken
            ? req.clone({ setHeaders: { Authorization: `Bearer ${retryToken}` } })
            : req;
          return next(retryReq);
        }),
      );
    }),
  );
};
