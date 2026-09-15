import { HttpErrorResponse } from '@angular/common/http';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
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

  beforeEach(() => {
    permissions = ['actors.manage'];
    actorsService = {
      listUsers: vi.fn().mockResolvedValue([me, ana]),
      listAgents: vi.fn().mockResolvedValue([codex]),
      createUser: vi.fn().mockResolvedValue(actor({})),
      createAgent: vi.fn().mockResolvedValue(actor({})),
      update: vi.fn().mockResolvedValue(actor({})),
    };
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: ActorsService, useValue: actorsService },
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
    expect(text).toContain('Add person');
    expect(text).toContain('Add agent');
    // Ana and Codex can be deactivated; the signed-in admin's own row cannot.
    expect(buttons().filter((label) => label === 'Deactivate')).toHaveLength(2);
  });

  it('is read-only without the actors.manage permission', async () => {
    permissions = [];
    const { fixture, buttons } = await render();
    const text = fixture.nativeElement.textContent as string;

    expect(text).toContain('Ana García');
    expect(text).not.toContain('Add person');
    expect(buttons()).not.toContain('Deactivate');
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
    expect(component.errorMessage()).toBe('Config must be a JSON object.');
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
});
