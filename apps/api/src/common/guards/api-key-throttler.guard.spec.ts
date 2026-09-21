import { describe, expect, it, vi } from 'vitest';
import { API_KEY_PREFIX } from '../../modules/auth/api-key-crypto.util.js';
import { ApiKeyThrottlerGuard } from './api-key-throttler.guard.js';

const SECRET = 'a'.repeat(64);

function guard(found: object | null) {
  const findUnique = vi.fn().mockResolvedValue(found);
  const instance = new ApiKeyThrottlerGuard(
    { throttlers: [{ ttl: 60000, limit: 100 }] } as never,
    {} as never,
    {} as never,
  );
  (instance as unknown as { prisma: unknown }).prisma = {
    apiKey: { findUnique },
  };
  const tracker = (headers: Record<string, unknown>, ip = '10.0.0.1') =>
    (
      instance as unknown as {
        getTracker(req: object): Promise<string>;
      }
    ).getTracker({ headers, ip });
  return { tracker, findUnique };
}

describe('ApiKeyThrottlerGuard (Roadmap SECURITY-04b2)', () => {
  it('counts a request with no key against the client address, as before', async () => {
    const { tracker, findUnique } = guard(null);

    expect(await tracker({})).toBe('10.0.0.1');
    expect(findUnique).not.toHaveBeenCalled();
  });

  it('gives each real key its own budget, so agents behind one host do not share one', async () => {
    const { tracker } = guard({
      id: 'key-1',
      revokedAt: null,
      expiresAt: null,
    });

    expect(await tracker({ 'x-api-key': `${API_KEY_PREFIX}${SECRET}` })).toBe(
      'api-key:key-1',
    );
  });

  it('counts a made-up, revoked or expired key against the address, so random keys cannot buy a fresh budget', async () => {
    const wrong = `${API_KEY_PREFIX}${SECRET}`;

    expect(await guard(null).tracker({ 'x-api-key': wrong })).toBe('10.0.0.1');
    expect(
      await guard({ id: 'k', revokedAt: new Date(), expiresAt: null }).tracker({
        'x-api-key': wrong,
      }),
    ).toBe('10.0.0.1');
    expect(
      await guard({
        id: 'k',
        revokedAt: null,
        expiresAt: new Date(Date.now() - 1000),
      }).tracker({ 'x-api-key': wrong }),
    ).toBe('10.0.0.1');
    // Not even shaped like a key: no lookup at all.
    const { tracker, findUnique } = guard(null);
    expect(await tracker({ 'x-api-key': 'garbage' })).toBe('10.0.0.1');
    expect(findUnique).not.toHaveBeenCalled();
  });

  it('remembers a key it found valid instead of asking the database on every request', async () => {
    const { tracker, findUnique } = guard({
      id: 'key-1',
      revokedAt: null,
      expiresAt: null,
    });
    const headers = { 'x-api-key': `${API_KEY_PREFIX}${SECRET}` };

    await tracker(headers);
    await tracker(headers);
    await tracker(headers);

    expect(findUnique).toHaveBeenCalledTimes(1);
  });
});
