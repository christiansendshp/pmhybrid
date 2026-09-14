import { TestBed } from '@angular/core/testing';
import { Router, UrlTree } from '@angular/router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { authGuard } from './auth.guard.js';
import { AuthService } from './auth.service.js';

describe('authGuard', () => {
  let isAuthenticated: boolean;
  let refreshMock: ReturnType<typeof vi.fn>;
  let routerMock: Pick<Router, 'createUrlTree'>;
  const loginTree = {} as UrlTree;

  beforeEach(() => {
    isAuthenticated = false;
    refreshMock = vi.fn().mockResolvedValue(false);
    routerMock = { createUrlTree: vi.fn().mockReturnValue(loginTree) };

    const authServiceMock: Pick<AuthService, 'isAuthenticated' | 'refresh'> = {
      isAuthenticated: (() => isAuthenticated) as AuthService['isAuthenticated'],
      refresh: refreshMock as AuthService['refresh'],
    };

    TestBed.configureTestingModule({
      providers: [
        { provide: AuthService, useValue: authServiceMock },
        { provide: Router, useValue: routerMock },
      ],
    });
  });

  function runGuard() {
    return TestBed.runInInjectionContext(() => authGuard({} as never, {} as never));
  }

  it('allows navigation when already authenticated', async () => {
    isAuthenticated = true;
    await expect(runGuard()).resolves.toBe(true);
    expect(refreshMock).not.toHaveBeenCalled();
  });

  it('tries a silent refresh when not authenticated, and allows navigation if it succeeds', async () => {
    refreshMock.mockResolvedValue(true);
    await expect(runGuard()).resolves.toBe(true);
  });

  it('redirects to /login when unauthenticated and refresh fails', async () => {
    const result = await runGuard();
    expect(result).toBe(loginTree);
    expect(routerMock.createUrlTree).toHaveBeenCalledWith(['/login']);
  });
});
