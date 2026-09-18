import { createHmac } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';
import { GithubWebhookController } from './github-webhook.controller.js';

const SECRET = 'test-webhook-secret';

function sign(body: string, secret = SECRET): string {
  return `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`;
}

function fakeRequest(
  body: unknown,
  rawBody: Buffer | undefined = Buffer.from(JSON.stringify(body)),
): RawBodyRequest<Request> {
  return { body, rawBody } as unknown as RawBodyRequest<Request>;
}

function fakeConfigService(secret: string | undefined = SECRET) {
  return { get: vi.fn().mockReturnValue(secret ?? '') };
}

function fakePrisma(projects: { id: string; docsPath: string }[] = []) {
  return { project: { findMany: vi.fn().mockResolvedValue(projects) } };
}

function fakeSyncService(runSync = vi.fn().mockResolvedValue(undefined)) {
  return { runSync };
}

function createController(
  configService = fakeConfigService(),
  prisma = fakePrisma(),
  syncService = fakeSyncService(),
) {
  return new GithubWebhookController(
    configService as never,
    prisma as never,
    syncService as never,
  );
}

describe('GithubWebhookController', () => {
  it('rejects with 503 when GITHUB_WEBHOOK_SECRET is not configured', async () => {
    const controller = createController(fakeConfigService(''));
    await expect(
      controller.handle(fakeRequest({}), sign('{}'), 'push'),
    ).rejects.toMatchObject({ status: 503 });
  });

  it('rejects a missing signature header', async () => {
    const controller = createController();
    await expect(
      controller.handle(fakeRequest({}), undefined, 'push'),
    ).rejects.toMatchObject({ status: 401 });
  });

  it('rejects a signature computed with the wrong secret', async () => {
    const controller = createController();
    const body = JSON.stringify({ repository: { full_name: 'acme/widgets' } });
    await expect(
      controller.handle(
        fakeRequest(JSON.parse(body), Buffer.from(body)),
        sign(body, 'wrong-secret'),
        'push',
      ),
    ).rejects.toMatchObject({ status: 401 });
  });

  it('rejects when rawBody was not captured (main.ts rawBody: true missing)', async () => {
    const controller = createController();
    const requestWithoutRawBody = {
      body: {},
      rawBody: undefined,
    } as unknown as RawBodyRequest<Request>;
    await expect(
      controller.handle(requestWithoutRawBody, sign('{}'), 'push'),
    ).rejects.toMatchObject({ status: 400 });
  });

  it('accepts a validly signed ping event and triggers no sync', async () => {
    const syncService = fakeSyncService();
    const controller = createController(
      fakeConfigService(),
      fakePrisma(),
      syncService,
    );
    const body = JSON.stringify({ zen: 'hello' });
    const result = await controller.handle(
      fakeRequest(JSON.parse(body), Buffer.from(body)),
      sign(body),
      'ping',
    );
    expect(result).toEqual({ matchedProjects: 0 });
    expect(syncService.runSync).not.toHaveBeenCalled();
  });

  it('triggers runSync with trigger WEBHOOK for a project whose docsPath is exactly the repo full_name', async () => {
    const syncService = fakeSyncService();
    const prisma = fakePrisma([{ id: 'proj-1', docsPath: 'acme/widgets' }]);
    const controller = createController(
      fakeConfigService(),
      prisma,
      syncService,
    );
    const body = JSON.stringify({ repository: { full_name: 'acme/widgets' } });

    const result = await controller.handle(
      fakeRequest(JSON.parse(body), Buffer.from(body)),
      sign(body),
      'push',
    );

    expect(result).toEqual({ matchedProjects: 1 });
    expect(syncService.runSync).toHaveBeenCalledWith('proj-1', 'WEBHOOK');
  });

  it('triggers runSync for a project whose docsPath is the repo full_name plus a docs subpath', async () => {
    const syncService = fakeSyncService();
    const prisma = fakePrisma([
      { id: 'proj-1', docsPath: 'acme/widgets/docs' },
    ]);
    const controller = createController(
      fakeConfigService(),
      prisma,
      syncService,
    );
    const body = JSON.stringify({ repository: { full_name: 'acme/widgets' } });

    const result = await controller.handle(
      fakeRequest(JSON.parse(body), Buffer.from(body)),
      sign(body),
      'push',
    );

    expect(result).toEqual({ matchedProjects: 1 });
    expect(syncService.runSync).toHaveBeenCalledWith('proj-1', 'WEBHOOK');
  });

  it('does not match a project whose docsPath merely shares a prefix ("acme/widgets-2")', async () => {
    const syncService = fakeSyncService();
    const prisma = fakePrisma([{ id: 'proj-1', docsPath: 'acme/widgets-2' }]);
    const controller = createController(
      fakeConfigService(),
      prisma,
      syncService,
    );
    const body = JSON.stringify({ repository: { full_name: 'acme/widgets' } });

    const result = await controller.handle(
      fakeRequest(JSON.parse(body), Buffer.from(body)),
      sign(body),
      'push',
    );

    expect(result).toEqual({ matchedProjects: 0 });
    expect(syncService.runSync).not.toHaveBeenCalled();
  });

  it('does not throw and reports the match when one matched project fails to sync', async () => {
    const syncService = fakeSyncService(
      vi.fn().mockRejectedValue(new Error('boom')),
    );
    const prisma = fakePrisma([{ id: 'proj-1', docsPath: 'acme/widgets' }]);
    const controller = createController(
      fakeConfigService(),
      prisma,
      syncService,
    );
    const body = JSON.stringify({ repository: { full_name: 'acme/widgets' } });

    const result = await controller.handle(
      fakeRequest(JSON.parse(body), Buffer.from(body)),
      sign(body),
      'push',
    );

    expect(result).toEqual({ matchedProjects: 1 });
    expect(syncService.runSync).toHaveBeenCalledWith('proj-1', 'WEBHOOK');
  });

  it('is a no-op when the push payload has no repository.full_name', async () => {
    const syncService = fakeSyncService();
    const controller = createController(
      fakeConfigService(),
      fakePrisma(),
      syncService,
    );
    const body = JSON.stringify({});

    const result = await controller.handle(
      fakeRequest(JSON.parse(body), Buffer.from(body)),
      sign(body),
      'push',
    );

    expect(result).toEqual({ matchedProjects: 0 });
    expect(syncService.runSync).not.toHaveBeenCalled();
  });
});
