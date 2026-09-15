import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthService } from '../../core/auth.service.js';
import { Notification, NotificationsService } from '../../core/notifications.service.js';
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

  beforeEach(() => {
    logout = vi.fn();
    list = vi.fn().mockResolvedValue([]);
    markRead = vi.fn();
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
      'Dashboard',
      'My Projects',
      'Workload',
      'Team',
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

    expect(current()).toEqual(['Team']);

    await harness.navigateByUrl('/projects/p1', AppShell);
    harness.detectChanges();
    expect(current()).toEqual(['My Projects']);
  });

  it('shows who is signed in, with their kind', async () => {
    const { root } = await renderAt('/dashboard');
    const header = root.querySelector('header')?.textContent ?? '';

    expect(header).toContain('Ana García');
    expect(header).toContain('Human');
  });

  it('signs out back to the login page', async () => {
    const { harness, root } = await renderAt('/workload');
    const signOut = Array.from(root.querySelectorAll('button')).find(
      (button) => button.textContent?.trim() === 'Sign out',
    );

    signOut!.click();
    await harness.fixture.whenStable();

    expect(logout).toHaveBeenCalledOnce();
    expect(TestBed.inject(Router).url).toBe('/login');
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

    expect(root.textContent).toContain('No notifications yet.');
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

    expect(root.textContent).toContain('Sync found 2 conflicts to resolve');
    expect(root.textContent).toContain('Sync failed: boom');

    const markReadButtons = Array.from(root.querySelectorAll('button')).filter(
      (b) => b.textContent?.trim() === 'Mark read',
    );
    expect(markReadButtons).toHaveLength(2); // n1 and n2 are unread; n3 already is.

    markReadButtons[0].click();
    await harness.fixture.whenStable();
    harness.detectChanges();

    expect(markRead).toHaveBeenCalledWith('n1');
    expect(
      Array.from(root.querySelectorAll('button')).filter(
        (b) => b.textContent?.trim() === 'Mark read',
      ),
    ).toHaveLength(1);
    expect(root.querySelector('.notifications__badge')?.textContent?.trim()).toBe('1');
  });
});
