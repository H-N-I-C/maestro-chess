import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Chess } from 'chess.js';
import Board from './Board.jsx';
import { playMoveSound } from '../sound.js';
import { openingName } from '../openings.js';
import {
  replay, lookup, addLine, removeLine, hasLine, emptyRepertoire, mergeRepertoire, STARTERS,
  turnAfter, nextMoves, pickOpponentMove, cardId, review, dueLineCount,
} from '../openingTrainer.js';
import './openings.css';

const REP_KEY = 'maestro-repertoire';
const SRS_KEY = 'maestro-opening-srs';

function load(key, fallback) {
  try {
    const v = JSON.parse(localStorage.getItem(key));
    return v && typeof v === 'object' ? v : fallback;
  } catch { return fallback; }
}
function save(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage unavailable */ }
}

const COLOR_NAME = { w: 'White', b: 'Black' };

/** SAN + capture flag for a board move from `fen`, or null if illegal. */
function toSan(fen, { from, to, promotion }) {
  const g = new Chess(fen);
  try {
    const mv = g.move({ from, to, promotion: promotion || 'q' });
    return { san: mv.san, capture: Boolean(mv.captured), from: mv.from, to: mv.to };
  } catch { return null; }
}
function squaresOf(fen, san) {
  const g = new Chess(fen);
  const mv = g.move(san);
  return { from: mv.from, to: mv.to, capture: Boolean(mv.captured) };
}

function MoveList({ sans, cursor, onJump }) {
  if (!sans.length) return <p className="op-muted">Starting position. Play a move or pick one below.</p>;
  return (
    <ol className="op-moves" aria-label="Moves">
      {sans.map((s, i) => (
        <li key={i} className={i % 2 === 0 ? 'w' : 'b'}>
          {i % 2 === 0 && <span className="op-num">{i / 2 + 1}.</span>}
          <button
            type="button"
            className={`op-ply${i === cursor - 1 ? ' current' : ''}${i >= cursor ? ' ahead' : ''}`}
            aria-current={i === cursor - 1 ? 'step' : undefined}
            onClick={() => onJump(i + 1)}
          >{s}</button>
        </li>
      ))}
    </ol>
  );
}

export default function Openings() {
  const [mode, setMode] = useState('explore');
  const [rep, setRep] = useState(() => {
    const r = load(REP_KEY, emptyRepertoire());
    return { w: Array.isArray(r.w) ? r.w : [], b: Array.isArray(r.b) ? r.b : [] };
  });
  const [srs, setSrs] = useState(() => load(SRS_KEY, {}));
  const [announce, setAnnounce] = useState('');
  const [orientation, setOrientation] = useState('w');

  useEffect(() => { save(REP_KEY, rep); }, [rep]);
  useEffect(() => { save(SRS_KEY, srs); }, [srs]);

  // ---------- explore ----------
  const [line, setLine] = useState([]);
  const [cursor, setCursor] = useState(0);
  const shown = useMemo(() => line.slice(0, cursor), [line, cursor]);
  const exploreFens = useMemo(() => replay(shown)?.fens || [new Chess().fen()], [shown]);
  const exploreFen = exploreFens[exploreFens.length - 1];
  const info = useMemo(() => lookup(shown), [shown]);
  const lastMove = useMemo(() => (shown.length ? squaresOf(exploreFens[exploreFens.length - 2], shown[shown.length - 1]) : null), [shown, exploreFens]);

  const playExplore = useCallback((san, capture) => {
    const next = [...shown, san];
    // keep the forward line if the move matches it
    setLine((l) => (l[cursor] === san ? l : next));
    setCursor(cursor + 1);
    playMoveSound({ capture });
  }, [shown, cursor]);

  const onExploreMove = (mv) => {
    const r = toSan(exploreFen, mv);
    if (r) playExplore(r.san, r.capture);
  };
  const back = useCallback(() => setCursor((c) => Math.max(0, c - 1)), []);
  const forward = useCallback(() => setCursor((c) => Math.min(line.length, c + 1)), [line.length]);
  const reset = () => { setLine([]); setCursor(0); };

  useEffect(() => {
    const onKey = (e) => {
      const t = e.target;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      // Listening on document (after React's root handlers, before window):
      // the hidden Play tab listens for arrows on window and must not react
      // while Openings is showing, so stop the event here.
      e.stopPropagation();
      if (mode !== 'explore' || t?.closest?.('.board')) return; // board uses arrows for keyboard play
      e.preventDefault();
      if (e.key === 'ArrowLeft') back(); else forward();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [mode, back, forward]);

  const addCurrent = (color) => {
    if (!shown.length) return;
    setRep((r) => addLine(r, color, shown));
    setAnnounce(`Line added to your ${COLOR_NAME[color]} repertoire`);
  };

  const exploreLine = (l) => { setLine(l); setCursor(l.length); setMode('explore'); };

  // ---------- drill ----------
  const [drillColor, setDrillColor] = useState('w');
  const [drill, setDrill] = useState(null); // { sans, misses, wrongFen, hint, results:{ok,bad}, done }
  const timer = useRef(null);
  useEffect(() => () => clearTimeout(timer.current), []);

  const now = Date.now();
  const dueW = dueLineCount(rep, 'w', srs, now);
  const dueB = dueLineCount(rep, 'b', srs, now);

  const startDrill = (color = drillColor) => {
    clearTimeout(timer.current);
    setDrillColor(color);
    setOrientation(color);
    setDrill({ sans: [], misses: 0, wrongFen: null, hint: null, results: { ok: 0, bad: 0 }, done: false });
    setAnnounce(`Drill started as ${COLOR_NAME[color]}`);
  };

  // trainer plays the opponent's moves
  useEffect(() => {
    if (mode !== 'drill' || !drill || drill.done || drill.wrongFen) return undefined;
    const { sans } = drill;
    if (turnAfter(sans) === drillColor) {
      if (!nextMoves(rep, drillColor, sans).length) setDrill((d) => ({ ...d, done: true }));
      return undefined;
    }
    timer.current = setTimeout(() => {
      const san = pickOpponentMove(rep, drillColor, sans, srs);
      if (!san) { setDrill((d) => ({ ...d, done: true })); return; }
      const fens = replay(sans).fens;
      playMoveSound({ capture: squaresOf(fens[fens.length - 1], san).capture });
      setDrill((d) => ({ ...d, sans: [...d.sans, san], misses: 0, hint: null }));
    }, sans.length ? 450 : 250);
    return () => clearTimeout(timer.current);
  }, [mode, drill, drillColor, rep, srs]);

  useEffect(() => {
    if (drill?.done) {
      const { ok, bad } = drill.results;
      setAnnounce(`Line complete: ${ok} correct, ${bad} missed`);
    }
  }, [drill?.done]); // eslint-disable-line react-hooks/exhaustive-deps

  const drillFens = useMemo(() => (drill ? replay(drill.sans).fens : [new Chess().fen()]), [drill]);
  const drillFen = drill?.wrongFen || drillFens[drillFens.length - 1];

  const onDrillMove = (mv) => {
    if (!drill || drill.done || drill.wrongFen || turnAfter(drill.sans) !== drillColor) return;
    const base = drillFens[drillFens.length - 1];
    const r = toSan(base, mv);
    if (!r) return;
    const expected = nextMoves(rep, drillColor, drill.sans);
    const id = cardId(drillColor, drill.sans);
    if (expected.includes(r.san)) {
      playMoveSound({ capture: r.capture });
      const clean = drill.misses === 0;
      if (clean) setSrs((s) => ({ ...s, [id]: review(s[id], true) }));
      setAnnounce(clean ? 'Correct' : `Correct — ${r.san}`);
      setDrill((d) => ({
        ...d, sans: [...d.sans, r.san], misses: 0, hint: null,
        results: clean ? { ...d.results, ok: d.results.ok + 1 } : d.results,
      }));
      return;
    }
    // wrong: show it briefly, then take it back
    const g = new Chess(base);
    g.move(r.san);
    const misses = drill.misses + 1;
    if (misses === 1) setSrs((s) => ({ ...s, [id]: review(s[id], false) }));
    const answer = expected[0];
    const hint = misses >= 2 ? squaresOf(base, answer) : null;
    setAnnounce(misses >= 2 ? `Not in your repertoire. The move is ${answer}` : 'Not in your repertoire. Try again');
    setDrill((d) => ({
      ...d, wrongFen: g.fen(), wrongMove: { from: r.from, to: r.to }, misses, hint,
      results: misses === 1 ? { ...d.results, bad: d.results.bad + 1 } : d.results,
    }));
    timer.current = setTimeout(() => setDrill((d) => d && { ...d, wrongFen: null, wrongMove: null }), 700);
  };

  const drillLast = useMemo(() => {
    if (!drill) return null;
    if (drill.wrongMove) return drill.wrongMove;
    if (!drill.sans.length) return null;
    const s = squaresOf(drillFens[drillFens.length - 2], drill.sans[drill.sans.length - 1]);
    return { from: s.from, to: s.to };
  }, [drill, drillFens]);

  const drillInfo = drill ? lookup(drill.sans) : null;
  const userTurn = drill && !drill.done && turnAfter(drill.sans) === drillColor;
  const repCount = rep[drillColor].length;

  // ---------- render ----------
  const boardProps = mode === 'drill'
    ? {
      fen: drillFen,
      orientation,
      onMove: onDrillMove,
      lastMove: drillLast,
      viewOnly: !userTurn || Boolean(drill?.wrongFen),
      hint: drill?.hint ? { from: drill.hint.from, to: drill.hint.to } : null,
      highlights: drill?.wrongMove ? { [drill.wrongMove.to]: 'op-wrong' } : {},
    }
    : { fen: exploreFen, orientation, onMove: onExploreMove, lastMove, arrows: [] };

  const name = info.opening?.name || openingName(shown);

  return (
    <div className="openings">
      <div className="op-modes" role="tablist" aria-label="Openings mode">
        {[['explore', 'Explore'], ['repertoire', 'Repertoire'], ['drill', 'Drill']].map(([id, label]) => (
          <button
            key={id} type="button" role="tab" aria-selected={mode === id}
            className={`op-mode${mode === id ? ' active' : ''}`}
            onClick={() => setMode(id)}
          >
            {label}
            {id === 'drill' && dueW + dueB > 0 && <span className="op-badge" aria-label={`${dueW + dueB} lines due`}>{dueW + dueB}</span>}
          </button>
        ))}
      </div>

      <div className="op-layout">
        <div className="op-board">
          <Board {...boardProps} />
          {mode === 'explore' && (
            <div className="op-nav" role="group" aria-label="Move navigation">
              <button type="button" className="icon-btn" onClick={back} disabled={cursor === 0} aria-label="Back (Left arrow)">‹</button>
              <button type="button" className="icon-btn" onClick={forward} disabled={cursor >= line.length} aria-label="Forward (Right arrow)">›</button>
              <button type="button" className="mini" onClick={reset}>Reset</button>
              <button type="button" className="mini" onClick={() => setOrientation((o) => (o === 'w' ? 'b' : 'w'))}>Flip board</button>
            </div>
          )}
        </div>

        <div className="op-side panel">
          {mode === 'explore' && (
            <>
              <div className="op-head">
                {info.opening?.eco && <span className="op-eco">{info.opening.eco}</span>}
                <h2 className="op-name">{name || 'Starting position'}</h2>
              </div>
              {info.opening?.idea && <p className="op-idea">{info.opening.idea}</p>}
              {info.transposed && <p className="op-muted">Reached by transposition.</p>}
              {!info.inBook && shown.length > 0 && <p className="op-muted">Out of book — this move isn’t in Maestro’s opening tree.</p>}
              <MoveList sans={line} cursor={cursor} onJump={setCursor} />
              {info.continuations.length > 0 && (
                <>
                  <h3 className="op-sub">Known continuations</h3>
                  <ul className="op-conts">
                    {info.continuations.map((c) => (
                      <li key={c.san}>
                        <button
                          type="button" className="op-cont"
                          onClick={() => playExplore(c.san, squaresOf(exploreFen, c.san).capture)}
                          aria-label={`Play ${c.san}${c.name ? `, ${c.name}` : ''}`}
                        >
                          <strong>{c.san}</strong>
                          {c.name && <span>{c.name}</span>}
                        </button>
                      </li>
                    ))}
                  </ul>
                </>
              )}
              <div className="op-add">
                {['w', 'b'].map((c) => (
                  <button
                    key={c} type="button" className="mini"
                    disabled={!shown.length || hasLine(rep, c, shown)}
                    onClick={() => addCurrent(c)}
                  >
                    {hasLine(rep, c, shown) && shown.length ? `In ${COLOR_NAME[c]} repertoire` : `Add line for ${COLOR_NAME[c]}`}
                  </button>
                ))}
              </div>
            </>
          )}

          {mode === 'repertoire' && (
            <>
              <h2 className="op-name">My repertoire</h2>
              <p className="op-muted">Add lines from Explore, or load a starter set.</p>
              <div className="op-starters">
                {STARTERS.map((s) => (
                  <button
                    key={s.id} type="button" className="mini"
                    onClick={() => { setRep((r) => mergeRepertoire(r, s.rep)); setAnnounce(`${s.label} loaded`); }}
                  >Load {s.label}</button>
                ))}
              </div>
              {['w', 'b'].map((c) => (
                <section key={c} className="op-rep" aria-label={`${COLOR_NAME[c]} repertoire`}>
                  <h3 className="op-sub">{COLOR_NAME[c]} · {rep[c].length} line{rep[c].length === 1 ? '' : 's'} · {c === 'w' ? dueW : dueB} due</h3>
                  {rep[c].length === 0 && <p className="op-muted">No lines yet.</p>}
                  <ul>
                    {rep[c].map((l) => {
                      const nm = lookup(l).opening?.name || openingName(l) || 'Custom line';
                      return (
                        <li key={l.join(' ')} className="op-rep-line">
                          <div>
                            <strong>{nm}</strong>
                            <span className="op-san">{l.map((s, i) => (i % 2 === 0 ? `${i / 2 + 1}.${s}` : s)).join(' ')}</span>
                          </div>
                          <div className="op-rep-actions">
                            <button type="button" className="mini" onClick={() => exploreLine(l)} aria-label={`Explore ${nm}`}>View</button>
                            <button type="button" className="mini" onClick={() => setRep((r) => removeLine(r, c, l))} aria-label={`Remove ${nm}`}>Remove</button>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              ))}
            </>
          )}

          {mode === 'drill' && (
            <>
              <h2 className="op-name">Drill</h2>
              <div className="op-drill-pick" role="group" aria-label="Drill colour">
                {['w', 'b'].map((c) => (
                  <button
                    key={c} type="button"
                    className={drillColor === c ? 'primary' : 'mini'}
                    aria-pressed={drillColor === c}
                    onClick={() => startDrill(c)}
                    disabled={!rep[c].length}
                  >
                    {COLOR_NAME[c]} · {c === 'w' ? dueW : dueB} due
                  </button>
                ))}
              </div>
              {!repCount && <p className="op-muted">Your {COLOR_NAME[drillColor]} repertoire is empty. Add lines in Explore or load a starter in Repertoire.</p>}
              {repCount > 0 && !drill && (
                <>
                  <p className="op-muted">{(drillColor === 'w' ? dueW : dueB)} lines due. The trainer plays the other side; you play your repertoire move from memory.</p>
                  <button type="button" className="primary" onClick={() => startDrill()}>Start drill</button>
                </>
              )}
              {drill && (
                <>
                  {drillInfo?.opening && <p className="op-idea"><span className="op-eco">{drillInfo.opening.eco}</span> {drillInfo.opening.name}</p>}
                  <p className="op-status">
                    {drill.done ? 'Line complete!'
                      : drill.wrongFen ? 'Not in your repertoire.'
                        : userTurn ? (drill.hint ? 'Play the arrowed move.' : drill.misses ? 'Try again.' : 'Your move.')
                          : 'Trainer is thinking…'}
                  </p>
                  <MoveList sans={drill.sans} cursor={drill.sans.length} onJump={() => {}} />
                  {drill.done && (
                    <div className="op-summary">
                      <p><strong>{drill.results.ok}</strong> correct first try, <strong>{drill.results.bad}</strong> missed.</p>
                      <p className="op-muted">{drillColor === 'w' ? dueW : dueB} lines still due.</p>
                      <button type="button" className="primary" onClick={() => startDrill()}>Next line</button>
                    </div>
                  )}
                  {!drill.done && <button type="button" className="mini" onClick={() => startDrill()}>Restart line</button>}
                </>
              )}
            </>
          )}
        </div>
      </div>
      <div className="sr-only" role="status" aria-live="polite">{announce}</div>
    </div>
  );
}
