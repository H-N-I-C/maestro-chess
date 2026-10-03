import { useEffect, useMemo, useRef, useState } from 'react';
import { Chess } from 'chess.js';
import Board, { GLYPHS } from './Board.jsx';
import CoachPanel from './CoachPanel.jsx';
import CoachWidget from './CoachWidget.jsx';
import SidePanel from './SidePanel.jsx';
import { DIFFICULTIES, bestMove, analyze, customLevel } from '../engine.js';
import { playMoveSound } from '../sound.js';
import { hostGame, joinGame, makeCode } from '../online.js';
import { openingName } from '../openings.js';
import { resetCoachChat } from '../coachChat.js';
import { useClocks, TIME_CONTROLS, migrateTimeControl, formatClock } from '../hooks/useClocks.js';
import { saveGame, updateRating, getRating, suggestedLevel } from '../library.js';
import { gameFromHistory, playMove, drawReason, capturedFromHistory, isValidHistory, spokenSan } from '../gameUtils.js';
import { t, useT, useLang } from '../i18n.js';

const COACH_OPEN_KEY = 'maestro-coach-open';
const MOVES_OPEN_KEY = 'maestro-moves-open';
const GAME_SAVE_KEY = 'maestro-game';
const ONLINE_SAVE_KEY = 'maestro-online';
const RESULTS_KEY = 'maestro-results';
const PIECE_SET_KEY = 'maestro-pieces';
const COORDS_KEY = 'maestro-show-coords';
const BLINDFOLD_KEY = 'maestro-blindfold';
const CUSTOM_ELO_KEY = 'maestro-custom-elo';
const STALE_SAVE_MS = 14 * 24 * 60 * 60 * 1000; // discard saved games older than 14 days

function loadResults() {
  const tally = (t) => t && typeof t === 'object' && ['w', 'l', 'd'].every((k) => Number.isFinite(t[k]));
  try {
    const r = JSON.parse(localStorage.getItem(RESULTS_KEY));
    // r.engine is keyed by difficulty id, so an empty object is valid;
    // every entry that exists must still be a well-formed w/l/d tally
    if (r && tally(r.online) && r.engine && typeof r.engine === 'object' && Object.values(r.engine).every(tally)) return r;
  } catch { /* ignore */ }
  return { engine: {}, online: { w: 0, l: 0, d: 0 } };
}
const MOBILE_QUERY = '(max-width: 760px)';

/** Localised difficulty name (custom levels are labelled here). */
function levelName(d) {
  return d.id === 'custom' ? t('play.custom') : t(`level.${d.id}`);
}

const PIECE_VALUE = { p: 1, n: 3, b: 3, r: 5, q: 9 };

/** Coach-facing label, e.g. "Club (~1200)". */
function difficultyLabel(d) {
  return `${d.label} (~${d.elo || 2800})`;
}

const WATCH_PROMPTS = [
  "You're commentating a game between two engines for a student who is watching to learn. In 2-4 sentences: what are each side's plans, and what should the viewer pay attention to?",
  "Comment on the last few moves for a student: who stands better, was anything inaccurate, and what is the key idea coming up?",
  "What's the most instructive feature of this position for a learner — a tactical motif, a structural strength, or a plan? Point it out in 2-3 sentences.",
  "Assess the play so far for a student: which side has been more accurate, what was the best move played, and what mistakes should be avoided?",
];

function loadSavedGame() {
  try {
    const saved = JSON.parse(localStorage.getItem(GAME_SAVE_KEY));
    if (!saved) return null;
    if (saved.savedAt && Date.now() - saved.savedAt > STALE_SAVE_MS) {
      console.log('Discarding saved game older than 14 days.');
      localStorage.removeItem(GAME_SAVE_KEY);
      return null;
    }
    return saved;
  } catch { return null; }
}

function loadSavedOnline() {
  try { return JSON.parse(localStorage.getItem(ONLINE_SAVE_KEY)); } catch { return null; }
}

/** Human-readable versions of PeerJS error types. */
function onlineErrorText(e) {
  const type = typeof e === 'string' ? e : e?.type;
  switch (type) {
    case 'peer-unavailable': return t('play.err.peerUnavailable');
    case 'negotiation-failed': return t('play.err.negotiationFailed');
    case 'unavailable-id': return t('play.err.unavailableId');
    case 'network': return t('play.err.network');
    case 'server-error': return t('play.err.serverError');
    default: return t('play.err.generic', { type: type || t('play.err.unknown') });
  }
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

export default function Play({ active = true, onAnalyze = () => {} }) {
  const t = useT();
  const lang = useLang();
  const saved = useMemo(loadSavedGame, []);
  const savedOnline = useMemo(loadSavedOnline, []);
  const [customElo, setCustomElo] = useState(() => {
    const v = Number(localStorage.getItem(CUSTOM_ELO_KEY));
    return Number.isFinite(v) && v >= 400 && v <= 2800 ? Math.round(v / 50) * 50 : 1200;
  });
  const [difficulty, setDifficulty] = useState(() => {
    if (saved?.difficultyId === 'custom') return customLevel(Number(localStorage.getItem(CUSTOM_ELO_KEY)) || 1200);
    return DIFFICULTIES.find(d => d.id === saved?.difficultyId) || DIFFICULTIES[2];
  });
  const [color, setColor] = useState(saved?.color === 'b' ? 'b' : 'w');
  const [game, setGame] = useState(() => {
    // replay the saved history so repetition tracking survives a reload
    if (isValidHistory(saved?.history)) return gameFromHistory(saved.history);
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
  const menuRef = useRef(null);
  const moveListRef = useRef(null);
  const gameId = useRef(0); // bumped whenever a new game starts; in-flight engine searches from an older id are dropped
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
  const [chatLog, setChatLog] = useState([]); // [{who:'me'|'opp', text}]
  const [chatInput, setChatInput] = useState('');
  const [menuOpen, setMenuOpen] = useState(false); // mobile game menu
  const [onlineOver, setOnlineOver] = useState(null); // 'win-resign'|'lose-resign'|'win-time'|'lose-time'|'draw-agreed'
  const [pendingOffer, setPendingOffer] = useState(null); // {kind:'draw'|'takeback'} we received
  const [rejoin, setRejoin] = useState(savedOnline?.code ? savedOnline : null); // restorable online game
  const [results, setResults] = useState(loadResults);
  const resultRecorded = useRef(false);
  const [savedGameId, setSavedGameId] = useState(null); // library id of the last finished game
  const [ratingChange, setRatingChange] = useState(null); // {rating, delta} after a rated game
  const onlineRef = useRef(null); // { peer, conn, role, prevColor }
  const [spectators, setSpectators] = useState(0); // watchers connected to our hosted game
  const myOfferRef = useRef(null); // 'draw'|'takeback'|'newgame' we sent and await an answer to

  const [timeOver, setTimeOver] = useState(null); // 'w' | 'b' flagged side (vs engine)
  const [manualResult, setManualResult] = useState(null); // {outcome, title, detail}

  // ---- game clocks (vs engine, and host-authoritative online) ----
  const [clockId, setClockId] = useState(() => migrateTimeControl(saved));
  const [onlineTc, setOnlineTc] = useState('off'); // time control the host chose (guest side)
  const isGuest = mode === 'online' && online.role === 'guest';
  const clocksActive = mode === 'play'
    ? !game.isGameOver() && !manualResult && !timeOver && viewIndex === null
    : mode === 'online' && online.status === 'playing' && !onlineOver && !game.isGameOver()
      && (history?.length || 1) > 2; // online clocks start once both sides have moved
  const clk = useClocks({
    tcId: isGuest ? onlineTc : clockId,
    initial: saved?.online ? null : saved?.clocks,
    active: clocksActive,
    turn: game.turn(),
    onFlag: (side) => {
      if (mode === 'play') setTimeOver(side);
      else if (mode === 'online' && !isGuest) {
        // the host's clock is authoritative and decides flagging
        setOnlineOver(side === 'w' ? 'lose-time' : 'win-time');
        sendPeer({ t: 'flag', side, clocks: onlineClockSnapshot() });
      }
    },
    onPersist: (clocks) => {
      if (mode !== 'play') return;
      try {
        const cur = JSON.parse(localStorage.getItem(GAME_SAVE_KEY));
        if (cur) localStorage.setItem(GAME_SAVE_KEY, JSON.stringify({ ...cur, clocks }));
      } catch { /* ignore */ }
    },
  });
  const clocksOn = clk.tc.base > 0 && (mode === 'play' || mode === 'online');
  function addIncrement(side) { if (mode !== 'watch') clk.addIncrement(side); }
  function onlineClockSnapshot() { return { ...clk.snapshot(), tc: clockId }; }
  function applyRemoteClocks(c) {
    if (typeof c?.tc === 'string') setOnlineTc(c.tc);
    clk.apply(c);
  }
  function resetOnlineClocks() { clk.reset(clockId); }
  const [hintMove, setHintMove] = useState(null); // {from,to,san}
  const [premove, setPremove] = useState(null); // {from,to,promotion} queued during the opponent's turn
  const hintBusyRef = useRef(false);
  const hintTimerRef = useRef(null);

  // ---- piece set + share/export panel ----
  const [pieceSet, setPieceSet] = useState(() => {
    try { return localStorage.getItem(PIECE_SET_KEY) === 'letters' ? 'letters' : 'classic'; } catch { return 'classic'; }
  });
  const [shareOpen, setShareOpen] = useState(false);
  const [fenInput, setFenInput] = useState('');
  const [shareCopied, setShareCopied] = useState(''); // 'pgn' | 'fen' | ''
  const [showCoords, setShowCoords] = useState(() => localStorage.getItem(COORDS_KEY) !== 'false');
  const [blindfold, setBlindfold] = useState(() => localStorage.getItem(BLINDFOLD_KEY) === 'true');
  const [flashSquare, setFlashSquare] = useState(null); // briefly reveals the moved piece in blindfold mode

  useEffect(() => {
    try { localStorage.setItem(COORDS_KEY, String(showCoords)); } catch { /* ignore */ }
  }, [showCoords]);
  useEffect(() => {
    try { localStorage.setItem(BLINDFOLD_KEY, String(blindfold)); } catch { /* ignore */ }
  }, [blindfold]);
  useEffect(() => {
    try { localStorage.setItem(CUSTOM_ELO_KEY, String(customElo)); } catch { /* ignore */ }
  }, [customElo]);

  // blindfold: flash the piece that just moved for 300ms, then hide it again
  useEffect(() => {
    if (!blindfold) { setFlashSquare(null); return; }
    if (!lastMove) { setFlashSquare(null); return; }
    setFlashSquare(lastMove.to);
    const t = setTimeout(() => setFlashSquare(null), 300);
    return () => clearTimeout(t);
  }, [lastMove, blindfold]);

  // live snapshot for connection handlers (they outlive any single render)
  const liveRef = useRef(null);
  liveRef.current = { game, history, captured, lastMove, mode, online, onlineOver };

  useEffect(() => {
    localStorage.setItem(MOVES_OPEN_KEY, String(movesOpen));
  }, [movesOpen]);

  // keep the move list scrolled to the current move
  const activePly = viewIndex ?? (history?.length || 1) - 1;
  useEffect(() => {
    const el = moveListRef.current?.querySelector('.mv.active');
    el?.scrollIntoView({ block: 'nearest' });
  }, [activePly]);

  // arrow-key move navigation (ignored while typing)
  useEffect(() => {
    function onKey(e) {
      if (!active) return; // Play stays mounted behind other tabs
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      const t = e.target;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
      if (e.key === 'ArrowLeft') stepPrev();
      else stepNext();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [history, viewIndex, active]);

  useEffect(() => {
    return () => { if (hintTimerRef.current) clearTimeout(hintTimerRef.current); };
  }, []);

  // Esc dismisses the share panel
  useEffect(() => {
    if (!shareOpen) return;
    function onKey(e) { if (e.key === 'Escape') setShareOpen(false); }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [shareOpen]);

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
      clockId, clocks: clk.snapshot(), savedAt: Date.now(),
    }));
    if (mode === 'online' && online.code) {
      localStorage.setItem(ONLINE_SAVE_KEY, JSON.stringify({
        code: online.code, role: online.role || onlineRef.current?.role,
        fen: game.fen(), history, captured, lastMove,
      }));
    }
  }, [game, lastMove, color, difficulty, history, captured, mode, online, clockId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    try { localStorage.setItem(PIECE_SET_KEY, pieceSet); } catch { /* ignore */ }
  }, [pieceSet]);

  function resetClocks(id = clockId) {
    clk.reset(id);
    setTimeOver(null);
  }

  function clearHint() {
    setHintMove(null);
    if (hintTimerRef.current) { clearTimeout(hintTimerRef.current); hintTimerRef.current = null; }
  }

  // if the saved position had the engine to move (e.g. player refreshed
  // while Maestro was thinking), let it reply now
  const resumedEngineReply = useRef(false); // StrictMode double-runs this effect in dev
  useEffect(() => {
    if (resumedEngineReply.current) return;
    if (saved?.online) return;
    if (mode === 'play' && game.turn() !== color && !game.isGameOver()) {
      resumedEngineReply.current = true;
      engineReply(game, difficulty);
    }
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

  useEffect(() => {
    if (!menuOpen) return;
    function onPointerDown(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false);
    }
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [menuOpen]);

  // wrap game with metadata for the coach
  const coachGame = useMemo(() => {
    const g = game;
    g.difficultyLabel = difficultyLabel(difficulty);
    g.humanColor = color;
    return g;
  }, [game, difficulty, color]);

  function newGame(c = color, d = difficulty) {
    gameId.current += 1;
    setPremove(null);
    resultRecorded.current = false;
    setSavedGameId(null);
    setRatingChange(null);
    resetCoachChat();
    clearHint();
    setManualResult(null);
    resetClocks();
    const g = new Chess();
    g.difficultyLabel = difficultyLabel(d);
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
    const id = gameId.current;
    setThinking(true);
    try {
      const mv = await bestMove(g.fen(), d);
      if (id !== gameId.current) return; // a new game started while searching
      clearHint();
      // side effects stay outside state updaters (StrictMode runs those twice)
      const prev = liveRef.current.game;
      if (!mv || mv === '(none)' || prev.fen() !== g.fen()) return;
      const r = playMove(prev, { from: mv.slice(0, 2), to: mv.slice(2, 4), promotion: mv[4] });
      if (!r) return;
      commitMove(prev, r);
    } finally {
      setThinking(false);
    }
  }

  /** Apply a played move to all board state (game, history, captures, clock increment). */
  function commitMove(prev, { game: next, lastMove: lm, victim }) {
    if (victim) setCaptured((c) => ({ ...c, [victim.color]: [...c[victim.color], victim.type] }));
    playMoveSound({ capture: !!victim });
    addIncrement(lm.color);
    setGame(next);
    setLastMove(lm);
    setHistory((h) => [...(h || [{ fen: prev.fen(), lastMove: null }]), { fen: next.fen(), lastMove: lm, victim }]);
  }

  // ---- observe mode: engine vs engine ----
  function randomDifficulty() {
    return DIFFICULTIES[Math.floor(Math.random() * DIFFICULTIES.length)];
  }

  function startWatch() {
    gameId.current += 1;
    setPremove(null);
    resultRecorded.current = false;
    setSavedGameId(null);
    setRatingChange(null);
    clearHint();
    setManualResult(null);
    setTimeOver(null);
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
    const choices = game.moves({ verbose: true }).filter((m) => {
      if (m.promotion) return false;
      if (m.piece === 'p') return ['3', '4'].includes(m.to[1]) && m.from[1] === '2';
      return m.piece === 'n';
    });
    const pool = choices.length ? choices : game.moves({ verbose: true });
    const pick = pool[Math.floor(Math.random() * pool.length)];
    const r = playMove(game, { from: pick.from, to: pick.to });
    if (r) commitMove(game, r);
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
    setPremove(null);
    setGame(g);
    setLastMove(null);
    setHistory([{ fen: g.fen(), lastMove: null }]);
    setViewIndex(null);
    setCaptured({ w: [], b: [] });
    setStatus('');
    setOnlineOver(null);
    setPendingOffer(null);
    setManualResult(null);
    setTimeOver(null);
    resultRecorded.current = false;
    setSavedGameId(null);
    setRatingChange(null);
  }

  function openLobby() {
    gameId.current += 1;
    setPremove(null);
    setMode('play');
    setOnline({ status: 'idle', code: '', role: null, error: '' });
  }

  /** Peer handlers for the host. They read live state through liveRef, so a
      reconnecting guest is synced to the CURRENT position, not a stale one. */
  function hostHandlers() {
    return {
      onConnected: (conn) => {
        const cur = onlineRef.current;
        if (!cur) { conn.close(); return; }
        if (conn.metadata?.role === 'spectator') {
          // read-only watchers get every state update but can't act
          cur.spectators = [...(cur.spectators || []).filter((c) => c.open), conn].slice(-20);
          const s = liveRef.current;
          try { conn.send(stateMessage(s.game.fen(), s.history, s.captured, s.lastMove)); } catch { /* ignore */ }
          setSpectators(cur.spectators.length);
          return;
        }
        // a game already has its player — reject extra connections
        if (cur.conn && cur.conn.open && cur.conn !== conn) {
          try { conn.send({ t: 'busy' }); } catch { /* ignore */ }
          conn.close();
          return;
        }
        cur.conn = conn;
        setOppGone(false);
        const s = liveRef.current;
        if (s.mode === 'online') {
          // returning guest (reconnection) — keep the game, just sync
          hostSync(s.game.fen(), s.history, s.captured, s.lastMove);
          if ((s.history?.length || 1) > 1) sysChat(t('play.chat.reconnected'));
        } else {
          beginOnlineGame('host');
        }
      },
      onData: (d, conn) => {
        // only the seated opponent can move, chat or make offers
        if (conn && conn !== onlineRef.current?.conn) return;
        onlineHostData(d);
      },
      onClose: (conn) => {
        const cur = onlineRef.current;
        if (cur && conn && conn !== cur.conn) {
          cur.spectators = (cur.spectators || []).filter((c) => c !== conn && c.open);
          setSpectators(cur.spectators.length);
          return;
        }
        setOppGone(true);
      },
      onError: (e) => setOnline((o) => ({ ...o, status: o.status === 'playing' ? o.status : 'error', error: onlineErrorText(e) })),
    };
  }

  function onlineCreate() {
    const code = makeCode();
    const peer = hostGame(code, hostHandlers());
    onlineRef.current = { ...(onlineRef.current || {}), peer, conn: null, role: 'host' };
    setOnline({ status: 'waiting', code, role: 'host', error: '' });
  }

  function onlineJoin(codeArg) {
    const code = (codeArg ?? joinCode).trim().toLowerCase();
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
      onError: (e) => setOnline((o) => ({ ...o, status: o.status === 'playing' ? o.status : 'error', error: onlineErrorText(e) })),
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
    myOfferRef.current = null;
    if (role === 'host') resetOnlineClocks();
  }

  function stateMessage(fen, hist, caps, lm) {
    return { t: 'state', fen, history: hist, captured: caps, lastMove: lm, clocks: onlineClockSnapshot(), over: liveRef.current?.onlineOver || null };
  }

  /** Send the authoritative state to the opponent and every spectator. */
  function hostSync(fen, hist, caps, lm) {
    const msg = stateMessage(fen, hist, caps, lm);
    const cur = onlineRef.current;
    for (const c of [cur?.conn, ...(cur?.spectators || [])]) {
      if (!c?.open) continue;
      try { c.send(msg); } catch { /* connection closing */ }
    }
  }

  /** Host applies a validated move (its own or the guest's) and syncs it. */
  function hostCommit(s, { game: g, lastMove: lm, victim }) {
    const hist = [...(s.history || [{ fen: s.game.fen(), lastMove: null }]), { fen: g.fen(), lastMove: lm, victim }];
    const caps = victim
      ? { ...s.captured, [victim.color]: [...s.captured[victim.color], victim.type] }
      : s.captured;
    playMoveSound({ capture: !!victim });
    addIncrement(lm.color);
    setGame(g);
    setLastMove(lm);
    setHistory(hist);
    setCaptured(caps);
    liveRef.current = { ...liveRef.current, game: g, history: hist, captured: caps, lastMove: lm };
    hostSync(g.fen(), hist, caps, lm);
  }

  function onlineHostData(d) {
    if (!d || typeof d !== 'object') return;
    const s = liveRef.current;
    if (d.t === 'chat') { setChatLog((c) => [...c.slice(-99), { who: 'opp', text: String(d.text).slice(0, 300) }]); return; }
    if (handleGameAction(d)) return;
    if (d.t === 'sync') {
      hostSync(s.game.fen(), s.history, s.captured, s.lastMove);
      return;
    }
    if (d.t === 'newgame-request') {
      // never reset the host's game unasked: a finished game restarts at
      // once, a game in progress needs the host to accept
      if (s.onlineOver || s.game.isGameOver()) requestNewGame(true);
      else setPendingOffer({ kind: 'newgame' });
      return;
    }
    if (d.t === 'move' && s.mode === 'online' && !s.onlineOver) {
      // the guest only moves Black, and only on Black's turn
      if (s.game.turn() !== 'b' || s.game.get(d.from)?.color !== 'b') return;
      if (typeof d.from !== 'string' || typeof d.to !== 'string') return;
      const r = playMove(s.game, { from: d.from, to: d.to, promotion: d.promotion });
      if (!r) return;
      hostCommit(s, r);
    }
  }

  function onlineGuestData(d) {
    if (!d || typeof d !== 'object') return;
    if (d.t === 'chat') { setChatLog((c) => [...c.slice(-99), { who: 'opp', text: String(d.text).slice(0, 300) }]); return; }
    if (handleGameAction(d)) return;
    if (d.t === 'newgame') { guestNewGame(d); return; }
    if (d.t === 'flag' && (d.side === 'w' || d.side === 'b')) {
      if (d.clocks) applyRemoteClocks(d.clocks);
      setOnlineOver(d.side === 'b' ? 'lose-time' : 'win-time');
      return;
    }
    if (d.t === 'busy') { setOnline((o) => ({ ...o, status: 'error', error: t('play.err.busy') })); return; }
    if (d.t !== 'state' || !isValidHistory(d.history)) return;
    const prev = liveRef.current;
    const hist = d.history;
    const lm = hist[hist.length - 1].lastMove || null;
    if (lm && hist.length !== (prev.history?.length || 0)) {
      playMoveSound({ capture: !!hist[hist.length - 1].victim });
    }
    setGame(gameFromHistory(hist));
    setHistory(hist);
    setCaptured(capturedFromHistory(hist));
    setLastMove(lm);
    if (d.clocks) applyRemoteClocks(d.clocks);
  }

  function rebuildFromHistory(hist) {
    setPremove(null);
    const last = hist[hist.length - 1];
    setGame(gameFromHistory(hist));
    setHistory(hist);
    setCaptured(capturedFromHistory(hist));
    setLastMove(last.lastMove || null);
    setViewIndex(null);
    setStatus('');
  }

  // single-player takeback: undo your last move and the engine's reply
  function singlePlayerTakeback() {
    if (mode !== 'play' || thinking || (history?.length || 1) < 2) return;
    if (game.isGameOver() || manualResult || timeOver) return; // result already recorded
    const n = history.length >= 3 ? 2 : 1;
    clearHint();
    rebuildFromHistory(history.slice(0, history.length - n));
  }

  // ---- play-vs-engine: hint, resign, draw offer ----
  async function requestHint() {
    if (mode !== 'play' || thinking || viewing || game.isGameOver() || manualResult || timeOver) return;
    if (game.turn() !== color || hintMove || hintBusyRef.current) return;
    hintBusyRef.current = true;
    try {
      const { bestmove } = await analyze(game.fen(), { depth: 8, movetime: 300 });
      const id = gameId.current;
      if (!bestmove || bestmove === '(none)' || id !== gameId.current) return;
      const from = bestmove.slice(0, 2);
      const to = bestmove.slice(2, 4);
      let san = '';
      try { san = new Chess(game.fen()).move({ from, to, promotion: bestmove[4] }).san; } catch { /* keep empty */ }
      clearHint();
      setHintMove({ from, to });
      setStatus(t('play.status.hint', { move: san || from + '–' + to }));
      hintTimerRef.current = setTimeout(clearHint, 2500);
    } catch {
      setStatus(t('play.status.hintUnavailable'));
    } finally {
      hintBusyRef.current = false;
    }
  }

  function resignVsEngine() {
    if (mode !== 'play' || game.isGameOver() || manualResult || timeOver) return;
    clearHint();
    setManualResult({ outcome: 'l', title: t('play.over.youResigned'), detail: t('play.over.resignDetail') });
  }

  async function offerDrawVsEngine() {
    if (mode !== 'play' || thinking || game.isGameOver() || manualResult || timeOver) return;
    setStatus(t('play.status.drawOfferSent'));
    try {
      const id = gameId.current;
      // cp is from the side-to-move perspective; when you offer on your move,
      // the engine's own evaluation of the position is the negation
      const { cp, mate } = await analyze(game.fen(), { depth: 10, movetime: 400 });
      if (id !== gameId.current) return;
      // scores are side-to-move POV: flip them when it's the player's move
      const flip = game.turn() === color ? -1 : 1;
      const engineCp = cp === null ? null : cp * flip;
      const engineMate = mate === null ? null : mate * flip;
      if (engineMate !== null && engineMate < 0) { // engine is getting mated — accept
        setManualResult({ outcome: 'd', title: t('play.over.drawAccepted'), detail: t('play.over.drawAcceptedMate') });
      } else if (engineCp !== null && engineCp <= -150) {
        setManualResult({ outcome: 'd', title: t('play.over.drawAccepted'), detail: t('play.over.drawAcceptedWorse') });
      } else {
        setStatus(t('play.status.drawDeclined'));
      }
    } catch {
      setStatus(t('play.status.engineError'));
    }
  }

  // ---- PGN/FEN export + FEN import ----
  function buildPgn() {
    try {
      const hist = history?.length ? history : [{ fen: game.fen(), lastMove: null }];
      const g = new Chess(hist[0].fen);
      for (let k = 1; k < hist.length; k++) {
        if (hist[k].lastMove?.san) g.move(hist[k].lastMove.san);
      }
      let result = '*';
      const mine = (o) => (o === 'd' ? '1/2-1/2' : (o === 'w') === (color === 'w') ? '1-0' : '0-1');
      if (onlineOver) result = mine(onlineOver === 'draw-agreed' ? 'd' : onlineOver.startsWith('win') ? 'w' : 'l');
      else if (manualResult) result = mine(manualResult.outcome);
      else if (timeOver) result = timeOver === 'w' ? '0-1' : '1-0';
      else if (game.isCheckmate()) result = game.turn() === 'w' ? '0-1' : '1-0';
      else if (game.isDraw()) result = '1/2-1/2';
      const opp = mode === 'online' ? 'Opponent' : 'Maestro';
      const whiteName = mode === 'watch' ? 'White' : color === 'w' ? 'You' : opp;
      const blackName = mode === 'watch' ? 'Black' : color === 'b' ? 'You' : opp;
      g.header('Event', 'Maestro Chess', 'Date', new Date().toISOString().slice(0, 10).replace(/-/g, '.'), 'White', whiteName, 'Black', blackName, 'Result', result);
      return g.pgn();
    } catch { return ''; }
  }

  async function copyText(text, kind) {
    try {
      await navigator.clipboard.writeText(text);
      setShareCopied(kind);
      setTimeout(() => setShareCopied(''), 1500);
    } catch {
      setStatus(t('play.status.copyFailed'));
    }
  }

  function loadFen() {
    const fen = fenInput.trim();
    if (!fen) return;
    let g;
    try { g = new Chess(fen); } catch {
      setStatus(t('play.status.invalidFen'));
      return;
    }
    gameId.current += 1;
    setPremove(null);
    resultRecorded.current = false;
    setSavedGameId(null);
    setRatingChange(null);
    resetCoachChat();
    clearHint();
    setManualResult(null);
    resetClocks();
    g.difficultyLabel = difficultyLabel(difficulty);
    g.humanColor = color;
    setMode('play');
    setGame(g);
    setLastMove(null);
    setHistory([{ fen: g.fen(), lastMove: null }]);
    setViewIndex(null);
    setCaptured({ w: [], b: [] });
    setStatus('');
    setShareOpen(false);
    setFenInput('');
    if (g.turn() !== color) engineReply(g, difficulty);
  }

  // ---- online game actions ----
  function sysChat(text) { setChatLog((c) => [...c.slice(-99), { who: 'sys', text }]); }

  function sendPeer(msg) {
    try { onlineRef.current?.conn?.send(msg); } catch { /* connection closing */ }
  }

  /** Takebacks are applied by the host only and then synced, so both boards
      always agree. Undoes the requester's last move (and the reply after it). */
  function hostApplyTakeback(requester) {
    const s = liveRef.current;
    const hist = s.history || [];
    if (hist.length < 2) return;
    const lastMover = hist[hist.length - 1].lastMove?.color;
    const n = lastMover === requester ? 1 : 2;
    if (hist.length - n < 1) return;
    const next = hist.slice(0, hist.length - n);
    rebuildFromHistory(next);
    const last = next[next.length - 1];
    liveRef.current = { ...s, history: next, game: gameFromHistory(next) };
    hostSync(last.fen, next, capturedFromHistory(next), last.lastMove || null);
  }

  function myColorOnline() {
    return (online.role || onlineRef.current?.role) === 'host' ? 'w' : 'b';
  }

  function requestTakeback() {
    if ((history?.length || 1) < 2 || myOfferRef.current) return;
    myOfferRef.current = 'takeback';
    sendPeer({ t: 'takeback' });
    sysChat(t('play.chat.takebackRequested'));
  }
  function acceptTakeback() {
    setPendingOffer(null);
    sendPeer({ t: 'takeback-ok' });
    // the opponent asked: undo THEIR last move
    if (myColorOnline() === 'w') hostApplyTakeback('b');
  }
  function declineOffer() {
    const kind = pendingOffer?.kind;
    sendPeer({ t: `${kind}-no` });
    setPendingOffer(null);
  }
  function offerDraw() {
    if (myOfferRef.current) return;
    myOfferRef.current = 'draw';
    sendPeer({ t: 'draw' });
    sysChat(t('play.chat.drawOffered'));
  }
  function acceptDraw() {
    setPendingOffer(null);
    sendPeer({ t: 'draw-ok' });
    setOnlineOver('draw-agreed');
  }
  function acceptNewGame() {
    setPendingOffer(null);
    requestNewGame(true);
  }
  function resign() {
    sendPeer({ t: 'resign' });
    setOnlineOver('lose-resign');
  }

  /** Offer/answer protocol. An '-ok' only counts when we actually made that
      offer — otherwise a tampered peer could force draws or rewind moves. */
  function handleGameAction(d) {
    const over = liveRef.current.onlineOver;
    const answer = (kind) => {
      if (myOfferRef.current !== kind) return false;
      myOfferRef.current = null;
      return true;
    };
    switch (d.t) {
      case 'takeback': if (!over) setPendingOffer({ kind: 'takeback' }); return true;
      case 'draw': if (!over) setPendingOffer({ kind: 'draw' }); return true;
      case 'takeback-ok':
        if (answer('takeback')) {
          if (myColorOnline() === 'w') hostApplyTakeback('w');
          sysChat(t('play.chat.takebackAccepted'));
        }
        return true;
      case 'draw-ok':
        if (answer('draw') && !over) setOnlineOver('draw-agreed');
        return true;
      case 'takeback-no': if (answer('takeback')) sysChat(t('play.chat.takebackDeclined')); return true;
      case 'draw-no': if (answer('draw')) sysChat(t('play.chat.drawDeclined')); return true;
      case 'newgame-no': if (answer('newgame')) sysChat(t('play.chat.newGameDeclined')); return true;
      case 'resign': if (!over) setOnlineOver('win-resign'); return true;
      default: return false;
    }
  }

  function sendChat() {
    const text = chatInput.trim();
    if (!text) return;
    onlineRef.current?.conn?.send({ t: 'chat', text });
    setChatLog((c) => [...c.slice(-99), { who: 'me', text: text.slice(0, 300) }]);
    setChatInput('');
  }

  function rejoinOnline() {
    const r = rejoin;
    setRejoin(null);
    onlineRef.current = { peer: null, conn: null, role: r.role, prevColor: color };
    if (r.role === 'host') {
      const hist = isValidHistory(r.history) ? r.history : [{ fen: new Chess().fen(), lastMove: null }];
      const g = gameFromHistory(hist);
      // set the live snapshot before the guest can connect
      liveRef.current = { ...liveRef.current, mode: 'online', game: g, history: hist, captured: capturedFromHistory(hist), lastMove: hist[hist.length - 1].lastMove || null };
      onlineRef.current.peer = hostGame(r.code, hostHandlers());
      setMode('online');
      setOnline({ status: 'playing', code: r.code, role: 'host', error: '' });
      setColor('w');
      rebuildFromHistory(hist);
      setChatLog((c) => [...c, { who: 'sys', text: t('play.chat.restored') }]);
    } else {
      onlineJoin(r.code); // guest path re-syncs from the host
    }
  }

  function discardRejoin() {
    localStorage.removeItem(ONLINE_SAVE_KEY);
    setRejoin(null);
  }

  function leaveOnline() {
    const prevColor = onlineRef.current?.prevColor || 'w';
    myOfferRef.current = null;
    onlineRef.current?.peer?.destroy();
    onlineRef.current = null;
    localStorage.removeItem(ONLINE_SAVE_KEY);
    setRejoin(null);
    setOnline({ status: 'off', code: '', role: null, error: '' });
    setOppGone(false);
    setChatLog([]);
    setOnlineOver(null);
    setPendingOffer(null);
    setMode('play');
    setColor(prevColor);
    newGame(prevColor, difficulty);
  }

  /** Online: the host starts the new game (directly once the game is over,
      or when the guest's request was accepted); otherwise ask the opponent. */
  function requestNewGame(accepted = false) {
    if (mode !== 'online') { newGame(); return; }
    const role = online.role || onlineRef.current?.role;
    const over = !!onlineOver || game.isGameOver();
    if (role === 'host' && (accepted || over)) {
      const g = new Chess();
      const hist = [{ fen: g.fen(), lastMove: null }];
      myOfferRef.current = null;
      resetBoardState(g);
      resetOnlineClocks();
      liveRef.current = { ...liveRef.current, game: g, history: hist, captured: { w: [], b: [] }, lastMove: null, onlineOver: null };
      sendPeer({ t: 'newgame', fen: g.fen(), history: hist, clocks: onlineClockSnapshot() });
    } else if (!myOfferRef.current) {
      myOfferRef.current = 'newgame';
      sendPeer({ t: 'newgame-request' });
      sysChat(over ? t('play.chat.rematchRequested') : t('play.chat.newGameRequested'));
    }
  }

  function guestNewGame(d) {
    if (!isValidHistory(d.history)) return;
    myOfferRef.current = null;
    setGame(gameFromHistory(d.history));
    setHistory(d.history);
    if (d.clocks) applyRemoteClocks(d.clocks);
    setCaptured({ w: [], b: [] });
    setLastMove(null);
    setViewIndex(null);
    setStatus('');
    setOnlineOver(null);
    setPendingOffer(null);
  }

  useEffect(() => {
    if (manualResult) {
      setStatus(manualResult.title + '.');
      return;
    }
    if (timeOver) {
      setStatus(timeOver === color ? t('play.status.timeLose') : t('play.status.timeWin'));
      return;
    }
    const over = game.isGameOver();
    if (!over) {
      // check indication is shown by the banner under the board — keep the status line for turn info only
      setStatus('');
      return;
    }
    let s = '';
    if (game.isCheckmate()) s = `${t('play.over.checkmateWins', { side: game.turn() === 'w' ? t('common.black') : t('common.white') })}. ${game.turn() === color ? t('play.over.askCoachWrong') : t('play.over.wellPlayed')}`;
    else if (game.isDraw()) s = drawReason(game, t);
    setStatus(s);
    // record the result once per finished game (a watched engine game is not a result)
    if (mode === 'watch') return;
    if (resultRecorded.current) return;
    let outcome; // 'w' | 'l' | 'd' from the local player's perspective
    if (game.isDraw() || game.isStalemate()) outcome = 'd';
    else {
      const winner = game.turn() === 'w' ? 'b' : 'w';
      const me = mode === 'online' ? (online.role === 'host' ? 'w' : 'b') : color;
      outcome = winner === me ? 'w' : 'l';
    }
    recordResult(outcome);
  }, [game, color]); // eslint-disable-line

  // endings that don't come from a terminal board position: flagging,
  // resignation, or an accepted draw offer in a play-vs-engine game
  useEffect(() => {
    if (mode !== 'play') return;
    let outcome = null;
    if (timeOver) outcome = timeOver === color ? 'l' : 'w';
    else if (manualResult) outcome = manualResult.outcome;
    if (!outcome || resultRecorded.current) return;
    recordResult(outcome);
  }, [timeOver, manualResult, mode, color, difficulty]); // eslint-disable-line react-hooks/exhaustive-deps

  // online games can end by resignation or an agreed draw without the
  // board position being terminal — tally those once, like the effect above
  useEffect(() => {
    if (!onlineOver) return;
    const outcome = onlineOver.startsWith('win') ? 'w'
      : onlineOver.startsWith('lose') ? 'l'
      : onlineOver === 'draw-agreed' ? 'd'
      : null;
    if (!outcome || resultRecorded.current) return;
    recordResult(outcome);
  }, [onlineOver]); // eslint-disable-line react-hooks/exhaustive-deps

  // spectators learn about resignations, agreed draws and flags too
  useEffect(() => {
    if (mode !== 'online' || myColorOnline() !== 'w' || !onlineOver) return;
    const s = liveRef.current;
    hostSync(s.game.fen(), s.history, s.captured, s.lastMove);
  }, [onlineOver]); // eslint-disable-line react-hooks/exhaustive-deps

  function copySpectateLink() {
    const url = `${window.location.origin}${window.location.pathname}#/watch/${online.code}`;
    copyText(url, 'watch');
  }

  /**
   * Once per finished game: tally it, save it to the library for review, and
   * (vs Maestro, from the normal start position) update the rating estimate.
   */
  function recordResult(outcome) {
    if (resultRecorded.current) return;
    resultRecorded.current = true;
    const online_ = mode === 'online';
    const next = JSON.parse(JSON.stringify(results));
    if (online_) next.online[outcome] += 1;
    else {
      next.engine[difficulty.id] = next.engine[difficulty.id] || { w: 0, l: 0, d: 0 };
      next.engine[difficulty.id][outcome] += 1;
    }
    try { localStorage.setItem(RESULTS_KEY, JSON.stringify(next)); } catch { /* ignore */ }
    setResults(next);

    const plies = (history?.length || 1) - 1;
    if (plies < 2) return; // nothing worth saving
    const me = online_ ? myColorOnline() : color;
    const oppName = online_ ? 'Opponent' : `Maestro (${difficulty.label}${difficulty.elo ? ` ~${difficulty.elo}` : ''})`;
    const result = outcome === 'd' ? '1/2-1/2' : (outcome === 'w') === (me === 'w') ? '1-0' : '0-1';
    const saved = saveGame({
      pgn: buildPgn(),
      white: me === 'w' ? 'You' : oppName,
      black: me === 'b' ? 'You' : oppName,
      result,
      source: online_ ? 'online' : 'engine',
      userColor: me,
      opponentElo: online_ ? null : difficulty.elo || 2850,
      timeControl: clk.tc.base ? clk.tc.label : null,
    });
    setSavedGameId(saved.id);
    const fromStart = history?.[0]?.fen === new Chess().fen();
    if (!online_ && fromStart) {
      const r = updateRating(difficulty.elo || 2850, outcome === 'w' ? 1 : outcome === 'd' ? 0.5 : 0);
      setRatingChange(r);
    }
  }

  // premoves: queued while the opponent (engine or online) is to move, then
  // played the moment it's our turn — dropped silently if no longer legal
  const premoveAllowed = (mode === 'play' || mode === 'online') && viewIndex === null && !onlineOver && !manualResult && !timeOver && !game.isGameOver();
  useEffect(() => {
    if (!premove) return;
    if (!premoveAllowed) { setPremove(null); return; }
    if (game.turn() !== color || thinking) return;
    const p = premove;
    setPremove(null);
    if (game.moves({ verbose: true }).some((m) => m.from === p.from && m.to === p.to)) onMove(p);
  }, [game, thinking, premoveAllowed]); // eslint-disable-line react-hooks/exhaustive-deps

  function onMove({ from, to, promotion }) {
    if (mode === 'watch') return;
    if (mode === 'online') {
      if (online.role === 'guest') {
        if (onlineOver || game.turn() !== 'b' || viewIndex !== null) return;
        sendPeer({ t: 'move', from, to, promotion });
        return;
      }
      // host plays White locally, then syncs
      if (game.isGameOver() || onlineOver || viewIndex !== null) return;
      if (game.turn() !== 'w') return;
      const r = playMove(game, { from, to, promotion });
      if (r) hostCommit(liveRef.current, r);
      return;
    }
    if (mode !== 'play') return;
    if (thinking || game.isGameOver() || viewIndex !== null) return;
    if (game.turn() !== color || manualResult || timeOver) return;
    const r = playMove(game, { from, to, promotion });
    if (!r) return;
    clearHint();
    commitMove(game, r);
    liveRef.current.game = r.game; // engineReply reads the live game after its search
    engineReply(r.game, difficulty);
  }

  const viewing = viewIndex !== null;
  const boardFen = viewing ? history[viewIndex].fen : game.fen();
  const boardLastMove = viewing ? history[viewIndex].lastMove : lastMove;
  const canPrev = viewing ? viewIndex > 0 : (history?.length || 0) > 1;
  const canNext = viewing && viewIndex < history.length - 1;
  const whiteAdv = captured.b.reduce((s, t) => s + (PIECE_VALUE[t] || 0), 0) - captured.w.reduce((s, t) => s + (PIECE_VALUE[t] || 0), 0);
  const byWhite = [...captured.b].sort((a, b) => PIECE_VALUE[b] - PIECE_VALUE[a]);
  const byBlack = [...captured.w].sort((a, b) => PIECE_VALUE[b] - PIECE_VALUE[a]);
  const opening = useMemo(() => {
    try { return openingName(game.history()); } catch { return null; }
  }, [game]);
  function stepPrev() {
    // no earlier position yet (fresh game): the ← key must not select index -1
    if ((history?.length || 0) < 2) return;
    setViewIndex((i) => (i === null ? history.length - 2 : Math.max(0, i - 1)));
  }
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
              aria-label={t('play.openCoach')}
              title={t('play.openCoach')}
            >
              <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
                <path fill="currentColor" d="M4 4h16a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H9l-4.4 3.3A1 1 0 0 1 3 19.5V5a1 1 0 0 1 1-1Z" />
              </svg>
              <span>{t('play.coach')}</span>
            </button>
          )}
        </aside>
      )}
      <div className="play-main">
        <div className="play-toolbar">
          <div className="toolbar-actions">
            <select
              className="toolbar-select"
              aria-label={t('play.difficulty')}
              value={difficulty.id}
              onChange={(e) => {
                if (e.target.value === 'custom') {
                  const d = customLevel(customElo);
                  setDifficulty(d);
                  newGame(color, d);
                } else {
                  const d = DIFFICULTIES.find(x => x.id === e.target.value);
                  setDifficulty(d);
                  newGame(color, d);
                }
              }}
            >
              {DIFFICULTIES.map((d) => (
                <option key={d.id} value={d.id}>{levelName(d)}{d.elo ? ` (~${d.elo})` : ''}</option>
              ))}
              <option value="custom">{t('play.custom')}{difficulty.id === 'custom' ? ` (~${difficulty.elo})` : ''}</option>
            </select>
            {difficulty.id === 'custom' && (
              <label className="custom-elo">
                <input
                  type="range"
                  min="400"
                  max="2800"
                  step="50"
                  value={customElo}
                  onChange={(e) => {
                    const elo = Number(e.target.value);
                    setCustomElo(elo);
                    const d = customLevel(elo);
                    setDifficulty(d);
                    newGame(color, d);
                  }}
                  aria-label={t('play.customElo')}
                />
                <span className="custom-elo-value">{difficulty.elo} Elo</span>
              </label>
            )}
            <select
              className="toolbar-select"
              aria-label={t('play.playAs')}
              value={color}
              onChange={(e) => { setColor(e.target.value); newGame(e.target.value); }}
            >
              <option value="w">{t('common.white')}</option>
              <option value="b">{t('common.black')}</option>
            </select>
            {mode !== 'online' && (
              <select
                className="toolbar-select"
                aria-label={t('play.clock')}
                title={t('play.gameClock')}
                value={clockId}
                onChange={(e) => { setClockId(e.target.value); resetClocks(e.target.value); }}
              >
                {TIME_CONTROLS.map((tc) => (
                  <option key={tc.id} value={tc.id}>{tc.id === 'off' ? t('play.clockOff') : tc.label}</option>
                ))}
              </select>
            )}
            <button
              type="button"
              className="icon-btn piece-set-toggle"
              onClick={() => setPieceSet((s) => (s === 'classic' ? 'letters' : 'classic'))}
              aria-label={t('play.pieceSetLabel', { set: pieceSet === 'classic' ? t('play.pieces.classic') : t('play.pieces.letters') })}
              title={t('play.piecesTitle', { set: pieceSet === 'classic' ? t('play.pieces.classic') : t('play.pieces.letters') })}
            >
              {pieceSet === 'classic' ? '♞' : 'N'}
            </button>
            <button
              type="button"
              className={`icon-btn${showCoords ? ' active' : ''}`}
              onClick={() => setShowCoords((v) => !v)}
              aria-label={showCoords ? t('play.coordsShown') : t('play.coordsHidden')}
              title={showCoords ? t('play.coordsShown') : t('play.coordsHidden')}
              aria-pressed={showCoords}
            >
              <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
                <path fill="none" stroke="currentColor" strokeWidth="2" d="M4 4h16v16H4V4Zm0 12h16M16 4v16" />
                <path fill="currentColor" d="M7 13.6h1.9l1-3 1 3H12l-1.8-5h-1L7.4 13.6Zm.6 2.4h1v2.4h2.2v.9H7.6V16Zm5-6.2h3v.9h-2v.8h1.8v.9h-1.8v1.5h-.9V9.8Z" />
              </svg>
            </button>
            <button
              type="button"
              className={`icon-btn${blindfold ? ' active' : ''}`}
              onClick={() => setBlindfold((v) => !v)}
              aria-label={blindfold ? t('play.blindfoldOnLabel') : t('play.blindfoldOffLabel')}
              title={blindfold ? t('play.blindfoldOnTitle') : t('play.blindfoldOffTitle')}
              aria-pressed={blindfold}
            >
              <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
                <path fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" d="M3 3l18 18M10.6 5.1A9.8 9.8 0 0 1 12 5c5 0 9 4.5 10 7-.4 1-1.3 2.4-2.7 3.7M6.6 6.6C4 8.3 2.5 10.8 2 12c1 2.5 5 7 10 7 1.5 0 3-.4 4.3-1.1" />
                <path fill="none" stroke="currentColor" strokeWidth="2" d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
              </svg>
            </button>
            {isMobile ? (
              <div className="settings-trigger" ref={menuRef}>
                <button
                  type="button"
                  className={`icon-btn${menuOpen ? ' active' : ''}`}
                  onClick={() => setMenuOpen((v) => !v)}
                  aria-label={t('play.gameMenu')}
                  title={t('play.gameMenu')}
                >
                  <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
                    <path fill="currentColor" d="M4 7h16v2H4V7Zm0 4h16v2H4v-2Zm0 4h16v2H4v-2Z" />
                  </svg>
                </button>
                {menuOpen && (
                  <div className="side dropdown-panel mobile-menu">
                    <button type="button" onClick={() => { setMenuOpen(false); gameId.current += 1; if (mode === 'online') requestNewGame(); else { newGame(); setMode('play'); } }}>{t('play.newGame')}</button>
                    <button type="button" onClick={() => { setMenuOpen(false); gameId.current += 1; mode === 'watch' ? stopWatch() : startWatch(); }}>
                      {mode === 'watch' ? t('play.stopWatching') : t('play.watchGame')}
                    </button>
                    <button type="button" onClick={() => { setMenuOpen(false); if (online.status === 'playing') leaveOnline(); else openLobby(); }}>
                      {online.status === 'playing' ? t('play.leaveOnline') : t('play.playOnline')}
                    </button>
                  </div>
                )}
              </div>
            ) : (
            <>
            <button className="toolbar-new-game" onClick={() => { gameId.current += 1; if (mode === 'online') requestNewGame(); else { newGame(); setMode('play'); } }}>{t('play.newGame')}</button>
            <button
              className={`toolbar-watch${mode === 'watch' ? ' active' : ''}`}
              onClick={() => { gameId.current += 1; mode === 'watch' ? stopWatch() : startWatch(); }}
              title={mode === 'watch' ? t('play.stopWatchingTitle') : t('play.watchGameTitle')}
            >
              {mode === 'watch' ? t('play.stopWatching') : t('play.watchGame')}
            </button>
            <button
              className={`toolbar-watch${online.status === 'playing' ? ' active' : ''}`}
              onClick={() => { if (online.status === 'playing') leaveOnline(); else openLobby(); }}
              title={online.status === 'playing' ? t('play.leaveOnlineTitle') : t('play.playFriendOnline')}
            >
              {online.status === 'playing' ? t('play.leaveOnline') : t('play.playOnline')}
            </button>
            </>
            )}
            <div className="settings-trigger" ref={settingsRef}>
              <button
                type="button"
                className={`icon-btn${settingsOpen ? ' active' : ''}`}
                onClick={() => setSettingsOpen((v) => !v)}
                aria-label={t('play.settings')}
                title={t('play.settings')}
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
          <div className="board-col">
          {rejoin && online.status === 'off' && (
            <div className="rejoin-bar panel">
              <span>{t('play.rejoinBefore')}<strong>{rejoin.code}</strong>{t('play.rejoinAfter')}</span>
              <button type="button" className="primary" onClick={rejoinOnline}>{t('play.rejoin')}</button>
              <button type="button" className="mini" onClick={discardRejoin}>{t('play.discard')}</button>
            </div>
          )}
          {online.status !== 'off' && online.status !== 'playing' ? (
            <div className="online-lobby panel">
              <h3>{t('play.playFriendOnline')}</h3>
              {online.status === 'idle' && (
                <>
                  <p className="side-note">{t('play.lobby.intro')}</p>
                  <button type="button" className="primary" onClick={onlineCreate}>{t('play.lobby.create')}</button>
                  <div className="join-row">
                    <input
                      value={joinCode}
                      onChange={(e) => setJoinCode(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && onlineJoin()}
                      placeholder={t('play.lobby.enterCode')}
                      maxLength={6}
                      aria-label={t('play.lobby.gameCode')}
                    />
                    <button type="button" onClick={() => onlineJoin()} disabled={joinCode.trim().length < 4}>{t('play.lobby.join')}</button>
                  </div>
                </>
              )}
              {online.status === 'waiting' && (
                <>
                  <p className="side-note">{t('play.lobby.shareCode')}</p>
                  <p className="online-code">{online.code}</p>
                  <p className="side-note">{t('play.lobby.waiting')}</p>
                </>
              )}
              {online.status === 'connecting' && <p className="side-note">{t('play.lobby.connectingBefore')}<strong>{online.code}</strong>{t('play.lobby.connectingAfter')}</p>}
              {online.status === 'error' && <p className="online-error">{online.error || t('play.lobby.couldNotConnect')}</p>}
              <button type="button" className="mini" onClick={leaveOnline}>{t('play.cancel')}</button>
            </div>
          ) : (
          <>
          {oppGone && <div className="online-gone">{t('play.oppDisconnected')}</div>}
          {pendingOffer && (
            <div className="offer-bar">
              <span>{{
                draw: t('play.offer.draw'),
                takeback: t('play.offer.takeback'),
                newgame: t('play.offer.newgame'),
              }[pendingOffer.kind]}</span>
              <button type="button" className="primary" onClick={{ draw: acceptDraw, takeback: acceptTakeback, newgame: acceptNewGame }[pendingOffer.kind]}>{t('play.accept')}</button>
              <button type="button" className="mini" onClick={declineOffer}>{t('play.decline')}</button>
            </div>
          )}
          <div className="captured-inline"><CapturedTray victims={byWhite} advantage={whiteAdv} pieceColor="black" /></div>
          {clocksOn && (
            <div className={`game-clock top${clocksActive && game.turn() !== color ? ' running' : ''}${clk.clocks[color === 'w' ? 'b' : 'w'] < 20_000 ? ' low' : ''}`} aria-live="off">
              {formatClock(clk.clocks[color === 'w' ? 'b' : 'w'])}
            </div>
          )}
          <Board
            fen={boardFen}
            orientation={color}
            onMove={onMove}
            lastMove={boardLastMove}
            hint={viewing ? null : hintMove}
            pieceSet={pieceSet}
            viewOnly={viewing || mode === 'watch' || !!onlineOver || !!manualResult || !!timeOver || game.isGameOver()}
            premove={premove}
            onPremove={premoveAllowed ? setPremove : null}
            playerColor={color}
            showCoords={showCoords}
            blindfold={blindfold}
            flashSquare={flashSquare}
          />
          <div className="sr-only" aria-live="polite">
            {boardLastMove ? `${boardLastMove.color === 'w' ? t('common.white') : t('common.black')}: ${spokenSan(boardLastMove.san, lang)}` : ''}
          </div>
          {!viewing && !game.isGameOver() && !onlineOver && !manualResult && !timeOver && game.isCheck() && (
            <div className="check-banner" role="alert">
              ⚠ {game.turn() === color ? t('play.check.yours') : t('play.check.side', { side: game.turn() === 'w' ? t('common.white') : t('common.black') })}
            </div>
          )}
          {mode === 'online' && !onlineOver && (
            <div className="online-actions">
              <button type="button" className="mini" onClick={requestTakeback} disabled={(history?.length || 1) < 2 || !!pendingOffer}>{t('play.takeback')}</button>
              <button type="button" className="mini" onClick={offerDraw} disabled={!!pendingOffer}>{t('play.offerDraw')}</button>
              <button type="button" className="mini resign" onClick={resign}>{t('play.resign')}</button>
              {online.code && (
                <button type="button" className="mini" onClick={copySpectateLink} title={t('play.spectatorTitle')}>
                  {shareCopied === 'watch' ? t('play.linkCopied') : t('play.spectatorLink')}
                </button>
              )}
              {spectators > 0 && <span className="side-note">👁 {spectators}</span>}
            </div>
          )}
          {mode === 'watch' ? (
            <div className="move-nav watch-controls">
              <button type="button" className="icon-btn" onClick={watchRewind} disabled={!canPrev} aria-label={t('play.rewind')} title={t('play.rewindTitle')}>‹</button>
              <button
                type="button"
                className="icon-btn watch-playpause"
                onClick={watchPlayPause}
                aria-label={watchPaused ? t('play.play') : t('play.pause')}
                title={watchPaused ? t('play.play') : t('play.pause')}
              >
                {watchPaused ? '▶' : '❚❚'}
              </button>
              <button type="button" className="icon-btn" onClick={watchForward} disabled={thinking} aria-label={t('play.forward')} title={t('play.forward')}>›</button>
              <button
                type="button"
                className="icon-btn watch-speed"
                onClick={() => setWatchSpeed((s) => (s >= 4 ? 0.4 : s * 2))}
                aria-label={t('play.changeSpeed')}
                title={t('play.timePerMove')}
              >
                {watchSpeed}s
              </button>
              {(watchPaused || viewing) && (
                <button type="button" className="watch-live" onClick={() => { setViewIndex(null); setWatchPaused(false); }}>
                  {t('play.live')}
                </button>
              )}
            </div>
          ) : (
          <div className="move-nav">
            <button type="button" className="icon-btn" onClick={stepPrev} disabled={!canPrev} aria-label={t('play.prevMove')} title={t('play.prevMove')}>‹</button>
            <button type="button" className="icon-btn" onClick={stepNext} disabled={!canNext} aria-label={t('play.nextMove')} title={t('play.nextMove')}>›</button>
            {mode === 'play' && (
              <button type="button" className="mini takeback-btn" onClick={singlePlayerTakeback} disabled={thinking || (history?.length || 1) < 2}>{t('play.takeback')}</button>
            )}
            {mode === 'play' && (
              <button
                type="button"
                className="mini hint-btn"
                onClick={requestHint}
                disabled={thinking || viewing || !!hintMove || game.isGameOver() || !!manualResult || !!timeOver || game.turn() !== color}
                title={t('play.hintTitle')}
              >{t('play.hint')}</button>
            )}
            {mode === 'play' && (history?.length || 1) > 1 && !game.isGameOver() && !manualResult && !timeOver && (
              <>
                <button type="button" className="mini" onClick={offerDrawVsEngine} disabled={thinking} title={t('play.offerDrawTitle')}>{t('play.offerDraw')}</button>
                <button type="button" className="mini resign" onClick={resignVsEngine}>{t('play.resign')}</button>
              </>
            )}
          </div>
          )}
          {clocksOn && (
            <div className={`game-clock bottom${clocksActive && game.turn() === color ? ' running' : ''}${clk.clocks[color] < 20_000 ? ' low' : ''}`} aria-live="off">
              {formatClock(clk.clocks[color])}
            </div>
          )}
          {(history?.length || 0) > 1 && (
            <ol className="move-strip" aria-label={t('play.moves')}>
              {history.slice(1).map((e, i) => {
                const k = i + 1;
                const active = (viewing ? viewIndex : history.length - 1) === k;
                return (
                  <li key={k}>
                    {k % 2 === 1 && <span className="mv-num">{(k + 1) / 2}.</span>}
                    <button
                      type="button"
                      className={`mv${active ? ' active' : ''}`}
                      ref={active ? (el) => el?.scrollIntoView({ block: 'nearest', inline: 'nearest' }) : undefined}
                      onClick={() => setViewIndex(k === history.length - 1 ? null : k)}
                    >{e.lastMove?.san}</button>
                  </li>
                );
              })}
            </ol>
          )}
          <div className="status-line">
            {viewing
              ? t('play.status.viewing', { n: viewIndex, total: history.length - 1 })
              : mode === 'watch'
                ? (thinking
                    ? t('play.status.sideThinking', { side: game.turn() === 'w' ? t('common.white') : t('common.black'), level: watchDiffs.current?.[game.turn()] ? levelName(watchDiffs.current[game.turn()]) : '' })
                    : t('play.status.sideToMove', { side: game.turn() === 'w' ? t('common.white') : t('common.black') }))
                : thinking ? <span className="thinking">{t('play.status.maestroThinking')}</span> : status || `${game.turn() === color ? t('play.status.yourMove') : t('play.status.oppToMove')} (${game.turn() === 'w' ? t('play.whiteLower') : t('play.blackLower')})`}
          </div>
          {(game.isGameOver() || onlineOver || timeOver || manualResult) && !viewing && (
            <div className="game-over panel">
              <p className="go-title">
                {onlineOver === 'win-resign' ? t('play.over.oppResigned')
                  : onlineOver === 'lose-resign' ? t('play.over.youResigned')
                  : onlineOver === 'win-time' ? t('play.over.winOnTime')
                  : onlineOver === 'lose-time' ? t('play.over.lostOnTime')
                  : onlineOver === 'draw-agreed' ? t('play.over.drawAgreed')
                  : manualResult ? manualResult.title
                  : timeOver ? (timeOver === color ? t('play.status.timeLose').replace(/\.$/, '') : t('play.status.timeWin').replace(/\.$/, ''))
                  : game.isCheckmate()
                    ? t('play.over.checkmateWins', { side: game.turn() === 'w' ? t('common.black') : t('common.white') })
                    : game.isDraw() ? drawReason(game, t).replace(/\.$/, '') : t('play.over.gameOver')}
              </p>
              <p className="go-detail">
                {onlineOver
                  ? t('play.over.onlineDetail')
                  : manualResult ? manualResult.detail
                  : timeOver
                    ? (timeOver === color ? t('play.over.clockRanOut') : t('play.over.maestroFlagged'))
                    : game.isCheckmate()
                      ? (game.turn() === color ? t('play.over.askCoachWrong') : t('play.over.wellPlayed'))
                      : game.isDraw()
                        ? drawReason(game, t) + ' ' + t('play.over.askCoachIdeas')
                        : t('play.over.askCoachIdeas')}
              </p>
              <div className="go-actions">
                <button type="button" className="primary" onClick={() => { if (mode === 'watch') startWatch(); else if (mode === 'online') requestNewGame(); else newGame(); }}>{mode === 'watch' ? t('play.over.watchAnother') : mode === 'online' ? t('play.over.rematch') : t('play.newGame')}</button>
                <button
                  type="button"
                  className="go-review"
                  onClick={() => setViewIndex((history?.length || 1) > 1 ? 1 : 0)}
                >
                  {t('play.over.replay')}
                </button>
                {savedGameId && (
                  <button type="button" className="go-review" onClick={() => onAnalyze(savedGameId)}>
                    {t('play.over.analyze')}
                  </button>
                )}
              </div>
              {ratingChange && mode === 'play' && (
                <p className="go-rating">
                  {t('play.over.ratingEstimate')} <strong>{ratingChange.rating}</strong>{' '}
                  <span className={ratingChange.delta >= 0 ? 'up' : 'down'}>({ratingChange.delta >= 0 ? '+' : ''}{ratingChange.delta})</span>
                  {ratingChange.games >= 5 && (() => {
                    const s = suggestedLevel(DIFFICULTIES, ratingChange.rating);
                    return s && s.id !== difficulty.id ? <> · {t('play.over.tryBefore')}<strong>{levelName(s)}</strong>{t('play.over.tryAfter')}</> : null;
                  })()}
                </p>
              )}
            </div>
          )}
          {mode === 'online' && (
            <div className="online-chat panel">
              <div className="chat-log">
                {chatLog.length === 0 && <p className="chat-hint">{t('play.chat.hint')}</p>}
                {chatLog.map((m, i) => (
                  <p key={i} className={`chat-msg ${m.who}`}>{m.text}</p>
                ))}
              </div>
              <form className="chat-input" onSubmit={(e) => { e.preventDefault(); sendChat(); }}>
                <input
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  placeholder={t('play.chat.placeholder')}
                  maxLength={300}
                  aria-label={t('play.chat.label')}
                />
                <button type="submit" disabled={!chatInput.trim()}>{t('play.chat.send')}</button>
              </form>
            </div>
          )}
          {mode === 'play' && opening && <div className="opening-tag">{opening}</div>}
          <div className="captured-inline"><CapturedTray victims={byBlack} advantage={-whiteAdv} pieceColor="white" /></div>
          </>
          )}
          </div>
        </div>
      </div>
      {(online.status === 'off' || online.status === 'playing') && (
        <div className={`captured-rail${movesOpen ? '' : ' moves-collapsed'}`} aria-hidden="true">
          <CapturedTray victims={byWhite} advantage={whiteAdv} pieceColor="black" />
          <CapturedTray victims={byBlack} advantage={-whiteAdv} pieceColor="white" />
        </div>
      )}
      <aside className={`game-side panel${movesOpen ? '' : ' collapsed'}`} aria-label={t('play.moveList')}>
        <button type="button" className="game-side-head" onClick={() => setMovesOpen((v) => !v)} aria-expanded={movesOpen} title={movesOpen ? t('play.collapseMoves') : t('play.expandMoves')}>
          <h3 className="game-side-title">{t('play.moves')}</h3>
          <span className="game-side-caret" aria-hidden="true">{movesOpen ? '›' : '‹'}</span>
        </button>
        <button type="button" className="mini share-btn" onClick={() => setShareOpen(true)} title={t('play.shareTitle')}>{t('play.shareBtn')}</button>
        {opening && <p className="opening-side">{opening}</p>}
        {movesOpen && boardLastMove && (
          <div className="last-move-line" aria-live="polite">
            <span className={`lm-glyph ${boardLastMove.color === 'w' ? 'white' : 'black'}`}>{GLYPHS[boardLastMove.piece]}</span>
            <span className="lm-text">
              <strong>{boardLastMove.color === 'w' ? t('common.white') : t('common.black')}</strong> {t('play.played')} <strong>{boardLastMove.san}</strong>
              <span className="lm-sq"> ({boardLastMove.from} → {boardLastMove.to})</span>
            </span>
          </div>
        )}
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
        <div className="results-line">
          {mode === 'online'
            ? <>{t('play.results.online')} <strong>{results.online.w}{t('play.results.w')}</strong> · <strong>{results.online.l}{t('play.results.l')}</strong> · <strong>{results.online.d}{t('play.results.d')}</strong></>
            : (() => {
              const r = results.engine[difficulty.id] || { w: 0, l: 0, d: 0 };
              const rating = getRating();
              return <>{t('play.results.vs', { level: levelName(difficulty) })} <strong>{r.w}{t('play.results.w')}</strong> · <strong>{r.l}{t('play.results.l')}</strong> · <strong>{r.d}{t('play.results.d')}</strong>{rating.games > 0 && <> · {t('play.results.rating')} ~<strong>{rating.rating}</strong></>}</>;
            })()}
        </div>
      </aside>
      {shareOpen && (
        <div className="share-overlay" role="dialog" aria-label={t('play.share.title')} onClick={() => setShareOpen(false)}>
          <div className="share-panel panel" onClick={(e) => e.stopPropagation()}>
            <div className="share-head">
              <h3>{t('play.share.title')}</h3>
              <button type="button" className="icon-btn" onClick={() => setShareOpen(false)} aria-label={t('play.close')}>✕</button>
            </div>
            <label className="share-label">PGN</label>
            <textarea readOnly value={buildPgn()} rows={6} onFocus={(e) => e.target.select()} aria-label={t('play.share.pgnLabel')} />
            <button type="button" className="mini" onClick={() => copyText(buildPgn(), 'pgn')}>{shareCopied === 'pgn' ? t('play.share.copied') : t('play.share.copyPgn')}</button>
            <label className="share-label">FEN</label>
            <textarea readOnly value={game.fen()} rows={2} onFocus={(e) => e.target.select()} aria-label={t('play.share.fenLabel')} />
            <button type="button" className="mini" onClick={() => copyText(game.fen(), 'fen')}>{shareCopied === 'fen' ? t('play.share.copied') : t('play.share.copyFen')}</button>
            <label className="share-label">{t('play.share.loadLabel')}</label>
            <textarea
              value={fenInput}
              onChange={(e) => setFenInput(e.target.value)}
              rows={2}
              placeholder="rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"
              aria-label={t('play.share.fenToLoad')}
            />
            <button type="button" className="primary" onClick={loadFen} disabled={!fenInput.trim()}>{t('play.share.loadFen')}</button>
            <p className="side-note">{t('play.share.loadNote')}</p>
          </div>
        </div>
      )}
    </div>
  );
}
