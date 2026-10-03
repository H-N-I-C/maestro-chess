import { describe, it, expect } from 'vitest';
import { Chess } from 'chess.js';
import { cloneGame, gameFromHistory, playMove, drawReason, capturedFromHistory, isValidHistory } from '../src/gameUtils.js';

function historyOf(sans) {
  let g = new Chess();
  const hist = [{ fen: g.fen(), lastMove: null }];
  for (const san of sans) {
    const r = playMove(g, san);
    hist.push({ fen: r.game.fen(), lastMove: r.lastMove, victim: r.victim });
    g = r.game;
  }
  return { g, hist };
}

const SHUFFLE = ['Nf3', 'Nf6', 'Ng1', 'Ng8', 'Nf3', 'Nf6', 'Ng1', 'Ng8'];

describe('gameUtils', () => {
  it('detects threefold repetition across moves (history is preserved)', () => {
    const { g } = historyOf(SHUFFLE);
    expect(g.isThreefoldRepetition()).toBe(true);
    expect(g.isGameOver()).toBe(true);
    expect(drawReason(g)).toBe('Draw — threefold repetition.');
  });

  it('does not report threefold on a twofold repetition', () => {
    const { g } = historyOf(SHUFFLE.slice(0, 4));
    expect(g.isThreefoldRepetition()).toBe(false);
    expect(g.isGameOver()).toBe(false);
  });

  it('cloneGame keeps the move history', () => {
    const { g } = historyOf(['e4', 'e5', 'Nf3']);
    const c = cloneGame(g);
    expect(c.history()).toEqual(['e4', 'e5', 'Nf3']);
    expect(c.fen()).toBe(g.fen());
  });

  it('gameFromHistory replays, and survives a saved game reload', () => {
    const { hist } = historyOf(SHUFFLE);
    const g = gameFromHistory(JSON.parse(JSON.stringify(hist)));
    expect(g.isThreefoldRepetition()).toBe(true);
  });

  it('playMove rejects illegal moves and records en passant victims', () => {
    expect(playMove(new Chess(), 'e5')).toBeNull();
    const { hist } = historyOf(['e4', 'a6', 'e5', 'd5', 'exd6']);
    expect(hist[hist.length - 1].victim).toEqual({ type: 'p', color: 'b' });
    expect(capturedFromHistory(hist)).toEqual({ w: [], b: ['p'] });
  });

  it('isValidHistory rejects tampered histories', () => {
    const { hist } = historyOf(['e4', 'e5']);
    expect(isValidHistory(hist)).toBe(true);
    const bad = JSON.parse(JSON.stringify(hist));
    bad[2].lastMove = { from: 'e7', to: 'e4', san: 'Qxe4' };
    expect(isValidHistory(bad)).toBe(false);
    expect(isValidHistory('nope')).toBe(false);
    expect(isValidHistory([])).toBe(false);
  });
});

import { spokenSan } from '../src/gameUtils.js';
describe('spokenSan', () => {
  it('reads moves aloud', () => {
    expect(spokenSan('Nxe5+')).toBe('knight takes e5, check');
    expect(spokenSan('e4')).toBe('pawn to e4');
    expect(spokenSan('exd8=Q#')).toBe('pawn from e takes d8 promotes to queen, checkmate');
    expect(spokenSan('O-O-O')).toBe('castles queenside');
    expect(spokenSan('Rad1')).toBe('rook from a to d1');
  });
});
