import { describe, it, expect } from 'vitest';
import { splitPgn } from '../src/library.js';
import { Chess } from 'chess.js';

const ok = (pgn) => { const g = new Chess(); g.loadPgn(pgn); return g.history().length; };

describe('splitPgn', () => {
  it('splits games that start with any tag, not just [Event]', () => {
    const games = splitPgn('[White "a"]\n[Black "b"]\n\n1. e4 e5 *\n\n[White "c"]\n[Black "d"]\n\n1. d4 d5 2. c4 *\n');
    expect(games).toHaveLength(2);
    expect(games.map(ok)).toEqual([2, 3]);
  });

  it('splits tagless games after a result token', () => {
    const games = splitPgn('1. e4 e5 2. Nf3 1-0\n\n1. d4 Nf6 0-1\n');
    expect(games).toHaveLength(2);
    expect(games.map(ok)).toEqual([3, 2]);
  });

  it('keeps multi-line movetext, comments and Windows line endings together', () => {
    const games = splitPgn('[Event "x"]\r\n\r\n1. e4 {best by test}\r\ne5 2. Nf3\r\nNc6 1/2-1/2\r\n');
    expect(games).toHaveLength(1);
    expect(ok(games[0])).toBe(4);
  });

  it('handles empty input', () => {
    expect(splitPgn('')).toEqual([]);
    expect(splitPgn(null)).toEqual([]);
  });
});
