import { Component, ElementRef, computed, inject, viewChild } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { actorKindLabel } from '../../core/actor-kind.js';
import { AuthService } from '../../core/auth.service.js';

interface NavItem {
  label: string;
  path: string;
}

/**
 * The one frame around every signed-in route (brief §21, §30): primary
 * navigation, who is signed in, and sign-out. `/login` renders outside it.
 */
@Component({
  selector: 'app-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, MatButtonModule],
  templateUrl: './app-shell.html',
  styleUrl: './app-shell.scss',
})
export class AppShell {
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly main = viewChild.required<ElementRef<HTMLElement>>('main');

  readonly navItems: readonly NavItem[] = [
    { label: 'Dashboard', path: '/dashboard' },
    { label: 'My Projects', path: '/projects' },
    { label: 'Workload', path: '/workload' },
    { label: 'Team', path: '/team' },
  ];

  readonly currentActor = this.authService.currentActor;
  readonly actorKindLabel = computed(() => actorKindLabel(this.currentActor()?.kind ?? ''));

  /** A plain `#main` link would be resolved against `<base href>` and trigger a route change. */
  skipToContent(event: Event): void {
    event.preventDefault();
    this.main().nativeElement.focus();
  }

  async signOut(): Promise<void> {
    this.authService.logout();
    await this.router.navigateByUrl('/login');
  }
}
