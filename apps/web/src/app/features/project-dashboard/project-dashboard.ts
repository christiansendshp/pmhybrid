import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatSelectModule } from '@angular/material/select';
import { Actor, ActorsService } from '../../core/actors.service.js';
import { Project, ProjectMember, ProjectsService } from '../../core/projects.service.js';
import { SyncRun, SynchronizationService } from '../../core/synchronization.service.js';

@Component({
  selector: 'app-project-dashboard',
  imports: [
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
    FormsModule,
    MatButtonModule,
    MatSelectModule,
  ],
  templateUrl: './project-dashboard.html',
})
export class ProjectDashboard implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly projectsService = inject(ProjectsService);
  private readonly actorsService = inject(ActorsService);
  private readonly synchronizationService = inject(SynchronizationService);

  readonly project = signal<Project | null>(null);
  readonly members = signal<ProjectMember[]>([]);
  readonly candidateActors = signal<Actor[]>([]);
  readonly canManageMembers = signal(false);
  readonly selectedActorId = signal<string | null>(null);
  readonly syncing = signal(false);
  readonly lastSyncRun = signal<SyncRun | null>(null);

  private get projectId(): string {
    return this.route.snapshot.paramMap.get('projectId')!;
  }

  async ngOnInit(): Promise<void> {
    const projectId = this.projectId;
    const [project, members, permissions, users, agents] = await Promise.all([
      this.projectsService.getById(projectId),
      this.projectsService.listMembers(projectId),
      this.projectsService.myPermissions(projectId),
      this.actorsService.listUsers(),
      this.actorsService.listAgents(),
    ]);

    this.project.set(project);
    this.members.set(members);
    this.canManageMembers.set(permissions.includes('project.members.manage'));

    // Inactive actors can't join a project (the API rejects them), so they're never offered.
    const memberActorIds = new Set(members.map((m) => m.actorId));
    this.candidateActors.set(
      [...users, ...agents].filter((a) => a.isActive && !memberActorIds.has(a.id)),
    );
  }

  /** "Sincronizar ahora" (brief §11). */
  async syncNow(): Promise<void> {
    this.syncing.set(true);
    try {
      this.lastSyncRun.set(await this.synchronizationService.triggerSync(this.projectId));
    } finally {
      this.syncing.set(false);
    }
  }

  async addMember(): Promise<void> {
    const actorId = this.selectedActorId();
    if (!actorId) {
      return;
    }
    await this.projectsService.addMember(this.projectId, actorId);
    this.selectedActorId.set(null);
    this.members.set(await this.projectsService.listMembers(this.projectId));
    const memberActorIds = new Set(this.members().map((m) => m.actorId));
    this.candidateActors.set(this.candidateActors().filter((a) => !memberActorIds.has(a.id)));
  }
}
