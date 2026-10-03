import { describe, it, expect } from 'vitest';
import { winPercent, moveAccuracy, classify, positionsOf, buildReview, runReview, evalLabel, keyMoments } from '../src/review.js';

describe('review math', () => {
  it('win% is symmetric and saturates', () => {
    expect(winPercent({ cp: 0 })).toBeCloseTo(50);
    expect(winPercent({ cp: 300 }) + winPercent({ cp: -300 })).toBeCloseTo(100);
    expect(winPercent({ mate: 3, cp: null })).toBe(100);
    expect(winPercent({ mate: -2, cp: null })).toBe(0);
  });

  it('accuracy is 100 with no drop and low for a big drop', () => {
    expect(moveAccuracy(60, 60)).toBeCloseTo(100, 0);
    expect(moveAccuracy(80, 20)).toBeLessThan(10);
  });

  it('classifies by win% drop', () => {
    expect(classify(0, true)).toBe('best');
    expect(classify(3, false)).toBe('good');
    expect(classify(6, false)).toBe('inaccuracy');
    expect(classify(12, false)).toBe('mistake');
    expect(classify(40, false)).toBe('blunder');
  });

  it('labels evals', () => {
    expect(evalLabel({ cp: 130, mate: null })).toBe('+1.3');
    expect(evalLabel({ cp: null, mate: -4 })).toBe('-M4');
    expect(evalLabel({ cp: null, mate: 1, final: true })).toBe('1-0');
  });
});

describe('runReview', () => {
  it("grades a blunder that hangs mate (scholar's mate)", async () => {
    const positions = positionsOf('1. e4 e5 2. Bc4 Nc6 3. Qh5 Nf6 4. Qxf7#');
    expect(positions).toHaveLength(8);
    // fake engine: equal everywhere, except after 3...Nf6 White mates in 1
    const fake = async (fen) => {
      const i = positions.findIndex((p) => p.fen === fen);
      if (i === 6) return { cp: null, mate: 1, bestmove: 'h5f7' };
      return { cp: 20, mate: null, bestmove: 'a2a3' };
    };
    const review = await runReview(positions, fake);
    const nf6 = review.moves.find((m) => m.san === 'Nf6');
    expect(nf6.cls).toBe('blunder');
    expect(review.moves.find((m) => m.san === 'Qxf7#').cls).toBe('best');
    expect(review.summary.b.blunder).toBe(1);
    expect(review.summary.w.accuracy).toBeGreaterThan(review.summary.b.accuracy);
    expect(keyMoments(review)[0].san).toBe('Nf6');
    expect(review.evals[7].final).toBe(true);
  });

  it('stops when aborted', async () => {
    const ctl = new AbortController();
    ctl.abort();
    await expect(runReview(positionsOf('1. e4'), async () => ({ cp: 0, mate: null }), { signal: ctl.signal })).rejects.toThrow('aborted');
  });
});
