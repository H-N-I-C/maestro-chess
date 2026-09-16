/* Offline coach — heuristic chess teacher powered by the local engine.
   Used whenever no COACH_API_KEY is configured on the server. */

import { Chess } from 'chess.js';
import { analyze } from './engine.js';

const PIECE_VALUES = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };

function describeEval(cp, side) {
  const pawns = Math.abs(cp) / 100;
  if (pawns < 0.3) return 'roughly equal';
  const betterSide = cp > 0 ? side : (side === 'w' ? 'b' : 'w');
  const who = betterSide === 'w' ? 'White' : 'Black';
  if (pawns < 1) return `slightly better for ${who}`;
  if (pawns < 2.5) return `better for ${who} (~${Math.round(pawns)} pawns)`;
  return `clearly winning for ${who}`;
}

/** Simple attack/defender audit: find pieces attacked more than defended. */
function hangingPieces(fen) {
  const g = new Chess(fen);
  const report = [];
  const board = g.board();
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const square = `${'abcdefgh'[c]}${8 - r}`;
      const p = board[r][c];
      if (!p) continue;
      const enemy = p.color === 'w' ? 'b' : 'w';
      const attackers = g.attackers(square, enemy).length;
      const defenders = g.attackers(square, p.color).length;
      if (attackers > defenders && PIECE_VALUES[p.type] >= 3 && attackers > 0) {
        const name = p.type === 'n' ? 'knight' : p.type === 'b' ? 'bishop' : p.type === 'r' ? 'rook' : 'queen';
        report.push(`${p.color === 'w' ? 'White' : 'Black'}'s ${name} on ${square} is attacked ${attackers}× and defended only ${defenders}×`);
      }
    }
  }
  return report;
}

function material(fen) {
  const g = new Chess(fen);
  let score = 0;
  for (const row of g.board()) for (const p of row) if (p) score += (p.color === 'w' ? 1 : -1) * PIECE_VALUES[p.type];
  return score;
}

export async function offlineCoachReply({ fen, pgn, message, history, stage }) {
  const g = new Chess(fen);
  const side = g.turn();
  const q = (message || '').toLowerCase();
  const lines = [];

  // keyword-ish intents get richer answers
  const wantsConcept = /(fork|pin|skewer|mate|opening|endgame|tactic|what should|plan|idea|help)/.test(q);

  const [before, after] = await Promise.all([
    pgn ? evalAfterLastMove(pgn) : Promise.resolve(null),
    analyze(fen, { depth: 11, movetime: 350 }),
  ]);

  lines.push(`Looking at the position: it's ${describeEval(after.cp ?? 0, side)}.`);

  if (before && before.cpBefore != null && after.cp != null) {
    // swing from perspective of the side that just moved
    const movedSide = side === 'w' ? 'b' : 'w';
    const theirSwing = (after.cp - before.cpBefore) * (movedSide === 'w' ? 1 : -1);
    if (theirSwing < -120) lines.push(`Your last move lost roughly ${Math.round(-theirSwing / 100)} pawn-units. The engine preferred ${before.best} — replay it and compare the ideas.`);
    else if (theirSwing > 120) lines.push(`Good move! You gained roughly ${Math.round(theirSwing / 100)} pawn-units over the alternative.`);
  }

  if (after.bestmove) lines.push(`Engine's suggestion right now: ${after.bestmove}.`);

  const hanging = hangingPieces(fen);
  if (hanging.length) lines.push(`Tactical alert: ${hanging[0]}${hanging.length > 1 ? ` (also: ${hanging[1]})` : ''}.`);

  if (wantsConcept) {
    if (stage) lines.push(`You're working on "${stage}". Tie this position back to it: ask yourself what that stage's core idea would prescribe here.`);
    lines.push('Tip: I\'m the offline coach (no AI key configured on the server). Add COACH_API_KEY to the container for full conversation.');
  } else if (q) {
    lines.push(`(Offline coach: I can't discuss "${message}" freely — my replies are position analysis. Add an API key for the full AI coach.)`);
  }

  return lines.join('\n\n');
}

async function evalAfterLastMove(pgn) {
  try {
    const g = new Chess();
    g.loadPgn(pgn);
    const moves = g.history();
    if (moves.length < 1) return null;
    const g2 = new Chess();
    g2.loadPgn(pgn);
    g2.undo();
    const res = await analyze(g2.fen(), { depth: 10, movetime: 250 });
    return { cpBefore: res.cp, best: res.bestmove };
  } catch {
    return null;
  }
}
