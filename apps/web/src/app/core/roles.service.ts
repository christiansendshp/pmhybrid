import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { API_BASE_URL } from './api-base-url.js';

export type RoleScope = 'GLOBAL' | 'PROJECT';

export interface Permission {
  id: string;
  key: string;
  description: string;
}

export interface Role {
  id: string;
  name: string;
  scope: RoleScope;
  isSystem: boolean;
  rolePermissions: Array<{ permission: Permission }>;
}

export interface RoleAssignment {
  id: string;
  actorId: string;
  roleId: string;
  projectId: string | null;
  role: Pick<Role, 'id' | 'name' | 'scope'>;
  actor: { id: string; displayName: string; kind: 'HUMAN' | 'AI_AGENT'; email: string | null };
}

/**
 * The global role/permission catalog (brief §4) plus per-project assignment.
 * Anyone signed in can read the catalog; editing a role's permissions needs
 * the global roles.manage permission, and assigning/revoking within a
 * project needs that project's project.roles.manage.
 */
@Injectable({ providedIn: 'root' })
export class RolesService {
  private readonly http = inject(HttpClient);

  listRoles(): Promise<Role[]> {
    return firstValueFrom(this.http.get<Role[]>(`${API_BASE_URL}/roles`));
  }

  listPermissions(): Promise<Permission[]> {
    return firstValueFrom(this.http.get<Permission[]>(`${API_BASE_URL}/roles/permissions`));
  }

  /** Replaces the role's entire permission set. */
  updatePermissions(roleId: string, permissionKeys: string[]): Promise<Role> {
    return firstValueFrom(
      this.http.patch<Role>(`${API_BASE_URL}/roles/${roleId}/permissions`, { permissionKeys }),
    );
  }

  listAssignments(projectId: string): Promise<RoleAssignment[]> {
    return firstValueFrom(
      this.http.get<RoleAssignment[]>(`${API_BASE_URL}/projects/${projectId}/roles`),
    );
  }

  assign(projectId: string, actorId: string, roleId: string): Promise<RoleAssignment> {
    return firstValueFrom(
      this.http.post<RoleAssignment>(`${API_BASE_URL}/projects/${projectId}/roles`, {
        actorId,
        roleId,
      }),
    );
  }

  revoke(projectId: string, actorRoleId: string): Promise<void> {
    return firstValueFrom(
      this.http.delete<void>(`${API_BASE_URL}/projects/${projectId}/roles/${actorRoleId}`),
    );
  }
}
