import { DatePipe } from '@angular/common';
import {
  Component,
  ElementRef,
  OnInit,
  computed,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
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
  readonly notificationsPanelOpen = signal(false);
  readonly describeNotification = describeNotification;

  async ngOnInit(): Promise<void> {
    await this.reloadNotifications();
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
    this.notifications.set(await this.notificationsService.list());
  }
}
