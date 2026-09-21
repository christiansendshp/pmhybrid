import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { provideRouter } from '@angular/router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Actor, ActorsService } from '../../core/actors.service.js';
import { Project, ProjectMember, ProjectsService } from '../../core/projects.service.js';
import { Role, RoleAssignment, RolesService } from '../../core/roles.service.js';
import { SynchronizationService } from '../../core/synchronization.service.js';
import { ProjectDashboard } from './project-dashboard.js';

const PROJECT: Project = {
  id: 'p1',
  name: 'Website Relaunch',
  description: null,
  repoUrl: null,
  docsPath: './docs',
  syncIntervalMinutes: 5,
  progressRollupStrategy: 'EQUAL_WEIGHT_AVERAGE',
  status: 'ACTIVE',
  createdAt: '2026-09-01T09:00:00.000Z',
  lead: null,
};

function actor(overrides: Partial<Actor> = {}): Actor {
  return {
    id: 'a1',
    kind: 'HUMAN',
    displayName: 'Ana García',
    email: 'ana@pmhybrid.local',
    avatarUrl: null,
    isActive: true,
    createdAt: '2026-09-01T09:00:00.000Z',
    ...overrides,
  };
}

function member(actorRow: Actor, overrides: Partial<ProjectMember> = {}): ProjectMember {
  return {
    id: `m-${actorRow.id}`,
    projectId: 'p1',
    actorId: actorRow.id,
    joinedAt: '2026-09-01T09:00:00.000Z',
    isActive: true,
    actor: {
      id: actorRow.id,
      displayName: actorRow.displayName,
      kind: actorRow.kind,
      email: actorRow.email,
    },
    ...overrides,
  };
}

function role(overrides: Partial<Role> = {}): Role {
  return {
    id: 'r-dev',
    name: 'DEVELOPER',
    scope: 'PROJECT',
    isSystem: true,
    rolePermissions: [],
    ...overrides,
  };
}

function assignment(overrides: Partial<RoleAssignment> = {}): RoleAssignment {
  return {
    id: 'ar1',
    actorId: 'a1',
    roleId: 'r-dev',
    projectId: 'p1',
    role: { id: 'r-dev', name: 'DEVELOPER', scope: 'PROJECT' },
    actor: { id: 'a1', displayName: 'Ana García', kind: 'HUMAN', email: 'ana@pmhybrid.local' },
    ...overrides,
  };
}

describe('ProjectDashboard — role assignment (brief §4)', () => {
  const ana = actor({ id: 'a1', displayName: 'Ana García' });
  const carla = actor({ id: 'a2', displayName: 'Carla Díaz', email: 'carla@pmhybrid.local' });
  const devRole = role({ id: 'r-dev', name: 'DEVELOPER' });
  const qaRole = role({ id: 'r-qa', name: 'QA' });
  const adminGlobalRole = role({ id: 'r-admin', name: 'ADMIN', scope: 'GLOBAL' });

  let rolesService: {
    listRoles: ReturnType<typeof vi.fn>;
    listAssignments: ReturnType<typeof vi.fn>;
    assign: ReturnType<typeof vi.fn>;
    revoke: ReturnType<typeof vi.fn>;
  };
  let projectsService: {
    getById: ReturnType<typeof vi.fn>;
    listMembers: ReturnType<typeof vi.fn>;
    myPermissions: ReturnType<typeof vi.fn>;
    addMember: ReturnType<typeof vi.fn>;
  };
  let permissions: string[];
  let triggerSync: ReturnType<typeof vi.fn>;
  let listSyncRuns: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    triggerSync = vi.fn();
    listSyncRuns = vi.fn().mockResolvedValue([]);
    permissions = ['project.roles.manage', 'project.members.manage'];
    rolesService = {
      listRoles: vi.fn().mockResolvedValue([devRole, qaRole, adminGlobalRole]),
      listAssignments: vi.fn().mockResolvedValue([assignment({ id: 'ar1', roleId: 'r-dev' })]),
      assign: vi.fn().mockResolvedValue(assignment({ id: 'ar2', roleId: 'r-qa' })),
      revoke: vi.fn().mockResolvedValue(undefined),
    };
    projectsService = {
      getById: vi.fn().mockResolvedValue(PROJECT),
      listMembers: vi.fn().mockResolvedValue([member(ana)]),
      // Reads `permissions` lazily so a test can reassign it after beforeEach runs.
      myPermissions: vi.fn().mockImplementation(() => Promise.resolve(permissions)),
      addMember: vi.fn().mockResolvedValue(member(carla)),
    };

    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { paramMap: convertToParamMap({ projectId: 'p1' }) } },
        },
        { provide: ProjectsService, useValue: projectsService },
        {
          provide: ActorsService,
          useValue: {
            listUsers: vi.fn().mockResolvedValue([ana, carla]),
            listAgents: vi.fn().mockResolvedValue([]),
          },
        },
        { provide: RolesService, useValue: rolesService },
        { provide: SynchronizationService, useValue: { triggerSync, listSyncRuns } },
      ],
    });
  });

  async function render() {
    const fixture = TestBed.createComponent(ProjectDashboard);
    fixture.detectChanges();
    await new Promise((resolve) => setTimeout(resolve));
    fixture.detectChanges();
    return { fixture, component: fixture.componentInstance };
  }

  it("lists each member's assigned project roles, PROJECT-scope only (not the GLOBAL ADMIN role)", async () => {
    const { fixture, component } = await render();
    const text = fixture.nativeElement.textContent as string;

    expect(text).toContain('DEVELOPER');
    expect(component.projectRoles().map((r) => r.name)).toEqual(['DEVELOPER', 'QA']);
    expect(component.availableRolesForMember('a1')).toEqual([qaRole]);
  });

  it("shows the project's lead, or 'sin asignar' when none is set (Roadmap GAP-32)", async () => {
    const { fixture } = await render();
    const normalized = (fixture.nativeElement.textContent as string).replace(/\s+/g, ' ');
    expect(normalized).toContain('Responsable: sin asignar');

    projectsService.getById.mockResolvedValue({
      ...PROJECT,
      lead: { id: 'a2', displayName: 'Carla Díaz', kind: 'HUMAN' },
    });
    const { fixture: withLead } = await render();
    const text = withLead.nativeElement.textContent as string;
    expect(text).toContain('Responsable:');
    expect(text).toContain('Carla Díaz');
  });

  it('hides the Assign control without project.roles.manage', async () => {
    permissions = [];
    const { fixture, component } = await render();

    expect(component.canManageRoles()).toBe(false);
    expect(fixture.nativeElement.textContent).not.toContain('Asignar');
  });

  it('assigns a role, reloads assignments and clears the pending selection', async () => {
    const { component } = await render();

    component.setSelectedRoleFor('a1', 'r-qa');
    await component.assignRole('a1');

    expect(rolesService.assign).toHaveBeenCalledWith('p1', 'a1', 'r-qa');
    expect(rolesService.listAssignments).toHaveBeenCalledTimes(2); // initial load + reload
    expect(component.selectedRoleFor('a1')).toBeNull();
  });

  it('does nothing when assigning with no role selected', async () => {
    const { component } = await render();

    await component.assignRole('a1');
    expect(rolesService.assign).not.toHaveBeenCalled();
  });

  it('revokes a role assignment and reloads', async () => {
    const { component } = await render();

    await component.revokeRole(assignment({ id: 'ar1' }));
    expect(rolesService.revoke).toHaveBeenCalledWith('p1', 'ar1');
    expect(rolesService.listAssignments).toHaveBeenCalledTimes(2);
  });

  it('surfaces the API error message when a role assignment fails', async () => {
    rolesService.assign.mockRejectedValueOnce(
      new HttpErrorResponse({ status: 400, error: { message: 'No such role' } }),
    );
    const { component } = await render();

    component.setSelectedRoleFor('a1', 'r-qa');
    await component.assignRole('a1');

    expect(component.roleErrorMessage()).toBe('No such role');
  });

  it('adds a member and assigns the chosen role in one action', async () => {
    const { component } = await render();
    expect(component.candidateActors().map((a) => a.id)).toEqual(['a2']);

    component.selectedActorId.set('a2');
    component.selectedNewMemberRoleId.set('r-qa');
    await component.addMember();

    expect(projectsService.addMember).toHaveBeenCalledWith('p1', 'a2');
    expect(rolesService.assign).toHaveBeenCalledWith('p1', 'a2', 'r-qa');
    expect(component.selectedActorId()).toBeNull();
    expect(component.selectedNewMemberRoleId()).toBeNull();
  });

  it('adds a member with no role when none was picked', async () => {
    const { component } = await render();

    component.selectedActorId.set('a2');
    await component.addMember();

    expect(projectsService.addMember).toHaveBeenCalledWith('p1', 'a2');
    expect(rolesService.assign).not.toHaveBeenCalled();
  });

  it('keeps the member added even if assigning its role fails, and surfaces the error', async () => {
    rolesService.assign.mockRejectedValueOnce(
      new HttpErrorResponse({ status: 400, error: { message: 'No such role' } }),
    );
    const { component } = await render();

    component.selectedActorId.set('a2');
    component.selectedNewMemberRoleId.set('r-qa');
    await component.addMember();

    expect(projectsService.addMember).toHaveBeenCalledWith('p1', 'a2');
    expect(component.roleErrorMessage()).toBe('No such role');
  });

  it('names the Roadmap entries a sync could not read, instead of hiding them (Roadmap BUG-05)', async () => {
    triggerSync.mockResolvedValue({
      id: 's1',
      projectId: 'p1',
      startedAt: '2026-09-21T10:00:00.000Z',
      finishedAt: '2026-09-21T10:00:01.000Z',
      trigger: 'MANUAL',
      status: 'PARTIAL',
      summary: {
        tasksCreated: 0,
        tasksUpdated: 1,
        conflictsRaised: 0,
        entryErrors: [{ id: 'F1-T104', line: 42, reason: 'Nested mappings are not allowed' }],
      },
    });
    const { fixture, component } = await render();

    await component.syncNow();
    fixture.detectChanges();

    const text = (fixture.nativeElement.textContent as string).replace(/\s+/g, ' ');
    expect(text).toContain('no pudo leer 1 entrada del Roadmap');
    expect(text).toContain('F1-T104 (línea 42): Nested mappings are not allowed');
  });

  it('shows why a manual sync failed rather than failing silently (Roadmap BUG-05)', async () => {
    triggerSync.mockRejectedValue(
      new HttpErrorResponse({
        status: 422,
        error: { message: 'Roadmap.md: unterminated yaml block for entry "T-1"' },
      }),
    );
    const { fixture, component } = await render();

    await component.syncNow();
    fixture.detectChanges();

    expect(component.syncing()).toBe(false);
    expect(fixture.nativeElement.textContent).toContain(
      'No se pudo sincronizar: Roadmap.md: unterminated yaml block for entry "T-1"',
    );
  });

  it('shows the last sync from the moment the header opens, in words (Roadmap UX-01)', async () => {
    listSyncRuns.mockResolvedValue([
      {
        id: 's2',
        projectId: 'p1',
        startedAt: '2026-09-21T10:00:00.000Z',
        finishedAt: '2026-09-21T10:00:02.000Z',
        trigger: 'SCHEDULED',
        status: 'PARTIAL',
        summary: { tasksCreated: 1, tasksUpdated: 2, conflictsRaised: 3 },
      },
    ]);
    const { fixture } = await render();

    const text = (fixture.nativeElement.textContent as string).replace(/\s+/g, ' ');
    expect(text).toContain('Última sincronización con avisos');
    expect(text).toContain('(1 creadas, 2 actualizadas, 3 conflictos)');
    expect(text).not.toContain('PARTIAL');
  });

  it('says so when the project has never synced', async () => {
    const { fixture } = await render();

    expect(fixture.nativeElement.textContent).toContain('Sin sincronizar todavía');
  });

  it('shows why the last sync failed without anyone pressing anything', async () => {
    listSyncRuns.mockResolvedValue([
      {
        id: 's3',
        projectId: 'p1',
        startedAt: '2026-09-21T10:00:00.000Z',
        finishedAt: '2026-09-21T10:00:01.000Z',
        trigger: 'SCHEDULED',
        status: 'FAILED',
        summary: { error: 'Roadmap.md: unterminated yaml block for entry "T-1"' },
      },
    ]);
    const { fixture, component } = await render();

    expect(component.lastSyncNeedsAttention()).toBe(true);
    expect(fixture.nativeElement.textContent).toContain(
      'La última sincronización falló: Roadmap.md: unterminated yaml block for entry "T-1"',
    );
  });

  it('says so when the project cannot be loaded, instead of rendering an empty header', async () => {
    projectsService.getById.mockRejectedValue(
      new HttpErrorResponse({ status: 500, error: { message: 'Something broke' } }),
    );
    const { fixture, component } = await render();

    expect(component.loadError()).toBe('Something broke');
    expect(fixture.nativeElement.textContent).toContain('Something broke');
  });
});
