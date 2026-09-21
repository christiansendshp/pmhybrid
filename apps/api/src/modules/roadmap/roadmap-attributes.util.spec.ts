import { describe, expect, it } from 'vitest';
import { TaskPriority } from '@pmhybrid/shared-types';
import {
  entryTypeFromDocument,
  NON_WORK_ENTRY_TYPES,
  priorityFromDocument,
  priorityToDocument,
  progressFromDocument,
} from './roadmap-attributes.util.js';

describe('the attributes of a Roadmap entry (Roadmap GAP-35c)', () => {
  describe('priority', () => {
    it('reads the schema priorities and the four words, in any case', () => {
      expect(priorityFromDocument('P0')).toBe(TaskPriority.CRITICAL);
      expect(priorityFromDocument('P1')).toBe(TaskPriority.HIGH);
      expect(priorityFromDocument(' p2 ')).toBe(TaskPriority.MEDIUM);
      expect(priorityFromDocument('P3')).toBe(TaskPriority.LOW);
      expect(priorityFromDocument('critical')).toBe(TaskPriority.CRITICAL);
      expect(priorityFromDocument('Low')).toBe(TaskPriority.LOW);
    });

    it('ignores a value the app has no level for, rather than guessing one', () => {
      expect(priorityFromDocument('P9')).toBeUndefined();
      expect(priorityFromDocument('urgent')).toBeUndefined();
      expect(priorityFromDocument('')).toBeUndefined();
      expect(priorityFromDocument(2)).toBeUndefined();
      expect(priorityFromDocument(undefined)).toBeUndefined();
    });

    it('writes back what it reads, so a value survives the round trip', () => {
      for (const level of Object.values(TaskPriority)) {
        expect(priorityFromDocument(priorityToDocument(level))).toBe(level);
      }
    });

    it('writes P0-P3 unless the document spells its priorities as words', () => {
      expect(priorityToDocument(TaskPriority.HIGH)).toBe('P1');
      expect(priorityToDocument(TaskPriority.HIGH, 'P3')).toBe('P1');
      expect(priorityToDocument(TaskPriority.HIGH, 'LOW')).toBe('HIGH');
    });
  });

  describe('progress', () => {
    it('reads a whole percent from a number or a numeric string', () => {
      expect(progressFromDocument(0)).toBe(0);
      expect(progressFromDocument(40)).toBe(40);
      expect(progressFromDocument(100)).toBe(100);
      expect(progressFromDocument('75')).toBe(75);
      expect(progressFromDocument('75%')).toBe(75);
    });

    it('ignores anything else', () => {
      expect(progressFromDocument(-1)).toBeUndefined();
      expect(progressFromDocument(101)).toBeUndefined();
      expect(progressFromDocument(33.5)).toBeUndefined();
      expect(progressFromDocument('half')).toBeUndefined();
      expect(progressFromDocument(null)).toBeUndefined();
      expect(progressFromDocument(undefined)).toBeUndefined();
    });
  });

  describe('type', () => {
    it('is upper-cased, and absent when the entry says none', () => {
      expect(entryTypeFromDocument('gap')).toBe('GAP');
      expect(entryTypeFromDocument(' TASK ')).toBe('TASK');
      expect(entryTypeFromDocument('')).toBeUndefined();
      expect(entryTypeFromDocument(undefined)).toBeUndefined();
    });

    it('sets apart the entries that are not work, and only those', () => {
      expect(NON_WORK_ENTRY_TYPES).toEqual(
        expect.arrayContaining(['PHASE', 'EPIC', 'DECISION', 'BLOCKER']),
      );
      for (const work of ['TASK', 'SUBTASK', 'GAP', 'BUG', 'FEATURE']) {
        expect(NON_WORK_ENTRY_TYPES).not.toContain(work);
      }
    });
  });
});
