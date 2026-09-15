import { HttpErrorResponse } from '@angular/common/http';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthService } from '../../core/auth.service.js';
import { Permission, Role, RolesService } from '../../core/roles.service.js';
import { RolesPage } from './roles.js';

function permission(key: string, description = key): Permission {
  return { id: key, key, description };
}

function role(overrides: Partial<Role> = {}): Role {
  return {
    id: 'r1',
    name: 'VIEWER',
    scope: 'PROJECT',
    isSystem: true,
    rolePermissions: [],
    ...overrides,
  };
}

describe('RolesPage (brief §4 — configurable role permissions)', () => {
  const taskAssign = permission('task.assign', 'Assign a task');
  const rolesManage = permission('roles.manage', "Edit any role's permission set");
  const viewer = role({ id: 'r1', name: 'VIEWER', rolePermissions: [] });
  const admin = role({
    id: 'r2',
    name: 'ADMIN',
    scope: 'GLOBAL',
    rolePermissions: [{ permission: rolesManage }],
  });

  let permissions: string[];
  let rolesService: {
    listRoles: ReturnType<typeof vi.fn>;
    listPermissions: ReturnType<typeof vi.fn>;
    updatePermissions: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    permissions = ['roles.manage'];
    rolesService = {
      listRoles: vi.fn().mockResolvedValue([viewer, admin]),
      listPermissions: vi.fn().mockResolvedValue([taskAssign, rolesManage]),
      updatePermissions: vi.fn().mockResolvedValue(role({})),
    };
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: RolesService, useValue: rolesService },
        {
          provide: AuthService,
          useValue: {
            currentActor: signal({ id: 'u1', displayName: 'Demo Human', permissions }),
            hasGlobalPermission: (key: string) => permissions.includes(key),
          },
        },
      ],
    });
  });

  async function render() {
    const fixture = TestBed.createComponent(RolesPage);
    fixture.detectChanges();
    await new Promise((resolve) => setTimeout(resolve));
    fixture.detectChanges();
    return { fixture, component: fixture.componentInstance };
  }

  it('lists every role with its permission keys', async () => {
    const { fixture } = await render();
    const text = fixture.nativeElement.textContent as string;

    expect(text).toContain('VIEWER');
    expect(text).toContain('ADMIN');
    expect(text).toContain('roles.manage');
    expect(text).toContain('None'); // VIEWER has no permissions
  });

  it('is read-only without roles.manage: no Edit buttons, edit() is inert', async () => {
    permissions = [];
    const { fixture } = await render();
    const buttons = Array.from(
      fixture.nativeElement.querySelectorAll('button') as NodeListOf<HTMLElement>,
    ).map((b) => b.textContent?.trim());

    expect(buttons).not.toContain('Edit');
  });

  it('a roles.manage holder can toggle a permission and save the new set', async () => {
    const { component } = await render();

    component.startEdit(admin);
    expect(component.editingKeys().has('roles.manage')).toBe(true);
    expect(component.editingKeys().has('task.assign')).toBe(false);

    component.togglePermission('task.assign', true);
    expect(component.editingKeys().has('task.assign')).toBe(true);

    component.togglePermission('roles.manage', false);
    expect(component.editingKeys().has('roles.manage')).toBe(false);

    await component.saveEdit();
    expect(rolesService.updatePermissions).toHaveBeenCalledWith('r2', ['task.assign']);
    expect(component.editingRoleId()).toBeNull();
  });

  it('surfaces the API lockout error and keeps editing open', async () => {
    rolesService.updatePermissions.mockRejectedValueOnce(
      new HttpErrorResponse({
        status: 400,
        error: { message: 'This change would leave no actor able to manage roles; refused' },
      }),
    );
    const { component } = await render();

    component.startEdit(admin);
    component.togglePermission('roles.manage', false);
    await component.saveEdit();

    expect(component.errorMessage()).toBe(
      'This change would leave no actor able to manage roles; refused',
    );
    expect(component.editingRoleId()).toBe('r2');
  });

  it('cancelEdit discards the in-progress edit', async () => {
    const { component } = await render();

    component.startEdit(viewer);
    component.togglePermission('task.assign', true);
    component.cancelEdit();

    expect(component.editingRoleId()).toBeNull();
    expect(rolesService.updatePermissions).not.toHaveBeenCalled();
  });
});
