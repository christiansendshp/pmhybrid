import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { AuditOrigin } from '@prisma/client';
import type { Request } from 'express';
import { JwtPayload } from '../../modules/auth/jwt-payload.interface.js';

/**
 * `UI` for a person's REST call (JwtAuthGuard/JwtStrategy, `authMethod`
 * unset or `'JWT'`), `API` for an agent authenticated via `X-API-Key`
 * (ApiKeyGuard sets `authMethod: 'API_KEY'`) — Roadmap GAP-24. A controller
 * that mutates state passes this straight to its service method, the same
 * way `@CurrentActorId()` threads the requester's id.
 */
export const CurrentAuditOrigin = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): AuditOrigin => {
    const request = ctx
      .switchToHttp()
      .getRequest<Request & { user: JwtPayload }>();
    return request.user.authMethod === 'API_KEY' ? 'API' : 'UI';
  },
);
