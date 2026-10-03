import { useEffect, useMemo, useRef, useState } from 'react';
import { Chess } from 'chess.js';

export const GLYPHS = {
  k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟',
};

export const PIECE_LETTERS = { k: 'K', q: 'Q', r: 'R', b: 'B', n: 'N', p: 'P' };
export const PIECE_NAMES = { k: 'king', q: 'queen', r: 'rook', b: 'bishop', n: 'knight', p: 'pawn' };

/** Render a piece as a unicode glyph (classic) or a styled letter (letters). */
export function PieceGlyph({ type, color, pieceSet = 'classic', className = '' }) {
  if (pieceSet === 'letters') {
    return (
      <span className={`piece letter-piece ${color === 'w' ? 'white' : 'black'} ${className}`}>
        {PIECE_LETTERS[type]}
      </span>
    );
  }
  return <span className={`piece ${color === 'w' ? 'white' : 'black'} ${className}`}>{GLYPHS[type]}</span>;
}

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
      result.push({ ...p, square: sq, status: 'moved' });
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

function MoveArrow({ from, to, flip, className = '' }) {
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
    <svg className={`move-arrow ${className}`} viewBox="0 0 8 8" aria-hidden="true">
      <line x1={x1} y1={y1} x2={x2} y2={y2} />
      <polygon points={`${hx},${hy} ${x2 + px * 0.13},${y2 + py * 0.13} ${x2 - px * 0.13},${y2 - py * 0.13}`} />
    </svg>
  );
}

/** Legal-looking targets for a premove: the position with the other side to move. */
function premoveTargets(fen, from) {
  try {
    const parts = fen.split(' ');
    parts[1] = parts[1] === 'w' ? 'b' : 'w';
    parts[3] = '-';
    const g = new Chess(parts.join(' '), { skipValidation: true });
    const map = {};
    for (const m of g.moves({ square: from, verbose: true })) map[m.to] = m.promotion ? 'promo' : 'move';
    // pawns may premove-capture onto squares the opponent might move to
    const p = g.get(from);
    if (p?.type === 'p') {
      const dir = p.color === 'w' ? 1 : -1;
      const r = parseInt(from[1]) + dir;
      for (const df of [-1, 1]) {
        const f = FILES[FILES.indexOf(from[0]) + df];
        if (f && r >= 1 && r <= 8) map[f + r] = r === 1 || r === 8 ? 'promo' : 'move';
      }
    }
    return map;
  } catch {
    return {};
  }
}

/**
 * Interactive board.
 * props: fen, orientation ('w'|'b'), onMove({from,to,promotion}), highlights {square: class},
 *        lastMove {from,to}, viewOnly, hint {from,to},
 *        arrows [{from,to,kind}] — engine/review arrows (kind → .arrow-<kind>),
 *        premove {from,to} + onPremove(move|null) + playerColor — queue a move while it's the opponent's turn.
 * Right-click a square to circle it, right-drag to draw an arrow (cleared by a left click or a new position).
 */
export default function Board({ fen, orientation = 'w', onMove, highlights = {}, lastMove, hint = null, arrows = [], pieceSet = 'classic', viewOnly = false, showCoords = true, blindfold = false, flashSquare = null, premove = null, onPremove = null, playerColor = null }) {
  const [selected, setSelected] = useState(null);
  const [promo, setPromo] = useState(null); // {from,to} awaiting promotion choice
  const [drag, setDrag] = useState(null); // {from,x,y} while dragging
  const [kbFocus, setKbFocus] = useState(null); // keyboard focus square
  const pendingRef = useRef(null); // {sq,x,y} pointer-down candidate
  const suppressClickRef = useRef(false);
  const game = useMemo(() => new Chess(fen), [fen]);
  const flip = orientation === 'b';
  // premove mode: it's the opponent's turn and the parent accepts queued moves
  const premoving = Boolean(onPremove && playerColor && game.turn() !== playerColor && !viewOnly);
  const myTurnColor = premoving ? playerColor : game.turn();
  const [marks, setMarks] = useState({ circles: [], arrows: [] }); // user annotations
  const rightDownRef = useRef(null);
  useEffect(() => { setMarks({ circles: [], arrows: [] }); }, [fen]);

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

  // ---- keyboard play: arrows move the focus square, Enter/Space picks up
  // and drops (routes through the same click logic as the mouse, so the
  // promotion chooser and legality checks behave identically) ----
  function stepKbFocus(dFile, dRank) {
    setKbFocus((cur) => {
      const base = cur || (orientation === 'b' ? 'd5' : 'e4');
      const f = FILES.indexOf(base[0]) + dFile;
      const r = parseInt(base[1]) + dRank;
      if (f < 0 || f > 7 || r < 1 || r > 8) return cur;
      return FILES[f] + r;
    });
  }

  function onBoardKeyDown(e) {
    if (viewOnly) return;
    const arrows = { ArrowUp: [0, 1], ArrowDown: [0, -1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] };
    if (arrows[e.key]) {
      e.preventDefault();
      e.stopPropagation(); // don't let Play's history-navigation listener see it
      stepKbFocus(...arrows[e.key]);
      return;
    }
    if (e.key === 'Escape') {
      if (selected || promo) {
        e.preventDefault();
        e.stopPropagation();
        setSelected(null);
        setPromo(null);
      }
      return;
    }
    if (e.key === 'Enter' || e.key === ' ') {
      if (!kbFocus) return;
      e.preventDefault();
      e.stopPropagation();
      click(kbFocus);
    }
  }

  const legalTargets = useMemo(() => {
    if (!selected || viewOnly) return {};
    if (premoving) return premoveTargets(fen, selected);
    const map = {};
    for (const m of game.moves({ square: selected, verbose: true })) {
      map[m.to] = m.promotion ? 'promo' : 'move';
    }
    return map;
  }, [selected, fen, viewOnly, premoving]); // eslint-disable-line

  /** Route a chosen move: a real move, or a queued premove. */
  function submit(move) {
    if (premoving) onPremove({ ...move, promotion: move.promotion || (legalTargets[move.to] === 'promo' ? 'q' : undefined) });
    else onMove(move);
  }

  // ---- right-click annotations (laptop/desktop) ----
  function onContextMenu(e) { e.preventDefault(); }
  function onRightDown(e, sq) {
    if (e.button !== 2) return;
    rightDownRef.current = sq;
  }
  function onRightUp(e) {
    if (e.button !== 2 || !rightDownRef.current) return;
    const from = rightDownRef.current;
    rightDownRef.current = null;
    const el = document.elementFromPoint(e.clientX, e.clientY);
    const to = el?.closest?.('[data-sq]')?.getAttribute('data-sq');
    if (!to) return;
    setMarks((m) => {
      if (to === from) {
        const has = m.circles.includes(from);
        return { ...m, circles: has ? m.circles.filter((c) => c !== from) : [...m.circles, from] };
      }
      const has = m.arrows.some((a) => a.from === from && a.to === to);
      return { ...m, arrows: has ? m.arrows.filter((a) => !(a.from === from && a.to === to)) : [...m.arrows, { from, to }] };
    });
  }

  function click(sq) {
    if (suppressClickRef.current) { suppressClickRef.current = false; return; }
    if (marks.circles.length || marks.arrows.length) setMarks({ circles: [], arrows: [] });
    if (viewOnly) return;
    const piece = game.get(sq);
    if (selected) {
      if (sq === selected) { setSelected(null); return; }
      if (legalTargets[sq]) {
        if (legalTargets[sq] === 'promo' && !premoving) {
          setPromo({ from: selected, to: sq });
          return;
        }
        submit({ from: selected, to: sq });
        setSelected(null);
        return;
      }
    }
    setPromo(null);
    if (premoving && premove) onPremove(null); // clicking elsewhere cancels a queued premove
    if (piece && piece.color === myTurnColor) setSelected(sq);
    else setSelected(null);
  }

  // ---- drag and drop ----
  function onSqPointerDown(e, sq) {
    if (viewOnly || e.button !== 0) return;
    if (selected === sq || legalTargets[sq]) return; // let click handling deal with it
    const piece = game.get(sq);
    if (!(piece && piece.color === myTurnColor)) return;
    pendingRef.current = { sq, x: e.clientX, y: e.clientY };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  }

  function onSqPointerMove(e, sq) {
    const p = pendingRef.current;
    if (!p || p.sq !== sq) return;
    const dx = e.clientX - p.x;
    const dy = e.clientY - p.y;
    if (!drag && Math.hypot(dx, dy) > 7) {
      setSelected(p.sq);
      setDrag({ from: p.sq, x: e.clientX, y: e.clientY });
    } else if (drag) {
      setDrag({ from: drag.from, x: e.clientX, y: e.clientY });
    }
  }

  function onSqPointerUp(e, sq) {
    const p = pendingRef.current;
    pendingRef.current = null;
    if (!drag || !p || p.sq !== sq) return;
    suppressClickRef.current = true;
    const el = document.elementFromPoint(e.clientX, e.clientY);
    const target = el?.closest?.('[data-sq]')?.getAttribute('data-sq') || null;
    const from = drag.from;
    setDrag(null);
    if (target && target !== from && legalTargets[target]) {
      if (legalTargets[target] === 'promo' && !premoving) setPromo({ from, to: target });
      else { submit({ from, to: target }); setSelected(null); }
    } else if (target === from) {
      setSelected(from); // dropped back on its own square = select
    } else {
      setSelected(null);
    }
  }

  function choosePromo(type) {
    onMove({ from: promo.from, to: promo.to, promotion: type });
    setPromo(null);
    setSelected(null);
  }

  return (
    <div className="board-wrap">
      <div
        className="board"
        role="grid"
        aria-label="Chess board. Use arrow keys to move the focus square, Enter to select and move."
        tabIndex={0}
        onKeyDown={onBoardKeyDown}
        onContextMenu={onContextMenu}
        onPointerUp={onRightUp}
      >
        {ordered.map((sq) => {
          const isLight = (FILES.indexOf(sq[0]) + parseInt(sq[1])) % 2 === 1;
          const cls = ['sq'];
          cls.push(isLight ? 'light' : 'dark');
          if (lastMove && (sq === lastMove.from || sq === lastMove.to)) cls.push('lastmove');
          if (selected === sq) cls.push('selected');
          if (kbFocus === sq) cls.push('kb-focus');
          if (legalTargets[sq]) cls.push('target-' + legalTargets[sq]);
          if (highlights[sq]) cls.push(highlights[sq]);
          if (premove && (sq === premove.from || sq === premove.to)) cls.push('premove');
          if (marks.circles.includes(sq)) cls.push('marked');
          const occupant = game.get(sq);
          let label = sq;
          if (occupant) label += `, ${occupant.color === 'w' ? 'white' : 'black'} ${PIECE_NAMES[occupant.type]}`;
          else label += ', empty';
          if (legalTargets[sq]) {
            label += occupant && occupant.color !== game.turn()
              ? `, can capture ${occupant.color === 'w' ? 'white' : 'black'} ${PIECE_NAMES[occupant.type]}`
              : ', legal move';
          }
          return (
            <button
              key={sq}
              data-sq={sq}
              className={cls.join(' ')}
              onClick={() => click(sq)}
              onPointerDown={(e) => { onRightDown(e, sq); onSqPointerDown(e, sq); }}
              onPointerMove={(e) => onSqPointerMove(e, sq)}
              onPointerUp={(e) => onSqPointerUp(e, sq)}
              aria-label={label}
            >
              {showCoords && (sq[0] === (flip ? 'h' : 'a')) && <span className="coord rank">{sq[1]}</span>}
              {showCoords && (sq[1] === (flip ? '8' : '1')) && <span className="coord file">{sq[0]}</span>}
            </button>
          );
        })}
        {!viewOnly && <MoveArrow from={lastMove?.from} to={lastMove?.to} flip={flip} />}
        {hint && <MoveArrow from={hint.from} to={hint.to} flip={flip} className="hint-arrow" />}
        {arrows.map((a, i) => <MoveArrow key={`a${i}`} from={a.from} to={a.to} flip={flip} className={`arrow-${a.kind || 'best'}`} />)}
        {marks.arrows.map((a, i) => <MoveArrow key={`m${i}`} from={a.from} to={a.to} flip={flip} className="arrow-user" />)}
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
                  <PieceGlyph type={t} color={mover} pieceSet={blindfold ? 'letters' : pieceSet} />
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
            return (
              <span
                key={p.key}
                className={cls}
                style={{ transform: `translate(${col * 100}%, ${row * 100}%)` }}
              >
                {!(blindfold && p.square !== flashSquare) && (
                <PieceGlyph
                  type={p.type}
                  color={p.color}
                  pieceSet={pieceSet}
                  className={[
                    p.status === 'new' ? 'spawned' : '',
                    p.status === 'moved' ? 'moved' : '',
                    selected === p.square ? 'lifted' : '',
                  ].filter(Boolean).join(' ')}
                />
                )}
              </span>
            );
          })}
        </div>
        {drag && (() => {
          const p = game.get(drag.from);
          return p && !(blindfold && drag.from !== flashSquare) ? (
            <span className="drag-ghost" style={{ left: drag.x, top: drag.y }} aria-hidden="true">
              <PieceGlyph type={p.type} color={p.color} pieceSet={pieceSet} />
            </span>
          ) : null;
        })()}
      </div>
    </div>
  );
}
