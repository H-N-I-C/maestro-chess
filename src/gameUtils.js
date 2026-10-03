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

/** i18n key for why the game is a draw (see drawReason). */
export function drawReasonKey(g) {
  if (g.isStalemate()) return 'draw.stalemate';
  if (g.isInsufficientMaterial()) return 'draw.insufficient';
  if (g.isThreefoldRepetition()) return 'draw.threefold';
  if (Number(g.fen().split(' ')[4]) >= 100) return 'draw.fiftyMove';
  return 'draw.generic';
}

const DRAW_EN = {
  'draw.stalemate': 'Draw — stalemate.',
  'draw.insufficient': 'Draw — insufficient material.',
  'draw.threefold': 'Draw — threefold repetition.',
  'draw.fiftyMove': 'Draw — fifty-move rule.',
  'draw.generic': 'Draw.',
};

/** Why the game is a draw, with specifics. English unless a translate fn (e.g. i18n t) is passed. */
export function drawReason(g, tr) {
  const key = drawReasonKey(g);
  return tr ? tr(key) : DRAW_EN[key];
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

const SPOKEN = {
  en: {
    piece: { K: 'king', Q: 'queen', R: 'rook', B: 'bishop', N: 'knight', P: 'pawn' },
    long: 'castles queenside', short: 'castles kingside', mate: ', checkmate', check: ', check',
    from: (s) => `from ${s}`, takes: (s) => `takes ${s}`, to: (s) => `to ${s}`, promo: (p) => `promotes to ${p}`,
  },
  es: {
    piece: { K: 'rey', Q: 'dama', R: 'torre', B: 'alfil', N: 'caballo', P: 'peón' },
    long: 'enroque largo', short: 'enroque corto', mate: ', jaque mate', check: ', jaque',
    from: (s) => `desde ${s}`, takes: (s) => `captura ${s}`, to: (s) => `a ${s}`, promo: (p) => `corona ${p}`,
  },
};

/** SAN as a screen reader should say it: "Nxe5+" → "knight takes e5, check" ("caballo captura e5, jaque" in es). */
export function spokenSan(san, lang = 'en') {
  if (!san) return '';
  const L = SPOKEN[lang] || SPOKEN.en;
  const tail = san.endsWith('#') ? L.mate : san.endsWith('+') ? L.check : '';
  if (san.startsWith('O-O-O')) return L.long + tail;
  if (san.startsWith('O-O')) return L.short + tail;
  const m = san.match(/^([KQRBN])?([a-h]?[1-8]?)(x)?([a-h][1-8])(?:=([QRBN]))?([+#])?$/);
  if (!m) return san;
  const [, piece, disamb, cap, to, promo, suffix] = m;
  const parts = [L.piece[piece || 'P']];
  if (disamb) parts.push(L.from(disamb));
  parts.push(cap ? L.takes(to) : L.to(to));
  if (promo) parts.push(L.promo(L.piece[promo]));
  let out = parts.join(' ');
  if (suffix === '#') out += L.mate;
  else if (suffix === '+') out += L.check;
  return out;
}
