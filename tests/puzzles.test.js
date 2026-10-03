import { describe, it, expect } from 'vitest';
import { Chess } from 'chess.js';
import rows from '../src/data/puzzles.json';
import {
  normalizePuzzle, solverColor, updateRating, expectedScore, selectPuzzle,
  scheduleReview, dueReviews, checkMove, replay, humanizeTheme, uciToMove, DAY,
} from '../src/puzzleEngine.js';

const puzzles = rows.map(normalizePuzzle);

describe('rating', () => {
  it('gains for a win, loses for a loss, symmetric at equal ratings', () => {
    const win = updateRating(1200, 1200, true, 30);
    const loss = updateRating(1200, 1200, false, 30);
    expect(win.delta).toBe(8);
    expect(loss.delta).toBe(-8);
    expect(win.rating).toBe(1208);
  });
  it('uses a larger K while provisional', () => {
    expect(updateRating(1200, 1200, true, 0).delta).toBe(20);
    expect(updateRating(1200, 1200, true, 25).delta).toBe(8);
  });
  it('beating a harder puzzle earns more', () => {
    expect(updateRating(1200, 1600, true, 30).delta).toBeGreaterThan(updateRating(1200, 1000, true, 30).delta);
    expect(expectedScore(1200, 1200)).toBeCloseTo(0.5);
  });
});

describe('selection', () => {
  const pool = [
    { id: 'a', rating: 1000, themes: ['fork'] },
    { id: 'b', rating: 1210, themes: ['pin'] },
    { id: 'c', rating: 1250, themes: ['mateIn2', 'mate'] },
    { id: 'd', rating: 1900, themes: ['endgame'] },
  ];
  it('picks within ±100 of the rating', () => {
    for (let i = 0; i < 20; i++) {
      const p = selectPuzzle(pool, { rating: 1200, rng: () => i / 20 });
      expect(['b', 'c']).toContain(p.id);
    }
  });
  it('avoids recently seen puzzles and widens the window', () => {
    expect(selectPuzzle(pool, { rating: 1200, seen: ['b', 'c'], rng: () => 0 }).id).toBe('a');
  });
  it('falls back to seen puzzles when everything was seen', () => {
    expect(selectPuzzle(pool, { rating: 1900, seen: ['a', 'b', 'c', 'd'], rng: () => 0 }).id).toBe('d');
  });
  it('respects the theme filter', () => {
    expect(selectPuzzle(pool, { rating: 1200, theme: 'mate', rng: () => 0 }).id).toBe('c');
    expect(selectPuzzle(pool, { rating: 1200, theme: 'endgame', rng: () => 0 }).id).toBe('d');
  });
  it('works on the real dataset', () => {
    const p = selectPuzzle(puzzles, { rating: 1500, rng: () => 0.5 });
    expect(Math.abs(p.rating - 1500)).toBeLessThanOrEqual(100);
  });
});

describe('spaced repetition', () => {
  it('climbs 1 → 3 → 7 → 16 days and resets on a failure', () => {
    const now = 0;
    let e = scheduleReview(null, false, now);
    expect(e.interval).toBe(1);
    expect(e.due).toBe(DAY);
    e = scheduleReview(e, true, now); expect(e.interval).toBe(3);
    e = scheduleReview(e, true, now); expect(e.interval).toBe(7);
    e = scheduleReview(e, true, now); expect(e.interval).toBeGreaterThanOrEqual(14);
    expect(e.interval).toBeLessThanOrEqual(16);
    const lapsesBefore = e.lapses;
    e = scheduleReview(e, false, now);
    expect(e.interval).toBe(1);
    expect(e.lapses).toBe(lapsesBefore + 1);
  });
  it('lists due reviews, most overdue first', () => {
    const srs = { x: { due: 50 }, y: { due: 10 }, z: { due: 500 } };
    expect(dueReviews(srs, 100)).toEqual(['y', 'x']);
  });
});

describe('solution check', () => {
  // fen has Black to move: Black's move is the opponent's, so the solver plays White
  const p = {
    id: 't', fen: '6k1/5ppp/8/8/8/8/5PPP/r5K1 b - - 0 1',
    moves: ['g8f8', 'g1h1', 'a1b1'], rating: 800, themes: [],
  };
  it('uses the expected move', () => {
    const fen = '6k1/5ppp/8/8/8/8/5PPP/r5K1 w - - 0 1';
    expect(checkMove(fen, { moves: ['x', 'g1f1'] }, 1, 'g1f1')).toBe('correct');
    expect(checkMove(fen, { moves: ['x', 'g1f1'] }, 1, 'h2h3')).toBe('wrong');
  });
  it('accepts an alternate move that mates', () => {
    // White to move; expected Qd8# but Qe8# also mates
    const fen = '6k1/5ppp/8/8/8/8/8/3Q2K1 w - - 0 1';
    const pz = { moves: ['x', 'd1d8'] };
    expect(checkMove(fen, pz, 1, 'd1d8')).toBe('correct');
    expect(new Chess(fen).move('Qd8#')).toBeTruthy();
    // a non-expected mating move
    const fen2 = '6k1/5ppp/8/8/8/8/R7/1R4K1 w - - 0 1';
    expect(checkMove(fen2, { moves: ['x', 'a2a8'] }, 1, 'b1b8')).toBe('mate');
    expect(checkMove(fen2, { moves: ['x', 'a2a8'] }, 1, 'b1b7')).toBe('wrong');
  });
  it('solver plays the side not to move in the fen', () => {
    expect(solverColor(p)).toBe('w');
  });
});

describe('dataset', () => {
  it('has about 1,500 puzzles spread over 600–2400', () => {
    expect(puzzles.length).toBeGreaterThanOrEqual(1400);
    const lo = puzzles.filter((q) => q.rating < 1000).length;
    const hi = puzzles.filter((q) => q.rating >= 2000).length;
    expect(lo).toBeGreaterThan(200);
    expect(hi).toBeGreaterThan(200);
    expect(new Set(puzzles.map((q) => q.id)).size).toBe(puzzles.length);
  });
  it('every puzzle has a valid fen and a legal move sequence', () => {
    for (const q of puzzles) {
      expect(() => new Chess(q.fen), q.id).not.toThrow();
      expect(q.moves.length % 2, q.id).toBe(0); // opponent move + solver/opponent pairs, ending with the solver
      expect(() => replay(q), q.id).not.toThrow();
      expect(q.moves.every((m) => /^[a-h][1-8][a-h][1-8][qrbn]?$/.test(m))).toBe(true);
      expect(uciToMove(q.moves[1]).from).toMatch(/^[a-h][1-8]$/);
    }
  });
});

describe('themes', () => {
  it('humanizes theme ids', () => {
    expect(humanizeTheme('mateIn2')).toBe('mate in 2');
    expect(humanizeTheme('fork')).toBe('fork');
    expect(humanizeTheme('rookEndgame')).toBe('rook endgame');
  });
});
