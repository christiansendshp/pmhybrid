import { Component, OnInit, computed, effect, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import {
  AbstractControl,
  FormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  ValidatorFn,
  Validators,
} from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import {
  LLM_DEFAULT_MODELS,
  LLM_LIMITS,
  LLM_PROVIDERS,
  type LlmSettingsStatus,
} from '@pmhybrid/shared-types';
import { describeHttpError } from '../../core/http-error.js';
import {
  LlmSettingsService,
  type LlmConnectionTestResult,
  type LlmProviderKey,
  type LlmSettingsView,
} from '../../core/llm-settings.service.js';

const NOT_BLANK = /\S/;
/** Printable characters with no space: what a provider key is made of. */
const API_KEY_CHARACTERS = /^[\x21-\x7E]+$/;
const WHOLE_NUMBER = /^\d+$/;

/**
 * A key as it will be sent: whitespace at either end (a pasted line break) is
 * dropped first, as the API does, so only what is really wrong blocks the save;
 * empty means "keep the stored one".
 */
const apiKeyValidator: ValidatorFn = (control: AbstractControl): ValidationErrors | null => {
  const key = typeof control.value === 'string' ? control.value.trim() : '';
  if (!key) {
    return null;
  }
  return key.length >= LLM_LIMITS.API_KEY.min &&
    key.length <= LLM_LIMITS.API_KEY.max &&
    API_KEY_CHARACTERS.test(key)
    ? null
    : { apiKey: true };
};

const PROVIDER_LABELS: Record<LlmProviderKey, string> = {
  ANTHROPIC: 'Anthropic (Claude)',
  OPENAI: 'OpenAI',
  OPENROUTER: 'OpenRouter',
};

const MODEL_HINTS: Record<LlmProviderKey, string> = {
  ANTHROPIC: 'El nombre del modelo tal como lo llama el proveedor.',
  OPENAI: 'El nombre del modelo tal como lo llama el proveedor.',
  OPENROUTER:
    'En OpenRouter el modelo lleva el prefijo del fabricante, por ejemplo anthropic/claude-haiku-4.5.',
};

const STATUS_LABELS: Record<LlmSettingsStatus, string> = {
  NOT_CONFIGURED: 'Sin configurar',
  DISABLED: 'Desactivada',
  KEY_UNREADABLE: 'Clave ilegible',
  READY: 'Lista',
};

/**
 * The application's own settings (Roadmap GAP-39b): today the LLM that
 * normalizes long Roadmap titles. Everything lives in the database and is
 * administered here, never in `.env`; the API key is write-only — once saved it
 * is never shown again, only that one exists — and the page is for whoever holds
 * the global `settings.manage` permission, which the API enforces too.
 */
@Component({
  selector: 'app-settings',
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatCheckboxModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
  ],
  templateUrl: './settings.html',
  styleUrl: './settings.scss',
})
export class SettingsPage implements OnInit {
  private readonly service = inject(LlmSettingsService);
  private readonly fb = inject(FormBuilder);

  readonly providers = LLM_PROVIDERS;
  readonly providerLabels = PROVIDER_LABELS;
  readonly statusLabels = STATUS_LABELS;
  readonly limits = LLM_LIMITS;

  readonly view = signal<LlmSettingsView | null>(null);
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly saved = signal(false);
  readonly errorMessage = signal<string | null>(null);
  /** The stored key is replaced only on purpose: until then the field stays out of sight. */
  readonly replacingKey = signal(false);
  readonly confirmingRemoval = signal(false);
  readonly removing = signal(false);
  readonly testing = signal(false);
  readonly testResult = signal<LlmConnectionTestResult | null>(null);

  readonly form = this.fb.nonNullable.group({
    provider: ['ANTHROPIC' as LlmProviderKey],
    model: [
      LLM_DEFAULT_MODELS.ANTHROPIC,
      [
        Validators.required,
        Validators.pattern(NOT_BLANK),
        Validators.maxLength(LLM_LIMITS.MODEL_MAX_LENGTH),
      ],
    ],
    enabled: [false],
    apiKey: ['', [apiKeyValidator]],
    temperature: [
      null as number | null,
      [Validators.min(LLM_LIMITS.TEMPERATURE.min), Validators.max(LLM_LIMITS.TEMPERATURE.max)],
    ],
    timeoutSeconds: [
      LLM_LIMITS.TIMEOUT_MS.default / 1000,
      [
        Validators.required,
        Validators.min(LLM_LIMITS.TIMEOUT_MS.min / 1000),
        Validators.max(LLM_LIMITS.TIMEOUT_MS.max / 1000),
        Validators.pattern(WHOLE_NUMBER),
      ],
    ],
    maxTokens: [
      LLM_LIMITS.MAX_TOKENS.default as number,
      [
        Validators.required,
        Validators.min(LLM_LIMITS.MAX_TOKENS.min),
        Validators.max(LLM_LIMITS.MAX_TOKENS.max),
        Validators.pattern(WHOLE_NUMBER),
      ],
    ],
  });

  private readonly typedKey = toSignal(this.form.controls.apiKey.valueChanges, {
    initialValue: '',
  });
  private readonly typedProvider = toSignal(this.form.controls.provider.valueChanges, {
    initialValue: this.form.controls.provider.value,
  });
  readonly modelHint = computed(() => MODEL_HINTS[this.typedProvider()]);
  /** The key field is shown when there is no stored key, or when it is being replaced. */
  readonly showKeyField = computed(() => !this.view()?.hasApiKey || this.replacingKey());
  /** Switching it on needs a key to call with: the stored one, or the one typed now. */
  readonly canEnable = computed(
    () => (this.view()?.hasApiKey ?? false) || this.typedKey().trim().length > 0,
  );
  readonly status = computed(() => this.view()?.status ?? 'NOT_CONFIGURED');

  constructor() {
    effect(() => {
      const enabled = this.form.controls.enabled;
      if (this.canEnable()) {
        enabled.enable({ emitEvent: false });
      } else {
        enabled.setValue(false, { emitEvent: false });
        enabled.disable({ emitEvent: false });
      }
    });
    // A model of one provider means nothing to another: following the provider
    // moves the model to its default, unless the administrator named their own.
    this.form.controls.provider.valueChanges.pipe(takeUntilDestroyed()).subscribe((provider) => {
      const model = this.form.controls.model.value.trim();
      const isADefault = !model || (Object.values(LLM_DEFAULT_MODELS) as string[]).includes(model);
      if (isADefault) {
        this.form.controls.model.setValue(LLM_DEFAULT_MODELS[provider]);
      }
    });
  }

  async ngOnInit(): Promise<void> {
    try {
      this.apply(await this.service.get());
    } catch (error) {
      this.errorMessage.set(describeHttpError(error, 'No se pudo cargar la configuración.'));
    } finally {
      this.loading.set(false);
    }
  }

  async save(): Promise<void> {
    this.form.markAllAsTouched();
    if (this.form.invalid || this.saving()) {
      return;
    }
    this.saving.set(true);
    this.saved.set(false);
    this.errorMessage.set(null);
    this.testResult.set(null);
    const value = this.form.getRawValue();
    const apiKey = value.apiKey.trim();
    try {
      const view = await this.service.update({
        provider: value.provider,
        model: value.model.trim(),
        enabled: value.enabled,
        temperature: value.temperature === null ? null : Number(value.temperature),
        timeoutMs: Number(value.timeoutSeconds) * 1000,
        maxTokens: Number(value.maxTokens),
        // Only a key typed now goes; the stored one stays where it is.
        ...(apiKey ? { apiKey } : {}),
      });
      this.apply(view);
      this.saved.set(true);
    } catch (error) {
      this.errorMessage.set(describeHttpError(error, 'No se pudo guardar la configuración.'));
    } finally {
      this.saving.set(false);
    }
  }

  discard(): void {
    const view = this.view();
    if (view) {
      this.apply(view);
    }
    this.saved.set(false);
    this.errorMessage.set(null);
  }

  replaceKey(): void {
    this.replacingKey.set(true);
    this.confirmingRemoval.set(false);
  }

  cancelReplaceKey(): void {
    this.replacingKey.set(false);
    this.form.controls.apiKey.setValue('');
  }

  askRemoveKey(): void {
    this.confirmingRemoval.set(true);
    this.replacingKey.set(false);
  }

  cancelRemoveKey(): void {
    this.confirmingRemoval.set(false);
  }

  async removeKey(): Promise<void> {
    this.removing.set(true);
    this.errorMessage.set(null);
    this.saved.set(false);
    this.testResult.set(null);
    try {
      this.apply(await this.service.removeApiKey());
    } catch (error) {
      this.errorMessage.set(describeHttpError(error, 'No se pudo quitar la clave.'));
    } finally {
      this.removing.set(false);
    }
  }

  async testConnection(): Promise<void> {
    this.testing.set(true);
    this.testResult.set(null);
    try {
      this.testResult.set(await this.service.test());
    } catch (error) {
      this.testResult.set({
        ok: false,
        error: describeHttpError(error, 'No se pudo probar la conexión.'),
      });
    } finally {
      this.testing.set(false);
    }
  }

  /** What the server holds becomes the form: the key field always starts empty, so the key never sits in the page after it is saved. */
  private apply(view: LlmSettingsView): void {
    this.view.set(view);
    this.replacingKey.set(false);
    this.confirmingRemoval.set(false);
    this.form.reset({
      provider: view.provider,
      model: view.model,
      enabled: view.enabled,
      apiKey: '',
      temperature: view.temperature,
      timeoutSeconds: Math.round(view.timeoutMs / 1000),
      maxTokens: view.maxTokens,
    });
  }
}
