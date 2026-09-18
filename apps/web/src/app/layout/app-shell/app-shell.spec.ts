import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthService } from '../../core/auth.service.js';
import { Notification, NotificationsService } from '../../core/notifications.service.js';
import { RealtimeService } from '../../core/realtime.service.js';
import { AppShell } from './app-shell.js';

@Component({ template: '<p>page body</p>' })
class StubPage {}

function notification(overrides: Partial<Notification> = {}): Notification {
  return {
    id: 'n1',
    actorId: 'u1',
    projectId: 'p1',
    type: 'CONFLICTS_DETECTED',
    payload: { conflictsRaised: 2 },
    readAt: null,
    createdAt: '2026-09-15T09:00:00.000Z',
    ...overrides,
  };
}

describe('AppShell', () => {
  let logout: ReturnType<typeof vi.fn>;
  let list: ReturnType<typeof vi.fn>;
  let markRead: ReturnType<typeof vi.fn>;
  let notificationsChanged: ReturnType<typeof signal<number>>;

  beforeEach(() => {
    logout = vi.fn();
    list = vi.fn().mockResolvedValue([]);
    markRead = vi.fn();
    notificationsChanged = signal(0);
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          { path: 'login', component: StubPage },
          {
            path: '',
            component: AppShell,
            children: [
              { path: 'dashboard', component: StubPage },
              { path: 'projects', component: StubPage },
              { path: 'projects/:projectId', component: StubPage },
              { path: 'workload', component: StubPage },
              { path: 'team', component: StubPage },
              { path: 'roles', component: StubPage },
            ],
          },
        ]),
        {
          provide: AuthService,
          useValue: {
            currentActor: signal({
              id: 'u1',
              displayName: 'Ana García',
              email: 'ana@pmhybrid.local',
              kind: 'HUMAN',
              avatarUrl: null,
              permissions: [],
            }),
            logout,
          },
        },
        { provide: NotificationsService, useValue: { list, markRead } },
        { provide: RealtimeService, useValue: { notificationsChanged } },
      ],
    });
  });

  async function renderAt(url: string) {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl(url, AppShell);
    // ngOnInit's notifications.list() is a plain promise, which whenStable() does not track.
    await new Promise((resolve) => setTimeout(resolve));
    harness.detectChanges();
    const root = harness.fixture.nativeElement as HTMLElement;
    const primaryLinks = () =>
      Array.from(root.querySelectorAll<HTMLAnchorElement>('nav[aria-label="Primary"] a'));
    return { harness, root, primaryLinks };
  }

  it('renders the primary navigation exactly once, around the routed page', async () => {
    const { root, primaryLinks } = await renderAt('/dashboard');

    expect(root.querySelectorAll('nav')).toHaveLength(1);
    expect(primaryLinks().map((link) => link.textContent?.trim())).toEqual([
      'Panel',
      'Mis proyectos',
      'Carga de trabajo',
      'Equipo',
      'Roles',
    ]);
    expect(root.querySelector('main')?.textContent).toContain('page body');
  });

  it('marks the current section as the current page, including inside a project', async () => {
    const { harness, primaryLinks } = await renderAt('/team');
    const current = () =>
      primaryLinks()
        .filter((link) => link.getAttribute('aria-current') === 'page')
        .map((link) => link.textContent?.trim());

    expect(current()).toEqual(['Equipo']);

    await harness.navigateByUrl('/projects/p1', AppShell);
    harness.detectChanges();
    expect(current()).toEqual(['Mis proyectos']);
  });

  it('shows who is signed in, with their kind', async () => {
    const { root } = await renderAt('/dashboard');
    const header = root.querySelector('header')?.textContent ?? '';

    expect(header).toContain('Ana García');
    expect(header).toContain('Humano');
  });

  it('signs out back to the login page', async () => {
    const { harness, root } = await renderAt('/workload');
    const signOut = Array.from(root.querySelectorAll('button')).find(
      (button) => button.textContent?.trim() === 'Cerrar sesión',
    );

    signOut!.click();
    await harness.fixture.whenStable();

    expect(logout).toHaveBeenCalledOnce();
    expect(TestBed.inject(Router).url).toBe('/login');
  });

  it('toggles the color scheme and its own label', async () => {
    document.documentElement.style.colorScheme = '';
    const { harness, root } = await renderAt('/dashboard');
    const toggle = root.querySelector<HTMLButtonElement>('.theme-toggle')!;

    expect(toggle.getAttribute('aria-label')).toBe('Cambiar a tema oscuro');

    toggle.click();
    await harness.fixture.whenStable();
    harness.detectChanges();

    expect(document.documentElement.style.colorScheme).toBe('dark');
    expect(toggle.getAttribute('aria-label')).toBe('Cambiar a tema claro');
  });

  it('moves keyboard focus to the main content from the skip link', async () => {
    const { root } = await renderAt('/dashboard');

    root.querySelector<HTMLAnchorElement>('.skip-link')!.click();

    expect(document.activeElement).toBe(root.querySelector('main'));
  });

  it('shows an unread badge and an empty state before the panel has any notifications', async () => {
    const { root, harness } = await renderAt('/dashboard');

    expect(root.querySelector('.notifications__badge')).toBeNull();

    const toggle = root.querySelector<HTMLButtonElement>('.notifications__toggle')!;
    toggle.click();
    await harness.fixture.whenStable();
    harness.detectChanges();

    expect(root.textContent).toContain('Todavía no hay notificaciones.');
  });

  it('badges the unread count and lets an unread notification be marked read', async () => {
    list.mockResolvedValue([
      notification({ id: 'n1', readAt: null }),
      notification({ id: 'n2', type: 'SYNC_FAILED', payload: { error: 'boom' }, readAt: null }),
      notification({ id: 'n3', readAt: '2026-09-15T10:00:00.000Z' }),
    ]);
    markRead.mockResolvedValue(notification({ id: 'n1', readAt: '2026-09-15T11:00:00.000Z' }));
    const { root, harness } = await renderAt('/dashboard');

    expect(root.querySelector('.notifications__badge')?.textContent?.trim()).toBe('2');

    root.querySelector<HTMLButtonElement>('.notifications__toggle')!.click();
    await harness.fixture.whenStable();
    harness.detectChanges();

    expect(root.textContent).toContain('La sincronización encontró 2 conflictos por resolver');
    expect(root.textContent).toContain('Falló la sincronización: boom');

    const markReadButtons = Array.from(root.querySelectorAll('button')).filter(
      (b) => b.textContent?.trim() === 'Marcar como leída',
    );
    expect(markReadButtons).toHaveLength(2); // n1 and n2 are unread; n3 already is.

    markReadButtons[0].click();
    await harness.fixture.whenStable();
    harness.detectChanges();

    expect(markRead).toHaveBeenCalledWith('n1');
    expect(
      Array.from(root.querySelectorAll('button')).filter(
        (b) => b.textContent?.trim() === 'Marcar como leída',
      ),
    ).toHaveLength(1);
    expect(root.querySelector('.notifications__badge')?.textContent?.trim()).toBe('1');
  });

  it('refetches notifications when RealtimeService signals a push (Roadmap GAP-26)', async () => {
    const { harness } = await renderAt('/dashboard');
    expect(list).toHaveBeenCalledTimes(1);

    list.mockResolvedValue([notification({ id: 'n4', readAt: null })]);
    notificationsChanged.set(1);
    await harness.fixture.whenStable();
    harness.detectChanges();

    expect(list).toHaveBeenCalledTimes(2);
  });
});
