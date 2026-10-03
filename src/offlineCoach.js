/* Offline coach — heuristic chess teacher powered by the local engine.
   Used whenever no COACH_API_KEY is configured on the server. */

import { Chess } from 'chess.js';
import { analyze } from './engine.js';
import { loadFen, isChess960Pgn, load960Pgn } from './chess960.js';
import { t } from './i18n.js';
import { uciToSan } from './review.js';

const PIECE_VALUES = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };

function describeEval(cp, side) {
  const pawns = Math.abs(cp) / 100;
  if (pawns < 0.3) return t('offlineCoach.eval.equal');
  const betterSide = cp > 0 ? side : (side === 'w' ? 'b' : 'w');
  const who = t(`offlineCoach.side.${betterSide}`);
  if (pawns < 1) return t('offlineCoach.eval.slight', { side: who });
  if (pawns < 2.5) return t('offlineCoach.eval.better', { side: who, count: Math.round(pawns) });
  return t('offlineCoach.eval.winning', { side: who });
}

/** Simple attack/defender audit: find pieces attacked more than defended. */
function hangingPieces(fen) {
  const g = loadFen(fen);
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
        report.push(t('offlineCoach.hanging', {
          side: t(`offlineCoach.owner.${p.color}`), piece: t(`offlineCoach.piece.${p.type}`), square, attackers, defenders,
        }));
      }
    }
  }
  return report;
}

export async function offlineCoachReply({ fen, pgn, message, stage }) {
  const g = loadFen(fen);
  const side = g.turn();
  const q = (message || '').toLowerCase();
  const lines = [];

  // keyword-ish intents get richer answers
  const wantsConcept = /(fork|pin|skewer|mate|opening|endgame|tactic|what should|plan|idea|help|debería|ayuda|clavada|horquilla|apertura|final|táctica)/.test(q); // + Spanish quick questions

  // single shallow pass — the shared engine queue stays responsive for moves
  const [before, after] = await Promise.all([
    pgn ? evalAfterLastMove(pgn) : Promise.resolve(null),
    analyze(fen, { depth: 6, movetime: 200 }),
  ]);

  lines.push(t('offlineCoach.looking', { eval: describeEval(after.cp ?? 0, side) }));

  if (before && before.cpBefore != null && after.cp != null) {
    // swing from perspective of the side that just moved
    const movedSide = side === 'w' ? 'b' : 'w';
    const theirSwing = (after.cp - before.cpBefore) * (movedSide === 'w' ? 1 : -1);
    if (theirSwing < -120) lines.push(t('offlineCoach.lost', { count: Math.round(-theirSwing / 100), best: before.best }));
    else if (theirSwing > 120) lines.push(t('offlineCoach.gained', { count: Math.round(theirSwing / 100) }));
  }

  // engine moves are UCI (e2e4); show them in normal notation (e4)
  if (after.bestmove && after.bestmove !== '(none)') lines.push(t('offlineCoach.suggestion', { move: uciToSan(fen, after.bestmove) || after.bestmove }));

  const hanging = hangingPieces(fen);
  if (hanging.length) lines.push(hanging.length > 1 ? t('offlineCoach.alertTwo', { first: hanging[0], second: hanging[1] }) : t('offlineCoach.alert', { first: hanging[0] }));

  if (wantsConcept) {
    if (stage) lines.push(t('offlineCoach.stage', { stage }));
    lines.push(t('offlineCoach.tip'));
  } else if (q) {
    lines.push(t('offlineCoach.cantDiscuss', { message }));
  }

  return lines.join('\n\n');
}

async function evalAfterLastMove(pgn) {
  try {
    const load = () => { if (isChess960Pgn(pgn)) return load960Pgn(pgn); const c = new Chess(); c.loadPgn(pgn); return c; };
    const g = load();
    const moves = g.history();
    if (moves.length < 1) return null;
    const g2 = load();
    g2.undo();
    const res = await analyze(g2.fen(), { depth: 6, movetime: 150 });
    return { cpBefore: res.cp, best: (res.bestmove && uciToSan(g2.fen(), res.bestmove)) || res.bestmove };
  } catch {
    return null;
  }
}
