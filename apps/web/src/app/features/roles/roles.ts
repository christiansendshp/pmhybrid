import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { AuthService } from '../../core/auth.service.js';
import { describeHttpError } from '../../core/http-error.js';
import { Permission, Role, RolesService } from '../../core/roles.service.js';

const ROLES_MANAGE = 'roles.manage';

/**
 * Global role/permission catalog (brief §4): every role's permission set,
 * editable by a roles.manage holder. Every seeded role currently has
 * isSystem: true (apps/api/prisma/seed.ts) — that flag marks a role the app
 * ships with, not one this page refuses to edit; the API's own lockout
 * guard is what actually stops an edit that would strand the instance
 * without anyone able to manage roles.
 */
@Component({
  selector: 'app-roles',
  imports: [MatButtonModule, MatCheckboxModule],
  templateUrl: './roles.html',
  styleUrl: './roles.scss',
})
export class RolesPage implements OnInit {
  private readonly rolesService = inject(RolesService);
  private readonly authService = inject(AuthService);

  readonly roles = signal<Role[]>([]);
  readonly permissions = signal<Permission[]>([]);
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly editingRoleId = signal<string | null>(null);
  readonly editingKeys = signal<ReadonlySet<string>>(new Set());

  readonly canManage = computed(() => this.authService.hasGlobalPermission(ROLES_MANAGE));
  readonly editingRole = computed(
    () => this.roles().find((r) => r.id === this.editingRoleId()) ?? null,
  );

  async ngOnInit(): Promise<void> {
    await this.reload();
  }

  startEdit(role: Role): void {
    this.errorMessage.set(null);
    this.editingRoleId.set(role.id);
    this.editingKeys.set(new Set(role.rolePermissions.map((rp) => rp.permission.key)));
  }

  cancelEdit(): void {
    this.editingRoleId.set(null);
  }

  togglePermission(key: string, checked: boolean): void {
    const next = new Set(this.editingKeys());
    if (checked) {
      next.add(key);
    } else {
      next.delete(key);
    }
    this.editingKeys.set(next);
  }

  async saveEdit(): Promise<void> {
    const role = this.editingRole();
    if (!role) {
      return;
    }
    this.saving.set(true);
    this.errorMessage.set(null);
    try {
      await this.rolesService.updatePermissions(role.id, [...this.editingKeys()]);
      this.editingRoleId.set(null);
      await this.reload();
    } catch (error) {
      this.errorMessage.set(describeHttpError(error));
    } finally {
      this.saving.set(false);
    }
  }

  permissionKeys(role: Role): string[] {
    return role.rolePermissions.map((rp) => rp.permission.key).sort();
  }

  private async reload(): Promise<void> {
    const [roles, permissions] = await Promise.all([
      this.rolesService.listRoles(),
      this.rolesService.listPermissions(),
    ]);
    this.roles.set(roles);
    this.permissions.set(permissions);
    this.loading.set(false);
  }
}
