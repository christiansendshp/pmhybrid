import { describe, expect, it } from 'vitest';
import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtStrategy } from './jwt.strategy.js';

describe('JwtStrategy', () => {
  const strategy = new JwtStrategy(
    new ConfigService({
      JWT_SECRET: 'test-secret',
    }) as unknown as ConfigService<{ JWT_SECRET: string }, true>,
  );

  it('accepts an access token payload', () => {
    const payload = { sub: 'actor-1', type: 'access' as const };
    expect(strategy.validate(payload)).toBe(payload);
  });

  it('rejects a refresh token presented as an access token', () => {
    expect(() =>
      strategy.validate({ sub: 'actor-1', type: 'refresh' }),
    ).toThrow(UnauthorizedException);
  });
});
