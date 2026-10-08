import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  folderKey,
  fromHostPath,
  parseHostMounts,
  toHostPath,
} from './host-mounts.js';

const DOCUMENTS = path.resolve('/data/documents');
const EXTRA = path.resolve('/data/extra-docs');
const MOUNTS = parseHostMounts(
  '/data/documents|C:/Users/me/Documents;/data/extra-docs|C:\\Users\\me\\Documents\\PROYECTO\\SMARTHR\\docs\\',
);

describe('host mounts (Roadmap UX-05)', () => {
  describe('parseHostMounts', () => {
    it('reads container|host pairs separated by ;, with either slash and a trailing one', () => {
      expect(MOUNTS).toEqual([
        { container: DOCUMENTS, host: 'C:/Users/me/Documents' },
        {
          container: EXTRA,
          host: 'C:/Users/me/Documents/PROYECTO/SMARTHR/docs',
        },
      ]);
    });

    it('is empty for nothing, and ignores a pair that is not one', () => {
      expect(parseHostMounts(undefined)).toEqual([]);
      expect(parseHostMounts('')).toEqual([]);
      expect(parseHostMounts('/data/x;no-pipe;/a|b|c;|C:/x;/y|')).toEqual([]);
    });

    it('ignores a host path that is relative, which says nothing a person could use', () => {
      expect(
        parseHostMounts('/data/projects|./deploy/projects;/data/x|../up'),
      ).toEqual([]);
      expect(parseHostMounts('/data/x|/home/me/docs')).toEqual([
        { container: path.resolve('/data/x'), host: '/home/me/docs' },
      ]);
    });
  });

  describe('toHostPath', () => {
    it('shows a folder as the user knows it, with backslashes for a drive path', () => {
      expect(toHostPath(DOCUMENTS, MOUNTS)).toBe('C:\\Users\\me\\Documents');
      expect(
        toHostPath(path.join(DOCUMENTS, 'PROYECTO', 'SMARTHR'), MOUNTS),
      ).toBe('C:\\Users\\me\\Documents\\PROYECTO\\SMARTHR');
    });

    it('goes through the mount that holds the folder most closely', () => {
      expect(toHostPath(path.join(EXTRA, 'roadmaps'), MOUNTS)).toBe(
        'C:\\Users\\me\\Documents\\PROYECTO\\SMARTHR\\docs\\roadmaps',
      );
    });

    it('leaves a folder no mount holds as it is', () => {
      const elsewhere = path.resolve('/data/projects/x');
      expect(toHostPath(elsewhere, MOUNTS)).toBe(elsewhere);
      expect(toHostPath(elsewhere, [])).toBe(elsewhere);
    });
  });

  describe('fromHostPath', () => {
    it('reads a path written the Windows way, in any case and with either slash', () => {
      expect(fromHostPath('C:\\Users\\me\\Documents', MOUNTS)).toBe(DOCUMENTS);
      expect(fromHostPath('c:/users/ME/documents/PROYECTO/x/', MOUNTS)).toBe(
        path.join(DOCUMENTS, 'PROYECTO', 'x'),
      );
    });

    it('prefers the mount that holds the path most closely', () => {
      expect(
        fromHostPath(
          'C:\\Users\\me\\Documents\\PROYECTO\\SMARTHR\\docs\\a',
          MOUNTS,
        ),
      ).toBe(path.join(EXTRA, 'a'));
    });

    it('is null for a path no mount holds, or one that is not a drive path', () => {
      expect(fromHostPath('D:\\other', MOUNTS)).toBeNull();
      expect(fromHostPath('C:\\Users\\me\\Documents-old', MOUNTS)).toBeNull();
      expect(fromHostPath('/data/documents/x', MOUNTS)).toBeNull();
      expect(fromHostPath('C:\\Users\\me\\Documents', [])).toBeNull();
    });

    it('lets ".." through only as a candidate that the roots will refuse', () => {
      const candidate = fromHostPath(
        'C:\\Users\\me\\Documents\\..\\..\\Windows',
        MOUNTS,
      );

      // Collapsed by the join: it is no longer under the mount, so no root holds it.
      expect(candidate).toBe(
        path.join(path.dirname(path.dirname(DOCUMENTS)), 'Windows'),
      );
      expect(candidate!.startsWith(DOCUMENTS)).toBe(false);
    });
  });

  describe('folderKey', () => {
    it('is the same for a folder reached through two mounts, and however it is written', () => {
      const viaDocuments = path.join(DOCUMENTS, 'PROYECTO', 'SMARTHR', 'docs');

      expect(folderKey(viaDocuments, MOUNTS)).toBe(folderKey(EXTRA, MOUNTS));
      expect(folderKey(`${EXTRA}${path.sep}`, MOUNTS)).toBe(
        folderKey(EXTRA, MOUNTS),
      );
    });

    it('differs for different folders, and falls back to the container path without a mount', () => {
      expect(folderKey(path.join(DOCUMENTS, 'a'), MOUNTS)).not.toBe(
        folderKey(path.join(DOCUMENTS, 'b'), MOUNTS),
      );
      expect(folderKey(path.resolve('/data/projects/x'), [])).toBe(
        folderKey(path.resolve('/data/projects/x/'), []),
      );
    });
  });
});
