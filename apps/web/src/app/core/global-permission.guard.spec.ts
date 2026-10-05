import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, Router } from '@angular/router';
import { describe, expect, it } from 'vitest';
import { AuthService } from './auth.service.js';
import { globalPermissionGuard } from './global-permission.guard.js';

function run(held: string[], data: Record<string, unknown>) {
  TestBed.configureTestingModule({
    providers: [
      {
        provide: AuthService,
        useValue: { hasGlobalPermission: (key: string) => held.includes(key) },
      },
      { provide: Router, useValue: { createUrlTree: (commands: string[]) => ({ commands }) } },
    ],
  });
  return TestBed.runInInjectionContext(() =>
    globalPermissionGuard({ data } as unknown as ActivatedRouteSnapshot, {} as never),
  );
}

describe('globalPermissionGuard (Roadmap GAP-39b)', () => {
  it('lets in whoever holds the global permission the route names', () => {
    expect(run(['settings.manage'], { globalPermission: 'settings.manage' })).toBe(true);
  });

  it('sends anyone else to the dashboard', () => {
    expect(run(['actors.manage'], { globalPermission: 'settings.manage' })).toEqual({
      commands: ['/dashboard'],
    });
  });

  it('checks nothing on a route that names no permission', () => {
    expect(run([], {})).toBe(true);
  });
});
