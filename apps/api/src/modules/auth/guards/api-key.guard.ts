import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { API_KEY_PREFIX, hashApiKeySecret } from '../api-key-crypto.util.js';
import { JwtPayload } from '../jwt-payload.interface.js';

/**
 * Authenticates a request carrying an `X-API-Key` header (Roadmap GAP-15,
 * brief §27, §28). Composed into JwtAuthGuard rather than used standalone,
 * so every route already gated by JwtAuthGuard — and everything layered on
 * top of it (PermissionGuard, CurrentActorId) — accepts a key without any
 * route needing to know which credential form was used.
 *
 * Re-checked per request, same as JwtStrategy: a revoked key or a
 * deactivated agent must cut off access immediately, not just future use.
 * Restricted to AI_AGENT actors — key creation is already confined to
 * agents (agent-api-keys.service.ts), this is defense in depth.
 */
@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const header = request.headers['x-api-key'];
    const rawKey = Array.isArray(header) ? header[0] : header;
    if (!rawKey || !rawKey.startsWith(API_KEY_PREFIX)) {
      throw new UnauthorizedException('Invalid API key');
    }
    const secret = rawKey.slice(API_KEY_PREFIX.length);
    const secretHash = hashApiKeySecret(secret);
    const apiKey = await this.prisma.apiKey.findUnique({
      where: { secretHash },
      include: { actor: { select: { id: true, isActive: true, kind: true } } },
    });
    if (
      !apiKey ||
      apiKey.revokedAt !== null ||
      !apiKey.actor.isActive ||
      apiKey.actor.kind !== 'AI_AGENT'
    ) {
      throw new UnauthorizedException('Invalid or revoked API key');
    }
    (request as Request & { user: JwtPayload }).user = {
      sub: apiKey.actorId,
      type: 'access',
      authMethod: 'API_KEY',
    };
    return true;
  }
}
