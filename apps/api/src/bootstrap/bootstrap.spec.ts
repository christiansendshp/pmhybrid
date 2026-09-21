import { describe, expect, it, vi } from 'vitest';
import { bootstrapInstallation, planFirstAdmin } from './bootstrap.js';

const env = {
  BOOTSTRAP_ADMIN_EMAIL: 'Admin@Example.com',
  BOOTSTRAP_ADMIN_PASSWORD: 'a-long-password-nobody-guesses',
};

describe('planFirstAdmin (Roadmap IMPROVEMENT-02c)', () => {
  it('does nothing when there is an administrator, whatever the environment says', () => {
    expect(planFirstAdmin({}, 1)).toEqual({ action: 'none' });
    expect(planFirstAdmin(env, 3)).toEqual({ action: 'none' });
  });

  it('creates the one the environment names, with the email in lower case and a default name', () => {
    expect(planFirstAdmin(env, 0)).toEqual({
      action: 'create',
      email: 'admin@example.com',
      displayName: 'Administrator',
      password: 'a-long-password-nobody-guesses',
    });
    expect(
      planFirstAdmin({ ...env, BOOTSTRAP_ADMIN_NAME: '  Ana García ' }, 0),
    ).toMatchObject({ displayName: 'Ana García' });
  });

  it('says what is missing when there is nobody and nothing to make them from', () => {
    expect(() => planFirstAdmin({}, 0)).toThrow(/BOOTSTRAP_ADMIN_EMAIL/);
    expect(() => planFirstAdmin({ BOOTSTRAP_ADMIN_EMAIL: 'a@b.c' }, 0)).toThrow(
      /BOOTSTRAP_ADMIN_PASSWORD/,
    );
  });

  it.each([
    [
      'an address that is not one',
      { BOOTSTRAP_ADMIN_EMAIL: 'nobody' },
      /email/,
    ],
    ['a short password', { BOOTSTRAP_ADMIN_PASSWORD: 'short' }, /at least 12/],
    [
      'the documented demo password, however it is cased',
      { BOOTSTRAP_ADMIN_PASSWORD: 'Demo1234' },
      /at least 12|guesses/,
    ],
    [
      'a well-known long one',
      { BOOTSTRAP_ADMIN_PASSWORD: 'change-me-please' },
      /guesses/,
    ],
  ])('refuses %s', (_label, override, message) => {
    expect(() => planFirstAdmin({ ...env, ...override }, 0)).toThrow(message);
  });
});

describe('bootstrapInstallation', () => {
  function fakePrisma(existingAdmins: number) {
    const created: string[] = [];
    const tx = {
      actor: { upsert: vi.fn().mockResolvedValue({ id: 'actor-1' }) },
      userCredential: { upsert: vi.fn().mockResolvedValue({}) },
      actorRole: {
        create: vi.fn().mockImplementation(async () => {
          created.push('grant');
        }),
      },
    };
    const anything = vi.fn().mockResolvedValue({ id: 'x' });
    const prisma = {
      permission: { upsert: anything },
      role: { upsert: anything },
      rolePermission: { upsert: anything },
      actorRole: { count: vi.fn().mockResolvedValue(existingAdmins) },
      $transaction: vi.fn(async (work: (client: typeof tx) => Promise<void>) =>
        work(tx),
      ),
    };
    return { prisma, tx, created };
  }

  it('writes the access model and the first administrator, hashed', async () => {
    const { prisma, tx } = fakePrisma(0);

    const result = await bootstrapInstallation(prisma as never, env);

    expect(result).toEqual({ createdAdmin: 'admin@example.com' });
    expect(prisma.permission.upsert).toHaveBeenCalled();
    expect(tx.actor.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { email: 'admin@example.com' } }),
    );
    const credential = tx.userCredential.upsert.mock.calls[0][0].create;
    expect(credential.passwordHash).toMatch(/^\$argon2id\$/);
    expect(credential.passwordHash).not.toContain('nobody-guesses');
    expect(tx.actorRole.create).toHaveBeenCalledOnce();
  });

  it('writes the access model and nothing else when an administrator exists', async () => {
    const { prisma, tx } = fakePrisma(1);

    const result = await bootstrapInstallation(prisma as never, {});

    expect(result).toEqual({ createdAdmin: null });
    expect(prisma.permission.upsert).toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(tx.actor.upsert).not.toHaveBeenCalled();
  });

  it('stops, having created nobody, when there is no administrator and no way to make one', async () => {
    const { prisma } = fakePrisma(0);

    await expect(bootstrapInstallation(prisma as never, {})).rejects.toThrow(
      /BOOTSTRAP_ADMIN_EMAIL/,
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
