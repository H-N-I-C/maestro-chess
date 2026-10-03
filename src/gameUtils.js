/* Pure game helpers shared by play, online and review code.
   Games are always copied WITH their move history (never rebuilt from a bare
   FEN) so chess.js can detect threefold repetition. */
import { Chess } from 'chess.js';

/** Copy a game including its full move history. */
export function cloneGame(g) {
  const moves = g.history({ verbose: true });
  const c = new Chess(moves.length ? moves[0].before : g.fen());
  for (const m of moves) c.move({ from: m.from, to: m.to, promotion: m.promotion });
  return c;
}

/**
 * Rebuild a game from our history entries ([{fen, lastMove:{from,to,san}}],
 * entry 0 = start position). Falls back to the last FEN if replay fails
 * (e.g. corrupted save) so callers always get a usable game.
 */
export function gameFromHistory(hist) {
  if (!Array.isArray(hist) || hist.length === 0) return new Chess();
  try {
    const g = new Chess(hist[0].fen);
    for (let k = 1; k < hist.length; k++) {
      const lm = hist[k]?.lastMove;
      if (!lm) throw new Error('missing move');
      g.move(lm.san || { from: lm.from, to: lm.to, promotion: lm.promotion });
    }
    return g;
  } catch {
    try { return new Chess(hist[hist.length - 1].fen); } catch { return new Chess(); }
  }
}

/** Piece that a move from->to will capture (handles en passant). */
export function findVictim(g, from, to) {
  const direct = g.get(to);
  if (direct) return direct;
  const mover = g.get(from);
  if (mover?.type === 'p' && from[0] !== to[0]) return g.get(to[0] + from[1]);
  return null;
}

/**
 * Play a move on a copy of `g`. Returns {game, lastMove, victim} or null when
 * illegal. lastMove carries everything the UI and history need.
 */
export function playMove(g, move) {
  const next = cloneGame(g);
  let moved;
  try { moved = next.move(move); } catch { return null; }
  const victim = findVictim(g, moved.from, moved.to);
  const lastMove = {
    from: moved.from, to: moved.to, san: moved.san, color: moved.color,
    piece: moved.piece, promotion: moved.promotion,
  };
  return { game: next, lastMove, victim: victim || null };
}

/** Why the game is a draw, with specifics. */
export function drawReason(g) {
  if (g.isStalemate()) return 'Draw — stalemate.';
  if (g.isInsufficientMaterial()) return 'Draw — insufficient material.';
  if (g.isThreefoldRepetition()) return 'Draw — threefold repetition.';
  if (Number(g.fen().split(' ')[4]) >= 100) return 'Draw — fifty-move rule.';
  return 'Draw.';
}

/** Captured pieces recomputed from history entries. */
export function capturedFromHistory(hist) {
  const caps = { w: [], b: [] };
  for (const e of hist || []) if (e?.victim) caps[e.victim.color].push(e.victim.type);
  return caps;
}

const SQUARE = /^[a-h][1-8]$/;

/** Validate a history array received from a peer or storage. */
export function isValidHistory(hist) {
  if (!Array.isArray(hist) || hist.length === 0 || hist.length > 1200) return false;
  try { new Chess(hist[0].fen); } catch { return false; }
  for (let k = 1; k < hist.length; k++) {
    const e = hist[k];
    if (!e || typeof e.fen !== 'string' || !e.lastMove) return false;
    if (!SQUARE.test(e.lastMove.from) || !SQUARE.test(e.lastMove.to)) return false;
  }
  // must replay legally to its own final position
  const g = gameFromHistory(hist);
  return g.history().length === hist.length - 1;
}
