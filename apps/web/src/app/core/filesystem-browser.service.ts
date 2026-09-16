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

export interface BrowseDirectoryResult {
  path: string;
  parentPath: string | null;
  root: string;
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
