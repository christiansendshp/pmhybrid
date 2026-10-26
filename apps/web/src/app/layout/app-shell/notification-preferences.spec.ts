import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NotificationsService, type SummaryFrequency } from '../../core/notifications.service.js';
import { NotificationPreferences } from './notification-preferences.js';

describe('NotificationPreferences (Roadmap TASK-42)', () => {
  let preferences: ReturnType<typeof vi.fn>;
  let setSummaryFrequency: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    preferences = vi.fn();
    setSummaryFrequency = vi.fn();
    TestBed.configureTestingModule({
      providers: [
        { provide: NotificationsService, useValue: { preferences, setSummaryFrequency } },
      ],
    });
  });

  async function render(current: SummaryFrequency = 'WEEKLY') {
    preferences.mockResolvedValue({ summaryFrequency: current });
    const fixture = TestBed.createComponent(NotificationPreferences);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const root: HTMLElement = fixture.nativeElement;
    const select = root.querySelector('select')!;
    return {
      root,
      select,
      choose: async (value: string) => {
        select.value = value;
        select.dispatchEvent(new Event('change'));
        await fixture.whenStable();
        fixture.detectChanges();
      },
    };
  }

  it('has a label that says what the choice is for', async () => {
    const { root, select } = await render();

    expect(root.querySelector(`label[for="${select.id}"]`)?.textContent).toBe(
      'Resumen de lo que cambió',
    );
  });

  it('offers the three frequencies in the words the person reads', async () => {
    const { select } = await render();

    expect([...select.options].map((option) => [option.value, option.text.trim()])).toEqual([
      ['DAILY', 'Diario'],
      ['WEEKLY', 'Semanal'],
      ['NONE', 'Ninguno'],
    ]);
  });

  it.each<[SummaryFrequency, string]>([
    ['DAILY', 'DAILY'],
    ['WEEKLY', 'WEEKLY'],
    ['NONE', 'NONE'],
  ])('shows the frequency the API has: %s', async (current, expected) => {
    const { select } = await render(current);

    expect(select.value).toBe(expected);
  });

  it('is disabled until the frequency is read', () => {
    preferences.mockReturnValue(new Promise(() => {}));
    const fixture = TestBed.createComponent(NotificationPreferences);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('select').disabled).toBe(true);
  });

  it('saves the frequency the person chooses', async () => {
    setSummaryFrequency.mockResolvedValue({ summaryFrequency: 'DAILY' });
    const { choose } = await render('WEEKLY');

    await choose('DAILY');

    expect(setSummaryFrequency.mock.calls).toEqual([['DAILY']]);
  });

  it('does not call the API when the choice is the one it already has', async () => {
    const { choose } = await render('WEEKLY');

    await choose('WEEKLY');

    expect(setSummaryFrequency).not.toHaveBeenCalled();
  });

  it('ignores a value that is not a frequency', async () => {
    const { choose } = await render('WEEKLY');

    await choose('HOURLY');

    expect(setSummaryFrequency).not.toHaveBeenCalled();
  });

  it('says it could not save, and keeps the frequency it had, when the API fails', async () => {
    setSummaryFrequency.mockRejectedValue(new Error('down'));
    const { root, choose } = await render('WEEKLY');

    await choose('NONE');

    expect(root.querySelector('[role="alert"]')?.textContent?.trim()).toBe(
      'No se pudo guardar. Reintenta en un momento.',
    );
  });

  it('says it could not read when the API fails', async () => {
    preferences.mockRejectedValue(new Error('down'));
    const fixture = TestBed.createComponent(NotificationPreferences);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('[role="alert"]')).not.toBeNull();
  });
});
