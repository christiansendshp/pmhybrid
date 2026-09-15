import { describe, expect, it, vi } from 'vitest';
import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { PrismaService } from '../../../prisma/prisma.service.js';
import { JwtStrategy } from './jwt.strategy.js';

describe('JwtStrategy', () => {
  function strategyFor(actor: { isActive: boolean } | null) {
    const prisma = {
      actor: { findUnique: vi.fn().mockResolvedValue(actor) },
    } as unknown as PrismaService;
    return new JwtStrategy(
      new ConfigService({
        JWT_SECRET: 'test-secret',
      }) as unknown as ConfigService<{ JWT_SECRET: string }, true>,
      prisma,
    );
  }

  it('accepts an access token payload for an active actor', async () => {
    const payload = { sub: 'actor-1', type: 'access' as const };
    await expect(
      strategyFor({ isActive: true }).validate(payload),
    ).resolves.toBe(payload);
  });

  it('rejects a refresh token presented as an access token', async () => {
    await expect(
      strategyFor({ isActive: true }).validate({
        sub: 'actor-1',
        type: 'refresh',
      }),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('rejects an access token whose actor was deactivated or no longer exists', async () => {
    const payload = { sub: 'actor-1', type: 'access' as const };
    await expect(
      strategyFor({ isActive: false }).validate(payload),
    ).rejects.toThrow(UnauthorizedException);
    await expect(strategyFor(null).validate(payload)).rejects.toThrow(
      UnauthorizedException,
    );
  });
});
