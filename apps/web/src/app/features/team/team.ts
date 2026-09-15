import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { Actor, ActorsService, UpdateActorInput } from '../../core/actors.service.js';
import { AuthService } from '../../core/auth.service.js';
import { describeHttpError } from '../../core/http-error.js';

const ACTORS_MANAGE = 'actors.manage';
const INVALID_CONFIG = Symbol('invalid-config');

/**
 * Team administration (brief §3): humans and AI agents as manageable actors.
 * Everyone signed in can see the team; changes need the global actors.manage
 * permission, which the API enforces regardless of what this page shows.
 */
@Component({
  selector: 'app-team',
  imports: [ReactiveFormsModule, RouterLink, MatButtonModule, MatFormFieldModule, MatInputModule],
  templateUrl: './team.html',
})
export class Team implements OnInit {
  private readonly actorsService = inject(ActorsService);
  private readonly authService = inject(AuthService);
  private readonly fb = inject(FormBuilder);

  readonly users = signal<Actor[]>([]);
  readonly agents = signal<Actor[]>([]);
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly editing = signal<Actor | null>(null);
  readonly canManage = computed(() => this.authService.hasGlobalPermission(ACTORS_MANAGE));
  readonly currentActorId = computed(() => this.authService.currentActor()?.id ?? null);

  readonly userForm = this.fb.nonNullable.group({
    displayName: ['', Validators.required],
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(8)]],
  });

  readonly agentForm = this.fb.nonNullable.group({
    displayName: ['', Validators.required],
    providerType: ['', Validators.required],
    config: [''],
  });

  readonly editForm = this.fb.nonNullable.group({
    displayName: ['', Validators.required],
    avatarUrl: [''],
    providerType: [''],
    config: [''],
  });

  async ngOnInit(): Promise<void> {
    await this.reload();
  }

  async createUser(): Promise<void> {
    if (this.userForm.invalid) {
      return;
    }
    await this.applyChange(async () => {
      await this.actorsService.createUser(this.userForm.getRawValue());
      this.userForm.reset();
    });
  }

  async createAgent(): Promise<void> {
    if (this.agentForm.invalid) {
      return;
    }
    const { displayName, providerType, config } = this.agentForm.getRawValue();
    const parsedConfig = parseConfig(config);
    if (parsedConfig === INVALID_CONFIG) {
      this.errorMessage.set('Config must be a JSON object.');
      return;
    }
    await this.applyChange(async () => {
      await this.actorsService.createAgent({ displayName, providerType, config: parsedConfig });
      this.agentForm.reset();
    });
  }

  startEdit(actor: Actor): void {
    this.errorMessage.set(null);
    this.editing.set(actor);
    const configJson = actor.agentProfile?.configJson;
    this.editForm.setValue({
      displayName: actor.displayName,
      avatarUrl: actor.avatarUrl ?? '',
      providerType: actor.agentProfile?.providerType ?? '',
      config: configJson ? JSON.stringify(configJson, null, 2) : '',
    });
  }

  cancelEdit(): void {
    this.editing.set(null);
  }

  async saveEdit(): Promise<void> {
    const actor = this.editing();
    if (!actor || this.editForm.invalid) {
      return;
    }
    const { displayName, avatarUrl, providerType, config } = this.editForm.getRawValue();
    const input: UpdateActorInput = { displayName, avatarUrl: avatarUrl || undefined };
    if (actor.kind === 'AI_AGENT') {
      const parsedConfig = parseConfig(config);
      if (parsedConfig === INVALID_CONFIG) {
        this.errorMessage.set('Config must be a JSON object.');
        return;
      }
      input.providerType = providerType || undefined;
      input.config = parsedConfig;
    }
    await this.applyChange(async () => {
      await this.actorsService.update(actor, input);
      this.editing.set(null);
    });
  }

  async setActive(actor: Actor, isActive: boolean): Promise<void> {
    await this.applyChange(() => this.actorsService.update(actor, { isActive }));
  }

  private async reload(): Promise<void> {
    const [users, agents] = await Promise.all([
      this.actorsService.listUsers(),
      this.actorsService.listAgents(),
    ]);
    this.users.set(users);
    this.agents.set(agents);
    this.loading.set(false);
  }

  /** Surfaces the API's own validation message on failure; refreshes both lists on success. */
  private async applyChange(change: () => Promise<unknown>): Promise<void> {
    this.saving.set(true);
    this.errorMessage.set(null);
    try {
      await change();
      await this.reload();
    } catch (error) {
      this.errorMessage.set(describeHttpError(error));
    } finally {
      this.saving.set(false);
    }
  }
}

/** Empty means "no config"; anything else must be a JSON object. */
function parseConfig(raw: string): Record<string, unknown> | undefined | typeof INVALID_CONFIG {
  if (!raw.trim()) {
    return undefined;
  }
  try {
    const value: unknown = JSON.parse(raw);
    return value !== null && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : INVALID_CONFIG;
  } catch {
    return INVALID_CONFIG;
  }
}
