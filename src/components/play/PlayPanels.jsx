/* Presentational pieces of the Play screen. State and game logic stay in
   Play.jsx; these components only render what they are given. */
import { useEffect, useRef } from 'react';
import { GLYPHS } from '../Board.jsx';
import { DIFFICULTIES } from '../../engine.js';
import { suggestedLevel, getRating } from '../../library.js';
import { drawReason } from '../../gameUtils.js';
import { useT, localSan } from '../../i18n.js';

/** Create/join lobby for online play. */
export function OnlineLobby({ online, joinCode, setJoinCode, onCreate, onJoin, onCancel }) {
  const t = useT();
  return (
    <div className="online-lobby panel">
      <h3>{t('play.playFriendOnline')}</h3>
      {online.status === 'idle' && (
        <>
          <p className="side-note">{t('play.lobby.intro')}</p>
          <button type="button" className="primary" onClick={onCreate}>{t('play.lobby.create')}</button>
          <div className="join-row">
            <input
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && onJoin()}
              placeholder={t('play.lobby.enterCode')}
              maxLength={6}
              aria-label={t('play.lobby.gameCode')}
            />
            <button type="button" onClick={() => onJoin()} disabled={joinCode.trim().length < 4}>{t('play.lobby.join')}</button>
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
      <button type="button" className="mini" onClick={onCancel}>{t('play.cancel')}</button>
    </div>
  );
}

/** Result card shown when a game ends (any mode). */
export function GameOverPanel({
  game, mode, color, onlineOver, manualResult, timeOver, savedGameId, ratingChange, difficulty, levelName,
  onPrimary, onReplay, onAnalyze,
}) {
  const t = useT();
  const side = (c) => (c === 'w' ? t('common.white') : t('common.black'));
  const title = onlineOver === 'win-resign' ? t('play.over.oppResigned')
    : onlineOver === 'lose-resign' ? t('play.over.youResigned')
      : onlineOver === 'win-time' ? t('play.over.winOnTime')
        : onlineOver === 'lose-time' ? t('play.over.lostOnTime')
          : onlineOver === 'draw-agreed' ? t('play.over.drawAgreed')
            : manualResult ? manualResult.title
              : timeOver ? (timeOver === color ? t('play.status.timeLose') : t('play.status.timeWin')).replace(/\.$/, '')
                : game.isCheckmate() ? t('play.over.checkmateWins', { side: side(game.turn() === 'w' ? 'b' : 'w') })
                  : game.isDraw() ? drawReason(game, t).replace(/\.$/, '') : t('play.over.gameOver');
  const detail = onlineOver ? t('play.over.onlineDetail')
    : manualResult ? manualResult.detail
      : timeOver ? (timeOver === color ? t('play.over.clockRanOut') : t('play.over.maestroFlagged'))
        : game.isCheckmate() ? (game.turn() === color ? t('play.over.askCoachWrong') : t('play.over.wellPlayed'))
          : game.isDraw() ? `${drawReason(game, t)} ${t('play.over.askCoachIdeas')}` : t('play.over.askCoachIdeas');
  const next = ratingChange?.games >= 5 ? suggestedLevel(DIFFICULTIES, ratingChange.rating) : null;
  return (
    <div className="game-over panel" role="status">
      <p className="go-title">{title}</p>
      <p className="go-detail">{detail}</p>
      <div className="go-actions">
        <button type="button" className="primary" onClick={onPrimary}>
          {mode === 'watch' ? t('play.over.watchAnother') : mode === 'online' ? t('play.over.rematch') : t('play.newGame')}
        </button>
        <button type="button" className="go-review" onClick={onReplay}>{t('play.over.replay')}</button>
        {savedGameId && <button type="button" className="go-review" onClick={() => onAnalyze(savedGameId)}>{t('play.over.analyze')}</button>}
      </div>
      {ratingChange && mode === 'play' && (
        <p className="go-rating">
          {t('play.over.ratingEstimate')} <strong>{ratingChange.rating}</strong>{' '}
          <span className={ratingChange.delta >= 0 ? 'up' : 'down'}>({ratingChange.delta >= 0 ? '+' : ''}{ratingChange.delta})</span>
          {next && next.id !== difficulty.id && <> · {t('play.over.tryBefore')}<strong>{levelName(next)}</strong>{t('play.over.tryAfter')}</>}
        </p>
      )}
    </div>
  );
}

/** Laptop side panel: move list, last move, results. Hidden ≤900px (the move strip replaces it). */
export function MovesSidePanel({
  history, viewIndex, setViewIndex, movesOpen, setMovesOpen, boardLastMove, opening, onShare,
  mode, results, difficulty, levelName, moveListRef,
}) {
  const t = useT();
  const viewing = viewIndex !== null;
  const activePly = viewing ? viewIndex : (history?.length || 1) - 1;
  const rows = [];
  for (let k = 1; k < (history?.length || 0); k += 2) {
    const white = history[k].lastMove;
    const black = k + 1 < history.length ? history[k + 1].lastMove : null;
    const num = (k + 1) / 2;
    const jump = (ply) => setViewIndex(ply === history.length - 1 ? null : ply);
    rows.push(
      <li key={num}>
        <span className="mv-num">{num}</span>
        <button type="button" className={`mv${activePly === k ? ' active' : ''}`} onClick={() => jump(k)}>{localSan(white?.san)}</button>
        {black && <button type="button" className={`mv${activePly === k + 1 ? ' active' : ''}`} onClick={() => jump(k + 1)}>{localSan(black.san)}</button>}
      </li>
    );
  }
  const r = results.engine[difficulty.id] || { w: 0, l: 0, d: 0 };
  const rating = getRating();
  return (
    <aside className={`game-side panel${movesOpen ? '' : ' collapsed'}`} aria-label={t('play.moveList')}>
      <button type="button" className="game-side-head" onClick={() => setMovesOpen((v) => !v)} aria-expanded={movesOpen} title={movesOpen ? t('play.collapseMoves') : t('play.expandMoves')}>
        <h3 className="game-side-title">{t('play.moves')}</h3>
        <span className="game-side-caret" aria-hidden="true">{movesOpen ? '›' : '‹'}</span>
      </button>
      <button type="button" className="mini share-btn" onClick={onShare} title={t('play.shareTitle')}>{t('play.shareBtn')}</button>
      {opening && <p className="opening-side">{opening}</p>}
      {movesOpen && boardLastMove && (
        <div className="last-move-line">
          <span className={`lm-glyph ${boardLastMove.color === 'w' ? 'white' : 'black'}`}>{GLYPHS[boardLastMove.piece]}</span>
          <span className="lm-text">
            <strong>{boardLastMove.color === 'w' ? t('common.white') : t('common.black')}</strong> {t('play.played')} <strong>{localSan(boardLastMove.san)}</strong>
            <span className="lm-sq"> ({boardLastMove.from} → {boardLastMove.to})</span>
          </span>
        </div>
      )}
      {movesOpen && <ol className="move-list" ref={moveListRef}>{rows}</ol>}
      <div className="results-line">
        {mode === 'online'
          ? <>{t('play.results.online')} <strong>{results.online.w}{t('play.results.w')}</strong> · <strong>{results.online.l}{t('play.results.l')}</strong> · <strong>{results.online.d}{t('play.results.d')}</strong></>
          : <>{t('play.results.vs', { level: levelName(difficulty) })} <strong>{r.w}{t('play.results.w')}</strong> · <strong>{r.l}{t('play.results.l')}</strong> · <strong>{r.d}{t('play.results.d')}</strong>{rating.games > 0 && <> · {t('play.results.rating')} ~<strong>{rating.rating}</strong></>}</>}
      </div>
    </aside>
  );
}

/** PGN/FEN export + FEN import dialog. Moves focus in on open and back out on close. */
export function ShareDialog({ pgn, fen, copied, onCopy, fenInput, setFenInput, onLoadFen, onClose }) {
  const t = useT();
  const panelRef = useRef(null);
  useEffect(() => {
    const opener = document.activeElement;
    panelRef.current?.querySelector('button, textarea')?.focus();
    function onKey(e) {
      if (e.key === 'Escape') { e.stopPropagation(); onClose(); return; }
      if (e.key !== 'Tab' || !panelRef.current) return;
      // keep Tab inside the dialog
      const items = [...panelRef.current.querySelectorAll('button:not(:disabled), textarea')];
      if (!items.length) return;
      const first = items[0], last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      opener?.focus?.();
    };
  }, [onClose]);
  return (
    <div className="share-overlay" onClick={onClose}>
      <div className="share-panel panel" role="dialog" aria-modal="true" aria-label={t('play.share.title')} ref={panelRef} onClick={(e) => e.stopPropagation()}>
        <div className="share-head">
          <h3>{t('play.share.title')}</h3>
          <button type="button" className="icon-btn" onClick={onClose} aria-label={t('play.close')}>✕</button>
        </div>
        <label className="share-label">PGN</label>
        <textarea readOnly value={pgn} rows={6} onFocus={(e) => e.target.select()} aria-label={t('play.share.pgnLabel')} />
        <button type="button" className="mini" onClick={() => onCopy(pgn, 'pgn')}>{copied === 'pgn' ? t('play.share.copied') : t('play.share.copyPgn')}</button>
        <label className="share-label">FEN</label>
        <textarea readOnly value={fen} rows={2} onFocus={(e) => e.target.select()} aria-label={t('play.share.fenLabel')} />
        <button type="button" className="mini" onClick={() => onCopy(fen, 'fen')}>{copied === 'fen' ? t('play.share.copied') : t('play.share.copyFen')}</button>
        <label className="share-label">{t('play.share.loadLabel')}</label>
        <textarea
          value={fenInput}
          onChange={(e) => setFenInput(e.target.value)}
          rows={2}
          placeholder="rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"
          aria-label={t('play.share.fenToLoad')}
        />
        <button type="button" className="primary" onClick={onLoadFen} disabled={!fenInput.trim()}>{t('play.share.loadFen')}</button>
        <p className="side-note">{t('play.share.loadNote')}</p>
      </div>
    </div>
  );
}
