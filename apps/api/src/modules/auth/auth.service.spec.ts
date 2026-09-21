import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import * as argon2 from 'argon2';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthService } from './auth.service.js';

vi.mock('argon2', () => ({
  argon2id: 2,
  hash: vi.fn().mockResolvedValue('dummy-hash'),
  verify: vi.fn(),
}));

/**
 * Login answered "inactive" before looking at the password and skipped the
 * hash for an unknown account, so both the message and the response time said
 * which accounts exist and which are switched off (Roadmap SECURITY-04a).
 */
describe('AuthService.login (Roadmap SECURITY-04a)', () => {
  const verify = vi.mocked(argon2.verify);
  let findActor: ReturnType<typeof vi.fn>;
  let service: AuthService;

  function actor(overrides: Record<string, unknown> = {}) {
    return {
      id: 'a1',
      kind: 'HUMAN',
      isActive: true,
      credential: { passwordHash: 'real-hash' },
      ...overrides,
    };
  }

  beforeEach(() => {
    verify.mockReset();
    findActor = vi.fn();
    service = new AuthService(
      { actor: { findUnique: findActor } } as never,
      { sign: vi.fn().mockReturnValue('token') } as never,
      { get: vi.fn().mockReturnValue('15m') } as never,
      {} as never,
      {} as never,
    );
  });

  async function rejection(promise: Promise<unknown>) {
    return promise.then(
      () => null,
      (error: unknown) => error,
    );
  }

  it('verifies a hash for every attempt: the real one, or a dummy when there is nothing to verify', async () => {
    verify.mockResolvedValue(false);
    const cases = [
      null, // unknown email
      actor({ kind: 'AI_AGENT' }), // not a person
      actor({ credential: null }), // no password set
      actor({ credential: { passwordHash: null } }),
      actor(), // wrong password
    ];

    for (const found of cases) {
      verify.mockClear();
      findActor.mockResolvedValue(found);
      await rejection(service.login('a@b.c', 'nope'));
      expect(verify).toHaveBeenCalledTimes(1);
    }
    // The real hash is used when there is one, the dummy otherwise.
    findActor.mockResolvedValue(actor());
    verify.mockClear();
    await rejection(service.login('a@b.c', 'nope'));
    expect(verify).toHaveBeenCalledWith('real-hash', 'nope');
    findActor.mockResolvedValue(null);
    verify.mockClear();
    await rejection(service.login('a@b.c', 'nope'));
    expect(verify).toHaveBeenCalledWith('dummy-hash', 'nope');
  });

  it('answers the same 401 for unknown, wrong password and inactive', async () => {
    const answers: string[] = [];
    for (const [found, valid] of [
      [null, false],
      [actor(), false],
      [actor({ isActive: false }), true], // right password, switched-off account
      [actor({ isActive: false }), false],
    ] as const) {
      verify.mockResolvedValue(valid);
      findActor.mockResolvedValue(found);
      const error = await rejection(service.login('a@b.c', 'pw'));
      expect(error).toBeInstanceOf(UnauthorizedException);
      answers.push((error as UnauthorizedException).message);
    }

    expect(new Set(answers)).toEqual(new Set(['Invalid credentials']));
  });

  it('signs a person in with the right password', async () => {
    verify.mockResolvedValue(true);
    findActor.mockResolvedValue(actor());

    await expect(service.login('a@b.c', 'pw')).resolves.toEqual({
      accessToken: 'token',
      refreshToken: 'token',
    });
  });
});

describe('AuthService.changePassword (Roadmap SECURITY-04a)', () => {
  const verify = vi.mocked(argon2.verify);
  let findCredential: ReturnType<typeof vi.fn>;
  let updateCredential: ReturnType<typeof vi.fn>;
  let record: ReturnType<typeof vi.fn>;
  let service: AuthService;

  beforeEach(() => {
    verify.mockReset();
    vi.mocked(argon2.hash).mockResolvedValue('new-hash');
    findCredential = vi.fn().mockResolvedValue({ passwordHash: 'old-hash' });
    updateCredential = vi.fn().mockResolvedValue({});
    record = vi.fn().mockResolvedValue({});
    const tx = { userCredential: { update: updateCredential } };
    service = new AuthService(
      {
        userCredential: { findUnique: findCredential },
        $transaction: (callback: (client: typeof tx) => unknown) =>
          callback(tx),
      } as never,
      {} as never,
      {} as never,
      {} as never,
      { record } as never,
    );
  });

  it('changes only the caller’s own credential and audits it without either password', async () => {
    verify.mockResolvedValue(true);

    await service.changePassword('a1', 'current-pw', 'brand-new-pw');

    expect(findCredential).toHaveBeenCalledWith({ where: { actorId: 'a1' } });
    expect(updateCredential).toHaveBeenCalledWith({
      where: { actorId: 'a1' },
      data: { passwordHash: 'new-hash' },
    });
    const [event] = record.mock.calls[0];
    expect(event).toMatchObject({
      entityId: 'a1',
      operation: 'PASSWORD_CHANGE',
    });
    expect(JSON.stringify(event)).not.toContain('current-pw');
    expect(JSON.stringify(event)).not.toContain('brand-new-pw');
  });

  it('refuses a wrong current password, an unchanged one, and an account with no password — changing nothing', async () => {
    verify.mockResolvedValue(false);
    await expect(
      service.changePassword('a1', 'wrong', 'brand-new-pw'),
    ).rejects.toThrow(
      new BadRequestException('The current password is incorrect'),
    );

    verify.mockResolvedValue(true);
    await expect(
      service.changePassword('a1', 'same-password', 'same-password'),
    ).rejects.toBeInstanceOf(BadRequestException);

    findCredential.mockResolvedValue(null);
    await expect(
      service.changePassword('a1', 'pw', 'brand-new-pw'),
    ).rejects.toThrow(/no password to change/);

    expect(updateCredential).not.toHaveBeenCalled();
    expect(record).not.toHaveBeenCalled();
  });
});
