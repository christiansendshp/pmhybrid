import { TaskStatus } from '@pmhybrid/shared-types';
import { describe, expect, it } from 'vitest';
import {
  classifyLedgerWord,
  derivedStage,
  latestEntryByTask,
  ledgerStageOf,
  reviewResultOf,
  stageOfEntry,
} from './ledger-status.util.js';

describe('classifyLedgerWord (Roadmap TASK-06)', () => {
  it.each([
    ['IN_PROGRESS', 'IN_PROGRESS', null],
    ['IN PROGRESS', 'IN_PROGRESS', null],
    ['in_progress', 'IN_PROGRESS', null],
    ['PAUSE', 'PAUSE', null],
    ['DONE', 'DONE', null],
    ['TODO', 'TODO', null],
    ['REVIEW', 'REVIEW', null],
    ['TESTING', 'REVIEW', null],
    ['QA_REVIEW', 'REVIEW', null],
    ['ASSIGNED', 'ASSIGNED', null],
    ['READY', 'ASSIGNED', null],
  ])('reads %j as %s with no qualifier', (word, canonical, qualifier) => {
    expect(classifyLedgerWord(word)).toEqual({
      canonicalStatus: canonical,
      qualifier,
    });
  });

  it.each([
    [
      'IN_PROGRESS (revisión, 3 correcciones antes de la próxima ronda)',
      'IN_PROGRESS',
      'revisión, 3 correcciones antes de la próxima ronda',
    ],
    ['IN_PROGRESS (impacto wireado)', 'IN_PROGRESS', 'impacto wireado'],
    ['DONE (hallazgo, sin codigo)', 'DONE', 'hallazgo, sin codigo'],
    ['DONE (análisis, sin código)', 'DONE', 'análisis, sin código'],
    ['DONE (2da ronda, pedido del PO)', 'DONE', '2da ronda, pedido del PO'],
    [
      'DONE (3ra y 4ta ronda, pedido del PO)',
      'DONE',
      '3ra y 4ta ronda, pedido del PO',
    ],
    ['DONE (verificacion post-cierre)', 'DONE', 'verificacion post-cierre'],
    ['REVIEW — passed once', 'REVIEW', 'passed once'],
    ['PAUSE: waiting', 'PAUSE', 'waiting'],
  ])('keeps the qualifier of %j', (word, canonical, qualifier) => {
    expect(classifyLedgerWord(word)).toEqual({
      canonicalStatus: canonical,
      qualifier,
    });
  });

  it.each([
    ['DONE parcial', 'parcial'],
    ['DONE partial', 'partial'],
    ['DONE (2 de 3 partes)', '2 de 3 partes'],
    ['DONE (chunk 1/2)', 'chunk 1/2'],
    ['DONE (chunk 2/2)', 'chunk 2/2'],
    ['DONE (1 of 4)', '1 of 4'],
  ])(
    'reads %j as a partial close, never as the terminal DONE',
    (word, qualifier) => {
      expect(classifyLedgerWord(word)).toEqual({
        canonicalStatus: 'DONE_PARTIAL',
        qualifier,
      });
    },
  );

  it('does not take a word that merely starts like a known one', () => {
    for (const word of [
      'DONEZO',
      'TODOS',
      'REVIEWER',
      'PAUSED',
      'INPROGRESS',
      'READYMADE',
    ]) {
      expect(classifyLedgerWord(word).canonicalStatus, word).toBeNull();
    }
  });

  it('leaves the words it does not know exactly as they are today: no canonical status, no qualifier', () => {
    for (const word of [
      'HALLAZGO',
      'SUPERADO (sin cambios de código)',
      'DESCARTADA',
      'BLOQUEADO_PO',
      'N/A',
      'EN CURSO — corrección sobre la marcha',
      'intento revertido, sin commitear (hipótesis falsa)',
      '',
    ]) {
      expect(classifyLedgerWord(word), word).toEqual({
        canonicalStatus: null,
        qualifier: null,
      });
    }
  });

  it('ignores the spacing around a word and treats an empty qualifier as none', () => {
    expect(classifyLedgerWord('  DONE  ')).toEqual({
      canonicalStatus: 'DONE',
      qualifier: null,
    });
    expect(classifyLedgerWord('DONE ()')).toEqual({
      canonicalStatus: 'DONE',
      qualifier: null,
    });
  });
});

describe('reviewResultOf', () => {
  it('reads PASS or FAIL from the start of a Review line, whatever the case, and nothing else', () => {
    expect(reviewResultOf('PASS - looks right')).toBe('PASS');
    expect(reviewResultOf('fail - the edge case')).toBe('FAIL');
    expect(reviewResultOf('  FAIL')).toBe('FAIL');
    expect(reviewResultOf('PASSED - almost')).toBeUndefined();
    expect(reviewResultOf('maybe')).toBeUndefined();
    expect(reviewResultOf('')).toBeUndefined();
    expect(reviewResultOf(undefined)).toBeUndefined();
  });
});

describe('stageOfEntry', () => {
  it('is QA for a review that is waiting or passed, and the developer again for one that failed', () => {
    expect(stageOfEntry({ statusWord: 'REVIEW' })).toBe(TaskStatus.QA);
    expect(stageOfEntry({ statusWord: 'REVIEW', review: 'PASS' })).toBe(
      TaskStatus.QA,
    );
    expect(stageOfEntry({ statusWord: 'TESTING' })).toBe(TaskStatus.QA);
    expect(stageOfEntry({ statusWord: 'QA_REVIEW' })).toBe(TaskStatus.QA);
    expect(stageOfEntry({ statusWord: 'REVIEW', review: 'FAIL' })).toBe(
      TaskStatus.EN_DESARROLLO,
    );
  });

  it('is development for a start, with or without a qualifier, and assigned for an assignment', () => {
    expect(stageOfEntry({ statusWord: 'IN_PROGRESS' })).toBe(
      TaskStatus.EN_DESARROLLO,
    );
    expect(
      stageOfEntry({ statusWord: 'IN_PROGRESS (revisión, 3 correcciones)' }),
    ).toBe(TaskStatus.EN_DESARROLLO);
    expect(stageOfEntry({ statusWord: 'ASSIGNED' })).toBe(TaskStatus.ASIGNADA);
    expect(stageOfEntry({ statusWord: 'READY' })).toBe(TaskStatus.ASIGNADA);
  });

  it('says nothing of the stage for a pause, a close, a to-do or a word it does not know', () => {
    for (const word of [
      'PAUSE',
      'DONE',
      'DONE parcial',
      'TODO',
      'HALLAZGO',
      '',
    ]) {
      expect(stageOfEntry({ statusWord: word }), word).toBeNull();
    }
  });
});

describe('latestEntryByTask (Roadmap TASK-07)', () => {
  const entry = (task: string, word: string, archived = false) => ({
    taskExternalId: task,
    statusWord: word,
    ...(archived ? { archived: true as const } : {}),
  });

  it('is the last entry written for each task, in file order, not the one with the latest clock', () => {
    const latest = latestEntryByTask([
      entry('A', 'IN_PROGRESS'),
      entry('B', 'IN_PROGRESS'),
      entry('A', 'REVIEW'),
    ]);

    expect(latest.get('A')?.statusWord).toBe('REVIEW');
    expect(latest.get('B')?.statusWord).toBe('IN_PROGRESS');
    expect(latest.size).toBe(2);
  });

  it('prefers the hot ledger over the archive, and falls back to the archive for a task the hot ledger lacks', () => {
    const latest = latestEntryByTask([
      entry('A', 'REVIEW'),
      entry('A', 'DONE', true),
      entry('B', 'DONE', true),
      entry('B', 'REVIEW', true),
    ]);

    expect(latest.get('A')?.statusWord).toBe('REVIEW');
    expect(latest.get('B')?.statusWord).toBe('REVIEW');
  });
});

describe('derivedStage (Roadmap TASK-07)', () => {
  it('gives QA to an IN_PROGRESS row whose latest entry is a review, and development back after a failed one or a new start', () => {
    expect(derivedStage('IN_PROGRESS', { statusWord: 'REVIEW' })).toBe(
      TaskStatus.QA,
    );
    expect(
      derivedStage('IN_PROGRESS', { statusWord: 'REVIEW', review: 'PASS' }),
    ).toBe(TaskStatus.QA);
    expect(
      derivedStage('IN_PROGRESS', { statusWord: 'REVIEW', review: 'FAIL' }),
    ).toBe(TaskStatus.EN_DESARROLLO);
    expect(derivedStage('IN_PROGRESS', { statusWord: 'IN_PROGRESS' })).toBe(
      TaskStatus.EN_DESARROLLO,
    );
  });

  it('gives ASIGNADA to a TODO row whose latest entry is an assignment, and nothing else', () => {
    expect(derivedStage('TODO', { statusWord: 'ASSIGNED' })).toBe(
      TaskStatus.ASIGNADA,
    );
    expect(derivedStage('TODO', { statusWord: 'READY' })).toBe(
      TaskStatus.ASIGNADA,
    );
    expect(derivedStage('TODO', { statusWord: 'REVIEW' })).toBeNull();
    expect(derivedStage('TODO', { statusWord: 'IN_PROGRESS' })).toBeNull();
  });

  it('never lets the ledger decide for a row that says DONE, or for a row whose word it does not know', () => {
    for (const word of ['REVIEW', 'IN_PROGRESS', 'ASSIGNED', 'DONE']) {
      expect(derivedStage('DONE', { statusWord: word }), word).toBeNull();
      expect(derivedStage(undefined, { statusWord: word }), word).toBeNull();
    }
  });

  it('says nothing when the entry says nothing about the stage', () => {
    for (const word of ['PAUSE', 'DONE', 'DONE parcial', 'HALLAZGO']) {
      expect(
        derivedStage('IN_PROGRESS', { statusWord: word }),
        word,
      ).toBeNull();
      expect(derivedStage('TODO', { statusWord: word }), word).toBeNull();
    }
  });
});

describe('ledgerStageOf (Roadmap TASK-14)', () => {
  it('is the stage of the word, and TERMINADA for the exact closing word', () => {
    expect(ledgerStageOf({ statusWord: 'REVIEW' })).toBe(TaskStatus.QA);
    expect(ledgerStageOf({ statusWord: 'REVIEW', review: 'FAIL' })).toBe(
      TaskStatus.EN_DESARROLLO,
    );
    expect(ledgerStageOf({ statusWord: 'IN_PROGRESS (impacto wireado)' })).toBe(
      TaskStatus.EN_DESARROLLO,
    );
    expect(ledgerStageOf({ statusWord: 'ASSIGNED' })).toBe(TaskStatus.ASIGNADA);
    expect(ledgerStageOf({ statusWord: 'DONE' })).toBe(TaskStatus.TERMINADA);
    expect(ledgerStageOf({ statusWord: 'DONE (hallazgo, sin codigo)' })).toBe(
      TaskStatus.TERMINADA,
    );
  });

  it('says nothing for a partial close, a pause, a to-do or a word it does not know', () => {
    for (const word of [
      'DONE parcial',
      'DONE (2 de 3 partes)',
      'PAUSE',
      'TODO',
      'HALLAZGO',
    ]) {
      expect(ledgerStageOf({ statusWord: word }), word).toBeNull();
    }
  });
});
