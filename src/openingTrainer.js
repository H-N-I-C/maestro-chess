/* Pure logic for the Openings screen: opening-tree lookup, repertoire
   editing, drill move selection and SM-2-lite spaced repetition.
   No React, no storage side effects — everything here is unit tested. */
import { Chess } from 'chess.js';
import DATA from './data/openings.json';

export const TREE = DATA.tree;
const DAY = 86400000;

/** Position identity ignoring the move counters (so transpositions match). */
export function fenKey(fen) {
  return fen.split(' ').slice(0, 4).join(' ');
}

/** Replay SAN moves from the start; returns { fens, sans } or null if any move is illegal. */
export function replay(sans) {
  const g = new Chess();
  const fens = [g.fen()];
  const out = [];
  for (const s of sans) {
    let mv;
    try { mv = g.move(s); } catch { return null; }
    out.push(mv.san);
    fens.push(g.fen());
  }
  return { fens, sans: out };
}

/** Every root-to-leaf line in a tree, as SAN arrays. */
export function allLines(tree = TREE) {
  const lines = [];
  const walk = (node, path) => {
    if (!node.children?.length) { if (path.length) lines.push(path); return; }
    for (const c of node.children) walk(c, [...path, c.san]);
  };
  walk(tree, []);
  return lines;
}

let INDEX = null;
/** Lazily built index: path string -> node info, fenKey -> path. */
function index() {
  if (INDEX) return INDEX;
  const byPath = new Map();
  const byFen = new Map();
  const walk = (node, path, g, named) => {
    const key = path.join(' ');
    const here = node.name ? { eco: node.eco, name: node.name, idea: node.idea } : named;
    byPath.set(key, { node, path, opening: here, exact: Boolean(node.name) });
    const fk = fenKey(g.fen());
    if (!byFen.has(fk)) byFen.set(fk, key);
    for (const c of node.children || []) {
      g.move(c.san);
      walk(c, [...path, c.san], g, here);
      g.undo();
    }
  };
  walk(TREE, [], new Chess(), null);
  INDEX = { byPath, byFen };
  return INDEX;
}

/** Name of the most specific named node within a child's subtree-first path (for listing). */
function childLabel(child) {
  let n = child;
  while (!n.name && n.children?.length === 1) n = n.children[0];
  return n.name ? { eco: n.eco, name: n.name } : null;
}

/**
 * Look up a move sequence in the tree. Falls back to a FEN match so a
 * transposed move order still finds its opening.
 * Returns { inBook, transposed, opening {eco,name,idea}|null, continuations [{san,name,eco}] }.
 */
export function lookup(sans) {
  const { byPath, byFen } = index();
  let entry = byPath.get(sans.join(' '));
  let transposed = false;
  if (!entry) {
    const r = replay(sans);
    const viaFen = r && byFen.get(fenKey(r.fens[r.fens.length - 1]));
    if (viaFen != null) { entry = byPath.get(viaFen); transposed = true; }
  }
  if (!entry) {
    // deepest known prefix gives the family name
    for (let i = sans.length - 1; i >= 0; i--) {
      const e = byPath.get(sans.slice(0, i).join(' '));
      if (e) return { inBook: false, transposed: false, opening: e.opening, continuations: [] };
    }
    return { inBook: false, transposed: false, opening: null, continuations: [] };
  }
  return {
    inBook: true,
    transposed,
    opening: entry.opening,
    continuations: (entry.node.children || []).map((c) => ({ san: c.san, ...(childLabel(c) || {}) })),
  };
}

// ---------------- repertoire ----------------

export const emptyRepertoire = () => ({ w: [], b: [] });

const samePrefix = (a, b) => a.length <= b.length && a.every((m, i) => b[i] === m);

/** Add a line for colour 'w'|'b'. Lines that are prefixes of the new one are absorbed. */
export function addLine(rep, color, sans) {
  if (!sans.length || !replay(sans)) return rep;
  const lines = rep[color] || [];
  if (lines.some((l) => samePrefix(sans, l))) return rep; // already covered
  return { ...rep, [color]: [...lines.filter((l) => !samePrefix(l, sans)), [...sans]] };
}

export function removeLine(rep, color, sans) {
  const key = sans.join(' ');
  return { ...rep, [color]: (rep[color] || []).filter((l) => l.join(' ') !== key) };
}

export function hasLine(rep, color, sans) {
  return (rep[color] || []).some((l) => samePrefix(sans, l));
}

/** Merge a starter set into an existing repertoire. */
export function mergeRepertoire(rep, starter) {
  let out = rep;
  for (const c of ['w', 'b']) for (const l of starter[c] || []) out = addLine(out, c, l);
  return out;
}

const L = (s) => s.split(' ');
export const STARTERS = [
  {
    id: 'w-italian', label: 'White: Italian Game', color: 'w',
    rep: { w: [
      L('e4 e5 Nf3 Nc6 Bc4 Bc5 c3 Nf6 d3 d6 O-O O-O'),
      L('e4 e5 Nf3 Nc6 Bc4 Nf6 d3 Be7 O-O O-O'),
    ], b: [] },
  },
  {
    id: 'b-caro', label: 'Black vs 1.e4: Caro-Kann', color: 'b',
    rep: { w: [], b: [
      L('e4 c6 d4 d5 Nc3 dxe4 Nxe4 Bf5 Ng3 Bg6 h4 h6'),
      L('e4 c6 d4 d5 e5 Bf5 Nf3 e6 Be2 c5'),
      L('e4 c6 d4 d5 exd5 cxd5 Bd3 Nc6 c3 Nf6'),
    ] },
  },
  {
    id: 'b-qgd', label: "Black vs 1.d4: Queen's Gambit Declined", color: 'b',
    rep: { w: [], b: [
      L('d4 d5 c4 e6 Nc3 Nf6 Bg5 Be7 e3 O-O Nf3 Nbd7'),
      L('d4 d5 c4 e6 Nc3 Nf6 cxd5 exd5 Bg5 c6'),
    ] },
  },
];

// ---------------- drill ----------------

/** The side to move after `sans` ('w' | 'b'). */
export const turnAfter = (sans) => (sans.length % 2 === 0 ? 'w' : 'b');

/** Distinct next moves (from repertoire lines of `color`) after `sans`. */
export function nextMoves(rep, color, sans) {
  const set = new Set();
  for (const l of rep[color] || []) {
    if (l.length > sans.length && samePrefix(sans, l)) set.add(l[sans.length]);
  }
  return [...set];
}

/** SRS card id for the position after `sans` where the user (`color`) must move. */
const CARD_CACHE = new Map();
export function cardId(color, sans) {
  const k = `${color}|${sans.join(' ')}`;
  let id = CARD_CACHE.get(k);
  if (!id) {
    const r = replay(sans);
    id = `${color}|${fenKey(r.fens[r.fens.length - 1])}`;
    if (CARD_CACHE.size > 5000) CARD_CACHE.clear();
    CARD_CACHE.set(k, id);
  }
  return id;
}

/** All user-to-move positions (card ids) in the repertoire for `color`, with the line they come from. */
export function userPositions(rep, color) {
  const seen = new Map();
  for (const l of rep[color] || []) {
    for (let i = 0; i < l.length; i++) {
      if (turnAfter(l.slice(0, i)) !== color) continue;
      const id = cardId(color, l.slice(0, i));
      if (!seen.has(id)) seen.set(id, l.slice(0, i));
    }
  }
  return seen;
}

export const isDue = (card, now) => !card || card.due <= now;

/** Number of repertoire lines for `color` with at least one position due. */
export function dueLineCount(rep, color, srs, now = Date.now()) {
  let n = 0;
  for (const l of rep[color] || []) {
    for (let i = 0; i < l.length; i++) {
      if (turnAfter(l.slice(0, i)) === color && isDue(srs[cardId(color, l.slice(0, i))], now)) { n++; break; }
    }
  }
  return n;
}

/**
 * Choose the trainer's (opponent's) move after `sans`, among repertoire
 * continuations only. Branches whose subtree holds more due positions are
 * favoured. Returns a SAN or null when the line is over.
 */
export function pickOpponentMove(rep, color, sans, srs = {}, now = Date.now(), rng = Math.random) {
  const options = nextMoves(rep, color, sans);
  if (!options.length) return null;
  const weights = options.map((san) => {
    const prefix = [...sans, san];
    let due = 0;
    const counted = new Set();
    for (const l of rep[color] || []) {
      if (!samePrefix(prefix, l)) continue;
      for (let i = prefix.length; i < l.length; i++) {
        if (turnAfter(l.slice(0, i)) !== color) continue;
        const id = cardId(color, l.slice(0, i));
        if (!counted.has(id)) { counted.add(id); if (isDue(srs[id], now)) due++; }
      }
    }
    return 1 + 4 * due;
  });
  let r = rng() * weights.reduce((a, b) => a + b, 0);
  for (let i = 0; i < options.length; i++) { r -= weights[i]; if (r < 0) return options[i]; }
  return options[options.length - 1];
}

/** Is `san` an accepted repertoire move for the user after `sans`? */
export function isRepertoireMove(rep, color, sans, san) {
  return nextMoves(rep, color, sans).includes(san);
}

// ---------------- SRS (SM-2-lite) ----------------

const LADDER = [1, 3, 7, 16, 35, 75, 160];

/** Review a card: correct climbs the interval ladder, wrong resets it (due now). */
export function review(card, correct, now = Date.now()) {
  const prev = card || { interval: 0, reps: 0, lapses: 0, due: now };
  if (!correct) return { interval: 0, reps: 0, lapses: prev.lapses + 1, due: now };
  const idx = LADDER.indexOf(prev.interval);
  const interval = prev.interval === 0 ? LADDER[0]
    : idx >= 0 && idx < LADDER.length - 1 ? LADDER[idx + 1]
      : Math.round(prev.interval * 2.2);
  return { interval, reps: prev.reps + 1, lapses: prev.lapses, due: now + interval * DAY };
}
