import { ForbiddenException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { guarded, type McpToolContext } from './mcp-tools.js';

function fakeContext(
  members: boolean,
  overrides: Partial<McpToolContext> = {},
): McpToolContext {
  return {
    prisma: {
      projectMember: {
        findUnique: vi
          .fn()
          .mockResolvedValue(members ? { isActive: true } : null),
      },
    } as unknown as McpToolContext['prisma'],
    tasksService: {} as McpToolContext['tasksService'],
    actorId: 'actor-1',
    ...overrides,
  };
}

describe('guarded (mcp-tools)', () => {
  it('returns the action result as JSON text on success', async () => {
    const ctx = fakeContext(true);
    const result = await guarded(ctx, 'project-1', async () => ({
      id: 'task-1',
      title: 'Hi',
    }));

    expect(result.isError).toBeUndefined();
    expect(result.content[0]).toMatchObject({ type: 'text' });
    expect(JSON.parse((result.content[0] as { text: string }).text)).toEqual({
      id: 'task-1',
      title: 'Hi',
    });
  });

  it('never calls the action when the actor is not a project member', async () => {
    const ctx = fakeContext(false);
    const action = vi.fn();

    const result = await guarded(ctx, 'project-1', action);

    expect(action).not.toHaveBeenCalled();
    expect(result.isError).toBe(true);
    expect((result.content[0] as { text: string }).text).toMatch(
      /not a member/i,
    );
  });

  it('maps a thrown HttpException to an isError result carrying its message, never throwing', async () => {
    const ctx = fakeContext(true);

    const result = await guarded(ctx, 'project-1', async () => {
      throw new ForbiddenException(
        'Missing permission: task.status.transition',
      );
    });

    expect(result.isError).toBe(true);
    expect((result.content[0] as { text: string }).text).toBe(
      'Missing permission: task.status.transition',
    );
  });

  it('maps a non-Error thrown value to a string isError result', async () => {
    const ctx = fakeContext(true);

    const result = await guarded(ctx, 'project-1', async () => {
      throw 'a plain string rejection';
    });

    expect(result.isError).toBe(true);
    expect((result.content[0] as { text: string }).text).toBe(
      'a plain string rejection',
    );
  });
});
