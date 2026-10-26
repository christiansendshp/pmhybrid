import { describe, expect, it } from 'vitest';
import { LIMITS } from '../../common/dto-limits.js';
import { titleOfClosedWork } from './untracked-title.util.js';

describe('titleOfClosedWork (Roadmap TASK-34)', () => {
  it('is what the closing entry says it did', () => {
    expect(titleOfClosedWork('X-1', 'Fixed the importer')).toBe(
      'Fixed the importer',
    );
  });

  it('is one line, however the entry broke it', () => {
    expect(titleOfClosedWork('X-1', '  Fixed\nthe   importer\r\n')).toBe(
      'Fixed the importer',
    );
  });

  it('is the ID when the entry says nothing', () => {
    expect(titleOfClosedWork('X-1', '   ')).toBe('X-1');
  });

  it('is cut at the longest a title may be, with an ellipsis, never beyond it', () => {
    const title = titleOfClosedWork('X-1', 'word '.repeat(200));

    expect(title.length).toBeLessThanOrEqual(LIMITS.TITLE);
    expect(title.endsWith('…')).toBe(true);
  });

  it('keeps a title that is exactly as long as it may be', () => {
    const exact = 'a'.repeat(LIMITS.TITLE);

    expect(titleOfClosedWork('X-1', exact)).toBe(exact);
  });
});
