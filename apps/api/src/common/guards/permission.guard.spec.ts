import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { describe, expect, it } from 'vitest';
import { RequirePermission } from '../decorators/require-permission.decorator.js';
import type { PermissionsResolverService } from '../permissions-resolver.service.js';
import { PermissionGuard } from './permission.guard.js';

@RequirePermission('class.key')
class ClassLevelController {
  inherits() {
    return 'inherits';
  }

  @RequirePermission('handler.key')
  overrides() {
    return 'overrides';
  }
}

class UnprotectedController {
  open() {
    return 'open';
  }
}

function contextFor(
  controller: new () => object,
  method: string,
): ExecutionContext {
  return {
    getHandler: () =>
      (controller.prototype as Record<string, () => unknown>)[method],
    getClass: () => controller,
    switchToHttp: () => ({
      getRequest: () => ({
        user: { sub: 'actor-1' },
        params: { projectId: 'p1' },
      }),
    }),
  } as unknown as ExecutionContext;
}

function guardHolding(...held: string[]) {
  const asked: string[] = [];
  const resolver = {
    hasPermission: (_actor: string, permission: string) => {
      asked.push(permission);
      return Promise.resolve(held.includes(permission));
    },
  } as unknown as PermissionsResolverService;
  return { guard: new PermissionGuard(new Reflector(), resolver), asked };
}

describe('PermissionGuard (Roadmap SECURITY-02)', () => {
  it('enforces a class-level @RequirePermission on handlers that declare none', async () => {
    const denied = guardHolding();
    await expect(
      denied.guard.canActivate(contextFor(ClassLevelController, 'inherits')),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(denied.asked).toEqual(['class.key']);

    const allowed = guardHolding('class.key');
    await expect(
      allowed.guard.canActivate(contextFor(ClassLevelController, 'inherits')),
    ).resolves.toBe(true);
  });

  it('lets a handler-level key override the class-level one', async () => {
    const { guard, asked } = guardHolding('handler.key');
    await expect(
      guard.canActivate(contextFor(ClassLevelController, 'overrides')),
    ).resolves.toBe(true);
    expect(asked).toEqual(['handler.key']);
  });

  it('does nothing for a route that opted out of permissions', async () => {
    const { guard, asked } = guardHolding();
    await expect(
      guard.canActivate(contextFor(UnprotectedController, 'open')),
    ).resolves.toBe(true);
    expect(asked).toEqual([]);
  });
});
