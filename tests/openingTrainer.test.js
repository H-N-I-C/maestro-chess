import { describe, it, expect } from 'vitest';
import {
  TREE, allLines, replay, lookup, addLine, removeLine, hasLine, emptyRepertoire, mergeRepertoire,
  STARTERS, nextMoves, pickOpponentMove, isRepertoireMove, review, cardId, dueLineCount, userPositions,
} from '../src/openingTrainer.js';

const L = (s) => s.split(' ');
const DAY = 86400000;

describe('opening data', () => {
  it('every line replays legally and SAN is canonical', () => {
    const lines = allLines(TREE);
    expect(lines.length).toBeGreaterThan(40);
    for (const l of lines) {
      const r = replay(l);
      expect(r, l.join(' ')).not.toBeNull();
      expect(r.sans).toEqual(l);
    }
  });

  it('named nodes carry eco, name and idea', () => {
    let named = 0;
    const walk = (n) => {
      if (n.name) { named++; expect(n.eco).toMatch(/^[A-E]\d\d$/); expect(n.idea.length).toBeGreaterThan(5); }
      (n.children || []).forEach(walk);
    };
    walk(TREE);
    expect(named).toBeGreaterThanOrEqual(40);
  });

  it('starter repertoires replay legally', () => {
    for (const s of STARTERS) for (const c of ['w', 'b']) for (const l of s.rep[c]) expect(replay(l)).not.toBeNull();
  });
});

describe('lookup', () => {
  it('finds openings by move sequence', () => {
    expect(lookup(L('e4 e5 Nf3 Nc6 Bc4')).opening.name).toBe('Italian Game');
    expect(lookup(L('e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 a6')).opening.name).toBe('Sicilian: Open'); // deeper name below
    expect(lookup(L('e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 a6 Be3 e5 Nb3 Be6')).opening.name).toBe('Sicilian: Najdorf');
    const root = lookup([]);
    expect(root.inBook).toBe(true);
    expect(root.continuations.map((c) => c.san)).toEqual(expect.arrayContaining(['e4', 'd4', 'c4', 'Nf3']));
  });

  it('continuations carry a label for the line below', () => {
    const c = lookup(L('e4 e5 Nf3 Nc6')).continuations;
    expect(c.find((x) => x.san === 'Bb5').name).toBe('Ruy Lopez');
  });

  it('detects transpositions by FEN', () => {
    // QGD reached via 1.d4 Nf6 2.c4 e6 3.Nc3 d5 — tree only has the 1...d5 order
    const r = lookup(L('d4 Nf6 c4 e6 Nc3 d5'));
    expect(r.inBook).toBe(true);
    expect(r.transposed).toBe(true);
    expect(r.continuations.length).toBeGreaterThan(0);
  });

  it('out-of-book moves keep the family name', () => {
    const r = lookup(L('e4 e5 Nf3 Nc6 Bc4 h6'));
    expect(r.inBook).toBe(false);
    expect(r.opening.name).toBe('Italian Game');
  });
});

describe('repertoire', () => {
  it('adds, absorbs prefixes and removes lines', () => {
    let rep = emptyRepertoire();
    rep = addLine(rep, 'w', L('e4 e5 Nf3'));
    rep = addLine(rep, 'w', L('e4 e5 Nf3 Nc6 Bc4'));
    expect(rep.w).toEqual([L('e4 e5 Nf3 Nc6 Bc4')]);
    expect(addLine(rep, 'w', L('e4 e5'))).toBe(rep);
    expect(hasLine(rep, 'w', L('e4 e5 Nf3'))).toBe(true);
    expect(addLine(rep, 'w', L('e4 e5 Ke3'))).toBe(rep); // illegal ignored
    rep = removeLine(rep, 'w', L('e4 e5 Nf3 Nc6 Bc4'));
    expect(rep.w).toEqual([]);
  });

  it('merges starters', () => {
    const rep = mergeRepertoire(emptyRepertoire(), STARTERS[1].rep);
    expect(rep.b.length).toBe(3);
  });
});

describe('drill', () => {
  const rep = mergeRepertoire(emptyRepertoire(), STARTERS[1].rep); // Caro-Kann for Black

  it('opponent picks only repertoire moves', () => {
    for (let i = 0; i < 50; i++) {
      expect(pickOpponentMove(rep, 'b', [], {}, 0, Math.random)).toBe('e4');
      expect(['Nc3', 'e5', 'exd5']).toContain(pickOpponentMove(rep, 'b', L('e4 c6 d4 d5'), {}, 0, Math.random));
    }
    expect(pickOpponentMove(rep, 'b', L('e4 c6 d4 d5 e5 Bf5 Nf3 e6 Be2 c5'))).toBeNull();
  });

  it('weights toward due branches', () => {
    const now = 1e12;
    const srs = {};
    // everything in the Classical and Exchange lines is learned; Advance is due
    for (const l of [rep.b[0], rep.b[2]]) {
      for (let i = 1; i < l.length; i += 2) srs[cardId('b', l.slice(0, i))] = { interval: 7, due: now + 7 * DAY };
    }
    const counts = { Nc3: 0, e5: 0, exd5: 0 };
    let seed = 1;
    const rng = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    for (let i = 0; i < 600; i++) counts[pickOpponentMove(rep, 'b', L('e4 c6 d4 d5'), srs, now, rng)]++;
    expect(counts.e5).toBeGreaterThan(counts.Nc3 * 2);
  });

  it('checks user moves against the repertoire', () => {
    expect(isRepertoireMove(rep, 'b', L('e4'), 'c6')).toBe(true);
    expect(isRepertoireMove(rep, 'b', L('e4'), 'e5')).toBe(false);
    expect(nextMoves(rep, 'b', L('e4 c6 d4'))).toEqual(['d5']);
  });

  it('counts due lines and user positions', () => {
    expect(dueLineCount(rep, 'b', {}, 0)).toBe(3);
    expect(userPositions(rep, 'b').size).toBeGreaterThan(5);
  });
});

describe('SRS', () => {
  it('progresses 1d → 3d → 7d → 16d and resets on a miss', () => {
    const now = 0;
    let c = review(null, true, now);
    expect(c.interval).toBe(1);
    expect(c.due).toBe(DAY);
    c = review(c, true, now); expect(c.interval).toBe(3);
    c = review(c, true, now); expect(c.interval).toBe(7);
    c = review(c, true, now); expect(c.interval).toBe(16);
    c = review(c, false, now);
    expect(c.interval).toBe(0);
    expect(c.due).toBe(now);
    expect(c.lapses).toBe(1);
    c = review(c, true, now); expect(c.interval).toBe(1);
  });
});
