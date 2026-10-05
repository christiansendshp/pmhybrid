import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { LLM_DEFAULT_MODELS } from '@pmhybrid/shared-types';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LlmSettingsService, type LlmSettingsView } from '../../core/llm-settings.service.js';
import { SettingsPage } from './settings.js';

const KEY = 'sk-ant-api03-WEB-TEST-KEY-never-shown-again';

function view(overrides: Partial<LlmSettingsView> = {}): LlmSettingsView {
  return {
    provider: 'ANTHROPIC',
    model: LLM_DEFAULT_MODELS.ANTHROPIC,
    enabled: false,
    hasApiKey: false,
    status: 'NOT_CONFIGURED',
    temperature: null,
    timeoutMs: 30_000,
    maxTokens: 1024,
    updatedAt: null,
    ...overrides,
  };
}

describe('SettingsPage (Roadmap GAP-39b — LLM configuration)', () => {
  let service: {
    get: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    removeApiKey: ReturnType<typeof vi.fn>;
    test: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    service = {
      get: vi.fn().mockResolvedValue(view()),
      update: vi.fn(),
      removeApiKey: vi.fn(),
      test: vi.fn(),
    };
  });

  async function render() {
    TestBed.configureTestingModule({
      providers: [{ provide: LlmSettingsService, useValue: service }],
    });
    const fixture = TestBed.createComponent(SettingsPage);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    const text = () => (root.textContent ?? '').replace(/\s+/g, ' ');
    const settle = async () => {
      await fixture.whenStable();
      fixture.detectChanges();
    };
    return { fixture, component: fixture.componentInstance, root, text, settle };
  }

  it('asks for a key when none is stored, and does not let the integration be switched on yet', async () => {
    const { component, root, text } = await render();

    expect(text()).toContain('Sin configurar');
    expect(root.querySelector('input[type="password"]')).not.toBeNull();
    expect(component.canEnable()).toBe(false);
    expect(component.form.controls.enabled.disabled).toBe(true);
    expect(text()).toContain('Para activarla primero ingresa una clave de API.');
  });

  it('allows switching it on once a key is typed', async () => {
    const { component, settle } = await render();

    component.form.controls.apiKey.setValue(KEY);
    await settle();

    expect(component.canEnable()).toBe(true);
    expect(component.form.controls.enabled.enabled).toBe(true);
  });

  it('shows only that a key exists when one is stored, never a field holding it', async () => {
    service.get.mockResolvedValue(view({ hasApiKey: true, status: 'DISABLED' }));
    const { root, text } = await render();

    expect(text()).toContain('Desactivada');
    expect(text()).toContain('guardada (no se muestra)');
    expect(root.querySelector('input[type="password"]')).toBeNull();
    expect(text()).toContain('Reemplazar clave');
    expect(text()).toContain('Quitar clave');
  });

  it('saves the key typed, then forgets it: the page never holds it again', async () => {
    service.update.mockResolvedValue(view({ hasApiKey: true, enabled: true, status: 'READY' }));
    const { component, root, text, settle } = await render();
    component.form.controls.apiKey.setValue(`  ${KEY}  `);
    component.form.controls.enabled.setValue(true);
    await settle();

    await component.save();
    await settle();

    expect(service.update).toHaveBeenCalledWith({
      provider: 'ANTHROPIC',
      model: LLM_DEFAULT_MODELS.ANTHROPIC,
      enabled: true,
      temperature: null,
      timeoutMs: 30_000,
      maxTokens: 1024,
      apiKey: KEY,
    });
    expect(component.form.controls.apiKey.value).toBe('');
    expect(root.querySelector('input[type="password"]')).toBeNull();
    expect(text()).toContain('Lista');
    expect(text()).toContain('Configuración guardada.');
    expect(root.innerHTML).not.toContain(KEY);
  });

  it('keeps the stored key when none is typed: nothing about it is sent', async () => {
    service.get.mockResolvedValue(view({ hasApiKey: true, status: 'DISABLED' }));
    service.update.mockResolvedValue(
      view({ hasApiKey: true, status: 'DISABLED', model: 'otro-modelo' }),
    );
    const { component, settle } = await render();
    component.form.controls.model.setValue('otro-modelo');
    component.form.controls.model.markAsDirty();
    await settle();

    await component.save();

    const body = service.update.mock.calls[0][0] as Record<string, unknown>;
    expect(body).not.toHaveProperty('apiKey');
    expect(body['model']).toBe('otro-modelo');
  });

  it('sends the temperature and the timeout in the units the API takes', async () => {
    service.update.mockResolvedValue(view());
    const { component } = await render();
    component.form.patchValue({ temperature: 0.4, timeoutSeconds: 45, maxTokens: 2048 });
    component.form.markAsDirty();

    await component.save();

    expect(service.update.mock.calls[0][0]).toMatchObject({
      temperature: 0.4,
      timeoutMs: 45_000,
      maxTokens: 2048,
    });
  });

  it('refuses a malformed key or a blank model without calling the API', async () => {
    const { component } = await render();

    component.form.controls.apiKey.setValue('has spaces in it');
    await component.save();
    component.form.controls.apiKey.setValue('short');
    await component.save();
    component.form.controls.apiKey.setValue('');
    component.form.controls.model.setValue('   ');
    await component.save();

    expect(service.update).not.toHaveBeenCalled();
  });

  it('follows the provider with its default model, and keeps one the administrator named', async () => {
    const { component } = await render();

    component.form.controls.provider.setValue('OPENAI');
    expect(component.form.controls.model.value).toBe(LLM_DEFAULT_MODELS.OPENAI);

    component.form.controls.model.setValue('mi-modelo-propio');
    component.form.controls.provider.setValue('ANTHROPIC');
    expect(component.form.controls.model.value).toBe('mi-modelo-propio');
  });

  it('replaces a stored key only on purpose, and can go back without changing it', async () => {
    service.get.mockResolvedValue(view({ hasApiKey: true, status: 'DISABLED' }));
    const { component, root, settle } = await render();

    component.replaceKey();
    await settle();
    expect(root.querySelector('input[type="password"]')).not.toBeNull();

    component.form.controls.apiKey.setValue(KEY);
    component.cancelReplaceKey();
    await settle();
    expect(root.querySelector('input[type="password"]')).toBeNull();
    expect(component.form.controls.apiKey.value).toBe('');
  });

  it('asks before removing the key, then forgets it', async () => {
    service.get.mockResolvedValue(view({ hasApiKey: true, enabled: true, status: 'READY' }));
    service.removeApiKey.mockResolvedValue(view());
    const { component, text, settle } = await render();

    component.askRemoveKey();
    await settle();
    expect(text()).toContain('¿Quitar la clave guardada?');
    expect(service.removeApiKey).not.toHaveBeenCalled();

    await component.removeKey();
    await settle();
    expect(service.removeApiKey).toHaveBeenCalledOnce();
    expect(text()).toContain('Sin configurar');
  });

  it('tests the stored configuration and says how it went', async () => {
    service.get.mockResolvedValue(view({ hasApiKey: true, status: 'DISABLED' }));
    service.test.mockResolvedValueOnce({ ok: true });
    const { component, text, settle } = await render();

    await component.testConnection();
    await settle();
    expect(text()).toContain('La conexión funciona');

    service.test.mockResolvedValueOnce({ ok: false, error: 'Anthropic answered 401' });
    await component.testConnection();
    await settle();
    expect(text()).toContain('No se pudo conectar: Anthropic answered 401');
  });

  it('shows the API error when saving fails, and keeps what was typed', async () => {
    service.update.mockRejectedValue(
      new HttpErrorResponse({
        status: 400,
        error: { message: 'An API key is required to enable the LLM' },
      }),
    );
    const { component, text, settle } = await render();
    component.form.controls.apiKey.setValue(KEY);
    component.form.markAsDirty();

    await component.save();
    await settle();

    expect(text()).toContain('An API key is required to enable the LLM');
    expect(component.form.controls.apiKey.value).toBe(KEY);
  });

  it('says so when the configuration cannot be loaded', async () => {
    service.get.mockRejectedValue(new HttpErrorResponse({ status: 403 }));
    const { text } = await render();

    expect(text()).toContain('No se pudo cargar la configuración.');
  });

  it('flags an unreadable key and asks for it again', async () => {
    service.get.mockResolvedValue(view({ hasApiKey: true, status: 'KEY_UNREADABLE' }));
    const { text } = await render();

    expect(text()).toContain('Clave ilegible');
    expect(text()).toContain('Vuelve a ingresarla');
  });
});
