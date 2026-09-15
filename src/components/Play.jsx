import { useEffect, useMemo, useRef, useState } from 'react';
import { Chess } from 'chess.js';
import Board, { GLYPHS } from './Board.jsx';
import CoachPanel from './CoachPanel.jsx';
import CoachWidget from './CoachWidget.jsx';
import SidePanel from './SidePanel.jsx';
import { DIFFICULTIES, bestMove } from '../engine.js';
import { playMoveSound } from '../sound.js';
import { hostGame, joinGame, makeCode } from '../online.js';

const COACH_OPEN_KEY = 'maestro-coach-open';
const MOVES_OPEN_KEY = 'maestro-moves-open';
const GAME_SAVE_KEY = 'maestro-game';
const MOBILE_QUERY = '(max-width: 760px)';

const PIECE_VALUE = { p: 1, n: 3, b: 3, r: 5, q: 9 };

const WATCH_PROMPTS = [
  "You're commentating a game between two engines for a student who is watching to learn. In 2-4 sentences: what are each side's plans, and what should the viewer pay attention to?",
  "Comment on the last few moves for a student: who stands better, was anything inaccurate, and what is the key idea coming up?",
  "What's the most instructive feature of this position for a learner — a tactical motif, a structural strength, or a plan? Point it out in 2-3 sentences.",
  "Assess the play so far for a student: which side has been more accurate, what was the best move played, and what mistakes should be avoided?",
];

function loadSavedGame() {
  try { return JSON.parse(localStorage.getItem(GAME_SAVE_KEY)); } catch { return null; }
}

/** Piece that a move from->to will capture (handles en passant). */
function findVictim(g, from, to) {
  const direct = g.get(to);
  if (direct) return direct;
  const mover = g.get(from);
  if (mover?.type === 'p' && from[0] !== to[0]) return g.get(to[0] + from[1]);
  return null;
}

function CapturedTray({ victims, advantage, pieceColor }) {
  return (
    <div className={`captured-tray${victims.length ? '' : ' empty'}`} aria-hidden="true">
      {victims.map((t, i) => (
        <span key={i} className={`ct-piece ${pieceColor}`}>{GLYPHS[t]}</span>
      ))}
      {advantage > 0 && <span className="ct-adv">+{advantage}</span>}
    </div>
  );
}

export default function Play({ stageTitle }) {
  const saved = useMemo(loadSavedGame, []);
  const [difficulty, setDifficulty] = useState(() => DIFFICULTIES.find(d => d.id === saved?.difficultyId) || DIFFICULTIES[2]);
  const [color, setColor] = useState(saved?.color === 'b' ? 'b' : 'w');
  const [game, setGame] = useState(() => {
    try { return saved?.fen ? new Chess(saved.fen) : new Chess(); } catch { return new Chess(); }
  });
  const [lastMove, setLastMove] = useState(saved?.lastMove || null);
  // one entry per position: entry 0 is the initial position, each move appends
  const [history, setHistory] = useState(() =>
    Array.isArray(saved?.history) && saved.history.length > 0 ? saved.history : null
  );
  const [viewIndex, setViewIndex] = useState(null); // null = live position
  const [mode, setMode] = useState(saved?.mode === 'watch' ? 'watch' : 'play');
  // captured.w = white pieces taken by black, captured.b = black pieces taken by white
  const [captured, setCaptured] = useState(() =>
    saved?.captured && Array.isArray(saved.captured.w) && Array.isArray(saved.captured.b)
      ? saved.captured
      : { w: [], b: [] }
  );
  const [thinking, setThinking] = useState(false);
  const [status, setStatus] = useState('');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(() => window.matchMedia(MOBILE_QUERY).matches);
  const [coachOpen, setCoachOpen] = useState(() => {
    const saved = localStorage.getItem(COACH_OPEN_KEY);
    if (saved !== null) return saved === 'true';
    // on phone-width screens the coach starts as a small bubble so the
    // board is visible immediately instead of hidden behind a full panel
    return !window.matchMedia(MOBILE_QUERY).matches;
  });
  const settingsRef = useRef(null);
  const moveListRef = useRef(null);
  const abort = useRef(false);
  const watchDiffs = useRef(null); // per-side difficulty in watch mode
  const coachRef = useRef(null);
  const lastCommentedPly = useRef(0);
  const watchSummarized = useRef(false);
  const [watchPaused, setWatchPaused] = useState(false);
  const [watchSpeed, setWatchSpeed] = useState(1.2); // seconds between moves
  const [movesOpen, setMovesOpen] = useState(() => localStorage.getItem(MOVES_OPEN_KEY) !== 'false');
  // online multiplayer: status 'off'|'idle'|'waiting'|'connecting'|'playing'|'error'
  const [online, setOnline] = useState({ status: 'off', code: '', role: null, error: '' });
  const [oppGone, setOppGone] = useState(false);
  const [joinCode, setJoinCode] = useState('');
  const onlineRef = useRef(null); // { peer, conn, role, prevColor }

  // live snapshot for connection handlers (they outlive any single render)
  const liveRef = useRef(null);
  liveRef.current = { game, history, captured, lastMove, mode, online };

  useEffect(() => {
    localStorage.setItem(MOVES_OPEN_KEY, String(movesOpen));
  }, [movesOpen]);

  // keep the move list scrolled to the current move
  const activePly = viewIndex ?? (history?.length || 1) - 1;
  useEffect(() => {
    const el = moveListRef.current?.querySelector('.mv.active');
    el?.scrollIntoView({ block: 'nearest' });
  }, [activePly]);

  useEffect(() => {
    const mql = window.matchMedia(MOBILE_QUERY);
    const onChange = () => setIsMobile(mql.matches);
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, []);

  useEffect(() => {
    localStorage.setItem(COACH_OPEN_KEY, String(coachOpen));
  }, [coachOpen]);

  // persist the game so a refresh (or reopening the app) resumes mid-game
  useEffect(() => {
    localStorage.setItem(GAME_SAVE_KEY, JSON.stringify({
      fen: game.fen(), lastMove, color, difficultyId: difficulty.id, history, captured,
      mode: mode === 'online' ? 'play' : mode,
      online: mode === 'online', // never resume an online game as an engine game
    }));
  }, [game, lastMove, color, difficulty, history, captured, mode]);

  // if the saved position had the engine to move (e.g. player refreshed
  // while Maestro was thinking), let it reply now
  useEffect(() => {
    if (saved?.online) return;
    if (mode === 'play' && game.turn() !== color && !game.isGameOver()) engineReply(game, difficulty);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!settingsOpen) return;
    function onPointerDown(e) {
      if (settingsRef.current && !settingsRef.current.contains(e.target)) setSettingsOpen(false);
    }
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [settingsOpen]);

  // wrap game with metadata for the coach
  const coachGame = useMemo(() => {
    const g = game;
    g.stageTitle = stageTitle;
    g.difficultyLabel = `${difficulty.label} (~${difficulty.elo || 2800})`;
    g.humanColor = color;
    return g;
  }, [game, difficulty, color, stageTitle]);

  function newGame(c = color, d = difficulty) {
    abort.current = false;
    const g = new Chess();
    g.stageTitle = stageTitle;
    g.difficultyLabel = `${d.label}`;
    g.humanColor = c;
    setGame(g);
    setLastMove(null);
    setHistory([{ fen: g.fen(), lastMove: null }]);
    setViewIndex(null);
    setCaptured({ w: [], b: [] });
    setStatus('');
    if (c === 'b') engineReply(g, d);
  }

  async function engineReply(g, d) {
    setThinking(true);
    try {
      const mv = await bestMove(g.fen(), d);
      if (abort.current) return;
      setGame((prev) => {
        const next = new Chess(prev.fen());
        try {
          const moved = next.move(mv);
          const from = mv.slice(0, 2);
          const to = mv.slice(2, 4);
          const victim = findVictim(prev, from, to);
          if (victim) setCaptured((c) => ({ ...c, [victim.color]: [...c[victim.color], victim.type] }));
          playMoveSound({ capture: !!victim });
          const lm = { from, to, san: moved.san, color: moved.color, piece: moved.piece };
          setLastMove(lm);
          setHistory((h) => [...(h || [{ fen: prev.fen(), lastMove: null }]), { fen: next.fen(), lastMove: lm }]);
        } catch { /* illegal — ignore */ }
        next.stageTitle = stageTitle;
        next.difficultyLabel = d.label;
        next.humanColor = color;
        return next;
      });
    } finally {
      setThinking(false);
    }
  }

  // ---- observe mode: engine vs engine ----
  function randomDifficulty() {
    return DIFFICULTIES[Math.floor(Math.random() * DIFFICULTIES.length)];
  }

  function startWatch() {
    abort.current = false;
    watchDiffs.current = { w: randomDifficulty(), b: randomDifficulty() };
    lastCommentedPly.current = 0;
    watchSummarized.current = false;
    setWatchPaused(false);
    const g = new Chess();
    setMode('watch');
    setGame(g);
    setLastMove(null);
    setHistory([{ fen: g.fen(), lastMove: null }]);
    setViewIndex(null);
    setCaptured({ w: [], b: [] });
    setStatus('');
  }

  function stopWatch() {
    setMode('play');
    newGame(color, difficulty);
  }

  // White opens with a random sensible developing move so no two watched
  // games start the same; Stockfish alone would be deterministic.
  function playRandomOpening() {
    const g = new Chess(game.fen());
    const choices = g.moves({ verbose: true }).filter((m) => {
      if (m.promotion) return false;
      if (m.piece === 'p') return ['3', '4'].includes(m.to[1]) && m.from[1] === '2';
      return m.piece === 'n';
    });
    const pool = choices.length ? choices : g.moves({ verbose: true });
    const moved = g.move(pool[Math.floor(Math.random() * pool.length)]);
    playMoveSound({});
    setGame(g);
    setLastMove({ from: moved.from, to: moved.to, san: moved.san, color: moved.color, piece: moved.piece });
    setHistory((h) => [...(h || [{ fen: game.fen(), lastMove: null }]), { fen: g.fen(), lastMove: { from: moved.from, to: moved.to, san: moved.san, color: moved.color, piece: moved.piece } }]);
  }

  // one move in a watched game: random opening for White, engine otherwise
  function watchStep() {
    if ((history?.length || 1) <= 1) playRandomOpening();
    else engineReply(game, watchDiffs.current?.[game.turn()] || difficulty);
  }

  // engine-vs-engine game loop (pausable, speed-adjustable)
  useEffect(() => {
    if (mode !== 'watch' || watchPaused || viewing || thinking || game.isGameOver()) return;
    const t = setTimeout(watchStep, watchSpeed * 1000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, game, thinking, history, watchPaused, watchSpeed, viewIndex]);

  // coach commentary while watching: every few plies, plus a game summary
  useEffect(() => {
    if (mode !== 'watch' || viewIndex !== null || thinking) return;
    const ply = (history?.length || 1) - 1;
    if (game.isGameOver()) {
      if (!watchSummarized.current) {
        watchSummarized.current = true;
        coachRef.current?.comment('The game just ended. Please give a brief post-game summary for a student who was watching: the critical moments, the decisive mistake or brilliant move, and the main lesson to take away.');
      }
      return;
    }
    if (ply >= 8 && ply % 8 === 0 && ply !== lastCommentedPly.current) {
      lastCommentedPly.current = ply;
      const prompt = WATCH_PROMPTS[Math.floor(ply / 8) % WATCH_PROMPTS.length];
      coachRef.current?.comment(prompt);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, game, thinking, viewIndex, history]);

  // watch-mode transport controls
  function watchRewind() {
    setWatchPaused(true);
    stepPrev();
  }
  function watchPlayPause() {
    if (watchPaused && viewing) setViewIndex(null); // resuming from a rewind jumps back to live
    setWatchPaused((p) => !p);
  }
  function watchForward() {
    if (viewing) { stepNext(); return; }
    if (!thinking) watchStep();
  }

  // ---- online multiplayer (host is White and authoritative) ----
  function resetBoardState(g) {
    setGame(g);
    setLastMove(null);
    setHistory([{ fen: g.fen(), lastMove: null }]);
    setViewIndex(null);
    setCaptured({ w: [], b: [] });
    setStatus('');
  }

  function openLobby() {
    abort.current = true;
    setMode('play');
    setOnline({ status: 'idle', code: '', role: null, error: '' });
  }

  function onlineCreate() {
    const code = makeCode();
    const peer = hostGame(code, {
      onConnected: (conn) => {
        onlineRef.current.conn = conn;
        setOppGone(false);
        beginOnlineGame('host');
      },
      onData: onlineHostData,
      onClose: () => setOppGone(true),
      onError: (e) => setOnline((o) => ({ ...o, status: o.status === 'playing' ? o.status : 'error', error: String(e?.type || e) })),
    });
    onlineRef.current = { ...(onlineRef.current || {}), peer, conn: null, role: 'host' };
    setOnline({ status: 'waiting', code, role: 'host', error: '' });
  }

  function onlineJoin() {
    const code = joinCode.trim().toLowerCase();
    if (!code) return;
    const peer = joinGame(code, {
      onConnected: (conn) => {
        onlineRef.current.conn = conn;
        setOppGone(false);
        beginOnlineGame('guest');
        conn.send({ t: 'sync' });
      },
      onData: onlineGuestData,
      onClose: () => setOppGone(true),
      onError: (e) => setOnline((o) => ({ ...o, status: o.status === 'playing' ? o.status : 'error', error: String(e?.type || e) })),
    });
    onlineRef.current = { ...(onlineRef.current || {}), peer, conn: null, role: 'guest' };
    setOnline({ status: 'connecting', code, role: 'guest', error: '' });
  }

  function beginOnlineGame(role) {
    if (onlineRef.current) onlineRef.current.prevColor = color;
    setOnline((o) => ({ ...o, status: 'playing', role }));
    setMode('online');
    setColor(role === 'host' ? 'w' : 'b');
    resetBoardState(new Chess());
  }

  function hostSync(fen, hist, caps, lm) {
    onlineRef.current?.conn?.send({ t: 'state', fen, history: hist, captured: caps, lastMove: lm });
  }

  function onlineHostData(d) {
    if (!d || typeof d !== 'object') return;
    const s = liveRef.current;
    if (d.t === 'sync') {
      hostSync(s.game.fen(), s.history, s.captured, s.lastMove);
      return;
    }
    if (d.t === 'newgame-request') {
      requestNewGame(true);
      return;
    }
    if (d.t === 'move' && s.mode === 'online') {
      const g = new Chess(s.game.fen());
      let moved;
      try { moved = g.move({ from: d.from, to: d.to, promotion: d.promotion }); } catch { return; }
      const victim = findVictim(s.game, d.from, d.to);
      const lm = { from: d.from, to: d.to, san: moved.san, color: moved.color, piece: moved.piece };
      const hist = [...(s.history || [{ fen: s.game.fen(), lastMove: null }]), { fen: g.fen(), lastMove: lm }];
      const caps = victim
        ? { ...s.captured, [victim.color]: [...s.captured[victim.color], victim.type] }
        : s.captured;
      playMoveSound({ capture: !!victim });
      setGame(g);
      setLastMove(lm);
      setHistory(hist);
      setCaptured(caps);
      hostSync(g.fen(), hist, caps, lm);
    }
  }

  function onlineGuestData(d) {
    if (!d || typeof d !== 'object') return;
    if (d.t === 'newgame') { guestNewGame(d); return; }
    if (d.t !== 'state') return;
    const prev = game;
    const lm = d.lastMove;
    if (lm) {
      const victim = findVictim(prev, lm.from, lm.to);
      playMoveSound({ capture: !!victim });
    }
    try { setGame(new Chess(d.fen)); } catch { return; }
    setHistory(d.history);
    setCaptured(d.captured);
    setLastMove(lm);
  }

  function leaveOnline() {
    const prevColor = onlineRef.current?.prevColor || 'w';
    onlineRef.current?.peer?.destroy();
    onlineRef.current = null;
    setOnline({ status: 'off', code: '', role: null, error: '' });
    setOppGone(false);
    setMode('play');
    setColor(prevColor);
    newGame(prevColor, difficulty);
  }

  function requestNewGame(fromRemote = false) {
    if (mode !== 'online') { newGame(); return; }
    const role = online.role || onlineRef.current?.role;
    if (role === 'host' || fromRemote) {
      const g = new Chess();
      const hist = [{ fen: g.fen(), lastMove: null }];
      resetBoardState(g);
      onlineRef.current?.conn?.send({ t: 'newgame', fen: g.fen(), history: hist });
    } else {
      onlineRef.current?.conn?.send({ t: 'newgame-request' });
    }
  }

  function guestNewGame(d) {
    try { setGame(new Chess(d.fen)); } catch { return; }
    setHistory(d.history);
    setCaptured({ w: [], b: [] });
    setLastMove(null);
    setViewIndex(null);
    setStatus('');
  }

  useEffect(() => {
    const over = game.isGameOver();
    if (over) {
      let s = '';
      if (game.isCheckmate()) s = `Checkmate — ${game.turn() === 'w' ? 'Black' : 'White'} wins. ${game.turn() === color ? 'Ask the coach where it went wrong.' : 'Well played!'}`;
      else if (game.isStalemate()) s = 'Stalemate — draw.';
      else if (game.isDraw()) s = 'Draw.';
      setStatus(s);
    } else {
      setStatus(game.isCheck() ? 'Check!' : '');
    }
  }, [game, color]);

  function onMove({ from, to, promotion }) {
    if (mode === 'watch') return;
    if (mode === 'online') {
      if (online.role === 'guest') {
        onlineRef.current?.conn?.send({ t: 'move', from, to, promotion });
        return;
      }
      // host plays White locally, then syncs
      if (thinking || game.isGameOver() || viewIndex !== null) return;
      if (game.turn() !== 'w') return;
      const g = new Chess(game.fen());
      let moved;
      try { moved = g.move({ from, to, promotion }); } catch { return; }
      const victim = findVictim(game, from, to);
      const lm = { from, to, san: moved.san, color: moved.color, piece: moved.piece };
      const hist = [...(history || [{ fen: game.fen(), lastMove: null }]), { fen: g.fen(), lastMove: lm }];
      const caps = victim
        ? { ...captured, [victim.color]: [...captured[victim.color], victim.type] }
        : captured;
      playMoveSound({ capture: !!victim });
      setGame(g);
      setLastMove(lm);
      setHistory(hist);
      setCaptured(caps);
      hostSync(g.fen(), hist, caps, lm);
      return;
    }
    if (mode !== 'play') return;
    if (thinking || game.isGameOver() || viewIndex !== null) return;
    if (game.turn() !== color) return;
    const g = new Chess(game.fen());
    let moved;
    try {
      moved = g.move({ from, to, promotion });
    } catch { return; }
    g.stageTitle = stageTitle;
    g.difficultyLabel = difficulty.label;
    g.humanColor = color;
    const lm = { from, to, san: moved.san, color: moved.color, piece: moved.piece };
    const victim = findVictim(game, from, to);
    if (victim) setCaptured((c) => ({ ...c, [victim.color]: [...c[victim.color], victim.type] }));
    playMoveSound({ capture: !!victim });
    setGame(g);
    setLastMove(lm);
    setHistory((h) => [...(h || [{ fen: game.fen(), lastMove: null }]), { fen: g.fen(), lastMove: lm }]);
    engineReply(g, difficulty);
  }

  const viewing = viewIndex !== null;
  const boardFen = viewing ? history[viewIndex].fen : game.fen();
  const boardLastMove = viewing ? history[viewIndex].lastMove : lastMove;
  const canPrev = viewing ? viewIndex > 0 : (history?.length || 0) > 1;
  const canNext = viewing && viewIndex < history.length - 1;
  const whiteAdv = captured.b.reduce((s, t) => s + (PIECE_VALUE[t] || 0), 0) - captured.w.reduce((s, t) => s + (PIECE_VALUE[t] || 0), 0);
  const byWhite = [...captured.b].sort((a, b) => PIECE_VALUE[b] - PIECE_VALUE[a]);
  const byBlack = [...captured.w].sort((a, b) => PIECE_VALUE[b] - PIECE_VALUE[a]);
  function stepPrev() { setViewIndex((i) => (i === null ? history.length - 2 : Math.max(0, i - 1))); }
  function stepNext() {
    setViewIndex((i) => {
      if (i === null) return null;
      const n = i + 1;
      return n >= history.length - 1 ? null : n;
    });
  }

  return (
    <div className="play-layout">
      {isMobile ? (
        <CoachWidget
          panelRef={coachRef}
          game={coachGame}
          open={coachOpen}
          onOpen={() => setCoachOpen(true)}
          onClose={() => setCoachOpen(false)}
        />
      ) : (
        <aside className={`coach-dock${coachOpen ? '' : ' collapsed'}`}>
          {coachOpen ? (
            <CoachPanel ref={coachRef} game={coachGame} disabled={false} onCollapse={() => setCoachOpen(false)} />
          ) : (
            <button
              type="button"
              className="coach-dock-toggle"
              onClick={() => setCoachOpen(true)}
              aria-label="Open coach"
              title="Open coach"
            >
              <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
                <path fill="currentColor" d="M4 4h16a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H9l-4.4 3.3A1 1 0 0 1 3 19.5V5a1 1 0 0 1 1-1Z" />
              </svg>
              <span>Coach</span>
            </button>
          )}
        </aside>
      )}
      <div className="play-main">
        <div className="play-toolbar">
          <div className="toolbar-actions">
            <select
              className="toolbar-select"
              aria-label="Difficulty"
              value={difficulty.id}
              onChange={(e) => { const d = DIFFICULTIES.find(x => x.id === e.target.value); setDifficulty(d); newGame(color, d); }}
            >
              {DIFFICULTIES.map((d) => (
                <option key={d.id} value={d.id}>{d.label}{d.elo ? ` (~${d.elo})` : ''}</option>
              ))}
            </select>
            <select
              className="toolbar-select"
              aria-label="Play as"
              value={color}
              onChange={(e) => { setColor(e.target.value); newGame(e.target.value); }}
            >
              <option value="w">White</option>
              <option value="b">Black</option>
            </select>
            <button className="toolbar-new-game" onClick={() => { abort.current = true; if (mode === 'online') requestNewGame(); else { newGame(); setMode('play'); } }}>New game</button>
            <button
              className={`toolbar-watch${mode === 'watch' ? ' active' : ''}`}
              onClick={() => { abort.current = true; mode === 'watch' ? stopWatch() : startWatch(); }}
              title={mode === 'watch' ? 'Stop watching and start your own game' : 'Watch Maestro play against itself'}
            >
              {mode === 'watch' ? 'Stop watching' : 'Watch a game'}
            </button>
            <button
              className={`toolbar-watch${online.status === 'playing' ? ' active' : ''}`}
              onClick={() => { if (online.status === 'playing') leaveOnline(); else openLobby(); }}
              title={online.status === 'playing' ? 'Leave the online game' : 'Play a friend online'}
            >
              {online.status === 'playing' ? 'Leave online game' : 'Play online'}
            </button>
            <div className="settings-trigger" ref={settingsRef}>
              <button
                type="button"
                className={`icon-btn${settingsOpen ? ' active' : ''}`}
                onClick={() => setSettingsOpen((v) => !v)}
                aria-label="Settings"
                title="Settings"
              >
                <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
                  <path
                    fill="currentColor"
                    d="M19.14 12.94a7.14 7.14 0 0 0 .06-.94 7.14 7.14 0 0 0-.06-.94l2.03-1.58a.5.5 0 0 0 .12-.64l-1.92-3.32a.5.5 0 0 0-.6-.22l-2.39.96a7.03 7.03 0 0 0-1.62-.94l-.36-2.54a.5.5 0 0 0-.5-.42h-3.84a.5.5 0 0 0-.5.42l-.36 2.54c-.59.24-1.13.56-1.62.94l-2.39-.96a.5.5 0 0 0-.6.22L2.71 8.84a.5.5 0 0 0 .12.64l2.03 1.58a7.14 7.14 0 0 0 0 1.88l-2.03 1.58a.5.5 0 0 0-.12.64l1.92 3.32c.14.24.42.32.66.22l2.39-.96c.49.38 1.03.7 1.62.94l.36 2.54a.5.5 0 0 0 .5.42h3.84a.5.5 0 0 0 .5-.42l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96a.5.5 0 0 0 .6-.22l1.92-3.32a.5.5 0 0 0-.12-.64ZM12 15.5A3.5 3.5 0 1 1 12 8.5a3.5 3.5 0 0 1 0 7Z"
                  />
                </svg>
              </button>
              {settingsOpen && <SidePanel onClose={() => setSettingsOpen(false)} />}
            </div>
          </div>
        </div>
        <div className="board-area">
          {online.status !== 'off' && online.status !== 'playing' ? (
            <div className="online-lobby panel">
              <h3>Play a friend online</h3>
              {online.status === 'idle' && (
                <>
                  <p className="side-note">One of you creates a game and shares the 6-letter code; the other joins with it. The creator plays White.</p>
                  <button type="button" className="primary" onClick={onlineCreate}>Create a game</button>
                  <div className="join-row">
                    <input
                      value={joinCode}
                      onChange={(e) => setJoinCode(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && onlineJoin()}
                      placeholder="Enter code"
                      maxLength={6}
                      aria-label="Game code"
                    />
                    <button type="button" onClick={onlineJoin} disabled={joinCode.trim().length < 4}>Join</button>
                  </div>
                </>
              )}
              {online.status === 'waiting' && (
                <>
                  <p className="side-note">Share this code with your opponent:</p>
                  <p className="online-code">{online.code}</p>
                  <p className="side-note">Waiting for them to join…</p>
                </>
              )}
              {online.status === 'connecting' && <p className="side-note">Connecting to game <strong>{online.code}</strong>…</p>}
              {online.status === 'error' && <p className="online-error">Couldn't connect ({online.error}). Check the code and try again.</p>}
              <button type="button" className="mini" onClick={leaveOnline}>Cancel</button>
            </div>
          ) : (
          <>
          {oppGone && <div className="online-gone">Your opponent disconnected.</div>}
          <CapturedTray victims={byWhite} advantage={whiteAdv} pieceColor="black" />
          <Board fen={boardFen} orientation={color} onMove={onMove} lastMove={boardLastMove} viewOnly={viewing || mode === 'watch' || (mode === 'online' && game.turn() !== color)} />
          {mode === 'watch' ? (
            <div className="move-nav watch-controls">
              <button type="button" className="icon-btn" onClick={watchRewind} disabled={!canPrev} aria-label="Rewind" title="Rewind one move">‹</button>
              <button
                type="button"
                className="icon-btn watch-playpause"
                onClick={watchPlayPause}
                aria-label={watchPaused ? 'Play' : 'Pause'}
                title={watchPaused ? 'Play' : 'Pause'}
              >
                {watchPaused ? '▶' : '❚❚'}
              </button>
              <button type="button" className="icon-btn" onClick={watchForward} disabled={thinking} aria-label="Forward one move" title="Forward one move">›</button>
              <button
                type="button"
                className="icon-btn watch-speed"
                onClick={() => setWatchSpeed((s) => (s >= 4 ? 0.4 : s * 2))}
                aria-label="Change speed"
                title="Time per move"
              >
                {watchSpeed}s
              </button>
              {(watchPaused || viewing) && (
                <button type="button" className="watch-live" onClick={() => { setViewIndex(null); setWatchPaused(false); }}>
                  Live
                </button>
              )}
            </div>
          ) : (
          <div className="move-nav">
            <button type="button" className="icon-btn" onClick={stepPrev} disabled={!canPrev} aria-label="Previous move" title="Previous move">‹</button>
            <button type="button" className="icon-btn" onClick={stepNext} disabled={!canNext} aria-label="Next move" title="Next move">›</button>
          </div>
          )}
          {boardLastMove && (
            <div className="last-move-line" aria-live="polite">
              <span className={`lm-glyph ${boardLastMove.color === 'w' ? 'white' : 'black'}`}>{GLYPHS[boardLastMove.piece]}</span>
              <span className="lm-text">
                <strong>{boardLastMove.color === 'w' ? 'White' : 'Black'}</strong> played <strong>{boardLastMove.san}</strong>
                <span className="lm-sq"> ({boardLastMove.from} → {boardLastMove.to})</span>
              </span>
            </div>
          )}
          <div className="status-line">
            {viewing
              ? `Viewing move ${viewIndex} of ${history.length - 1}`
              : mode === 'watch'
                ? (thinking
                    ? `${game.turn() === 'w' ? 'White' : 'Black'} (${watchDiffs.current?.[game.turn()]?.label || ''}) is thinking…`
                    : `${game.turn() === 'w' ? 'White' : 'Black'} to move`)
                : thinking ? <span className="thinking">Maestro is thinking…</span> : status || `${game.turn() === color ? 'Your move' : 'Opponent to move'} (${game.turn() === 'w' ? 'white' : 'black'})`}
          </div>
          {game.isGameOver() && !viewing && (
            <div className="game-over panel">
              <p className="go-title">
                {game.isCheckmate()
                  ? `Checkmate — ${game.turn() === 'w' ? 'Black' : 'White'} wins`
                  : game.isStalemate() ? 'Stalemate — draw' : 'Draw'}
              </p>
              <p className="go-detail">
                {game.isCheckmate()
                  ? (game.turn() === color ? 'Ask the coach where it went wrong.' : 'Well played!')
                  : 'Nobody made a wrong move — ask the coach for ideas to sharpen it next time.'}
              </p>
              <div className="go-actions">
                <button type="button" className="primary" onClick={() => { if (mode === 'watch') startWatch(); else if (mode === 'online') requestNewGame(); else newGame(); }}>{mode === 'watch' ? 'Watch another' : mode === 'online' ? 'Rematch' : 'New game'}</button>
                <button
                  type="button"
                  className="go-review"
                  onClick={() => setViewIndex((history?.length || 1) > 1 ? 1 : 0)}
                >
                  Review game
                </button>
              </div>
            </div>
          )}
          <CapturedTray victims={byBlack} advantage={-whiteAdv} pieceColor="white" />
          </>
          )}
        </div>
      </div>
      <aside className={`game-side panel${movesOpen ? '' : ' collapsed'}`} aria-label="Move list">
        <button type="button" className="game-side-head" onClick={() => setMovesOpen((v) => !v)} aria-expanded={movesOpen} title={movesOpen ? 'Collapse move list' : 'Expand move list'}>
          <h3 className="game-side-title">Moves</h3>
          <span className="game-side-caret" aria-hidden="true">{movesOpen ? '›' : '‹'}</span>
        </button>
        {movesOpen && (
        <ol className="move-list" ref={moveListRef}>
          {(() => {
            const rows = [];
            for (let k = 1; k < (history?.length || 0); k += 2) {
              const white = history[k].lastMove;
              const black = k + 1 < history.length ? history[k + 1].lastMove : null;
              const num = (k + 1) / 2;
              const activePly = viewing ? viewIndex : history.length - 1;
              rows.push(
                <li key={num}>
                  <span className="mv-num">{num}</span>
                  <button type="button" className={`mv${activePly === k ? ' active' : ''}`} onClick={() => setViewIndex(k === history.length - 1 ? null : k)}>{white?.san}</button>
                  {black && (
                    <button type="button" className={`mv${activePly === k + 1 ? ' active' : ''}`} onClick={() => setViewIndex(k + 1 === history.length - 1 ? null : k + 1)}>{black.san}</button>
                  )}
                </li>
              );
            }
            return rows;
          })()}
        </ol>
        )}
      </aside>
    </div>
  );
}
