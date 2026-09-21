import { HttpErrorResponse } from '@angular/common/http';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiKey, ApiKeysService, CreatedApiKey } from '../../core/api-keys.service.js';
import { Actor, ActorsService } from '../../core/actors.service.js';
import { AuthService } from '../../core/auth.service.js';
import { Team } from './team.js';

function actor(overrides: Partial<Actor>): Actor {
  return {
    id: 'x',
    kind: 'HUMAN',
    displayName: 'Someone',
    email: null,
    avatarUrl: null,
    isActive: true,
    createdAt: '2026-09-15T10:00:00.000Z',
    ...overrides,
  };
}

describe('Team (brief §3 — administrable actors)', () => {
  const me = actor({ id: 'u1', displayName: 'Demo Human', email: 'demo@pmhybrid.local' });
  const ana = actor({ id: 'u2', displayName: 'Ana García', email: 'ana@pmhybrid.local' });
  const codex = actor({
    id: 'a1',
    kind: 'AI_AGENT',
    displayName: 'Codex',
    agentProfile: { providerType: 'codex', configJson: null },
  });

  let permissions: string[];
  let actorsService: {
    listUsers: ReturnType<typeof vi.fn>;
    listAgents: ReturnType<typeof vi.fn>;
    createUser: ReturnType<typeof vi.fn>;
    createAgent: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
  let apiKeysService: {
    list: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    revoke: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    permissions = ['actors.manage'];
    actorsService = {
      listUsers: vi.fn().mockResolvedValue([me, ana]),
      listAgents: vi.fn().mockResolvedValue([codex]),
      createUser: vi.fn().mockResolvedValue(actor({})),
      createAgent: vi.fn().mockResolvedValue(actor({})),
      update: vi.fn().mockResolvedValue(actor({})),
    };
    apiKeysService = {
      list: vi.fn().mockResolvedValue([]),
      create: vi.fn(),
      revoke: vi.fn(),
    };
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: ActorsService, useValue: actorsService },
        { provide: ApiKeysService, useValue: apiKeysService },
        {
          provide: AuthService,
          useValue: {
            currentActor: signal({ id: 'u1', displayName: 'Demo Human', permissions }),
            hasGlobalPermission: (key: string) => permissions.includes(key),
          },
        },
      ],
    });
  });

  async function render() {
    const fixture = TestBed.createComponent(Team);
    fixture.detectChanges();
    // ngOnInit's list requests are plain promises, which whenStable() does not track.
    await new Promise((resolve) => setTimeout(resolve));
    fixture.detectChanges();
    const buttons = () =>
      Array.from(fixture.nativeElement.querySelectorAll('button') as NodeListOf<HTMLElement>).map(
        (b) => b.textContent?.trim(),
      );
    return { fixture, component: fixture.componentInstance, buttons };
  }

  it('lists people and agents, and lets an actors.manage holder deactivate anyone but themselves', async () => {
    const { fixture, buttons } = await render();
    const text = fixture.nativeElement.textContent as string;

    expect(text).toContain('Ana García');
    expect(text).toContain('Codex');
    expect(text).toContain('codex');
    expect(text).toContain('Agregar persona');
    expect(text).toContain('Agregar agente');
    // Ana and Codex can be deactivated; the signed-in admin's own row cannot.
    expect(buttons().filter((label) => label === 'Desactivar')).toHaveLength(2);
  });

  it('filters both lists as you type, and says so when nothing matches (Roadmap UX-03c3)', async () => {
    const { fixture, component } = await render();
    const root = fixture.nativeElement as HTMLElement;
    const rows = (table: string) =>
      Array.from(root.querySelectorAll(`table[aria-label="${table}"] tbody tr`));
    const type = (value: string) => {
      const input = root.querySelector('input[type="search"]') as HTMLInputElement;
      input.value = value;
      input.dispatchEvent(new Event('input'));
      fixture.detectChanges();
    };

    expect(rows('Personas').length).toBeGreaterThan(0);
    type('garcia');
    expect(rows('Personas')).toHaveLength(1);
    expect(rows('Personas')[0].textContent).toContain('Ana García');
    expect(rows('Agentes IA')).toHaveLength(0);
    expect(root.textContent).toContain('Ningún agente coincide con «garcia»');

    type('zzz');
    expect(rows('Personas')).toHaveLength(0);
    expect(root.textContent).toContain('Ninguna persona coincide con «zzz»');

    type('');
    expect(component.visibleUsers().length).toBeGreaterThan(0);
    expect(root.textContent).not.toContain('coincide con');
  });

  it('is read-only without the actors.manage permission', async () => {
    permissions = [];
    const { fixture, buttons } = await render();
    const text = fixture.nativeElement.textContent as string;

    expect(text).toContain('Ana García');
    expect(text).not.toContain('Agregar persona');
    expect(buttons()).not.toContain('Desactivar');
  });

  it('creates an agent with its JSON config parsed, and refuses a config that is not a JSON object', async () => {
    const { component } = await render();

    component.agentForm.setValue({
      displayName: 'Claude QA',
      providerType: 'claude',
      config: '{"model":"claude-opus-5"}',
    });
    await component.createAgent();
    expect(actorsService.createAgent).toHaveBeenCalledWith({
      displayName: 'Claude QA',
      providerType: 'claude',
      config: { model: 'claude-opus-5' },
    });
    expect(actorsService.listAgents).toHaveBeenCalledTimes(2);

    component.agentForm.setValue({
      displayName: 'Broken',
      providerType: 'custom',
      config: '[1, 2]',
    });
    await component.createAgent();
    expect(actorsService.createAgent).toHaveBeenCalledTimes(1);
    expect(component.errorMessage()).toBe('La configuración debe ser un objeto JSON.');
  });

  it('deactivates through the actor-specific endpoint and surfaces the API validation message', async () => {
    const { component } = await render();

    await component.setActive(codex, false);
    expect(actorsService.update).toHaveBeenCalledWith(codex, { isActive: false });

    actorsService.update.mockRejectedValueOnce(
      new HttpErrorResponse({
        status: 400,
        error: { message: ['You cannot deactivate yourself'] },
      }),
    );
    await component.setActive(me, false);
    expect(component.errorMessage()).toBe('You cannot deactivate yourself');
  });

  it('edits an agent: name, provider and config are sent together', async () => {
    const { component } = await render();

    component.startEdit(codex);
    component.editForm.patchValue({ displayName: 'Codex Senior', config: '{"focus":"backend"}' });
    await component.saveEdit();

    expect(actorsService.update).toHaveBeenCalledWith(codex, {
      displayName: 'Codex Senior',
      avatarUrl: undefined,
      providerType: 'codex',
      config: { focus: 'backend' },
    });
    expect(component.editing()).toBeNull();
  });

  it("loads an AI agent's API keys when editing starts, but not for a human", async () => {
    const { component } = await render();

    component.startEdit(ana);
    expect(apiKeysService.list).not.toHaveBeenCalled();

    component.startEdit(codex);
    expect(apiKeysService.list).toHaveBeenCalledWith('a1');
  });

  it('generates a new key, shows the plaintext exactly once, and clears it on any other action', async () => {
    const { component, fixture } = await render();
    const created: CreatedApiKey = {
      id: 'k1',
      name: 'CI pipeline',
      prefix: 'abcd1234',
      createdAt: '2026-09-15T10:00:00.000Z',
      revokedAt: null,
      expiresAt: null,
      scope: 'READ_WRITE',
      lastUsedAt: null,
      key: 'pmh_deadbeef',
    };
    apiKeysService.create.mockResolvedValue(created);
    apiKeysService.list.mockResolvedValue([created]);

    component.startEdit(codex);
    component.keyForm.setValue({ name: 'CI pipeline', scope: 'READ_WRITE', expiresInDays: null });
    await component.createKey('a1');
    fixture.detectChanges();

    expect(apiKeysService.create).toHaveBeenCalledWith('a1', {
      name: 'CI pipeline',
      scope: 'READ_WRITE',
    });
    expect(component.justCreatedKey()?.key).toBe('pmh_deadbeef');
    expect(fixture.nativeElement.textContent as string).toContain('pmh_deadbeef');

    // Any other action — like revoking a (different) key — clears the plaintext off screen.
    apiKeysService.revoke.mockResolvedValue({ ...created, revokedAt: '2026-09-15T11:00:00.000Z' });
    apiKeysService.list.mockResolvedValue([{ ...created, revokedAt: '2026-09-15T11:00:00.000Z' }]);
    await component.revokeKey('a1', created);
    expect(component.justCreatedKey()).toBeNull();
    expect(apiKeysService.revoke).toHaveBeenCalledWith('a1', 'k1');
  });

  it('creates a read-only key that expires, and sends what was chosen (Roadmap SECURITY-04b2)', async () => {
    const { component } = await render();
    apiKeysService.create.mockResolvedValue({ id: 'k2', key: 'pmh_x' });
    component.startEdit(codex);

    component.keyForm.setValue({ name: '', scope: 'READ_ONLY', expiresInDays: 30 });
    await component.createKey('a1');

    expect(apiKeysService.create).toHaveBeenCalledWith('a1', {
      scope: 'READ_ONLY',
      expiresInDays: 30,
    });
    // An expiry out of range is not sent at all.
    apiKeysService.create.mockClear();
    component.keyForm.setValue({ name: '', scope: 'READ_WRITE', expiresInDays: 9999 });
    await component.createKey('a1');
    expect(apiKeysService.create).not.toHaveBeenCalled();
  });

  it('shows the permission, expiry and last use of each key, and an expired key as expired with nothing to revoke', async () => {
    const base: ApiKey = {
      id: 'k1',
      name: 'CI',
      prefix: 'abcd1234',
      createdAt: '2026-09-15T10:00:00.000Z',
      revokedAt: null,
      expiresAt: null,
      scope: 'READ_WRITE',
      lastUsedAt: null,
    };
    apiKeysService.list.mockResolvedValue([
      { ...base, scope: 'READ_ONLY', lastUsedAt: '2026-09-16T10:00:00.000Z' },
      { ...base, id: 'k2', name: 'Old', expiresAt: '2026-09-17T10:00:00.000Z' },
      { ...base, id: 'k3', name: 'Later', expiresAt: '2999-01-01T00:00:00.000Z' },
    ]);
    const { component, fixture } = await render();
    component.startEdit(codex);
    await new Promise((resolve) => setTimeout(resolve));
    fixture.detectChanges();
    const rows = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll(
        'table[aria-label="Claves de API"] tbody tr',
      ),
    ).map((row) => (row.textContent ?? '').replace(/\s+/g, ' ').trim());

    expect(rows[0]).toContain('Solo lectura');
    expect(rows[0]).toContain('16 Sep 2026');
    expect(rows[0]).toContain('Activa');
    expect(rows[0]).toContain('Revocar');
    expect(rows[1]).toContain('Caducada');
    expect(rows[1]).not.toContain('Revocar');
    expect(rows[2]).toContain('Activa');
  });

  it('surfaces a key-creation failure without crashing the panel', async () => {
    const { component } = await render();
    component.startEdit(codex);
    apiKeysService.create.mockRejectedValueOnce(
      new HttpErrorResponse({
        status: 403,
        error: { message: ['Missing permission: actors.manage'] },
      }),
    );

    await component.createKey('a1');
    expect(component.keyErrorMessage()).toBe('Missing permission: actors.manage');
    expect(component.justCreatedKey()).toBeNull();
  });

  it('leaves the key panel behind on cancel', async () => {
    const { component } = await render();
    const key: ApiKey = {
      id: 'k1',
      name: null,
      prefix: 'abcd1234',
      createdAt: '2026-09-15T10:00:00.000Z',
      revokedAt: null,
      expiresAt: null,
      scope: 'READ_WRITE',
      lastUsedAt: null,
    };
    apiKeysService.list.mockResolvedValue([key]);
    component.startEdit(codex);
    await new Promise((resolve) => setTimeout(resolve));
    expect(component.agentKeys()).toEqual([key]);

    component.cancelEdit();
    expect(component.agentKeys()).toEqual([]);
    expect(component.editing()).toBeNull();
  });

  describe('inactive people and agents (Roadmap IMPROVEMENT-02d)', () => {
    const gone = actor({
      id: 'u9',
      displayName: 'Sam Departed',
      email: 'sam@pmhybrid.local',
      isActive: false,
    });
    const retired = actor({
      id: 'a9',
      kind: 'AI_AGENT',
      displayName: 'Retired Bot',
      isActive: false,
    });
    // An agent's cell also holds its kind badge, so a name is matched by how it starts.
    const shows = (root: HTMLElement, name: string) =>
      names(root).some((cell) => cell?.startsWith(name));
    const names = (root: HTMLElement) =>
      Array.from(root.querySelectorAll('table tbody tr td:first-child')).map((cell) =>
        cell.textContent?.trim(),
      );

    beforeEach(() => {
      actorsService.listUsers.mockResolvedValue([me, ana, gone]);
      actorsService.listAgents.mockResolvedValue([codex, retired]);
    });

    it('folds them away, and says how many are', async () => {
      const { fixture } = await render();
      const root = fixture.nativeElement as HTMLElement;

      expect(shows(root, 'Ana García')).toBe(true);
      expect(shows(root, 'Sam Departed')).toBe(false);
      expect(shows(root, 'Retired Bot')).toBe(false);
      expect(root.textContent).toContain('Mostrar inactivos (2)');
    });

    it('shows them on request, with their state, and folds them again', async () => {
      const { fixture, component } = await render();
      const root = fixture.nativeElement as HTMLElement;

      component.showInactive.set(true);
      fixture.detectChanges();
      expect(shows(root, 'Sam Departed')).toBe(true);
      expect(shows(root, 'Retired Bot')).toBe(true);
      expect(root.textContent).toContain('Inactivo');

      component.showInactive.set(false);
      fixture.detectChanges();
      expect(shows(root, 'Sam Departed')).toBe(false);
    });

    it('shows a match whether it is on or off, for whoever typed the name', async () => {
      const { fixture } = await render();
      const root = fixture.nativeElement as HTMLElement;
      const input = root.querySelector('input[type="search"]') as HTMLInputElement;

      input.value = 'departed';
      input.dispatchEvent(new Event('input'));
      fixture.detectChanges();

      expect(names(root)).toEqual(['Sam Departed']);
    });

    it('offers nothing to fold when everyone is active', async () => {
      actorsService.listUsers.mockResolvedValue([me, ana]);
      actorsService.listAgents.mockResolvedValue([codex]);
      const { fixture } = await render();

      expect((fixture.nativeElement as HTMLElement).textContent).not.toContain('Mostrar inactivos');
    });
  });
});
