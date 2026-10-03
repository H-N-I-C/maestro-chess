import { describe, it, expect } from 'vitest';
import { parseScore, customLevel } from '../src/engine.js';

describe('engine helpers', () => {
  it('takes the score from the deepest line only', () => {
    expect(parseScore([
      'info depth 5 score mate 3 pv a1a2',
      'info depth 9 score cp 120 pv a1a2',
    ])).toEqual({ cp: 120, mate: null });
    expect(parseScore([
      'info depth 5 score cp 40',
      'info depth 9 score mate -2',
    ])).toEqual({ cp: null, mate: -2 });
    expect(parseScore([])).toEqual({ cp: null, mate: null });
  });

  it('customLevel clamps and interpolates', () => {
    expect(customLevel(100).elo).toBe(400);
    expect(customLevel(9999).elo).toBe(2800);
    const mid = customLevel(1400);
    expect(mid.skill).toBeGreaterThan(6);
    expect(mid.skill).toBeLessThan(10);
  });
});
