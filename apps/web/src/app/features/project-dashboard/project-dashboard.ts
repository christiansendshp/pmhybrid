import { DatePipe } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatSelectModule } from '@angular/material/select';
import { actorKindLabel } from '../../core/actor-kind.js';
import { Actor, ActorsService } from '../../core/actors.service.js';
import { describeHttpError } from '../../core/http-error.js';
import { ProjectContext } from '../../core/project-context.js';
import { ProjectMember, ProjectsService } from '../../core/projects.service.js';
import { Role, RoleAssignment, RolesService } from '../../core/roles.service.js';
import { syncNeedsAttention, syncStatusLabel } from '../../core/sync-status.js';
import { SyncRun, SynchronizationService } from '../../core/synchronization.service.js';

/** Project header inside the app shell: identity, sync, members and the section tabs. */
@Component({
  selector: 'app-project-dashboard',
  imports: [
    DatePipe,
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
    FormsModule,
    MatButtonModule,
    MatSelectModule,
  ],
  providers: [ProjectContext],
  templateUrl: './project-dashboard.html',
  styleUrl: './project-dashboard.scss',
})
export class ProjectDashboard implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly projectsService = inject(ProjectsService);
  private readonly actorsService = inject(ActorsService);
  private readonly rolesService = inject(RolesService);
  private readonly synchronizationService = inject(SynchronizationService);
  private readonly context = inject(ProjectContext);

  readonly tabs = [
    { label: 'Kanban', path: 'kanban' },
    { label: 'Progreso', path: 'progress' },
    { label: 'Documentos', path: 'documents' },
    { label: 'Conflictos', path: 'conflicts' },
    { label: 'Auditoría', path: 'audit' },
    { label: 'Configuración', path: 'settings' },
  ] as const;
  readonly kindLabel = actorKindLabel;

  readonly project = this.context.project;
  readonly members = signal<ProjectMember[]>([]);
  readonly candidateActors = signal<Actor[]>([]);
  readonly canManageMembers = signal(false);
  readonly selectedActorId = signal<string | null>(null);
  /** Role picked in the same "add a member" form — optional, assigned right after the member is added. */
  readonly selectedNewMemberRoleId = signal<string | null>(null);
  readonly syncing = signal(false);
  readonly lastSyncRun = signal<SyncRun | null>(null);
  readonly syncStatusLabel = syncStatusLabel;
  /** The last run failed: why, from the run itself, so it is visible without pressing anything (Roadmap UX-01). */
  readonly lastSyncFailure = computed(() => {
    const run = this.lastSyncRun();
    return run?.status === 'FAILED' ? (run.summary?.error ?? 'Error desconocido') : null;
  });
  readonly lastSyncNeedsAttention = computed(() => {
    const run = this.lastSyncRun();
    return run ? syncNeedsAttention(run.status) : false;
  });
  /** Dependencies the last run left unlinked because they would close a loop in the document. */
  readonly skippedCycles = computed(() => this.lastSyncRun()?.summary?.skippedCycles ?? []);
  /** The project could not be loaded at all. */
  readonly loadError = signal<string | null>(null);
  /** Why "Sincronizar ahora" failed (a 422 carries the readable reason), or null. */
  readonly syncErrorMessage = signal<string | null>(null);
  /** Roadmap entries the last run could not read; their tasks were left as they were. */
  readonly entryErrors = computed(() => this.lastSyncRun()?.summary?.entryErrors ?? []);

  /** Project-scoped roles (brief §4) — assignment reuses the roles.controller.ts catalog, filtered client-side. */
  readonly projectRoles = signal<Role[]>([]);
  readonly roleAssignments = signal<RoleAssignment[]>([]);
  readonly canManageRoles = signal(false);
  readonly roleErrorMessage = signal<string | null>(null);
  /** One pending role-to-assign selection per member row, keyed by actorId. */
  private readonly selectedRoleByActor = signal<Record<string, string | null>>({});

  private get projectId(): string {
    return this.route.snapshot.paramMap.get('projectId')!;
  }

  async ngOnInit(): Promise<void> {
    try {
      await this.load();
    } catch (error) {
      this.loadError.set(describeHttpError(error, 'No se pudo cargar el proyecto.'));
    }
  }

  private async load(): Promise<void> {
    const projectId = this.projectId;
    void this.loadLastSyncRun(projectId);
    const [project, members, permissions, users, agents, roles, assignments] = await Promise.all([
      this.projectsService.getById(projectId),
      this.projectsService.listMembers(projectId),
      this.projectsService.myPermissions(projectId),
      this.actorsService.listUsers(),
      this.actorsService.listAgents(),
      this.rolesService.listRoles(),
      this.rolesService.listAssignments(projectId),
    ]);

    this.context.project.set(project);
    this.context.permissions.set(permissions);
    this.members.set(members);
    this.canManageMembers.set(permissions.includes('project.members.manage'));
    this.canManageRoles.set(permissions.includes('project.roles.manage'));
    this.projectRoles.set(roles.filter((r) => r.scope === 'PROJECT'));
    this.roleAssignments.set(assignments);

    // Inactive actors can't join a project (the API rejects them), so they're never offered.
    const memberActorIds = new Set(members.map((m) => m.actorId));
    this.candidateActors.set(
      [...users, ...agents].filter((a) => a.isActive && !memberActorIds.has(a.id)),
    );
  }

  /** The header shows the last run from the moment it opens, not only after "Sincronizar ahora" was pressed. */
  private async loadLastSyncRun(projectId: string): Promise<void> {
    try {
      const runs = await this.synchronizationService.listSyncRuns(projectId);
      if (!this.lastSyncRun()) {
        this.lastSyncRun.set(runs[0] ?? null);
      }
    } catch {
      // Best effort: the header simply shows no run.
    }
  }

  rolesForMember(actorId: string): RoleAssignment[] {
    return this.roleAssignments().filter((a) => a.actorId === actorId);
  }

  /** Roles not already assigned to this member — nothing left to offer once they hold every project role. */
  availableRolesForMember(actorId: string): Role[] {
    const assignedRoleIds = new Set(this.rolesForMember(actorId).map((a) => a.roleId));
    return this.projectRoles().filter((r) => !assignedRoleIds.has(r.id));
  }

  selectedRoleFor(actorId: string): string | null {
    return this.selectedRoleByActor()[actorId] ?? null;
  }

  setSelectedRoleFor(actorId: string, roleId: string | null): void {
    this.selectedRoleByActor.set({ ...this.selectedRoleByActor(), [actorId]: roleId });
  }

  async assignRole(actorId: string): Promise<void> {
    const roleId = this.selectedRoleFor(actorId);
    if (!roleId) {
      return;
    }
    this.roleErrorMessage.set(null);
    try {
      await this.rolesService.assign(this.projectId, actorId, roleId);
      this.setSelectedRoleFor(actorId, null);
      this.roleAssignments.set(await this.rolesService.listAssignments(this.projectId));
    } catch (error) {
      this.roleErrorMessage.set(describeHttpError(error));
    }
  }

  async revokeRole(assignment: RoleAssignment): Promise<void> {
    this.roleErrorMessage.set(null);
    try {
      await this.rolesService.revoke(this.projectId, assignment.id);
      this.roleAssignments.set(await this.rolesService.listAssignments(this.projectId));
    } catch (error) {
      this.roleErrorMessage.set(describeHttpError(error));
    }
  }

  /** "Sincronizar ahora" (brief §11). */
  async syncNow(): Promise<void> {
    this.syncing.set(true);
    this.syncErrorMessage.set(null);
    try {
      this.lastSyncRun.set(await this.synchronizationService.triggerSync(this.projectId));
    } catch (error) {
      this.syncErrorMessage.set(describeHttpError(error, 'No se pudo sincronizar.'));
    } finally {
      this.syncing.set(false);
    }
  }

  /** Adds the selected actor as a member and, when a role was also picked, assigns it in the same action. */
  async addMember(): Promise<void> {
    const actorId = this.selectedActorId();
    if (!actorId) {
      return;
    }
    this.roleErrorMessage.set(null);
    await this.projectsService.addMember(this.projectId, actorId);

    const roleId = this.selectedNewMemberRoleId();
    if (roleId) {
      try {
        await this.rolesService.assign(this.projectId, actorId, roleId);
      } catch (error) {
        this.roleErrorMessage.set(describeHttpError(error));
      }
      this.roleAssignments.set(await this.rolesService.listAssignments(this.projectId));
    }

    this.selectedActorId.set(null);
    this.selectedNewMemberRoleId.set(null);
    this.members.set(await this.projectsService.listMembers(this.projectId));
    const memberActorIds = new Set(this.members().map((m) => m.actorId));
    this.candidateActors.set(this.candidateActors().filter((a) => !memberActorIds.has(a.id)));
  }
}
