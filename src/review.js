/* Post-game review: evaluate every position with Stockfish, then grade each
   move by how much winning chance it gave away (the same model Lichess uses:
   win% from centipawns, per-move accuracy from the win% drop). */
import { Chess } from 'chess.js';
import { loadFen } from './chess960.js';

/** Winning chance (0-100) for White from a White-POV score. */
export function winPercent({ cp = null, mate = null }) {
  if (mate !== null) return mate > 0 ? 100 : 0;
  if (cp === null) return 50;
  const c = Math.max(-1000, Math.min(1000, cp));
  return 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * c)) - 1);
}

/** Accuracy (0-100) of a single move from the mover's win% before/after. */
export function moveAccuracy(winBefore, winAfter) {
  const drop = Math.max(0, winBefore - winAfter);
  const acc = 103.1668 * Math.exp(-0.04354 * drop) - 3.1669;
  return Math.max(0, Math.min(100, acc));
}

/** Classify by the mover's win% drop (Lichess thresholds: 5/10/15 points ≈ 0.1/0.2/0.3 chances). */
export function classify(drop, playedBest) {
  if (playedBest) return 'best';
  if (drop >= 15) return 'blunder';
  if (drop >= 10) return 'mistake';
  if (drop >= 5) return 'inaccuracy';
  return 'good';
}

export const CLASS_LABELS = {
  best: 'Best move', good: 'Good move', inaccuracy: 'Inaccuracy', mistake: 'Mistake', blunder: 'Blunder',
};
/** i18n keys for the classification labels (CLASS_LABELS stays as the English default). */
export const CLASS_KEYS = {
  best: 'review.class.best', good: 'review.class.good', inaccuracy: 'review.class.inaccuracy', mistake: 'review.class.mistake', blunder: 'review.class.blunder',
};
export const CLASS_SYMBOLS = { best: '★', good: '', inaccuracy: '?!', mistake: '?', blunder: '??' };

/** Positions of a game: [{fen, san, uci, color}] — entry 0 is the start (no move). */
export function positionsOf(pgnOrGame) {
  const g = typeof pgnOrGame === 'string' ? (() => { const c = new Chess(); c.loadPgn(pgnOrGame); return c; })() : pgnOrGame;
  const moves = g.history({ verbose: true });
  const start = moves.length ? moves[0].before : g.fen();
  const out = [{ fen: start, san: null, uci: null, color: null }];
  for (const m of moves) {
    // 960 castles carry lan = king→rook (what the engine reports with UCI_Chess960)
    out.push({ fen: m.after, san: m.san, uci: m.lan || m.from + m.to + (m.promotion || ''), color: m.color, from: m.from, to: m.to });
  }
  return out;
}

/** White-POV score of a terminal position, or null if the game goes on. */
function terminalScore(fen) {
  const g = loadFen(fen);
  // side to move is mated: a "mate in 1" for the winner keeps win% at 0/100
  if (g.isCheckmate()) return { cp: null, mate: g.turn() === 'w' ? -1 : 1, final: true };
  if (g.isDraw() || g.isStalemate()) return { cp: 0, mate: null };
  return null;
}

/**
 * Turn per-position evaluations into a review.
 * evals[i] = {cp, mate, best} for positions[i], scores White-POV, best = engine's
 * best move (uci) in that position.
 */
export function buildReview(positions, evals) {
  const moves = [];
  const acc = { w: [], b: [] };
  for (let i = 1; i < positions.length; i++) {
    const p = positions[i];
    const before = evals[i - 1];
    const after = evals[i];
    const sign = p.color === 'w' ? 1 : -1;
    const wb = p.color === 'w' ? winPercent(before) : 100 - winPercent(before);
    const wa = p.color === 'w' ? winPercent(after) : 100 - winPercent(after);
    const drop = Math.max(0, wb - wa);
    const playedBest = Boolean(before.best) && before.best === p.uci;
    const a = moveAccuracy(wb, wa);
    acc[p.color].push(a);
    moves.push({
      ply: i, san: p.san, color: p.color, uci: p.uci,
      cls: classify(drop, playedBest),
      drop: Math.round(drop * 10) / 10,
      accuracy: Math.round(a),
      best: before.best || null,
      bestSan: before.best ? uciToSan(positions[i - 1].fen, before.best) : null,
      evalAfter: after, sign,
    });
  }
  const mean = (xs) => (xs.length ? Math.round(xs.reduce((s, x) => s + x, 0) / xs.length) : null);
  const count = (color, cls) => moves.filter((m) => m.color === color && m.cls === cls).length;
  const summary = {};
  for (const c of ['w', 'b']) {
    summary[c] = {
      accuracy: mean(acc[c]),
      inaccuracy: count(c, 'inaccuracy'), mistake: count(c, 'mistake'), blunder: count(c, 'blunder'),
      best: count(c, 'best'),
    };
  }
  return { moves, summary, evals: evals.map((e) => ({ cp: e.cp, mate: e.mate, ...(e.final ? { final: true } : {}) })) };
}

export function uciToSan(fen, uci) {
  try {
    const g = loadFen(fen);
    return g.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] }).san;
  } catch {
    return null;
  }
}

/** Top swings, for the coach summary: the costliest moves of the game. */
export function keyMoments(review, n = 4) {
  return [...review.moves]
    .filter((m) => m.cls === 'blunder' || m.cls === 'mistake')
    .sort((a, b) => b.drop - a.drop)
    .slice(0, n)
    .sort((a, b) => a.ply - b.ply);
}

/**
 * Run the engine over every position. `analyze(fen, opts)` → {cp, mate, bestmove}
 * with side-to-move POV (engine.js). onProgress(done, total). Stops early when
 * `signal.aborted`. Returns the review.
 */
export async function runReview(positions, analyze, { movetime = 250, depth = 14, onProgress, signal } = {}) {
  const evals = [];
  for (let i = 0; i < positions.length; i++) {
    if (signal?.aborted) throw new Error('aborted');
    const { fen } = positions[i];
    const term = terminalScore(fen);
    if (term) {
      evals.push({ ...term, best: null });
    } else {
      const r = await analyze(fen, { depth, movetime });
      const stm = fen.split(' ')[1] === 'w' ? 1 : -1;
      evals.push({
        cp: r.cp === null ? null : r.cp * stm,
        mate: r.mate === null ? null : r.mate * stm,
        best: r.bestmove && r.bestmove !== '(none)' ? r.bestmove : null,
      });
    }
    onProgress?.(i + 1, positions.length);
  }
  return buildReview(positions, evals);
}

/** Text label for a White-POV score, e.g. "+1.3", "-M4", "#". */
export function evalLabel({ cp, mate, final }) {
  if (final) return mate > 0 ? '1-0' : '0-1';
  if (mate !== null && mate !== undefined) return mate === 0 ? '#' : `${mate > 0 ? '+' : '-'}M${Math.abs(mate)}`;
  if (cp === null || cp === undefined) return '0.0';
  const v = cp / 100;
  return `${v > 0 ? '+' : ''}${v.toFixed(1)}`;
}
