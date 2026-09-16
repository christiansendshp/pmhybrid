import { Component, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import {
  MAT_DIALOG_DATA,
  MatDialogActions,
  MatDialogClose,
  MatDialogContent,
  MatDialogRef,
  MatDialogTitle,
} from '@angular/material/dialog';
import { describeHttpError } from '../../core/http-error.js';
import {
  BrowseDirectoryResult,
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
 */
@Component({
  selector: 'app-folder-browser-dialog',
  imports: [MatButtonModule, MatDialogTitle, MatDialogContent, MatDialogActions, MatDialogClose],
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

  constructor() {
    void this.load(this.data?.initialPath);
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

  select(): void {
    const result = this.current();
    if (result) {
      this.dialogRef.close(result.path);
    }
  }

  private async load(path?: string): Promise<void> {
    this.loading.set(true);
    this.errorMessage.set(null);
    try {
      this.current.set(await this.filesystemBrowser.browse(path));
    } catch (error) {
      this.errorMessage.set(describeHttpError(error, 'No se pudo abrir esa carpeta.'));
    } finally {
      this.loading.set(false);
    }
  }
}
