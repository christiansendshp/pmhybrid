import { TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NOTE_MAX_LENGTH, NoteDialog, NoteDialogData } from './note-dialog.js';

const DATA: NoteDialogData = {
  title: 'Devolver a desarrollo',
  label: 'Motivo (opcional)',
  confirm: 'Devolver',
  hint: 'Se escribe en el registro del proyecto.',
};

describe('NoteDialog (Roadmap TASK-28)', () => {
  let close: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    close = vi.fn();
    TestBed.configureTestingModule({
      imports: [NoteDialog],
      providers: [
        { provide: MAT_DIALOG_DATA, useValue: DATA },
        { provide: MatDialogRef, useValue: { close } },
      ],
    });
  });

  function render() {
    const fixture = TestBed.createComponent(NoteDialog);
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    const button = (label: string) =>
      Array.from(root.querySelectorAll('button')).find((candidate) =>
        candidate.textContent?.includes(label),
      );
    return { fixture, root, button };
  }

  it('says what it asks, with the confirming button and the hint it was given', () => {
    const { root, button } = render();

    expect(root.textContent).toContain('Devolver a desarrollo');
    expect(root.textContent).toContain('Motivo (opcional)');
    expect(root.textContent).toContain('Se escribe en el registro del proyecto.');
    expect(button('Devolver')).toBeDefined();
  });

  it('closes with the text the person wrote, trimmed', () => {
    const { fixture, button } = render();

    fixture.componentInstance.note.setValue('  falta el caso vacío  ');
    button('Devolver')!.click();

    expect(close).toHaveBeenCalledWith('falta el caso vacío');
  });

  it('closes with an empty text, not with nothing, when the person confirms without writing', () => {
    const { button } = render();

    button('Devolver')!.click();

    expect(close).toHaveBeenCalledWith('');
  });

  it('closes with nothing when the person cancels, even after writing', () => {
    const { fixture, button } = render();

    fixture.componentInstance.note.setValue('algo');
    button('Cancelar')!.click();

    expect(close).toHaveBeenCalledWith(undefined);
  });

  it('limits the text to what the API takes', () => {
    const { root } = render();

    expect(root.querySelector('textarea')!.getAttribute('maxlength')).toBe(String(NOTE_MAX_LENGTH));
  });
});
