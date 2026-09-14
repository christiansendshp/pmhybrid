import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import { JwtPayload } from '../../modules/auth/jwt-payload.interface.js';

/** Reads the authenticated actor id set by JwtAuthGuard/JwtStrategy onto `request.user`. */
export const CurrentActorId = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): string => {
    const request = ctx
      .switchToHttp()
      .getRequest<Request & { user: JwtPayload }>();
    return request.user.sub;
  },
);
