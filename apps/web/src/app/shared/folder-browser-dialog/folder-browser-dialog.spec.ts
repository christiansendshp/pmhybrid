import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  BrowseDirectoryResult,
  FilesystemBrowserService,
} from '../../core/filesystem-browser.service.js';
import { FolderBrowserDialog, FolderBrowserDialogData } from './folder-browser-dialog.js';

const DOCS = '/data/documents';
const DOCS_HOST = 'C:\\Users\\me\\Documents';

function result(overrides: Partial<BrowseDirectoryResult> = {}): BrowseDirectoryResult {
  return {
    path: DOCS,
    displayPath: DOCS_HOST,
    parentPath: null,
    root: DOCS,
    roots: [{ path: DOCS, label: DOCS_HOST }],
    breadcrumbs: [{ name: DOCS_HOST, path: DOCS }],
    directories: [
      { name: 'my-project-docs', path: `${DOCS}/my-project-docs` },
      { name: 'PROYECTO', path: `${DOCS}/PROYECTO` },
      { name: 'Otras cosas', path: `${DOCS}/Otras cosas` },
    ],
    documents: [
      { kind: 'roadmap', filename: 'Roadmap.md', found: false },
      { kind: 'agentslog', filename: 'Agentslog.md', found: false },
    ],
    ...overrides,
  };
}

describe('FolderBrowserDialog (Roadmap GAP-27, UX-05)', () => {
  let browse: ReturnType<typeof vi.fn>;
  let close: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    browse = vi.fn();
    close = vi.fn();
  });

  async function render(data: FolderBrowserDialogData | null = null) {
    TestBed.configureTestingModule({
      providers: [
        { provide: FilesystemBrowserService, useValue: { browse } },
        { provide: MatDialogRef, useValue: { close } },
        { provide: MAT_DIALOG_DATA, useValue: data },
      ],
    });
    const fixture = TestBed.createComponent(FolderBrowserDialog);
    fixture.detectChanges();
    // The dialog may browse twice on opening (a stored path that no longer opens): let both finish.
    await new Promise((resolve) => setTimeout(resolve));
    await fixture.whenStable();
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    const text = () => (root.textContent ?? '').replace(/\s+/g, ' ');
    const settle = async () => {
      await fixture.whenStable();
      fixture.detectChanges();
    };
    const pathField = () => root.querySelector<HTMLInputElement>('.folder-browser__field input')!;
    return { fixture, component: fixture.componentInstance, root, text, settle, pathField };
  }

  it('loads the initial path on open and shows its subfolders, the doc presence and where it is', async () => {
    browse.mockResolvedValue(
      result({
        documents: [
          { kind: 'roadmap', filename: 'Roadmap.md', found: true },
          { kind: 'agentslog', filename: 'Agentslog.md', found: false },
        ],
      }),
    );
    const { root, text, pathField } = await render({ initialPath: DOCS });

    expect(browse).toHaveBeenCalledWith(DOCS);
    expect(text()).toContain('my-project-docs');
    expect(text()).toContain('Roadmap.md');
    expect(text()).toContain('Agentslog.md');
    // Paths are shown the way the user knows them.
    expect(pathField().value).toBe(DOCS_HOST);
    expect(root.querySelector('.folder-browser__chosen code')?.textContent).toBe(DOCS_HOST);
  });

  it('navigates into a subfolder by clicking it, and back up', async () => {
    browse.mockResolvedValueOnce(result());
    const { component, root, settle, pathField } = await render();

    browse.mockResolvedValueOnce(
      result({
        path: `${DOCS}/PROYECTO`,
        displayPath: `${DOCS_HOST}\\PROYECTO`,
        parentPath: DOCS,
        directories: [],
        breadcrumbs: [
          { name: DOCS_HOST, path: DOCS },
          { name: 'PROYECTO', path: `${DOCS}/PROYECTO` },
        ],
      }),
    );
    const entry = Array.from(
      root.querySelectorAll<HTMLButtonElement>('.folder-browser__entry'),
    ).find((button) => button.textContent?.includes('PROYECTO'))!;
    entry.click();
    await settle();

    expect(browse).toHaveBeenLastCalledWith(`${DOCS}/PROYECTO`);
    expect(component.current()?.parentPath).toBe(DOCS);
    expect(pathField().value).toBe(`${DOCS_HOST}\\PROYECTO`);

    browse.mockResolvedValueOnce(result());
    await component.up();
    expect(browse).toHaveBeenLastCalledWith(DOCS);
  });

  it('does nothing on up() at the root (no parentPath), and the button says so', async () => {
    browse.mockResolvedValue(result({ parentPath: null }));
    const { component, root } = await render();
    browse.mockClear();

    await component.up();

    expect(browse).not.toHaveBeenCalled();
    expect(root.querySelector<HTMLButtonElement>('.folder-browser__up')!.disabled).toBe(true);
  });

  it('closes with the folder as the API sees it, which is what gets stored, not the one shown', async () => {
    browse.mockResolvedValue(
      result({ path: `${DOCS}/chosen`, displayPath: `${DOCS_HOST}\\chosen` }),
    );
    const { component } = await render();

    component.select();

    expect(close).toHaveBeenCalledWith(`${DOCS}/chosen`);
  });

  describe('the way from the root', () => {
    const deep = () =>
      result({
        path: `${DOCS}/PROYECTO/SMARTHR`,
        displayPath: `${DOCS_HOST}\\PROYECTO\\SMARTHR`,
        parentPath: `${DOCS}/PROYECTO`,
        breadcrumbs: [
          { name: DOCS_HOST, path: DOCS },
          { name: 'PROYECTO', path: `${DOCS}/PROYECTO` },
          { name: 'SMARTHR', path: `${DOCS}/PROYECTO/SMARTHR` },
        ],
      });

    it('shows every step, each one but the last a way back to it', async () => {
      browse.mockResolvedValueOnce(deep());
      const { root } = await render();

      const steps = Array.from(root.querySelectorAll('.folder-browser__crumbs li'));
      expect(steps.map((step) => step.textContent?.replace(/[\s›]+/g, ' ').trim())).toEqual([
        DOCS_HOST,
        'PROYECTO',
        'SMARTHR',
      ]);
      expect(steps[0].querySelector('button')).not.toBeNull();
      expect(steps[2].querySelector('button')).toBeNull();
      expect(steps[2].querySelector('[aria-current="location"]')?.textContent).toContain('SMARTHR');
    });

    it('goes to a step when it is clicked', async () => {
      browse.mockResolvedValueOnce(deep());
      const { root, settle } = await render();
      browse.mockResolvedValueOnce(result());

      root.querySelector<HTMLButtonElement>('.folder-browser__crumbs li button')!.click();
      await settle();

      expect(browse).toHaveBeenLastCalledWith(DOCS);
    });
  });

  describe('quick access to the roots (Roadmap BUG-11)', () => {
    const TWO = [
      { path: DOCS, label: DOCS_HOST },
      { path: '/data/projects', label: '/data/projects' },
    ];

    it('offers none with a single root', async () => {
      browse.mockResolvedValue(result());
      const { root } = await render();

      expect(root.querySelector('.folder-browser__places')).toBeNull();
    });

    it('offers each root by its short name, with the whole path as its tooltip, and jumps to one on click', async () => {
      browse.mockResolvedValueOnce(result({ roots: TWO }));
      const { root, settle } = await render();
      const places = Array.from(root.querySelectorAll<HTMLButtonElement>('.folder-browser__place'));

      expect(places.map((place) => place.textContent?.trim())).toEqual(['Documents', 'projects']);
      expect(places[0].getAttribute('title')).toBe(DOCS_HOST);
      expect(places[0].getAttribute('aria-current')).toBe('true');
      expect(places[1].hasAttribute('aria-current')).toBe(false);

      browse.mockResolvedValueOnce(
        result({
          path: '/data/projects',
          displayPath: '/data/projects',
          root: '/data/projects',
          roots: TWO,
          directories: [],
          breadcrumbs: [{ name: '/data/projects', path: '/data/projects' }],
        }),
      );
      places[1].click();
      await settle();

      expect(browse).toHaveBeenLastCalledWith('/data/projects');
    });
  });

  describe('the path field', () => {
    it('goes to the path typed in it when Enter is pressed, the Windows way or the API way', async () => {
      browse.mockResolvedValueOnce(result());
      const { pathField, settle } = await render();
      browse.mockResolvedValueOnce(
        result({ path: `${DOCS}/PROYECTO`, displayPath: `${DOCS_HOST}\\PROYECTO` }),
      );

      const field = pathField();
      field.value = `${DOCS_HOST}\\PROYECTO`;
      field.dispatchEvent(new Event('input'));
      field.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
      await settle();

      expect(browse).toHaveBeenLastCalledWith(`${DOCS_HOST}\\PROYECTO`);
      expect(pathField().value).toBe(`${DOCS_HOST}\\PROYECTO`);
    });

    it('goes with the "Ir" button too, ignores blanks and keeps what was typed when the path is refused', async () => {
      browse.mockResolvedValueOnce(result());
      const { component, root, pathField, settle, text } = await render();
      browse.mockClear();

      pathField().value = '   ';
      pathField().dispatchEvent(new Event('input'));
      await component.goToTypedPath();
      expect(browse).not.toHaveBeenCalled();

      browse.mockRejectedValueOnce(
        new HttpErrorResponse({
          status: 400,
          error: { message: 'Path is outside the allowed roots for project documents' },
        }),
      );
      pathField().value = 'D:\\somewhere';
      pathField().dispatchEvent(new Event('input'));
      root.querySelector<HTMLButtonElement>('.folder-browser__go')!.click();
      await settle();

      expect(browse).toHaveBeenCalledWith('D:\\somewhere');
      expect(text()).toContain('Path is outside the allowed roots for project documents');
      // The typed text stays to be corrected, and the folder on screen does not change.
      expect(pathField().value).toBe('D:\\somewhere');
      expect(text()).toContain('my-project-docs');
    });
  });

  describe('the filter', () => {
    it('narrows the subfolders without regard to case, says when none matches, and clears on moving', async () => {
      browse.mockResolvedValueOnce(result());
      const { component, root, settle, text } = await render();
      const filter = () => root.querySelector<HTMLInputElement>('.folder-browser__filter input')!;

      filter().value = 'proy';
      filter().dispatchEvent(new Event('input'));
      await settle();
      expect(
        Array.from(root.querySelectorAll('.folder-browser__entry-name')).map((n) => n.textContent),
      ).toEqual(['PROYECTO']);

      filter().value = 'zzz';
      filter().dispatchEvent(new Event('input'));
      await settle();
      expect(text()).toContain('Ninguna carpeta coincide con el filtro.');

      browse.mockResolvedValueOnce(result({ path: `${DOCS}/PROYECTO`, directories: [] }));
      await component.open(`${DOCS}/PROYECTO`);
      await settle();
      expect(filter().value).toBe('');
      expect(text()).toContain('Esta carpeta no tiene subcarpetas.');
    });
  });

  describe('when the browse fails', () => {
    it('shows an error message when it fails at the start', async () => {
      browse.mockRejectedValue(new Error('boom'));
      const { text } = await render();

      expect(text()).toContain('No se pudo abrir esa carpeta.');
    });

    it('opens at the first root, and says why, when the stored path can no longer be opened', async () => {
      browse.mockRejectedValueOnce(
        new HttpErrorResponse({
          status: 400,
          error: { message: 'Directory not found: /old/path' },
        }),
      );
      browse.mockResolvedValueOnce(result());
      const { text, pathField } = await render({ initialPath: '/old/path' });

      expect(browse).toHaveBeenNthCalledWith(1, '/old/path');
      expect(browse).toHaveBeenNthCalledWith(2, undefined);
      expect(text()).toContain('Directory not found: /old/path');
      expect(text()).toContain('my-project-docs');
      expect(pathField().value).toBe(DOCS_HOST);
    });

    it('does not let a folder be chosen before one has opened', async () => {
      browse.mockRejectedValue(new Error('boom'));
      const { root } = await render();
      const choose = Array.from(root.querySelectorAll('button')).find((button) =>
        button.textContent?.includes('Elegir esta carpeta'),
      )!;

      expect((choose as HTMLButtonElement).disabled).toBe(true);
    });
  });
});
