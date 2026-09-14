import { execFile } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import { Injectable } from '@nestjs/common';
import {
  FileRevisionInfo,
  ProjectRepositoryProvider,
} from './project-repository-provider.interface.js';

const execFileAsync = promisify(execFile);

/**
 * MVP implementation of ProjectRepositoryProvider: reads/writes a managed
 * project's own checked-out working tree on the local filesystem, and lists
 * revisions via `git log` against that same working tree (brief §20 —
 * "MVP puede comenzar con repositorios Git y archivos Markdown").
 */
@Injectable()
export class LocalFsGitProvider implements ProjectRepositoryProvider {
  async readFile(docsPath: string, relativePath: string): Promise<string> {
    return fs.readFile(path.join(docsPath, relativePath), 'utf-8');
  }

  async writeFile(
    docsPath: string,
    relativePath: string,
    content: string,
  ): Promise<void> {
    await fs.writeFile(path.join(docsPath, relativePath), content, 'utf-8');
  }

  async listRevisions(
    docsPath: string,
    relativePath: string,
  ): Promise<FileRevisionInfo[]> {
    try {
      const { stdout } = await execFileAsync(
        'git',
        ['log', '--follow', '--format=%H|%cI', '--', relativePath],
        { cwd: docsPath },
      );
      return stdout
        .split('\n')
        .filter((line) => line.trim().length > 0)
        .map((line) => {
          const [hash, isoDate] = line.split('|');
          return { hash, capturedAt: new Date(isoDate) };
        });
    } catch {
      // Not a git repo, or the file has no history yet — not fatal for MVP.
      return [];
    }
  }
}
