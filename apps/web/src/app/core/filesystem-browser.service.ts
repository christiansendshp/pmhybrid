import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { API_BASE_URL } from './api-base-url.js';

export interface FilesystemEntry {
  name: string;
  path: string;
}

export interface DocumentPresence {
  kind: string;
  filename: string;
  found: boolean;
}

/** A root the picker can jump to, named the way the user knows the folder (Roadmap UX-05). */
export interface BrowseRoot {
  path: string;
  label: string;
}

/** One step of the way from the root to the folder being viewed. */
export interface BrowseCrumb {
  name: string;
  path: string;
}

export interface BrowseDirectoryResult {
  /** The folder as the API sees it: what is stored as the project's docsPath. */
  path: string;
  /** The same folder as the user knows it (a Windows path), or `path` when nothing names it differently. */
  displayPath: string;
  parentPath: string | null;
  root: string;
  /** Every configured root (Roadmap BUG-11), not just `root` — the picker offers a way to jump to any of them. */
  roots: BrowseRoot[];
  /** From the root to the folder being viewed, the first being the root itself. */
  breadcrumbs: BrowseCrumb[];
  directories: FilesystemEntry[];
  documents: DocumentPresence[];
}

/** Backs the docsPath folder picker (Roadmap GAP-27) — browses the API server's own filesystem. */
@Injectable({ providedIn: 'root' })
export class FilesystemBrowserService {
  private readonly http = inject(HttpClient);

  browse(path?: string): Promise<BrowseDirectoryResult> {
    return firstValueFrom(
      this.http.get<BrowseDirectoryResult>(`${API_BASE_URL}/filesystem-browser/browse`, {
        params: path ? { path } : {},
      }),
    );
  }
}
