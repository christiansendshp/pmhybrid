import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { EnvConfig } from '../../config/env.validation.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { JwtPayload } from './jwt-payload.interface.js';

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

export interface ActorProfile {
  id: string;
  displayName: string;
  email: string | null;
  kind: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService<EnvConfig, true>,
  ) {}

  async login(email: string, password: string): Promise<TokenPair> {
    const actor = await this.prisma.actor.findUnique({
      where: { email },
      include: { credential: true },
    });

    if (!actor || actor.kind !== 'HUMAN' || !actor.credential?.passwordHash) {
      throw new UnauthorizedException('Invalid credentials');
    }
    if (!actor.isActive) {
      throw new UnauthorizedException('Actor is inactive');
    }

    const passwordValid = await argon2.verify(
      actor.credential.passwordHash,
      password,
    );
    if (!passwordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    return this.issueTokenPair(actor.id);
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
    const actor = await this.prisma.actor.findUniqueOrThrow({
      where: { id: actorId },
    });
    return {
      id: actor.id,
      displayName: actor.displayName,
      email: actor.email,
      kind: actor.kind,
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
