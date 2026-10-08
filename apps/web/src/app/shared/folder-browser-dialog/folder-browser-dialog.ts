import { Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import {
  MAT_DIALOG_DATA,
  MatDialogActions,
  MatDialogClose,
  MatDialogContent,
  MatDialogRef,
  MatDialogTitle,
} from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { describeHttpError } from '../../core/http-error.js';
import {
  BrowseDirectoryResult,
  BrowseRoot,
  FilesystemBrowserService,
} from '../../core/filesystem-browser.service.js';

export interface FolderBrowserDialogData {
  /** Where to start browsing — typically the form's current docsPath, when it looks like a real path. */
  initialPath?: string;
}

/**
 * Lets the user pick a `docsPath` by browsing the API server's own local
 * filesystem, instead of typing a raw path (Roadmap GAP-27). A browser
 * folder picker can't hand a real OS path to a web app, and `docsPath` is
 * read server-side — so this dialog drives the server-side browse endpoint.
 *
 * Laid out as a folder explorer (Roadmap UX-05): quick access to each root, a
 * way up, the way from the root as clickable steps, a path field that takes a
 * pasted or typed path (the Windows way too), a filter, and the subfolders as
 * rows. Paths are shown as the user knows them; what the dialog hands back is
 * the folder as the API sees it, which is what gets stored.
 */
@Component({
  selector: 'app-folder-browser-dialog',
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatDialogTitle,
    MatDialogContent,
    MatDialogActions,
    MatDialogClose,
  ],
  templateUrl: './folder-browser-dialog.html',
  styleUrl: './folder-browser-dialog.scss',
})
export class FolderBrowserDialog {
  private readonly dialogRef = inject(MatDialogRef<FolderBrowserDialog, string>);
  private readonly filesystemBrowser = inject(FilesystemBrowserService);
  private readonly data = inject<FolderBrowserDialogData>(MAT_DIALOG_DATA, { optional: true });

  readonly loading = signal(true);
  readonly errorMessage = signal<string | null>(null);
  readonly current = signal<BrowseDirectoryResult | null>(null);

  /** The path field: shows where the dialog is, and takes a path to go to. */
  readonly pathControl = new FormControl('', { nonNullable: true });
  readonly filterControl = new FormControl('', { nonNullable: true });
  private readonly filterText = toSignal(this.filterControl.valueChanges, { initialValue: '' });

  /** The subfolders that match the filter, in the order the API sent them. */
  readonly visibleDirectories = computed(() => {
    const needle = this.filterText().trim().toLowerCase();
    const directories = this.current()?.directories ?? [];
    return needle
      ? directories.filter((directory) => directory.name.toLowerCase().includes(needle))
      : directories;
  });

  constructor() {
    void this.start(this.data?.initialPath);
  }

  /** The stored path may no longer exist or be allowed: then the dialog opens at the first root and says why. */
  private async start(initialPath?: string): Promise<void> {
    const opened = await this.load(initialPath);
    if (!opened && initialPath) {
      const reason = this.errorMessage();
      if (await this.load(undefined)) {
        this.errorMessage.set(reason);
      }
    }
  }

  async open(directoryPath: string): Promise<void> {
    await this.load(directoryPath);
  }

  async up(): Promise<void> {
    const parentPath = this.current()?.parentPath;
    if (parentPath) {
      await this.load(parentPath);
    }
  }

  /** Goes to the path in the field, as typed or pasted. */
  async goToTypedPath(): Promise<void> {
    const typed = this.pathControl.value.trim();
    if (typed) {
      await this.load(typed);
    }
  }

  select(): void {
    const result = this.current();
    if (result) {
      this.dialogRef.close(result.path);
    }
  }

  /** The short name of a root for its button; the whole path is its tooltip. */
  placeName(root: BrowseRoot): string {
    const parts = root.label.split(/[\\/]+/).filter(Boolean);
    return parts.at(-1) ?? root.label;
  }

  /** True when the browse worked. A failure leaves what was on screen where it was and says what went wrong. */
  private async load(path?: string): Promise<boolean> {
    this.loading.set(true);
    this.errorMessage.set(null);
    try {
      const result = await this.filesystemBrowser.browse(path);
      this.current.set(result);
      this.pathControl.setValue(result.displayPath);
      this.filterControl.setValue('');
      return true;
    } catch (error) {
      // The field keeps what was typed, to be corrected; the list stays where it was.
      this.errorMessage.set(describeHttpError(error, 'No se pudo abrir esa carpeta.'));
      return false;
    } finally {
      this.loading.set(false);
    }
  }
}
