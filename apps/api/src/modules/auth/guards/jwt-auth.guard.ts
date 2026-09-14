import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/**
 * Real guard for FASE-04, replacing the permissive stub. Permission-key
 * enforcement (permissionGuard) and project-membership enforcement
 * (projectMemberGuard) are FASE-05 — this guard only proves "who are you."
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {}
