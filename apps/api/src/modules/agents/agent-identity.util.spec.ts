import { describe, expect, it } from 'vitest';
import {
  identifierKey,
  identifierProblem,
  looksLikeCredential,
} from './agent-identity.util.js';

describe('agent identity (Roadmap TASK-01)', () => {
  describe('identifierKey', () => {
    it('folds case, spacing and Unicode composition, and keeps accents', () => {
      expect(identifierKey('  Claude-Sonnet-5-5 ')).toBe('claude-sonnet-5-5');
      expect(identifierKey('claude   sonnet')).toBe('claude sonnet');
      expect(identifierKey('Réviseur')).toBe(identifierKey('Réviseur'));
      expect(identifierKey('revisor')).not.toBe(identifierKey('révisor'));
    });
  });

  describe('identifierProblem', () => {
    it.each([
      'claude-sonnet-5-5',
      'codex',
      'Claude Code',
      'gemini-3.7-flash',
      'agente-qa_1',
    ])('accepts %s', (name) => {
      expect(identifierProblem(name)).toBeNull();
    });

    it('refuses an empty name, one that is too long, and one the ledger header cannot hold', () => {
      expect(identifierProblem('   ')).toMatch(/empty/);
      expect(identifierProblem('x'.repeat(101))).toMatch(/longer than 100/);
      expect(identifierProblem('a | b')).toMatch(/"\|"/);
      expect(identifierProblem('two\nlines')).toMatch(/line break/);
      expect(identifierProblem('tab\there')).toMatch(/control/);
    });

    it('refuses what looks like a credential and says why', () => {
      expect(identifierProblem('sk-ant-api03-ABCDEFGHIJKLMNOP')).toMatch(
        /credential/,
      );
      expect(identifierProblem('pmh_0123456789abcdef')).toMatch(/credential/);
      expect(identifierProblem('ghp_0123456789abcdefABCDEF')).toMatch(
        /credential/,
      );
      expect(identifierProblem('A'.repeat(40))).toMatch(/credential/);
    });
  });

  describe('looksLikeCredential', () => {
    it('is false for the names real agents carry', () => {
      for (const name of [
        'claude',
        'claude-opus-5-5',
        'gemini-3.7-flash',
        'qa-agent',
        'Codex CLI',
        'Akiaki',
        'skynet',
      ]) {
        expect(looksLikeCredential(name)).toBe(false);
      }
    });
  });
});
