import { TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  BrowseDirectoryResult,
  FilesystemBrowserService,
} from '../../core/filesystem-browser.service.js';
import { FolderBrowserDialog, FolderBrowserDialogData } from './folder-browser-dialog.js';

function result(overrides: Partial<BrowseDirectoryResult> = {}): BrowseDirectoryResult {
  return {
    path: 'C:\\Users\\me',
    parentPath: null,
    root: 'C:\\Users\\me',
    directories: [{ name: 'my-project-docs', path: 'C:\\Users\\me\\my-project-docs' }],
    documents: [
      { kind: 'roadmap', filename: 'Roadmap.md', found: false },
      { kind: 'agentslog', filename: 'Agentslog.md', found: false },
    ],
    ...overrides,
  };
}

describe('FolderBrowserDialog (Roadmap GAP-27)', () => {
  let browse: ReturnType<typeof vi.fn>;
  let close: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    browse = vi.fn();
    close = vi.fn();
  });

  function render(data: FolderBrowserDialogData | null = null) {
    TestBed.configureTestingModule({
      providers: [
        { provide: FilesystemBrowserService, useValue: { browse } },
        { provide: MatDialogRef, useValue: { close } },
        { provide: MAT_DIALOG_DATA, useValue: data },
      ],
    });
    const fixture = TestBed.createComponent(FolderBrowserDialog);
    fixture.detectChanges();
    const text = () =>
      ((fixture.nativeElement as HTMLElement).textContent ?? '').replace(/\s+/g, ' ');
    return { fixture, component: fixture.componentInstance, text };
  }

  it('loads the initial path on open and shows its subfolders and doc presence', async () => {
    browse.mockResolvedValue(
      result({
        documents: [
          { kind: 'roadmap', filename: 'Roadmap.md', found: true },
          { kind: 'agentslog', filename: 'Agentslog.md', found: false },
        ],
      }),
    );
    const { fixture, text } = render({ initialPath: 'C:\\Users\\me' });
    await fixture.whenStable();
    fixture.detectChanges();

    expect(browse).toHaveBeenCalledWith('C:\\Users\\me');
    expect(text()).toContain('my-project-docs');
    expect(text()).toContain('Roadmap.md');
    expect(text()).toContain('Agentslog.md');
  });

  it('navigates into a subfolder and back up', async () => {
    browse.mockResolvedValueOnce(result());
    const { fixture, component } = render();
    await fixture.whenStable();

    browse.mockResolvedValueOnce(
      result({
        path: 'C:\\Users\\me\\my-project-docs',
        parentPath: 'C:\\Users\\me',
        directories: [],
      }),
    );
    await component.open('C:\\Users\\me\\my-project-docs');
    expect(component.current()?.path).toBe('C:\\Users\\me\\my-project-docs');
    expect(component.current()?.parentPath).toBe('C:\\Users\\me');

    browse.mockResolvedValueOnce(result());
    await component.up();
    expect(browse).toHaveBeenLastCalledWith('C:\\Users\\me');
  });

  it('does nothing on up() at the root (no parentPath)', async () => {
    browse.mockResolvedValue(result({ parentPath: null }));
    const { fixture, component } = render();
    await fixture.whenStable();
    browse.mockClear();

    await component.up();

    expect(browse).not.toHaveBeenCalled();
  });

  it('closes the dialog with the currently viewed path on select()', async () => {
    browse.mockResolvedValue(result({ path: 'C:\\Users\\me\\chosen' }));
    const { fixture, component } = render();
    await fixture.whenStable();

    component.select();

    expect(close).toHaveBeenCalledWith('C:\\Users\\me\\chosen');
  });

  it('shows an error message when the browse call fails', async () => {
    browse.mockRejectedValue(new Error('boom'));
    const { fixture, text } = render();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(text()).toContain('No se pudo abrir esa carpeta.');
  });
});
