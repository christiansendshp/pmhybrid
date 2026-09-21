import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { API_KEY_PREFIX, hashApiKeySecret } from '../api-key-crypto.util.js';
import { JwtPayload } from '../jwt-payload.interface.js';

/** A key that is only ever used to read is worth recording at most this often (one write a minute, not one per request). */
const LAST_USED_RESOLUTION_MS = 60_000;

/** The methods a READ_ONLY key may use: none of them changes anything. */
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

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
    const now = Date.now();
    if (
      !apiKey ||
      apiKey.revokedAt !== null ||
      (apiKey.expiresAt !== null && apiKey.expiresAt.getTime() <= now) ||
      !apiKey.actor.isActive ||
      apiKey.actor.kind !== 'AI_AGENT'
    ) {
      // One message for a wrong, revoked or expired key: which of them it was is
      // for the person who owns the key to find out, not for a caller to probe.
      throw new UnauthorizedException('Invalid, expired or revoked API key');
    }
    // A read-only key is refused before it does anything (Roadmap SECURITY-04b2).
    // Enforced by the HTTP method, in this one place, because a scope per
    // permission would need every route annotated. The MCP endpoint is a POST
    // for every call, reads included, so a read-only key cannot use it.
    if (
      apiKey.scope === 'READ_ONLY' &&
      !SAFE_METHODS.has(request.method.toUpperCase())
    ) {
      throw new ForbiddenException('This API key is read-only');
    }
    if (
      apiKey.lastUsedAt === null ||
      now - apiKey.lastUsedAt.getTime() >= LAST_USED_RESOLUTION_MS
    ) {
      // Best effort: failing to note the use must never fail the request.
      await this.prisma.apiKey
        .update({
          where: { id: apiKey.id },
          data: { lastUsedAt: new Date(now) },
        })
        .catch(() => undefined);
    }
    (request as Request & { user: JwtPayload }).user = {
      sub: apiKey.actorId,
      type: 'access',
      authMethod: 'API_KEY',
    };
    return true;
  }
}
