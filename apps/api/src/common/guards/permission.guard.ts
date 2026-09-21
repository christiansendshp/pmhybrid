import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { JwtPayload } from '../../modules/auth/jwt-payload.interface.js';
import { PERMISSION_METADATA_KEY } from '../decorators/require-permission.decorator.js';
import { PermissionsResolverService } from '../permissions-resolver.service.js';

/**
 * Reads the @RequirePermission() key off the handler (or, failing that, the
 * controller class — a class-level key used to be silently ignored, leaving
 * the whole controller open, Roadmap SECURITY-02), resolves the current
 * actor's effective permissions (global ∪ the :projectId route param, if
 * present) and denies with 403 if the key isn't held. No metadata = no
 * check (route didn't opt in). Must run after JwtAuthGuard (needs
 * request.user) and, for project-scoped routes, after ProjectMemberGuard.
 */
@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly permissionsResolver: PermissionsResolverService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<string | undefined>(
      PERMISSION_METADATA_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!required) {
      return true;
    }

    const request = context
      .switchToHttp()
      .getRequest<Request & { user?: JwtPayload }>();
    const actorId = request.user?.sub;
    if (!actorId) {
      throw new UnauthorizedException();
    }

    const projectId = (request.params as Record<string, string> | undefined)
      ?.projectId;
    const allowed = await this.permissionsResolver.hasPermission(
      actorId,
      required,
      projectId,
    );
    if (!allowed) {
      throw new ForbiddenException(`Missing permission: ${required}`);
    }
    return true;
  }
}
