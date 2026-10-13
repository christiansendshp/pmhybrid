import { describe, expect, it } from 'vitest';
import { ledgerDivergenceText, ledgerDiverges } from './ledger-stage.js';
import { TaskStatus } from './tasks.service.js';

describe('ledgerDiverges (Roadmap TASK-14)', () => {
  const all: TaskStatus[] = ['PENDIENTE', 'ASIGNADA', 'EN_DESARROLLO', 'QA', 'TERMINADA'];

  it('never says a task whose ledger says nothing about its stage disagrees', () => {
    for (const status of all) {
      expect(ledgerDiverges(null, status), status).toBe(false);
      expect(ledgerDiverges(undefined, status), status).toBe(false);
    }
  });

  it('agrees when the stage is the status', () => {
    for (const status of all) {
      expect(ledgerDiverges(status, status), status).toBe(false);
    }
  });

  it('takes a start in the ledger for development or QA, as the sync reads a coarse row', () => {
    expect(ledgerDiverges('EN_DESARROLLO', 'QA')).toBe(false);
  });

  it('disagrees on every other pair, in both directions where it is not the coarse one', () => {
    expect(ledgerDiverges('QA', 'EN_DESARROLLO')).toBe(true);
    expect(ledgerDiverges('TERMINADA', 'EN_DESARROLLO')).toBe(true);
    expect(ledgerDiverges('TERMINADA', 'QA')).toBe(true);
    expect(ledgerDiverges('EN_DESARROLLO', 'PENDIENTE')).toBe(true);
    expect(ledgerDiverges('EN_DESARROLLO', 'TERMINADA')).toBe(true);
    expect(ledgerDiverges('ASIGNADA', 'PENDIENTE')).toBe(true);
    expect(ledgerDiverges('QA', 'TERMINADA')).toBe(true);
  });
});

describe('ledgerDivergenceText', () => {
  it('writes both stages, the ledger first', () => {
    expect(ledgerDivergenceText('QA', 'EN_DESARROLLO')).toBe(
      'Registro: QA · PM Hub: EN DESARROLLO',
    );
  });
});
