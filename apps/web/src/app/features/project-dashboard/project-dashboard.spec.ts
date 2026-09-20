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

  beforeEach(() => {
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
        { provide: SynchronizationService, useValue: { triggerSync: vi.fn() } },
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
});
