import { describe, expect, it, vi } from 'vitest';
import { UnregisteredAgentsService } from './unregistered-agents.service.js';
import type { UnregisteredName } from './agent-ledger-link.service.js';

const NAME = (overrides: Partial<UnregisteredName>): UnregisteredName => ({
  name: 'ghost',
  entries: 2,
  tasks: 1,
  firstSeen: new Date('2026-10-01T10:00:00Z'),
  lastSeen: new Date('2026-10-02T10:00:00Z'),
  reason: 'UNKNOWN',
  ...overrides,
});

function service(options: {
  listed?: UnregisteredName[];
  mayCreate?: boolean;
}) {
  const create = vi.fn().mockResolvedValue({ id: 'new-agent' });
  const addMember = vi.fn().mockResolvedValue({});
  const record = vi.fn().mockResolvedValue({});
  const unregistered = vi.fn().mockResolvedValue(options.listed ?? []);
  const hasPermission = vi.fn().mockResolvedValue(options.mayCreate ?? true);
  const instance = new UnregisteredAgentsService(
    { unregistered } as never,
    { create } as never,
    { addMember } as never,
    { hasPermission } as never,
    { record } as never,
  );
  return { instance, create, addMember, record, hasPermission };
}

describe('UnregisteredAgentsService.register (Roadmap TASK-03)', () => {
  it('creates nothing for a name that two agents already answer to', async () => {
    const { instance, create } = service({
      listed: [NAME({ reason: 'AMBIGUOUS' })],
    });

    await expect(instance.register('p1', 'ghost', 'ana')).rejects.toThrow(
      'Two agents already answer to this name',
    );
    expect(create).not.toHaveBeenCalled();
  });

  it('creates nothing for a name that looks like a credential, even when the ledger carries it', async () => {
    const secret = 'sk-' + 'a'.repeat(30);
    const { instance, create } = service({ listed: [NAME({ name: secret })] });

    await expect(instance.register('p1', secret, 'ana')).rejects.toThrow(
      'looks like a credential',
    );
    expect(create).not.toHaveBeenCalled();
  });

  it('asks for the permission to create agents before it looks at the name', async () => {
    const { instance, create, hasPermission } = service({
      mayCreate: false,
      listed: [NAME({})],
    });

    await expect(instance.register('p1', 'ghost', 'ana')).rejects.toThrow(
      'Missing permission: actors.manage',
    );
    expect(hasPermission).toHaveBeenCalledWith('ana', 'actors.manage', 'p1');
    expect(create).not.toHaveBeenCalled();
  });

  it('registers the ledger spelling as display name and alias, adds the member, and audits it', async () => {
    const { instance, create, addMember, record } = service({
      listed: [NAME({ name: 'Ghost' })],
    });

    await instance.register('p1', ' ghost ', 'ana', 'API');

    expect(create).toHaveBeenCalledWith(
      { displayName: 'Ghost', providerType: 'custom', aliases: ['Ghost'] },
      'ana',
      'API',
    );
    expect(addMember).toHaveBeenCalledWith('p1', 'new-agent', 'ana', 'API');
    expect(record).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: 'p1',
        operation: 'AGENT_REGISTERED_FROM_LEDGER',
        origin: 'API',
      }),
    );
  });
});
