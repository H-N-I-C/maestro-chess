#!/usr/bin/env node
/* Builds src/data/puzzles.json — a curated slice of the Lichess puzzle database (CC0).
   Usage:
     curl -sL https://database.lichess.org/lichess_db_puzzle.csv.zst | zstd -dc | head -n 400000 \
       | node scripts/build-puzzles.mjs
   or: node scripts/build-puzzles.mjs path/to/lichess_db_puzzle.csv
   Output rows are compact arrays: [id, fen, "uci uci …", rating, "theme theme …"].
   Selection is deterministic for a given input. */
import { createReadStream, writeFileSync, mkdirSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { Chess } from 'chess.js';

const MIN = 600, MAX = 2400, BAND = 100, TOTAL = 1500;
const BANDS = (MAX - MIN) / BAND;
const PER_BAND = Math.ceil(TOTAL / BANDS);
const OUT = new URL('../src/data/puzzles.json', import.meta.url);
// themes that describe length/phase rather than the tactic — ignored when balancing the mix
const GENERIC = new Set(['short', 'long', 'veryLong', 'oneMove', 'middlegame', 'opening', 'endgame', 'advantage', 'crushing', 'equality', 'master', 'masterVsMaster', 'superGM', 'mate']);

function legal(fen, moves) {
  try {
    const g = new Chess(fen);
    for (const m of moves) g.move({ from: m.slice(0, 2), to: m.slice(2, 4), promotion: m[4] });
    return true;
  } catch { return false; }
}

const input = process.argv[2] ? createReadStream(process.argv[2]) : process.stdin;
const rl = createInterface({ input, crlfDelay: Infinity });
const bands = Array.from({ length: BANDS }, () => []);
let header = true;
for await (const line of rl) {
  if (header) { header = false; continue; }
  const [id, fen, moves, rating, , pop, plays, themes] = line.split(',');
  const r = Number(rating);
  if (!(r >= MIN && r < MAX)) continue;
  if (Number(pop) < 80 || Number(plays) < 500) continue;
  const mv = moves.split(' ');
  if (mv.length < 2 || mv.length > 8) continue;
  bands[Math.floor((r - MIN) / BAND)].push({ id, fen, moves, rating: r, themes, score: Number(pop) * Math.log(Number(plays)) });
}

const out = [];
for (const cands of bands) {
  cands.sort((a, b) => b.score - a.score || (a.id < b.id ? -1 : 1));
  // greedy theme balancing: take the best candidate whose main tactic is least used so far
  const used = new Map();
  const key = (p) => p.themes.split(' ').find((t) => !GENERIC.has(t)) || p.themes.split(' ')[0];
  const pool = cands.slice(0, PER_BAND * 20);
  const picked = [];
  while (picked.length < PER_BAND && pool.length) {
    let bestI = 0, bestUse = Infinity;
    for (let i = 0; i < pool.length && i < 400; i++) {
      const u = used.get(key(pool[i])) || 0;
      if (u < bestUse) { bestUse = u; bestI = i; if (u === 0) break; }
    }
    const [p] = pool.splice(bestI, 1);
    if (!legal(p.fen, p.moves.split(' '))) continue;
    used.set(key(p), (used.get(key(p)) || 0) + 1);
    picked.push(p);
  }
  out.push(...picked);
}
out.sort((a, b) => a.rating - b.rating || (a.id < b.id ? -1 : 1));
const rows = out.slice(0, TOTAL).map((p) => [p.id, p.fen, p.moves, p.rating, p.themes]);
mkdirSync(new URL('../src/data/', import.meta.url), { recursive: true });
writeFileSync(OUT, JSON.stringify(rows));
console.log(`wrote ${rows.length} puzzles; per band: ${bands.map((b) => b.length).join(',')}`);
