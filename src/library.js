/* Game library + player rating, persisted in localStorage.
   Every finished game (vs engine or online) is saved with its PGN so it can
   be reviewed later; imported PGNs land here too. */
import { Chess } from 'chess.js';

const LIBRARY_KEY = 'maestro-library';
const RATING_KEY = 'maestro-rating';
const MAX_GAMES = 300;

function read(key, fallback) {
  try {
    const v = JSON.parse(localStorage.getItem(key));
    return v ?? fallback;
  } catch {
    return fallback;
  }
}
function write(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch { return false; }
}

const listeners = new Set();
export function subscribeLibrary(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
function notify() { listeners.forEach((fn) => fn()); }

function newId() {
  const b = new Uint8Array(6);
  crypto.getRandomValues(b);
  return Date.now().toString(36) + Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('').slice(0, 6);
}

/** All saved games, newest first. Entries: {id, pgn, date, white, black, result, source, opponentElo?, userColor?, review?} */
export function listGames() {
  const games = read(LIBRARY_KEY, []);
  return Array.isArray(games) ? games.filter((g) => g && typeof g.pgn === 'string') : [];
}

export function getGame(id) {
  return listGames().find((g) => g.id === id) || null;
}

export function saveGame(entry) {
  const games = listGames();
  const game = { id: newId(), date: Date.now(), ...entry };
  games.unshift(game);
  // drop the oldest when over the cap, or when localStorage is full
  let kept = games.slice(0, MAX_GAMES);
  while (!write(LIBRARY_KEY, kept) && kept.length > 1) kept = kept.slice(0, Math.floor(kept.length * 0.8));
  notify();
  return game;
}

export function updateGame(id, patch) {
  const games = listGames();
  const i = games.findIndex((g) => g.id === id);
  if (i < 0) return null;
  games[i] = { ...games[i], ...patch };
  write(LIBRARY_KEY, games);
  notify();
  return games[i];
}

export function deleteGame(id) {
  write(LIBRARY_KEY, listGames().filter((g) => g.id !== id));
  notify();
}

/**
 * Split a PGN file (one or many games) into library entries. Returns
 * {added: n, errors: n}. Each game is validated by replaying it.
 */
export function importPgn(text) {
  const chunks = String(text || '')
    .replace(/\r\n?/g, '\n')
    .split(/\n\s*\n(?=\[Event )/)
    .map((c) => c.trim())
    .filter(Boolean);
  let added = 0, errors = 0;
  for (const chunk of chunks.slice(0, 200)) {
    const g = new Chess();
    try {
      g.loadPgn(chunk);
    } catch {
      errors += 1;
      continue;
    }
    if (g.history().length === 0) { errors += 1; continue; }
    const h = g.getHeaders();
    saveGame({
      pgn: g.pgn(),
      white: h.White || 'White',
      black: h.Black || 'Black',
      result: h.Result || '*',
      source: 'import',
      event: h.Event || '',
    });
    added += 1;
  }
  return { added, errors };
}

/* ---------------- rating estimate ----------------
   Elo-style estimate from results against the engine's calibrated levels
   (UCI_Elo). Starts provisional at 800 with a large K that shrinks as games
   accumulate, so the first handful of games move it quickly. */

export function getRating() {
  const r = read(RATING_KEY, null);
  if (r && Number.isFinite(r.rating) && Number.isFinite(r.games)) return r;
  return { rating: 800, games: 0, history: [] };
}

export function expectedScore(rating, opp) {
  return 1 / (1 + 10 ** ((opp - rating) / 400));
}

/** score: 1 win, 0.5 draw, 0 loss vs an opponent of `oppElo`. */
export function updateRating(oppElo, score) {
  const cur = getRating();
  const k = cur.games < 10 ? 64 : cur.games < 30 ? 32 : 20;
  const delta = Math.round(k * (score - expectedScore(cur.rating, oppElo)));
  const rating = Math.max(100, Math.min(3000, cur.rating + delta));
  const next = {
    rating,
    games: cur.games + 1,
    history: [...(cur.history || []), { t: Date.now(), rating }].slice(-200),
  };
  write(RATING_KEY, next);
  notify();
  return { ...next, delta };
}

/** Suggest the engine level just above the player's estimate (only after a few games). */
export function suggestedLevel(levels, rating) {
  const calibrated = levels.filter((l) => l.elo > 0);
  return calibrated.find((l) => l.elo >= rating + 100) || calibrated[calibrated.length - 1];
}
