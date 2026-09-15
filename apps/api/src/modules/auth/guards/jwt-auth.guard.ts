import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { Request } from 'express';
import { ApiKeyGuard } from './api-key.guard.js';

/**
 * Real guard for FASE-04, replacing the permissive stub. Permission-key
 * enforcement (permissionGuard) and project-membership enforcement
 * (projectMemberGuard) are FASE-05 — this guard only proves "who are you."
 *
 * Roadmap GAP-15: composes with ApiKeyGuard rather than being replaced by a
 * second auth axis. An `X-API-Key` header routes to key validation; its
 * absence keeps the original JWT-only behavior. Either path leaves the same
 * shape on `request.user`, so every one of the ~15 controllers already
 * using this guard — and PermissionGuard/CurrentActorId layered on top —
 * accepts a key with zero changes.
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') implements CanActivate {
  constructor(private readonly apiKeyGuard: ApiKeyGuard) {
    super();
  }

  canActivate(context: ExecutionContext): Promise<boolean> | boolean {
    const request = context.switchToHttp().getRequest<Request>();
    if (request.headers['x-api-key']) {
      return this.apiKeyGuard.canActivate(context);
    }
    return super.canActivate(context) as Promise<boolean> | boolean;
  }
}
