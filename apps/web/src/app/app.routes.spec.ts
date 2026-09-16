import { signal } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { describe, expect, it, vi } from 'vitest';
import { routes } from './app.routes.js';
import { AuthService } from './core/auth.service.js';

function configure(signedIn: boolean): void {
  TestBed.configureTestingModule({
    providers: [
      provideRouter(routes),
      provideHttpClient(),
      provideHttpClientTesting(),
      {
        provide: AuthService,
        useValue: {
          isAuthenticated: () => signedIn,
          refresh: vi.fn().mockResolvedValue(false),
          hasGlobalPermission: () => false,
          logout: vi.fn(),
          currentActor: signal(
            signedIn
              ? {
                  id: 'u1',
                  displayName: 'Demo Human',
                  email: 'demo@pmhybrid.local',
                  kind: 'HUMAN',
                  avatarUrl: null,
                  permissions: [],
                }
              : null,
          ),
        },
      },
    ],
  });
}

async function open(url: string) {
  const harness = await RouterTestingHarness.create();
  await harness.navigateByUrl(url);
  harness.detectChanges();
  return {
    root: harness.fixture.nativeElement as HTMLElement,
    url: TestBed.inject(Router).url,
  };
}

describe('app routes', () => {
  it('renders the login page outside the shell', async () => {
    configure(false);
    const { root, url } = await open('/login');

    expect(url).toBe('/login');
    expect(root.querySelector('h1')?.textContent).toContain('Iniciar sesión');
    expect(root.querySelector('nav')).toBeNull();
  });

  it('sends a signed-out visitor from a shell page to the login page', async () => {
    configure(false);
    const { root, url } = await open('/team');

    expect(url).toBe('/login');
    expect(root.querySelector('nav[aria-label="Primary"]')).toBeNull();
  });

  it('renders signed-in pages inside the shell with exactly one navigation', async () => {
    configure(true);
    const { root, url } = await open('/team');

    expect(url).toBe('/team');
    expect(root.querySelectorAll('nav')).toHaveLength(1);
    expect(root.querySelector('main h1')?.textContent).toContain('Equipo');
  });

  it('opens the dashboard for the bare root', async () => {
    configure(true);

    expect((await open('/')).url).toBe('/dashboard');
  });

  it('opens the dashboard for unknown paths', async () => {
    configure(true);

    expect((await open('/no-such-page')).url).toBe('/dashboard');
  });
});
