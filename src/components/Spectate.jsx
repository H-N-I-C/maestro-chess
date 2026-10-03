import { useEffect, useRef, useState } from 'react';
import Board from './Board.jsx';
import { joinGame } from '../online.js';
import { gameFromHistory, isValidHistory } from '../gameUtils.js';
import { formatClock, timeControl } from '../hooks/useClocks.js';
import { playMoveSound } from '../sound.js';
import { EvalBar } from './Analysis.jsx';
import { analyze } from '../engine.js';
import { useT, localSan } from '../i18n.js';

const OVER_TEXT = {
  'win-resign': 'spectate.over.winResign', 'lose-resign': 'spectate.over.loseResign',
  'win-time': 'spectate.over.winTime', 'lose-time': 'spectate.over.loseTime',
  'draw-agreed': 'spectate.over.drawAgreed',
};

/** Read-only view of someone's online game, opened from a #/watch/<code> link. */
export default function Spectate({ code, onLeave }) {
  const t = useT();
  const [state, setState] = useState(null); // {history, game, lastMove, clocks, over}
  const [status, setStatus] = useState('connecting'); // connecting | live | ended | error
  const [error, setError] = useState(null); // {key, params}
  const [flip, setFlip] = useState(false);
  const [score, setScore] = useState(null);
  const [, setTick] = useState(0);
  const clockRef = useRef(null); // {w,b,tc,at,turn}

  useEffect(() => {
    const peer = joinGame(code, {
      onConnected: () => setStatus('live'),
      onData: (d) => {
        if (d?.t !== 'state' || !isValidHistory(d.history)) return;
        const game = gameFromHistory(d.history);
        setState((prev) => {
          if (prev && d.history.length > prev.history.length) playMoveSound({ capture: Boolean(d.history[d.history.length - 1].victim) });
          return { history: d.history, game, lastMove: d.history[d.history.length - 1].lastMove || null, over: d.over || null };
        });
        if (d.clocks && Number.isFinite(d.clocks.w)) {
          clockRef.current = { w: d.clocks.w, b: d.clocks.b, tc: d.clocks.tc, at: performance.now(), turn: game.turn() };
        }
      },
      onClose: () => setStatus((s) => (s === 'error' ? s : 'ended')),
      onError: (e) => { setStatus('error'); setError(e?.type === 'peer-unavailable' ? { key: 'spectate.noGame' } : { key: 'spectate.connFailed', params: { type: e?.type || 'unknown' } }); },
    }, { spectator: true });
    return () => peer.destroy();
  }, [code]);

  const game = state?.game;
  const running = Boolean(game && !game.isGameOver() && !state.over && (state.history.length > 2));
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setTick((n) => n + 1), 200);
    return () => clearInterval(id);
  }, [running]);

  // light engine evaluation for viewers
  const fen = game?.fen();
  useEffect(() => {
    if (!fen) return;
    let cancelled = false;
    analyze(fen, { depth: 12, movetime: 300 }).then((r) => {
      if (cancelled) return;
      const stm = fen.split(' ')[1] === 'w' ? 1 : -1;
      setScore({ cp: r.cp === null ? null : r.cp * stm, mate: r.mate === null ? null : r.mate * stm });
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [fen]);

  function clockFor(side) {
    const c = clockRef.current;
    if (!c || !timeControl(c.tc).base) return null;
    const elapsed = running && c.turn === side ? performance.now() - c.at : 0;
    return Math.max(0, c[side] - elapsed);
  }

  const orientation = flip ? 'b' : 'w';
  const top = orientation === 'w' ? 'b' : 'w';
  const result = !game ? null
    : state.over ? (OVER_TEXT[state.over] && t(OVER_TEXT[state.over]))
      : game.isCheckmate() ? t(game.turn() === 'w' ? 'spectate.mateBlack' : 'spectate.mateWhite')
        : game.isDraw() ? t('spectate.draw') : null;
  const sans = state?.history.slice(1).map((e) => e.lastMove?.san) || [];

  return (
    <div className="spectate">
      <div className="spectate-head">
        <h2>{t('spectate.watching')} <code>{code}</code></h2>
        <span className={`badge ${status === 'live' ? 'live' : 'offline'}`}>{t(`spectate.status.${status}`)}</span>
        <button type="button" className="mini" onClick={() => setFlip((f) => !f)}>{t('spectate.flip')}</button>
        <button type="button" className="mini" onClick={onLeave}>{t('spectate.leave')}</button>
      </div>
      {status === 'error' && <p className="online-error">{error && t(error.key, error.params)}</p>}
      {!game && status !== 'error' && <p className="side-note">{t('spectate.waiting')}</p>}
      {game && (
        <div className="spectate-body">
          <div className="spectate-board">
            {clockFor(top) !== null && <div className="game-clock top">{formatClock(clockFor(top))}</div>}
            <div className="an-board-row">
              <EvalBar score={score} orientation={orientation} />
              <div className="an-board"><Board fen={game.fen()} orientation={orientation} lastMove={state.lastMove} viewOnly onMove={() => {}} /></div>
            </div>
            {clockFor(orientation) !== null && <div className="game-clock bottom">{formatClock(clockFor(orientation))}</div>}
            <p className="an-status" aria-live="polite">
              {result || t(game.turn() === 'w' ? 'spectate.whiteToMove' : 'spectate.blackToMove')}
            </p>
          </div>
          <ol className="spectate-moves panel" aria-label={t('spectate.moves')}>
            {sans.map((san, i) => (i % 2 === 0 ? (
              <li key={i}><span className="am-num">{i / 2 + 1}.</span> {localSan(san)} {localSan(sans[i + 1]) || ''}</li>
            ) : null))}
          </ol>
        </div>
      )}
      {status === 'ended' && <p className="side-note">{t('spectate.hostClosed')}</p>}
    </div>
  );
}
