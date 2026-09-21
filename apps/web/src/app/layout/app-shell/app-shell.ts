import { DatePipe } from '@angular/common';
import {
  Component,
  DestroyRef,
  ElementRef,
  HostListener,
  OnInit,
  computed,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs';
import { MatButtonModule } from '@angular/material/button';
import { actorKindLabel } from '../../core/actor-kind.js';
import { AuthService } from '../../core/auth.service.js';
import { describeNotification } from '../../core/notification-format.js';
import { Notification, NotificationsService } from '../../core/notifications.service.js';
import { RealtimeService } from '../../core/realtime.service.js';
import { ThemeService } from '../../core/theme.service.js';

interface NavItem {
  label: string;
  path: string;
}

/** Notifications that say the same thing about the same project, shown once with how many there are (Roadmap UX-01). */
export interface NotificationGroup {
  key: string;
  message: string;
  count: number;
  unreadCount: number;
  latestAt: string;
  ids: string[];
}

/**
 * The one frame around every signed-in route (brief §21, §30): primary
 * navigation, who is signed in, and sign-out. `/login` renders outside it.
 * Also owns the notifications indicator (brief §29): fetched once on load,
 * refreshed each time the panel opens, and pushed live over
 * `RealtimeService` (Roadmap GAP-26) — a push just triggers a refetch, the
 * REST list stays the source of truth for what a notification looks like.
 */
@Component({
  selector: 'app-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, MatButtonModule, DatePipe],
  templateUrl: './app-shell.html',
  styleUrl: './app-shell.scss',
})
export class AppShell implements OnInit {
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly notificationsService = inject(NotificationsService);
  private readonly realtimeService = inject(RealtimeService);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly destroyRef = inject(DestroyRef);
  private readonly main = viewChild.required<ElementRef<HTMLElement>>('main');
  readonly themeService = inject(ThemeService);

  private readonly notificationsPushEffect = effect(() => {
    if (this.realtimeService.notificationsChanged() > 0) {
      void this.reloadNotifications();
    }
  });

  readonly navItems: readonly NavItem[] = [
    { label: 'Panel', path: '/dashboard' },
    { label: 'Mis proyectos', path: '/projects' },
    { label: 'Carga de trabajo', path: '/workload' },
    { label: 'Equipo', path: '/team' },
    { label: 'Roles', path: '/roles' },
  ];

  readonly currentActor = this.authService.currentActor;
  readonly actorKindLabel = computed(() => actorKindLabel(this.currentActor()?.kind ?? ''));

  readonly notifications = signal<Notification[]>([]);
  readonly unreadCount = computed(() => this.notifications().filter((n) => !n.readAt).length);
  /** The failure of loading them, shown in the panel instead of an empty list that looks like "nothing happened". */
  readonly notificationsError = signal<string | null>(null);
  readonly markingAll = signal(false);
  /** The same message about the same project collapses to one row, newest first. */
  readonly notificationGroups = computed<NotificationGroup[]>(() => {
    const groups = new Map<string, NotificationGroup>();
    for (const notification of this.notifications()) {
      const message = describeNotification(notification);
      const key = `${notification.projectId}\u001f${message}`;
      const group = groups.get(key) ?? {
        key,
        message,
        count: 0,
        unreadCount: 0,
        latestAt: notification.createdAt,
        ids: [],
      };
      group.count += 1;
      group.unreadCount += notification.readAt ? 0 : 1;
      group.ids.push(notification.id);
      if (notification.createdAt > group.latestAt) {
        group.latestAt = notification.createdAt;
      }
      groups.set(key, group);
    }
    return [...groups.values()].sort((a, b) => b.latestAt.localeCompare(a.latestAt));
  });
  readonly notificationsPanelOpen = signal(false);
  readonly describeNotification = describeNotification;

  async ngOnInit(): Promise<void> {
    // Moving to another page closes the panel: it would otherwise sit over the new one.
    this.router.events
      .pipe(
        filter((event) => event instanceof NavigationEnd),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe(() => this.notificationsPanelOpen.set(false));
    await this.reloadNotifications();
  }

  @HostListener('document:keydown.escape')
  closePanelOnEscape(): void {
    this.notificationsPanelOpen.set(false);
  }

  @HostListener('document:click', ['$event'])
  closePanelOnOutsideClick(event: Event): void {
    if (!this.notificationsPanelOpen()) {
      return;
    }
    const notifications = this.host.nativeElement.querySelector('.notifications');
    if (notifications && !notifications.contains(event.target as Node)) {
      this.notificationsPanelOpen.set(false);
    }
  }

  async toggleNotificationsPanel(): Promise<void> {
    const opening = !this.notificationsPanelOpen();
    this.notificationsPanelOpen.set(opening);
    if (opening) {
      await this.reloadNotifications();
    }
  }

  async markNotificationRead(notification: Notification): Promise<void> {
    if (notification.readAt) {
      return;
    }
    const updated = await this.notificationsService.markRead(notification.id);
    this.notifications.set(this.notifications().map((n) => (n.id === updated.id ? updated : n)));
  }

  /** Marks every unread notification in a group (they all say the same thing). */
  async markGroupRead(group: NotificationGroup): Promise<void> {
    const unread = this.notifications().filter((n) => group.ids.includes(n.id) && !n.readAt);
    await Promise.all(unread.map((n) => this.markNotificationRead(n)));
  }

  async markAllRead(): Promise<void> {
    if (this.markingAll() || this.unreadCount() === 0) {
      return;
    }
    this.markingAll.set(true);
    try {
      await this.notificationsService.markAllRead();
      const now = new Date().toISOString();
      this.notifications.set(
        this.notifications().map((n) => (n.readAt ? n : { ...n, readAt: now })),
      );
    } catch {
      this.notificationsError.set('No se pudieron marcar como leídas.');
    } finally {
      this.markingAll.set(false);
    }
  }

  /** A plain `#main` link would be resolved against `<base href>` and trigger a route change. */
  skipToContent(event: Event): void {
    event.preventDefault();
    this.main().nativeElement.focus();
  }

  async signOut(): Promise<void> {
    this.authService.logout();
    await this.router.navigateByUrl('/login');
  }

  private async reloadNotifications(): Promise<void> {
    try {
      this.notifications.set(await this.notificationsService.list());
      this.notificationsError.set(null);
    } catch {
      this.notificationsError.set('No se pudieron cargar las notificaciones.');
    }
  }
}
