import { describe, it, expect } from 'vitest';
import { Chess960Game, startRank, startFen960, load960Pgn, pgnSans, isShredderFen } from '../src/chess960.js';

function perft(fen, depth) {
  if (depth === 0) return 1;
  const g = new Chess960Game(fen);
  const moves = g.moves({ verbose: true });
  if (depth === 1) return moves.length;
  let n = 0;
  for (const m of moves) {
    const c = new Chess960Game(fen);
    c.move({ from: m.from, to: m.rookFrom || m.to, promotion: m.promotion });
    n += perft(c.fen(), depth - 1);
  }
  return n;
}

describe('Chess960 start positions', () => {
  it('numbers positions like Scharnagl (518 = standard, 0 = BBQNNRKR)', () => {
    expect(startRank(518)).toBe('rnbqkbnr');
    expect(startRank(0)).toBe('bbqnnrkr');
    const all = new Set(Array.from({ length: 960 }, (_, i) => startRank(i)));
    expect(all.size).toBe(960);
    for (const r of all) {
      const b = [...r].map((p, i) => (p === 'b' ? i % 2 : null)).filter((x) => x !== null);
      expect(b.sort()).toEqual([0, 1]); // opposite-coloured bishops
      expect(r.indexOf('r') < r.indexOf('k') && r.indexOf('k') < r.lastIndexOf('r')).toBe(true);
    }
  });
  it('builds Shredder-FEN castling', () => {
    expect(startFen960(518)).toBe('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w HAha - 0 1');
    expect(isShredderFen(startFen960(0))).toBe(true);
  });
});

describe('perft (move generation incl. castling)', () => {
  it('standard start', () => {
    const f = startFen960(518);
    expect([1, 2, 3].map((d) => perft(f, d))).toEqual([20, 400, 8902]);
  });
  it('kiwipete (castling through/into check, captures of rooks)', () => {
    const f = 'r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w HAha - 0 1';
    expect([1, 2].map((d) => perft(f, d))).toEqual([48, 2039]);
  });
  it('published Chess960 perft positions', () => {
    expect([1, 2, 3].map((d) => perft('bqnb1rkr/pp3ppp/3ppn2/2p5/5P2/P2P4/NPP1P1PP/BQ1BNRKR w HFhf - 2 9', d))).toEqual([21, 528, 12189]);
    expect([1, 2, 3].map((d) => perft('2nnrbkr/p1qppppp/8/1ppb4/6PP/3PP3/PPP2P2/BQNNRBKR w HEhe - 1 9', d))).toEqual([21, 807, 18002]);
    expect([1, 2, 3].map((d) => perft('b1q1rrkb/pppppppp/3nn3/8/P7/1PPP4/4PPPP/BQNNRKRB w GE - 1 9', d))).toEqual([20, 479, 10471]);
  });
});

describe('960 castling', () => {
  it('castles king-to-rook and king-to-destination, keeping rights in sync', () => {
    // king b1, rooks a1/h1: queenside castle puts K on c1 (moving right!) and R on d1
    const g = new Chess960Game('1k5r/8/8/8/8/8/8/RK5R w HAh - 0 1');
    const qs = g.moves({ verbose: true }).find((m) => m.san.startsWith('O-O-O'));
    expect(qs).toMatchObject({ from: 'b1', to: 'c1', rookFrom: 'a1', rookTo: 'd1' });
    g.move({ from: 'b1', to: 'a1' }); // UCI_Chess960 style
    expect(g.get('c1')).toMatchObject({ type: 'k' });
    expect(g.get('d1')).toMatchObject({ type: 'r' });
    expect(g.fen().split(' ')[2]).toBe('h');
    expect(g.history()).toEqual(['O-O-O']);
  });
  it('refuses castling through an attacked square', () => {
    const g = new Chess960Game('4k3/8/8/8/8/8/5r2/4K2R w H - 0 1'); // f2 rook... attacks f1
    expect(g.moves().some((s) => s.startsWith('O-O'))).toBe(false);
  });
  it('detects threefold repetition and supports clone/undo', () => {
    const g = new Chess960Game(startFen960(0));
    for (const m of ['Nc3', 'Nc6', 'Nd1', 'Nd8', 'Nc3', 'Nc6', 'Nd1', 'Nd8']) g.move(m);
    expect(g.isThreefoldRepetition()).toBe(true);
    expect(g.clone().isThreefoldRepetition()).toBe(true);
    g.undo();
    expect(g.isThreefoldRepetition()).toBe(false);
  });
  it('round-trips through PGN', () => {
    const g = new Chess960Game('1k5r/8/8/8/8/8/8/RK5R w HAh - 0 1');
    g.move('O-O-O'); g.move('Kb7'); g.move('Rd7+');
    const back = load960Pgn(g.pgn());
    expect(back.fen()).toBe(g.fen());
    expect(back.history()).toEqual(['O-O-O', 'Kb7', 'Rd7+']);
    expect(pgnSans('1. e4 {c} (1. d4 d5) e5 $1 2. Nf3!? 1-0')).toEqual(['e4', 'e5', 'Nf3']);
  });
});
