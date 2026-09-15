import { useEffect, useMemo, useState } from 'react';
import { Chess } from 'chess.js';

export const GLYPHS = {
  k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟',
};

const FILES = 'abcdefgh';
const RANKS = '87654321';

function placementOf(fen) {
  const g = new Chess(fen);
  const map = {};
  for (const f of FILES) {
    for (let r = 1; r <= 8; r++) {
      const p = g.get(f + r);
      if (p) map[f + r] = p;
    }
  }
  return map;
}

let uid = 0;

/**
 * Diff the previous rendered pieces against the new position.
 * Pieces that changed square keep their key so the CSS transition
 * on `transform` slides them to the new square; vanished pieces are
 * marked captured and fade out; brand-new pieces pop in.
 */
function reconcile(prev, next) {
  const result = [];
  const nextEntries = Object.entries(next);
  const displaced = [];

  for (const p of prev) {
    const i = nextEntries.findIndex(([sq, n]) => sq === p.square && n.color === p.color && n.type === p.type);
    if (i >= 0) {
      nextEntries.splice(i, 1);
      result.push({ ...p, status: 'on' });
    } else {
      displaced.push(p);
    }
  }

  for (const p of displaced) {
    const i = nextEntries.findIndex(([, n]) => n.color === p.color && n.type === p.type);
    if (i >= 0) {
      const [sq] = nextEntries.splice(i, 1)[0];
      result.push({ ...p, square: sq, status: 'on' });
    } else {
      result.push({ ...p, status: 'captured' });
    }
  }

  for (const [sq, n] of nextEntries) {
    result.push({ key: `new-${uid++}`, square: sq, color: n.color, type: n.type, status: 'new' });
  }
  return result;
}

/** Grid coordinates (0..7) of a square for the given orientation. */
function sqXY(sq, flip) {
  const col = FILES.indexOf(sq[0]);
  const row = 8 - parseInt(sq[1]);
  return flip ? { col: 7 - col, row: 7 - row } : { col, row };
}

function MoveArrow({ from, to, flip }) {
  if (!from || !to || from === to) return null;
  const a = sqXY(from, flip);
  const b = sqXY(to, flip);
  let dx = b.col - a.col;
  let dy = b.row - a.row;
  const len = Math.hypot(dx, dy) || 1;
  dx /= len;
  dy /= len;
  // start/end slightly inset from the square centers
  const x1 = a.col + 0.5 + dx * 0.18;
  const y1 = a.row + 0.5 + dy * 0.18;
  const x2 = b.col + 0.5 - dx * 0.32;
  const y2 = b.row + 0.5 - dy * 0.32;
  // arrowhead
  const px = -dy, py = dx;
  const hx = x2 + dx * 0.22;
  const hy = y2 + dy * 0.22;
  return (
    <svg className="move-arrow" viewBox="0 0 8 8" aria-hidden="true">
      <line x1={x1} y1={y1} x2={x2} y2={y2} />
      <polygon points={`${hx},${hy} ${x2 + px * 0.13},${y2 + py * 0.13} ${x2 - px * 0.13},${y2 - py * 0.13}`} />
    </svg>
  );
}

/**
 * Interactive board.
 * props: fen, orientation ('w'|'b'), onMove({from,to,promotion}), highlights {square: class},
 *        lastMove {from,to}, viewOnly, small
 */
export default function Board({ fen, orientation = 'w', onMove, highlights = {}, lastMove, viewOnly = false }) {
  const [selected, setSelected] = useState(null);
  const [promo, setPromo] = useState(null); // {from,to} awaiting promotion choice
  const game = useMemo(() => new Chess(fen), [fen]);
  const flip = orientation === 'b';

  const [pieces, setPieces] = useState(() =>
    Object.entries(placementOf(fen)).map(([sq, p]) => ({
      key: sq, square: sq, color: p.color, type: p.type, status: 'on',
    }))
  );

  useEffect(() => {
    setPieces((prev) => reconcile(prev, placementOf(fen)));
    const t = setTimeout(() => {
      setPieces((prev) => prev.filter((p) => p.status !== 'captured'));
    }, 280);
    return () => clearTimeout(t);
  }, [fen]);

  const squares = [];
  for (const r of RANKS) for (const f of FILES) squares.push(f + r);
  const ordered = [...squares].sort((a, b) => {
    const ia = (8 - parseInt(a[1])) * 8 + FILES.indexOf(a[0]);
    const ib = (8 - parseInt(b[1])) * 8 + FILES.indexOf(b[0]);
    return flip ? ib - ia : ia - ib;
  });

  // drop any pending promotion when the position changes (move was made elsewhere)
  useEffect(() => { setPromo(null); }, [fen]);

  const legalTargets = useMemo(() => {
    if (!selected || viewOnly) return {};
    const map = {};
    for (const m of game.moves({ square: selected, verbose: true })) {
      map[m.to] = m.promotion ? 'promo' : 'move';
    }
    return map;
  }, [selected, fen, viewOnly]); // eslint-disable-line

  function click(sq) {
    if (viewOnly) return;
    const piece = game.get(sq);
    if (selected) {
      if (sq === selected) { setSelected(null); return; }
      if (legalTargets[sq]) {
        if (legalTargets[sq] === 'promo') {
          setPromo({ from: selected, to: sq });
          return;
        }
        onMove({ from: selected, to: sq });
        setSelected(null);
        return;
      }
    }
    setPromo(null);
    if (piece && piece.color === game.turn()) setSelected(sq);
    else setSelected(null);
  }

  function choosePromo(type) {
    onMove({ from: promo.from, to: promo.to, promotion: type });
    setPromo(null);
    setSelected(null);
  }

  return (
    <div className="board-wrap">
      <div className="board" role="grid" aria-label="Chess board">
        {ordered.map((sq) => {
          const isLight = (FILES.indexOf(sq[0]) + parseInt(sq[1])) % 2 === 1;
          const cls = ['sq'];
          cls.push(isLight ? 'light' : 'dark');
          if (lastMove && (sq === lastMove.from || sq === lastMove.to)) cls.push('lastmove');
          if (selected === sq) cls.push('selected');
          if (legalTargets[sq]) cls.push('target-' + legalTargets[sq]);
          if (highlights[sq]) cls.push(highlights[sq]);
          return (
            <button key={sq} className={cls.join(' ')} onClick={() => click(sq)} aria-label={sq}>
              {(sq[0] === (flip ? 'h' : 'a')) && <span className="coord rank">{sq[1]}</span>}
              {(sq[1] === (flip ? '1' : '8')) && <span className="coord file">{sq[0]}</span>}
            </button>
          );
        })}
        {!viewOnly && <MoveArrow from={lastMove?.from} to={lastMove?.to} flip={flip} />}
        {promo && (() => {
          const pr = sqXY(promo.to, flip);
          const mover = game.turn();
          const dir = flip ? 1 : -1; // stack toward the board interior
          const rows = [0, 1, 2, 3].map((i) => pr.row + dir * i);
          const fixed = rows.every((r) => r >= 0 && r <= 7) ? rows : [0, 1, 2, 3].map((i) => pr.row - dir * i);
          return (
            <div className="promo-chooser" role="dialog" aria-label="Choose promotion piece">
              {['q', 'n', 'r', 'b'].map((t, i) => (
                <button
                  key={t}
                  type="button"
                  className={`promo-btn ${mover === 'w' ? 'white' : 'black'}`}
                  style={{ left: `${pr.col * 12.5}%`, top: `${fixed[i] * 12.5}%` }}
                  onClick={(e) => { e.stopPropagation(); choosePromo(t); }}
                  aria-label={`Promote to ${t}`}
                >
                  {GLYPHS[t]}
                </button>
              ))}
              <button type="button" className="promo-cancel" onClick={() => setPromo(null)} aria-label="Cancel promotion">✕</button>
            </div>
          );
        })()}
        <div className="pieces" aria-hidden="true">
          {pieces.map((p) => {
            const { col, row } = sqXY(p.square, flip);
            const cls = [
              'piece-pos',
              p.status === 'captured' ? 'captured' : '',
            ].filter(Boolean).join(' ');
            const inner = [
              'piece',
              p.color === 'w' ? 'white' : 'black',
              p.status === 'new' ? 'spawned' : '',
              selected === p.square ? 'lifted' : '',
            ].filter(Boolean).join(' ');
            return (
              <span
                key={p.key}
                className={cls}
                style={{ transform: `translate(${col * 100}%, ${row * 100}%)` }}
              >
                <span className={inner}>{GLYPHS[p.type]}</span>
              </span>
            );
          })}
        </div>
      </div>
    </div>
  );
}
