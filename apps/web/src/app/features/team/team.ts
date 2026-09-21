import { DatePipe } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { ApiKey, ApiKeyScope, ApiKeysService, CreatedApiKey } from '../../core/api-keys.service.js';
import { LabelPipe } from '../../shared/label.pipe.js';
import { ScrollCue } from '../../shared/scroll-cue';
import { Actor, ActorsService, UpdateActorInput } from '../../core/actors.service.js';
import { AuthService } from '../../core/auth.service.js';
import { filterActors } from '../../core/actor-filter.js';
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
  imports: [
    ReactiveFormsModule,
    DatePipe,
    LabelPipe,
    MatButtonModule,
    MatCheckboxModule,
    MatFormFieldModule,
    MatInputModule,
    ScrollCue,
  ],
  templateUrl: './team.html',
  styleUrl: './team.scss',
})
export class Team implements OnInit {
  private readonly actorsService = inject(ActorsService);
  private readonly apiKeysService = inject(ApiKeysService);
  private readonly authService = inject(AuthService);
  private readonly fb = inject(FormBuilder);

  readonly users = signal<Actor[]>([]);
  readonly agents = signal<Actor[]>([]);
  /** What was typed in the search box (Roadmap UX-03c3). */
  readonly search = signal('');
  /**
   * People and agents that were switched off (a person who left, a test fixture) are folded
   * away until asked for, so the page shows who is on the team (Roadmap IMPROVEMENT-02d). A
   * search shows a match either way: whoever typed a name is looking for that one.
   */
  readonly showInactive = signal(false);
  readonly inactiveCount = computed(
    () => [...this.users(), ...this.agents()].filter((actor) => !actor.isActive).length,
  );
  private readonly includeInactive = computed(
    () => this.showInactive() || this.search().trim() !== '',
  );
  readonly visibleUsers = computed(() =>
    this.withoutHiddenInactive(filterActors(this.users(), this.search())),
  );
  readonly visibleAgents = computed(() =>
    this.withoutHiddenInactive(filterActors(this.agents(), this.search())),
  );

  private withoutHiddenInactive(actors: Actor[]): Actor[] {
    return this.includeInactive() ? actors : actors.filter((actor) => actor.isActive);
  }
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly editing = signal<Actor | null>(null);
  readonly canManage = computed(() => this.authService.hasGlobalPermission(ACTORS_MANAGE));
  readonly currentActorId = computed(() => this.authService.currentActor()?.id ?? null);

  /** Roadmap GAP-15: API keys for whichever AI agent is currently being edited. */
  readonly agentKeys = signal<ApiKey[]>([]);
  readonly keysLoading = signal(false);
  readonly keyErrorMessage = signal<string | null>(null);
  /** Set only right after create() — the one moment the plaintext exists client-side. Cleared on any other action. */
  readonly justCreatedKey = signal<CreatedApiKey | null>(null);

  readonly keyForm = this.fb.nonNullable.group({
    name: [''],
    scope: ['READ_WRITE' as ApiKeyScope],
    /** Days until the key stops working; empty means never (Roadmap SECURITY-04b2). */
    expiresInDays: [null as number | null, [Validators.min(1), Validators.max(3650)]],
  });

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

  onSearch(event: Event): void {
    this.search.set((event.target as HTMLInputElement).value);
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
      this.errorMessage.set('La configuración debe ser un objeto JSON.');
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
    this.justCreatedKey.set(null);
    this.keyErrorMessage.set(null);
    this.agentKeys.set([]);
    if (actor.kind === 'AI_AGENT') {
      void this.loadKeys(actor.id);
    }
  }

  cancelEdit(): void {
    this.editing.set(null);
    this.justCreatedKey.set(null);
    this.keyErrorMessage.set(null);
    this.agentKeys.set([]);
  }

  async createKey(agentId: string): Promise<void> {
    if (this.keyForm.invalid) {
      return;
    }
    this.keysLoading.set(true);
    this.keyErrorMessage.set(null);
    try {
      const { name, scope, expiresInDays } = this.keyForm.getRawValue();
      const created = await this.apiKeysService.create(agentId, {
        ...(name ? { name } : {}),
        scope,
        ...(expiresInDays ? { expiresInDays } : {}),
      });
      this.justCreatedKey.set(created);
      this.keyForm.reset({ name: '', scope: 'READ_WRITE', expiresInDays: null });
      await this.loadKeys(agentId);
    } catch (error) {
      this.keyErrorMessage.set(describeHttpError(error));
    } finally {
      this.keysLoading.set(false);
    }
  }

  /** A key past its expiry no longer works, whether or not anyone revoked it. */
  isExpired(key: ApiKey): boolean {
    return key.expiresAt !== null && new Date(key.expiresAt).getTime() <= Date.now();
  }

  async revokeKey(agentId: string, key: ApiKey): Promise<void> {
    this.keysLoading.set(true);
    this.keyErrorMessage.set(null);
    try {
      if (this.justCreatedKey()?.id === key.id) {
        this.justCreatedKey.set(null);
      }
      await this.apiKeysService.revoke(agentId, key.id);
      await this.loadKeys(agentId);
    } catch (error) {
      this.keyErrorMessage.set(describeHttpError(error));
    } finally {
      this.keysLoading.set(false);
    }
  }

  /** Best-effort only — the key is still shown as selectable text if the clipboard API is unavailable or denied. */
  async copyKey(key: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(key);
    } catch {
      // Ignored: the plaintext stays visible on screen either way.
    }
  }

  private async loadKeys(agentId: string): Promise<void> {
    this.keysLoading.set(true);
    try {
      this.agentKeys.set(await this.apiKeysService.list(agentId));
    } catch (error) {
      this.keyErrorMessage.set(describeHttpError(error));
    } finally {
      this.keysLoading.set(false);
    }
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
        this.errorMessage.set('La configuración debe ser un objeto JSON.');
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
