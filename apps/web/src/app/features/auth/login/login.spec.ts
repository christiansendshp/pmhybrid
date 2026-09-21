import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthService } from '../../../core/auth.service.js';
import { Login } from './login.js';

/** The login form: validation before any request, the request, and both outcomes (Roadmap TEST-01c). */
describe('Login', () => {
  let login: ReturnType<typeof vi.fn>;
  let navigateByUrl: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    login = vi.fn().mockResolvedValue(undefined);
    navigateByUrl = vi.fn().mockResolvedValue(true);
    TestBed.configureTestingModule({
      providers: [
        { provide: AuthService, useValue: { login } },
        { provide: Router, useValue: { navigateByUrl } },
      ],
    });
  });

  function render() {
    const fixture = TestBed.createComponent(Login);
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    return { fixture, component: fixture.componentInstance, root };
  }

  it('does not send anything for an empty form, a bad email or a short password', async () => {
    const { component } = render();

    for (const value of [
      { email: '', password: '' },
      { email: 'not-an-email', password: 'longenough1' },
      { email: 'a@b.co', password: 'short' },
    ]) {
      component.form.setValue(value);
      await component.submit();
    }

    expect(login).not.toHaveBeenCalled();
    expect(navigateByUrl).not.toHaveBeenCalled();
  });

  it('signs in with what was typed and lands on the dashboard', async () => {
    const { component, root } = render();
    component.form.setValue({ email: 'a@b.co', password: 'longenough1' });

    await component.submit();

    expect(login).toHaveBeenCalledWith('a@b.co', 'longenough1');
    expect(navigateByUrl).toHaveBeenCalledWith('/dashboard');
    expect(component.errorMessage()).toBeNull();
    expect(root.querySelector('[role="alert"]')).toBeNull();
  });

  it('says the credentials are wrong, without saying which part, and stays on the page', async () => {
    login.mockRejectedValue(new Error('401'));
    const { component, fixture, root } = render();
    component.form.setValue({ email: 'a@b.co', password: 'longenough1' });

    await component.submit();
    fixture.detectChanges();

    expect(navigateByUrl).not.toHaveBeenCalled();
    expect(root.querySelector('[role="alert"]')?.textContent).toContain(
      'Email o contraseña inválidos.',
    );
    expect(component.submitting()).toBe(false);
  });

  it('ignores a second submit while the first is in flight, and clears the error on the next try', async () => {
    let finish!: () => void;
    login.mockImplementationOnce(() => new Promise<void>((resolve) => (finish = resolve)));
    const { component } = render();
    component.form.setValue({ email: 'a@b.co', password: 'longenough1' });

    const first = component.submit();
    await component.submit();
    expect(login).toHaveBeenCalledTimes(1);
    expect(component.submitting()).toBe(true);
    finish();
    await first;

    login.mockRejectedValueOnce(new Error('401'));
    await component.submit();
    expect(component.errorMessage()).not.toBeNull();
    login.mockResolvedValueOnce(undefined);
    await component.submit();
    expect(component.errorMessage()).toBeNull();
  });

  it('disables the button until the form is valid', () => {
    const { component, fixture, root } = render();
    const button = root.querySelector('button[type="submit"]') as HTMLButtonElement;

    expect(button.disabled).toBe(true);
    component.form.setValue({ email: 'a@b.co', password: 'longenough1' });
    fixture.detectChanges();
    expect(button.disabled).toBe(false);
  });
});
