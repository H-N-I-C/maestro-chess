import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Chess } from 'chess.js';
import Board from './Board.jsx';
import { playMoveSound } from '../sound.js';
import {
  START_RATING, PROVISIONAL_GAMES, SEEN_LIMIT, THEME_FILTERS,
  normalizePuzzle, solverColor, uciToMove, moveToUci, updateRating,
  selectPuzzle, scheduleReview, dueReviews, checkMove, humanizeTheme,
} from '../puzzleEngine.js';
import './puzzles.css';

const STORE_KEY = 'maestro-puzzles';
const REPLY_DELAY = 450; // ms before the opponent's automatic move

function loadStore() {
  const blank = { rating: START_RATING, games: 0, streak: 0, history: [], srs: {}, seen: [], theme: 'all' };
  try {
    const s = JSON.parse(localStorage.getItem(STORE_KEY));
    if (s && typeof s === 'object') {
      return {
        ...blank,
        rating: Number.isFinite(s.rating) ? s.rating : blank.rating,
        games: Number.isFinite(s.games) ? s.games : 0,
        streak: Number.isFinite(s.streak) ? s.streak : 0,
        history: Array.isArray(s.history) ? s.history.slice(-10) : [],
        srs: s.srs && typeof s.srs === 'object' ? s.srs : {},
        seen: Array.isArray(s.seen) ? s.seen.slice(-SEEN_LIMIT) : [],
        theme: THEME_FILTERS.some((f) => f.id === s.theme) ? s.theme : 'all',
      };
    }
  } catch { /* ignore */ }
  return blank;
}

function saveStore(s) {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(s)); } catch { /* ignore */ }
}

/** Applies a UCI move to a fen, returning { fen, move } (move = chess.js verbose move). */
function applyUci(fen, uci) {
  const g = new Chess(fen);
  const move = g.move(uciToMove(uci));
  return { fen: g.fen(), move };
}

export default function Puzzles() {
  const [puzzles, setPuzzles] = useState(null);
  const [loadError, setLoadError] = useState(false);
  const [store, setStore] = useState(loadStore);
  const [mode, setMode] = useState('rated'); // 'rated' | 'review'
  const [puzzle, setPuzzle] = useState(null);
  const [fen, setFen] = useState(null);
  const [ply, setPly] = useState(0); // index into puzzle.moves of the next move to play
  const [lastMove, setLastMove] = useState(null);
  const [status, setStatus] = useState('loading'); // loading | opponent | play | solved | revealed
  const [result, setResult] = useState(null); // { won, delta } once the first attempt is decided
  const [hintLevel, setHintLevel] = useState(0);
  const [wrong, setWrong] = useState(null); // square flashed red after a wrong move
  const [announce, setAnnounce] = useState('');
  const timers = useRef([]);
  const storeRef = useRef(store);
  storeRef.current = store;

  const later = useCallback((fn, ms) => { timers.current.push(setTimeout(fn, ms)); }, []);
  const clearTimers = useCallback(() => { timers.current.forEach(clearTimeout); timers.current = []; }, []);
  useEffect(() => clearTimers, [clearTimers]);

  // dataset is code-split: only fetched when the tab opens
  useEffect(() => {
    let live = true;
    import('../data/puzzles.json')
      .then((m) => { if (live) setPuzzles((m.default || m).map(normalizePuzzle)); })
      .catch(() => { if (live) setLoadError(true); });
    return () => { live = false; };
  }, []);

  const byId = useMemo(() => new Map((puzzles || []).map((p) => [p.id, p])), [puzzles]);
  const due = dueReviews(store.srs).filter((id) => byId.has(id));

  const update = useCallback((patch) => {
    setStore((s) => {
      const next = { ...s, ...(typeof patch === 'function' ? patch(s) : patch) };
      saveStore(next);
      return next;
    });
  }, []);

  /** Loads a puzzle and plays the opponent's first move after a short pause. */
  const start = useCallback((p) => {
    clearTimers();
    setPuzzle(p);
    setFen(p.fen);
    setPly(0);
    setLastMove(null);
    setResult(null);
    setHintLevel(0);
    setWrong(null);
    setStatus('opponent');
    setAnnounce('');
    update((s) => ({ seen: [...s.seen.filter((id) => id !== p.id), p.id].slice(-SEEN_LIMIT) }));
    later(() => {
      const { fen: f, move } = applyUci(p.fen, p.moves[0]);
      playMoveSound({ capture: Boolean(move.captured) });
      setFen(f);
      setLastMove({ from: move.from, to: move.to });
      setPly(1);
      setStatus('play');
      setAnnounce(`Your turn. Find the best move for ${solverColor(p) === 'w' ? 'White' : 'Black'}.`);
    }, 600);
  }, [clearTimers, later, update]);

  const next = useCallback((forceMode) => {
    if (!puzzles?.length) return;
    const s = storeRef.current;
    const m = forceMode || mode;
    if (m === 'review') {
      const ids = dueReviews(s.srs).filter((id) => byId.has(id) && id !== puzzle?.id);
      if (ids.length) { start(byId.get(ids[0])); return; }
    }
    const p = selectPuzzle(puzzles, { rating: s.rating, seen: s.seen, theme: s.theme, exclude: puzzle?.id });
    if (p) start(p);
  }, [puzzles, mode, byId, puzzle, start]);

  // first puzzle once the data arrives
  useEffect(() => {
    if (puzzles && !puzzle) next();
  }, [puzzles, puzzle, next]);

  /** Records the outcome of the first attempt (once per puzzle). */
  function record(won) {
    if (result) return;
    const p = puzzle;
    const reviewing = mode === 'review' && Boolean(store.srs[p.id]);
    // review attempts only move the SRS schedule — the rating counts each puzzle's first encounter
    const r = reviewing ? { rating: store.rating, delta: 0 } : updateRating(store.rating, p.rating, won, store.games);
    setResult({ won, delta: r.delta, reviewing });
    update((s) => {
      const srs = { ...s.srs };
      if (!won || srs[p.id]) srs[p.id] = scheduleReview(srs[p.id], won);
      return {
        rating: r.rating,
        games: reviewing ? s.games : s.games + 1,
        streak: won ? s.streak + 1 : 0,
        history: [...s.history, { id: p.id, won }].slice(-10),
        srs,
      };
    });
    return r;
  }

  function finish(won) {
    const r = record(won);
    setStatus('solved');
    const change = r && r.delta ? ` Rating ${r.delta > 0 ? '+' : ''}${r.delta}.` : '';
    setAnnounce(won === false || result?.won === false
      ? `Solved, but not on the first try.${change}`
      : `Correct, puzzle solved!${change}`);
  }

  function onMove({ from, to, promotion }) {
    if (status !== 'play') return;
    const uci = moveToUci({ from, to, promotion });
    const verdict = checkMove(fen, puzzle, ply, uci);
    let played;
    try { played = applyUci(fen, uci); } catch { return; }
    playMoveSound({ capture: Boolean(played.move.captured) });
    setFen(played.fen);
    setLastMove({ from, to });

    if (verdict === 'wrong') {
      const r = record(false);
      setStatus('opponent'); // block input while the move is taken back
      setWrong(to);
      setAnnounce(`${played.move.san} is not it. Try again.${r && r.delta ? ` Rating ${r.delta}.` : ''}`);
      const before = fen, prevLast = lastMove;
      later(() => {
        setFen(before);
        setLastMove(prevLast);
        setWrong(null);
        setStatus('play');
      }, 700);
      return;
    }
    setHintLevel(0);
    const nextPly = ply + 1;
    if (verdict === 'mate' || nextPly >= puzzle.moves.length) { finish(true); return; }
    // opponent's scripted reply
    setStatus('opponent');
    setAnnounce(`${played.move.san} — correct. Keep going.`);
    later(() => {
      const reply = applyUci(played.fen, puzzle.moves[nextPly]);
      playMoveSound({ capture: Boolean(reply.move.captured) });
      setFen(reply.fen);
      setLastMove({ from: reply.move.from, to: reply.move.to });
      setPly(nextPly + 1);
      setStatus('play');
    }, REPLY_DELAY);
  }

  function onHint() {
    if (status !== 'play') return;
    record(false);
    setHintLevel((h) => Math.min(2, h + 1));
  }

  function onShowSolution() {
    if (status !== 'play' && status !== 'opponent') return;
    clearTimers();
    record(false);
    setStatus('revealed');
    setWrong(null);
    setHintLevel(0);
    setAnnounce('Showing the solution.');
    // play the remaining line from the current position, one move at a time
    let f = fen, i = ply;
    if (i === 0) { f = puzzle.fen; } // opponent's first move had not been played yet
    const step = () => {
      if (i >= puzzle.moves.length) { setStatus('solved'); setAnnounce('Solution shown. Press Next for a new puzzle.'); return; }
      const { fen: nf, move } = applyUci(f, puzzle.moves[i]);
      playMoveSound({ capture: Boolean(move.captured) });
      f = nf; i += 1;
      setFen(nf);
      setLastMove({ from: move.from, to: move.to });
      setPly(i);
      later(step, 650);
    };
    later(step, 200);
  }

  // `n` = next puzzle once this one is finished
  useEffect(() => {
    function onKey(e) {
      if (e.key !== 'n' || e.ctrlKey || e.metaKey || e.altKey) return;
      if (/^(INPUT|SELECT|TEXTAREA)$/.test(e.target?.tagName || '')) return;
      if (status === 'solved') { e.preventDefault(); next(); }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [status, next]);

  if (loadError) return <p className="loading-pane">Could not load the puzzle set.</p>;
  if (!puzzles || !puzzle) return <p className="loading-pane">Loading puzzles…</p>;

  const solver = solverColor(puzzle);
  const expected = status === 'play' ? uciToMove(puzzle.moves[ply]) : null;
  const highlights = {};
  if (expected && hintLevel >= 1) highlights[expected.from] = 'pz-hint-sq';
  if (wrong) highlights[wrong] = 'pz-wrong-sq';
  const finished = status === 'solved';
  const provisional = store.games < PROVISIONAL_GAMES;
  const themes = puzzle.themes.filter((t) => !['short', 'long', 'veryLong', 'oneMove'].includes(t));

  let headline;
  if (status === 'opponent' && ply === 0) headline = 'Opponent to move…';
  else if (status === 'revealed') headline = 'Solution';
  else if (finished) headline = result?.won ? 'Solved!' : 'Puzzle complete';
  else headline = `${solver === 'w' ? 'White' : 'Black'} to play`;

  return (
    <div className="pz">
      <div className={`pz-board ${wrong ? 'shake' : ''}`}>
        <Board
          fen={fen}
          orientation={solver}
          onMove={onMove}
          lastMove={lastMove}
          viewOnly={status !== 'play'}
          hint={expected && hintLevel >= 2 ? { from: expected.from, to: expected.to } : null}
          highlights={highlights}
        />
      </div>

      <aside className="pz-side panel">
        <div className="pz-top">
          <div className="pz-rating" title={provisional ? 'Provisional rating' : 'Puzzle rating'}>
            <span className="pz-rating-label">Rating</span>
            <strong>{store.rating}{provisional ? '?' : ''}</strong>
            {result && result.delta !== 0 && (
              <span className={`pz-delta ${result.delta > 0 ? 'up' : 'down'}`}>{result.delta > 0 ? '+' : ''}{result.delta}</span>
            )}
          </div>
          <div className="pz-streak" title="Current streak">
            <span className="pz-rating-label">Streak</span>
            <strong>{store.streak}</strong>
          </div>
        </div>

        <div className="pz-modes" role="group" aria-label="Puzzle mode">
          <button className={mode === 'rated' ? 'active' : ''} aria-pressed={mode === 'rated'}
            onClick={() => { setMode('rated'); if (mode !== 'rated') next('rated'); }}>Rated</button>
          <button className={mode === 'review' ? 'active' : ''} aria-pressed={mode === 'review'} disabled={!due.length && mode !== 'review'}
            onClick={() => { setMode('review'); if (mode !== 'review') next('review'); }}>
            Review mistakes ({due.length} due)
          </button>
        </div>

        <label className="pz-filter">
          <span>Theme</span>
          <select value={store.theme} onChange={(e) => { update({ theme: e.target.value }); storeRef.current = { ...storeRef.current, theme: e.target.value }; next(); }}>
            {THEME_FILTERS.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
          </select>
        </label>

        <div className={`pz-status ${finished ? (result?.won ? 'good' : 'meh') : ''} ${wrong ? 'bad' : ''}`}>
          <h2>{headline}</h2>
          <p className="pz-meta">Puzzle rated {puzzle.rating}{mode === 'review' && store.srs[puzzle.id] ? ' · review' : ''}</p>
          {wrong && <p className="pz-msg">Not the move — try again.</p>}
          {!wrong && status === 'play' && result && !result.won && <p className="pz-msg">Keep going — this one no longer counts for rating.</p>}
          {finished && (
            <ul className="pz-themes" aria-label="Puzzle themes">
              {themes.map((t) => <li key={t}>{humanizeTheme(t)}</li>)}
            </ul>
          )}
        </div>

        <div className="pz-actions">
          {finished ? (
            <button className="primary" onClick={() => next()} aria-label="Next puzzle (shortcut n)">Next puzzle</button>
          ) : (
            <>
              <button className="mini" onClick={onHint} disabled={status !== 'play' || hintLevel >= 2}
                aria-label={hintLevel === 0 ? 'Hint: highlight the piece to move' : 'Hint: show the move'}>
                {hintLevel === 0 ? 'Hint' : 'Show move'}
              </button>
              <button className="mini" onClick={onShowSolution} disabled={status === 'revealed'} aria-label="Show the solution">Show solution</button>
            </>
          )}
        </div>

        <div className="pz-history" aria-label="Last 10 results">
          {store.history.length === 0 && <span className="pz-meta">No puzzles yet</span>}
          {store.history.map((h, i) => (
            <span key={i} className={h.won ? 'win' : 'loss'} title={`Puzzle ${h.id}`} aria-label={h.won ? 'solved' : 'missed'}>{h.won ? '✓' : '✗'}</span>
          ))}
        </div>

        <p className="sr-only" aria-live="polite">{announce}</p>
        <p className="pz-credit">Puzzles from the Lichess database (CC0).</p>
      </aside>
    </div>
  );
}
