import { SetMetadata } from '@nestjs/common';

export const PERMISSION_METADATA_KEY = 'requiredPermission';

/** Pairs with PermissionGuard. Apply after JwtAuthGuard (and ProjectMemberGuard, if the route is project-scoped). */
export const RequirePermission = (permission: string) =>
  SetMetadata(PERMISSION_METADATA_KEY, permission);
