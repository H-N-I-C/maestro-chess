import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Chess } from 'chess.js';
import Board from './Board.jsx';
import { playMoveSound } from '../sound.js';
import {
  START_RATING, PROVISIONAL_GAMES, SEEN_LIMIT, THEME_FILTERS,
  normalizePuzzle, solverColor, uciToMove, moveToUci, updateRating,
  selectPuzzle, scheduleReview, dueReviews, checkMove, humanizeTheme,
} from '../puzzleEngine.js';
import { useT, useLang, localSan } from '../i18n.js';
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
        inProgress: typeof s.inProgress === 'string' ? s.inProgress : null,
        inProgressReview: s.inProgressReview === true,
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
  const t = useT();
  const lang = useLang();
  const [puzzles, setPuzzles] = useState(null);
  const [loadError, setLoadError] = useState(false);
  const [store, setStore] = useState(loadStore);
  const [mode, setMode] = useState('rated'); // 'rated' | 'review'
  const modeRef = useRef(mode);
  modeRef.current = mode;
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
  // last position with no animation pending: Show solution replays from here
  const settledRef = useRef({ fen: null, ply: 0 });
  const abandonRef = useRef(null); // charges a loss for a rated puzzle left unfinished

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
    settledRef.current = { fen: p.fen, ply: 0 };
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
      settledRef.current = { fen: f, ply: 1 };
      // remembered so leaving mid-puzzle (tab switch, reload) still costs rating
      update((s) => ({ inProgress: p.id, inProgressReview: modeRef.current === 'review' && Boolean(s.srs[p.id]) }));
      setStatus('play');
      setAnnounce(t(solverColor(p) === 'w' ? 'puzzles.yourTurnWhite' : 'puzzles.yourTurnBlack'));
    }, 600);
  }, [clearTimers, later, update, t]);

  const next = useCallback((forceMode) => {
    if (!puzzles?.length) return;
    abandonRef.current?.();
    const s = storeRef.current;
    const m = forceMode || mode;
    if (m === 'review') {
      const ids = dueReviews(s.srs).filter((id) => byId.has(id) && id !== puzzle?.id);
      if (ids.length) { start(byId.get(ids[0])); return; }
    }
    const p = selectPuzzle(puzzles, { rating: s.rating, seen: s.seen, theme: s.theme, exclude: puzzle?.id });
    if (p) start(p);
  }, [puzzles, mode, byId, puzzle, start]);

  // first puzzle once the data arrives — a rated puzzle abandoned last time
  // (tab switch or reload mid-attempt) counts as a loss first
  useEffect(() => {
    if (!puzzles || puzzle) return;
    const left = storeRef.current.inProgress && byId.get(storeRef.current.inProgress);
    if (left) {
      update((s) => {
        // a review puzzle only reschedules; a new rated one also costs rating
        const reviewing = Boolean(s.inProgressReview); // the same rule record() applies
        const r = reviewing ? { rating: s.rating } : updateRating(s.rating, left.rating, false, s.games);
        return {
          rating: r.rating, games: reviewing ? s.games : s.games + 1, streak: 0, inProgress: null, inProgressReview: false,
          history: [...s.history, { id: left.id, won: false }].slice(-10),
          srs: { ...s.srs, [left.id]: scheduleReview(s.srs[left.id], false) },
        };
      });
    }
    next();
  }, [puzzles, puzzle, next, byId, update]);

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
        inProgress: null,
        inProgressReview: false,
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
    const change = r && r.delta ? ' ' + t('puzzles.ratingChange', { delta: `${r.delta > 0 ? '+' : ''}${r.delta}` }) : '';
    setAnnounce(won === false || result?.won === false
      ? t('puzzles.solvedNotFirst') + change
      : t('puzzles.solvedCorrect') + change);
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
      setAnnounce(t('puzzles.wrongMove', { san: localSan(played.move.san) }) + (r && r.delta ? ' ' + t('puzzles.ratingChange', { delta: r.delta }) : ''));
      const before = fen, prevLast = lastMove;
      later(() => {
        settledRef.current = { fen: before, ply };
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
    setAnnounce(t('puzzles.correctKeepGoing', { san: localSan(played.move.san) }));
    later(() => {
      const reply = applyUci(played.fen, puzzle.moves[nextPly]);
      playMoveSound({ capture: Boolean(reply.move.captured) });
      setFen(reply.fen);
      setLastMove({ from: reply.move.from, to: reply.move.to });
      setPly(nextPly + 1);
      settledRef.current = { fen: reply.fen, ply: nextPly + 1 };
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
    setAnnounce(t('puzzles.showingSolution'));
    // replay the rest of the line from the last settled position — never from
    // a mid-animation one (pending reply or wrong-move takeback)
    let { fen: f, ply: i } = settledRef.current;
    setFen(f);
    const step = () => {
      if (i >= puzzle.moves.length) { setStatus('solved'); setAnnounce(t('puzzles.solutionShown')); return; }
      let res;
      try { res = applyUci(f, puzzle.moves[i]); } catch { setStatus('solved'); return; }
      const { fen: nf, move } = res;
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

  abandonRef.current = () => {
    if (puzzle && !result && ply >= 1 && (status === 'play' || status === 'opponent')) record(false);
  };

  if (loadError) return <p className="loading-pane">{t('puzzles.loadError')}</p>;
  if (!puzzles || !puzzle) return <p className="loading-pane">{t('puzzles.loading')}</p>;

  const solver = solverColor(puzzle);
  const expected = status === 'play' ? uciToMove(puzzle.moves[ply]) : null;
  const highlights = {};
  if (expected && hintLevel >= 1) highlights[expected.from] = 'pz-hint-sq';
  if (wrong) highlights[wrong] = 'pz-wrong-sq';
  const finished = status === 'solved';
  const provisional = store.games < PROVISIONAL_GAMES;
  const themes = puzzle.themes.filter((th) => !['short', 'long', 'veryLong', 'oneMove'].includes(th));

  let headline;
  if (status === 'opponent' && ply === 0) headline = t('puzzles.opponentToMove');
  else if (status === 'revealed') headline = t('puzzles.solution');
  else if (finished) headline = result?.won ? t('puzzles.solved') : t('puzzles.complete');
  else headline = t(solver === 'w' ? 'puzzles.whiteToPlay' : 'puzzles.blackToPlay');

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
          <div className="pz-rating" title={provisional ? t('puzzles.provisionalRating') : t('puzzles.puzzleRating')}>
            <span className="pz-rating-label">{t('puzzles.rating')}</span>
            <strong>{store.rating}{provisional ? '?' : ''}</strong>
            {result && result.delta !== 0 && (
              <span className={`pz-delta ${result.delta > 0 ? 'up' : 'down'}`}>{result.delta > 0 ? '+' : ''}{result.delta}</span>
            )}
          </div>
          <div className="pz-streak" title={t('puzzles.currentStreak')}>
            <span className="pz-rating-label">{t('puzzles.streak')}</span>
            <strong>{store.streak}</strong>
          </div>
        </div>

        <div className="pz-modes" role="group" aria-label={t('puzzles.mode')}>
          <button className={mode === 'rated' ? 'active' : ''} aria-pressed={mode === 'rated'}
            onClick={() => { setMode('rated'); if (mode !== 'rated') next('rated'); }}>{t('puzzles.rated')}</button>
          <button className={mode === 'review' ? 'active' : ''} aria-pressed={mode === 'review'} disabled={!due.length && mode !== 'review'}
            onClick={() => { setMode('review'); if (mode !== 'review') next('review'); }}>
            {t('puzzles.reviewMistakes', { count: due.length })}
          </button>
        </div>

        <label className="pz-filter">
          <span>{t('puzzles.theme')}</span>
          <select value={store.theme} onChange={(e) => { update({ theme: e.target.value }); storeRef.current = { ...storeRef.current, theme: e.target.value }; next(); }}>
            {THEME_FILTERS.map((f) => <option key={f.id} value={f.id}>{t(`puzzles.filter.${f.id}`)}</option>)}
          </select>
        </label>

        <div className={`pz-status ${finished ? (result?.won ? 'good' : 'meh') : ''} ${wrong ? 'bad' : ''}`}>
          <h2>{headline}</h2>
          <p className="pz-meta">{t('puzzles.ratedAt', { rating: puzzle.rating })}{mode === 'review' && store.srs[puzzle.id] ? ` · ${t('puzzles.reviewTag')}` : ''}</p>
          {wrong && <p className="pz-msg">{t('puzzles.notTheMove')}</p>}
          {!wrong && status === 'play' && result && !result.won && <p className="pz-msg">{t('puzzles.noLongerCounts')}</p>}
          {finished && (
            <ul className="pz-themes" aria-label={t('puzzles.themes')}>
              {themes.map((th) => <li key={th}>{humanizeTheme(th, lang)}</li>)}
            </ul>
          )}
        </div>

        <div className="pz-actions">
          {finished ? (
            <button className="primary" onClick={() => next()} aria-label={t('puzzles.nextAria')}>{t('puzzles.next')}</button>
          ) : (
            <>
              <button className="mini" onClick={onHint} disabled={status !== 'play' || hintLevel >= 2}
                aria-label={hintLevel === 0 ? t('puzzles.hintPieceAria') : t('puzzles.hintMoveAria')}>
                {hintLevel === 0 ? t('puzzles.hint') : t('puzzles.showMove')}
              </button>
              <button className="mini" onClick={onShowSolution} disabled={status === 'revealed'} aria-label={t('puzzles.showSolutionAria')}>{t('puzzles.showSolution')}</button>
            </>
          )}
        </div>

        <div className="pz-history" aria-label={t('puzzles.last10')}>
          {store.history.length === 0 && <span className="pz-meta">{t('puzzles.none')}</span>}
          {store.history.map((h, i) => (
            <span key={i} className={h.won ? 'win' : 'loss'} title={t('puzzles.puzzleId', { id: h.id })} aria-label={h.won ? t('puzzles.solvedShort') : t('puzzles.missed')}>{h.won ? '✓' : '✗'}</span>
          ))}
        </div>

        <p className="sr-only" aria-live="polite">{announce}</p>
        <p className="pz-credit">{t('puzzles.credit')}</p>
      </aside>
    </div>
  );
}
