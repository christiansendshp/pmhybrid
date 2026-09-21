import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { AuditOrigin } from '@prisma/client';
import * as argon2 from 'argon2';
import { PermissionsResolverService } from '../../common/permissions-resolver.service.js';
import { EnvConfig } from '../../config/env.validation.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { JwtPayload } from './jwt-payload.interface.js';

/**
 * What every login is checked against when there is no real hash to check: an
 * unknown email, a non-human actor, an account with no password. Verifying it
 * costs what verifying a real one does, so the response time does not say
 * whether the account exists (Roadmap SECURITY-04a). Computed once, on first use.
 */
let unknownAccountHash: Promise<string> | undefined;
function dummyPasswordHash(): Promise<string> {
  unknownAccountHash ??= argon2.hash('no-such-account-password', {
    type: argon2.argon2id,
  });
  return unknownAccountHash;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

export interface ActorProfile {
  id: string;
  displayName: string;
  email: string | null;
  kind: string;
  avatarUrl: string | null;
  /** Global permission keys only — project permissions come from /projects/:id/roles/my-permissions. */
  permissions: string[];
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService<EnvConfig, true>,
    private readonly permissionsResolver: PermissionsResolverService,
    private readonly audit: AuditService,
  ) {}

  /**
   * One password verification for every attempt, and one answer for every
   * failure (Roadmap SECURITY-04a). It used to answer "inactive" before looking
   * at the password and skip the hash for an unknown account, so both the
   * message and the response time (157-370 ms for an existing account against
   * 11-14 ms for an unknown one) said which accounts exist and which are off.
   */
  async login(email: string, password: string): Promise<TokenPair> {
    const actor = await this.prisma.actor.findUnique({
      where: { email },
      include: { credential: true },
    });

    const hash = actor?.credential?.passwordHash;
    const passwordValid = await argon2.verify(
      hash ?? (await dummyPasswordHash()),
      password,
    );
    if (
      !actor ||
      actor.kind !== 'HUMAN' ||
      !hash ||
      !passwordValid ||
      !actor.isActive
    ) {
      throw new UnauthorizedException('Invalid credentials');
    }

    return this.issueTokenPair(actor.id);
  }

  /**
   * A signed-in human changes their own password by proving the current one
   * (Roadmap SECURITY-04a). Only the caller's own credential is touched, and
   * the audit event records that it happened, never either password. A wrong
   * current password is a 400, not a 401: a 401 makes the web client try to
   * refresh the session and sign the person out.
   */
  async changePassword(
    actorId: string,
    currentPassword: string,
    newPassword: string,
    origin: AuditOrigin = 'UI',
  ): Promise<void> {
    const credential = await this.prisma.userCredential.findUnique({
      where: { actorId },
    });
    if (!credential?.passwordHash) {
      throw new BadRequestException('This account has no password to change');
    }
    if (!(await argon2.verify(credential.passwordHash, currentPassword))) {
      throw new BadRequestException('The current password is incorrect');
    }
    if (currentPassword === newPassword) {
      throw new BadRequestException(
        'The new password must be different from the current one',
      );
    }
    const passwordHash = await argon2.hash(newPassword, {
      type: argon2.argon2id,
    });
    await this.prisma.$transaction(async (tx) => {
      await tx.userCredential.update({
        where: { actorId },
        data: { passwordHash },
      });
      await this.audit.record(
        {
          projectId: null,
          actorId,
          entityType: 'Actor',
          entityId: actorId,
          operation: 'PASSWORD_CHANGE',
          origin,
        },
        tx,
      );
    });
  }

  async refresh(refreshToken: string): Promise<{ accessToken: string }> {
    let payload: JwtPayload;
    try {
      payload = this.jwtService.verify<JwtPayload>(refreshToken);
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }
    if (payload.type !== 'refresh') {
      throw new UnauthorizedException('Not a refresh token');
    }

    const actor = await this.prisma.actor.findUnique({
      where: { id: payload.sub },
    });
    if (!actor || !actor.isActive) {
      throw new UnauthorizedException('Actor not found or inactive');
    }

    return { accessToken: this.signAccessToken(actor.id) };
  }

  async me(actorId: string): Promise<ActorProfile> {
    const [actor, permissions] = await Promise.all([
      this.prisma.actor.findUniqueOrThrow({ where: { id: actorId } }),
      this.permissionsResolver.resolve(actorId),
    ]);
    return {
      id: actor.id,
      displayName: actor.displayName,
      email: actor.email,
      kind: actor.kind,
      avatarUrl: actor.avatarUrl,
      permissions: [...permissions].sort(),
    };
  }

  private issueTokenPair(actorId: string): TokenPair {
    return {
      accessToken: this.signAccessToken(actorId),
      refreshToken: this.signRefreshToken(actorId),
    };
  }

  private signAccessToken(actorId: string): string {
    const payload: JwtPayload = { sub: actorId, type: 'access' };
    return this.jwtService.sign(payload, {
      expiresIn: this.configService.get('JWT_EXPIRES_IN', { infer: true }),
    });
  }

  private signRefreshToken(actorId: string): string {
    const payload: JwtPayload = { sub: actorId, type: 'refresh' };
    return this.jwtService.sign(payload, {
      expiresIn: this.configService.get('JWT_REFRESH_EXPIRES_IN', {
        infer: true,
      }),
    });
  }
}
