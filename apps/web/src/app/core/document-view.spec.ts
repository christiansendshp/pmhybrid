import { describe, expect, it } from 'vitest';
import { extractHeadings, findMatchingLines, highlightSegments } from './document-view.js';

describe('extractHeadings', () => {
  it('finds every ATX heading with its level, text and line index', () => {
    const content = ['# Roadmap', '', '## Active work', 'row', '### Details'].join('\n');
    expect(extractHeadings(content)).toEqual([
      { id: 'roadmap', level: 1, text: 'Roadmap', lineIndex: 0 },
      { id: 'active-work', level: 2, text: 'Active work', lineIndex: 2 },
      { id: 'details', level: 3, text: 'Details', lineIndex: 4 },
    ]);
  });

  it('ignores a "#" that is not a heading (no space, or inside a table cell)', () => {
    const content = ['#hashtag not a heading', '| a | #not-a-heading |'].join('\n');
    expect(extractHeadings(content)).toEqual([]);
  });

  it('numbers a repeated heading text so ids stay unique', () => {
    const content = ['## Depends on', 'x', '## Depends on'].join('\n');
    const headings = extractHeadings(content);
    expect(headings.map((h) => h.id)).toEqual(['depends-on', 'depends-on-1']);
  });

  it('returns nothing for a document with no headings', () => {
    expect(extractHeadings('just some text\nmore text')).toEqual([]);
  });
});

describe('highlightSegments', () => {
  it('returns the whole line unmatched when the query is empty', () => {
    expect(highlightSegments('hello world', '')).toEqual([{ text: 'hello world', matched: false }]);
  });

  it('splits a single match into before/matched/after segments', () => {
    expect(highlightSegments('hello world', 'wor')).toEqual([
      { text: 'hello ', matched: false },
      { text: 'wor', matched: true },
      { text: 'ld', matched: false },
    ]);
  });

  it('matches case-insensitively but preserves the original casing in the segment', () => {
    expect(highlightSegments('Hello World', 'world')).toEqual([
      { text: 'Hello ', matched: false },
      { text: 'World', matched: true },
    ]);
  });

  it('splits every occurrence when the query repeats', () => {
    expect(highlightSegments('ababab', 'ab')).toEqual([
      { text: 'ab', matched: true },
      { text: 'ab', matched: true },
      { text: 'ab', matched: true },
    ]);
  });

  it('returns the whole line unmatched when there is no match', () => {
    expect(highlightSegments('hello world', 'xyz')).toEqual([
      { text: 'hello world', matched: false },
    ]);
  });
});

describe('findMatchingLines', () => {
  it('returns the 0-based indexes of every matching line, case-insensitively', () => {
    const content = ['Alpha', 'beta', 'gamma ALPHA', 'delta'].join('\n');
    expect(findMatchingLines(content, 'alpha')).toEqual([0, 2]);
  });

  it('returns an empty array for a blank query', () => {
    expect(findMatchingLines('anything at all', '   ')).toEqual([]);
  });

  it('returns an empty array when nothing matches', () => {
    expect(findMatchingLines('one\ntwo\nthree', 'zzz')).toEqual([]);
  });
});
