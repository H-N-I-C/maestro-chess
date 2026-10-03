/* Puzzle trainer logic — pure functions, no React, no storage (see tests/puzzles.test.js).
   Puzzles follow the Lichess convention: `fen` is the position BEFORE the opponent's move,
   moves[0] is that opponent move, then the solver plays moves[1], moves[3], … */
import { Chess } from 'chess.js';
import { THEME_NAMES_ES } from './locales/themes.es.js';

export const START_RATING = 1200;
export const PROVISIONAL_GAMES = 20;
export const DAY = 24 * 60 * 60 * 1000;
export const SEEN_LIMIT = 300;

/** Compact JSON row [id, fen, "uci …", rating, "themes …"] → puzzle object. */
export function normalizePuzzle(row) {
  if (!Array.isArray(row)) return row;
  const [id, fen, moves, rating, themes] = row;
  return { id, fen, moves: moves.split(' '), rating, themes: themes ? themes.split(' ') : [] };
}

/** The side the solver plays: the opposite of the side to move in the starting fen. */
export function solverColor(puzzle) {
  return puzzle.fen.split(' ')[1] === 'w' ? 'b' : 'w';
}

export function uciToMove(uci) {
  return { from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] || undefined };
}

export function moveToUci({ from, to, promotion }) {
  return from + to + (promotion || '');
}

/* ---------- rating (Elo, provisional K for the first games) ---------- */

export function expectedScore(userRating, puzzleRating) {
  return 1 / (1 + 10 ** ((puzzleRating - userRating) / 400));
}

export function kFactor(games) {
  return games < PROVISIONAL_GAMES ? 40 : 16;
}

/** Returns { rating, delta } after one attempt. `won` = solved cleanly on the first try. */
export function updateRating(userRating, puzzleRating, won, games = 0) {
  const delta = Math.round(kFactor(games) * ((won ? 1 : 0) - expectedScore(userRating, puzzleRating)));
  return { rating: Math.max(100, userRating + delta), delta };
}

/* ---------- selection ---------- */

/** Theme filter options shown in the UI; `match` tests a puzzle's theme list. */
export const THEME_FILTERS = [
  { id: 'all', label: 'All themes', match: () => true },
  { id: 'mate', label: 'Checkmate', match: (t) => t.includes('mate') },
  { id: 'fork', label: 'Fork', match: (t) => t.includes('fork') },
  { id: 'pin', label: 'Pin', match: (t) => t.includes('pin') },
  { id: 'skewer', label: 'Skewer', match: (t) => t.includes('skewer') },
  { id: 'sacrifice', label: 'Sacrifice', match: (t) => t.includes('sacrifice') },
  { id: 'discovered', label: 'Discovered attack', match: (t) => t.includes('discoveredAttack') || t.includes('discoveredCheck') },
  { id: 'endgame', label: 'Endgame', match: (t) => t.includes('endgame') },
  { id: 'opening', label: 'Opening', match: (t) => t.includes('opening') },
];

/**
 * Picks a puzzle near `rating` (±100, widening by 100 each round) that matches the theme
 * filter and is not in `seen`. If everything matching was seen, seen puzzles are allowed again.
 */
export function selectPuzzle(puzzles, { rating = START_RATING, seen = [], theme = 'all', exclude = null, rng = Math.random } = {}) {
  const filter = THEME_FILTERS.find((f) => f.id === theme) || THEME_FILTERS[0];
  const pool = puzzles.filter((p) => filter.match(p.themes) && p.id !== exclude);
  if (!pool.length) return null;
  const seenSet = new Set(seen);
  const fresh = pool.filter((p) => !seenSet.has(p.id));
  const from = fresh.length ? fresh : pool;
  for (let w = 100; ; w += 100) {
    const near = from.filter((p) => Math.abs(p.rating - rating) <= w);
    if (near.length) return near[Math.floor(rng() * near.length)];
  }
}

/* ---------- spaced repetition (SM-2 style) ---------- */

const LADDER = [1, 3, 7]; // days, then interval × ease (≈16, 37, …)

/** Schedules the next review. Failure resets to 1 day; success climbs the ladder. */
export function scheduleReview(entry, correct, now = Date.now()) {
  const prev = entry || { interval: 0, ease: 2.3, lapses: 0 };
  let { interval, ease, lapses } = prev;
  if (!correct) {
    interval = 1;
    lapses += 1;
    ease = Math.max(1.3, Math.round((ease - 0.2) * 100) / 100);
  } else {
    const i = LADDER.indexOf(interval);
    interval = i >= 0 && i < LADDER.length - 1 ? LADDER[i + 1]
      : interval >= LADDER[LADDER.length - 1] ? Math.round(interval * ease)
        : LADDER[0];
  }
  return { due: now + interval * DAY, interval, ease, lapses };
}

/** Ids of puzzles due for review, most overdue first. */
export function dueReviews(srs, now = Date.now()) {
  return Object.entries(srs || {})
    .filter(([, e]) => e && e.due <= now)
    .sort((a, b) => a[1].due - b[1].due)
    .map(([id]) => id);
}

/* ---------- solution checking ---------- */

/**
 * Checks the solver's move at `ply` (an odd index into puzzle.moves) in position `fen`.
 * Returns 'correct' (the expected move), 'mate' (a different move that mates — accepted,
 * like Lichess), or 'wrong'.
 */
export function checkMove(fen, puzzle, ply, uci) {
  const expected = puzzle.moves[ply];
  if (uci === expected) return 'correct';
  const g = new Chess(fen);
  try { g.move(uciToMove(uci)); } catch { return 'wrong'; }
  return g.isCheckmate() ? 'mate' : 'wrong';
}

/** Replays the whole line; returns the final Chess instance or throws on an illegal move. */
export function replay(puzzle) {
  const g = new Chess(puzzle.fen);
  for (const m of puzzle.moves) g.move(uciToMove(m));
  return g;
}

/* ---------- theme names ---------- */

const THEME_NAMES = {
  mateIn1: 'mate in 1', mateIn2: 'mate in 2', mateIn3: 'mate in 3', mateIn4: 'mate in 4', mateIn5: 'mate in 5+',
  oneMove: 'one-mover', veryLong: 'very long', crushing: 'crushing', advantage: 'advantage',
  backRankMate: 'back-rank mate', smotheredMate: 'smothered mate', hangingPiece: 'hanging piece',
  discoveredAttack: 'discovered attack', discoveredCheck: 'discovered check', doubleCheck: 'double check',
  kingsideAttack: 'kingside attack', queensideAttack: 'queenside attack', exposedKing: 'exposed king',
  trappedPiece: 'trapped piece', advancedPawn: 'advanced pawn', xRayAttack: 'x-ray attack',
  quietMove: 'quiet move', defensiveMove: 'defensive move', capturingDefender: 'capturing the defender',
  enPassant: 'en passant', underPromotion: 'underpromotion',
};

const THEME_NAMES_BY_LANG = { es: THEME_NAMES_ES };

/** Readable theme name in `lang` (Spanish when available), falling back to English. */
export function humanizeTheme(t, lang = 'en') {
  const local = THEME_NAMES_BY_LANG[lang]?.[t];
  if (local) return local;
  return THEME_NAMES[t] || t.replace(/([A-Z])/g, ' $1').toLowerCase().trim();
}
