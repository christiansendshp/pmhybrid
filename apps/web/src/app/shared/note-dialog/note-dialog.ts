import { Component, inject } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import {
  MAT_DIALOG_DATA,
  MatDialogActions,
  MatDialogContent,
  MatDialogRef,
  MatDialogTitle,
} from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';

export interface NoteDialogData {
  title: string;
  /** The label of the field. */
  label: string;
  /** What the confirming button says. */
  confirm: string;
  /** A line under the field. */
  hint?: string;
}

/** The longest note the API takes with a move (Roadmap TASK-08). */
export const NOTE_MAX_LENGTH = 400;

/**
 * Asks for an optional line of text before something is done (Roadmap TASK-28): the reason a
 * task goes back from QA. It closes with the text, trimmed and possibly empty, when the person
 * confirms, and with nothing at all when they cancel, so the caller can tell "no reason" from "no move".
 */
@Component({
  selector: 'app-note-dialog',
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatDialogTitle,
    MatDialogContent,
    MatDialogActions,
  ],
  templateUrl: './note-dialog.html',
  styleUrl: './note-dialog.scss',
})
export class NoteDialog {
  private readonly dialogRef = inject<MatDialogRef<NoteDialog, string | undefined>>(MatDialogRef);
  readonly data = inject<NoteDialogData>(MAT_DIALOG_DATA);

  readonly maxLength = NOTE_MAX_LENGTH;
  readonly note = new FormControl('', { nonNullable: true });

  confirm(): void {
    this.dialogRef.close(this.note.value.trim());
  }

  cancel(): void {
    this.dialogRef.close(undefined);
  }
}
