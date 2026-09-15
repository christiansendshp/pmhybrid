import { Body, Controller, Get, Param, Patch, UseGuards } from '@nestjs/common';
import { PERMISSIONS } from '@pmhybrid/shared-types';
import { CurrentActorId } from '../../common/decorators/current-actor-id.decorator.js';
import { RequirePermission } from '../../common/decorators/require-permission.decorator.js';
import { PermissionGuard } from '../../common/guards/permission.guard.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { UpdateRolePermissionsDto } from './dto/update-role-permissions.dto.js';
import { RolesService } from './roles.service.js';

/** Global catalog — every authenticated actor can read what roles/permissions exist; editing a role's permissions needs the global roles.manage permission. */
@UseGuards(JwtAuthGuard)
@Controller('roles')
export class RolesController {
  constructor(private readonly rolesService: RolesService) {}

  @Get()
  findAll() {
    return this.rolesService.findAllRoles();
  }

  @Get('permissions')
  findAllPermissions() {
    return this.rolesService.findAllPermissions();
  }

  @Patch(':id/permissions')
  @UseGuards(PermissionGuard)
  @RequirePermission(PERMISSIONS.ROLES_MANAGE)
  updatePermissions(
    @Param('id') id: string,
    @Body() dto: UpdateRolePermissionsDto,
    @CurrentActorId() requesterActorId: string,
  ) {
    return this.rolesService.updateRolePermissions(
      id,
      dto.permissionKeys,
      requesterActorId,
    );
  }
}
