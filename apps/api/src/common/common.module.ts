import { Global, Module } from '@nestjs/common';
import { PermissionGuard } from './guards/permission.guard.js';
import { ProjectMemberGuard } from './guards/project-member.guard.js';
import { PermissionsResolverService } from './permissions-resolver.service.js';

/**
 * Global on purpose (like PrismaModule): PermissionGuard/ProjectMemberGuard
 * are referenced via @UseGuards() in many feature modules, and Nest
 * resolves a guard's own constructor deps against the *consuming* module's
 * injector — see the PassportModule lesson from FASE-04's auth.module.ts.
 * Keeping their deps (Prisma, Reflector) global/framework-level and this
 * module itself global avoids repeating that bug across every module.
 */
@Global()
@Module({
  providers: [PermissionsResolverService, PermissionGuard, ProjectMemberGuard],
  exports: [PermissionsResolverService, PermissionGuard, ProjectMemberGuard],
})
export class CommonModule {}
