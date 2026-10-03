import { useEffect, useMemo, useRef, useState } from 'react';
import { Chess } from 'chess.js';
import Board from './Board.jsx';
import { analyze } from '../engine.js';
import { askCoach } from '../api.js';
import { getGame, updateGame, importPgn, listGames, subscribeLibrary } from '../library.js';
import {
  positionsOf, runReview, winPercent, evalLabel, keyMoments, uciToSan,
  CLASS_KEYS, CLASS_SYMBOLS,
} from '../review.js';
import { t as tr, useT, useLang, localSan } from '../i18n.js';
import { playMoveSound } from '../sound.js';
import { loadFen as loadAnyFen, isChess960Pgn, load960Pgn } from '../chess960.js';
import './analysis.css';

/** Vertical (laptop) / horizontal (phone) bar showing White's winning chances. */
export function EvalBar({ score, orientation = 'w' }) {
  const t = useT();
  const white = score ? winPercent(score) : 50;
  const label = score ? evalLabel(score) : '…';
  return (
    <div className={`eval-bar${orientation === 'b' ? ' flipped' : ''}`} role="img" aria-label={t('analysis.evalAria', { label })}>
      <div className="eval-fill" style={{ '--white': `${white}%` }} />
      <span className={`eval-text ${white >= 50 ? 'on-white' : 'on-black'}`}>{label}</span>
    </div>
  );
}

/** Win% curve over the game; click/tap to jump to a ply. */
function EvalGraph({ evals, ply, onSelect, moves }) {
  const t = useT();
  const w = 600, h = 90;
  if (!evals?.length) return null;
  const n = Math.max(1, evals.length - 1);
  const pts = evals.map((e, i) => [(i / n) * w, h - (winPercent(e) / 100) * h]);
  const line = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const area = `${line} L${w},${h} L0,${h} Z`;
  function pick(e) {
    const r = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width;
    onSelect(Math.max(0, Math.min(evals.length - 1, Math.round(x * n))));
  }
  return (
    <svg className="eval-graph" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" onPointerDown={pick} role="img" aria-label={t('analysis.graphAria')}>
      <rect x="0" y="0" width={w} height={h} className="eg-bg" />
      <path d={area} className="eg-area" />
      <line x1="0" y1={h / 2} x2={w} y2={h / 2} className="eg-mid" />
      <path d={line} className="eg-line" />
      {moves?.filter((m) => m.cls === 'blunder' || m.cls === 'mistake').map((m) => (
        <circle key={m.ply} cx={pts[m.ply][0]} cy={pts[m.ply][1]} r="4" className={`eg-dot ${m.cls}`} />
      ))}
      <line x1={pts[ply]?.[0] ?? 0} y1="0" x2={pts[ply]?.[0] ?? 0} y2={h} className="eg-cursor" />
    </svg>
  );
}

function SummaryCard({ review, white, black }) {
  const t = useT();
  const row = (c, name) => {
    const s = review.summary[c];
    return (
      <div className="sum-row">
        <span className={`sum-side ${c === 'w' ? 'white' : 'black'}`} aria-hidden="true" />
        <span className="sum-name">{name}</span>
        <span className="sum-acc" title={t('analysis.accuracy')}>{s.accuracy ?? '—'}%</span>
        <span className="sum-counts">
          <span className="c-inaccuracy" title={t('analysis.inaccuracies')}>{s.inaccuracy}?!</span>
          <span className="c-mistake" title={t('analysis.mistakes')}>{s.mistake}?</span>
          <span className="c-blunder" title={t('analysis.blunders')}>{s.blunder}??</span>
        </span>
      </div>
    );
  };
  return (
    <div className="review-summary">
      {row('w', white)}
      {row('b', black)}
    </div>
  );
}

/** Plain-language summary used when no live AI coach is available. */
function localSummary(review, headers) {
  const lines = [];
  for (const c of ['w', 'b']) {
    const s = review.summary[c];
    const name = c === 'w' ? headers.white : headers.black;
    lines.push(tr('analysis.sumLine', {
      name, acc: s.accuracy ?? '—',
      blunders: tr('analysis.nBlunders', { count: s.blunder }),
      mistakes: tr('analysis.nMistakes', { count: s.mistake }),
      inaccuracies: tr('analysis.nInaccuracies', { count: s.inaccuracy }),
    }));
  }
  const km = keyMoments(review);
  if (km.length) {
    lines.push(tr('analysis.turningPoints'));
    for (const m of km) {
      const num = Math.ceil(m.ply / 2) + (m.color === 'w' ? '.' : '...');
      lines.push(tr('analysis.turningLine', { num, san: localSan(m.san), cls: tr(CLASS_KEYS[m.cls]).toLowerCase(), best: localSan(m.bestSan || m.best) }));
    }
  } else {
    lines.push(tr('analysis.cleanGame'));
  }
  return lines.join('\n');
}

export default function Analysis({ gameId, onOpenGame }) {
  const t = useT();
  const lang = useLang();
  const entry = useMemo(() => (gameId ? getGame(gameId) : null), [gameId]);
  const [pgnText, setPgnText] = useState('');
  const [importMsg, setImportMsg] = useState('');
  const [recent, setRecent] = useState(() => listGames().slice(0, 6));
  useEffect(() => subscribeLibrary(() => setRecent(listGames().slice(0, 6))), []);

  // mainline from the saved game (or an empty board for free analysis)
  const { positions, headers, loadError } = useMemo(() => {
    const W = tr('common.white'), B = tr('common.black');
    if (!entry) return { positions: positionsOf(new Chess()), headers: { white: W, black: B }, loadError: null };
    try {
      const g = entry.variant === 'chess960' || isChess960Pgn(entry.pgn) ? load960Pgn(entry.pgn) : (() => { const c = new Chess(); c.loadPgn(entry.pgn); return c; })();
      return { positions: positionsOf(g), headers: { white: entry.white || W, black: entry.black || B }, loadError: null };
    } catch (e) {
      return { positions: positionsOf(new Chess()), headers: { white: W, black: B }, loadError: String(e?.message || e) };
    }
    // lang: default player names are translated
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entry, lang]);

  const [ply, setPly] = useState(0);
  const [variation, setVariation] = useState(null); // {basePly, fens:[...], sans:[...], lastMove}
  const [review, setReview] = useState(entry?.review || null);
  const [progress, setProgress] = useState(null); // {done,total} while reviewing
  const [live, setLive] = useState(null); // {cp,mate,best} for the shown position
  const [engineOn, setEngineOn] = useState(true);
  const [orientation, setOrientation] = useState(entry?.userColor || 'w');
  const [coachText, setCoachText] = useState('');
  const [coachBusy, setCoachBusy] = useState(false);
  const abortRef = useRef(null);
  const moveListRef = useRef(null);

  useEffect(() => {
    setPly(entry ? positions.length - 1 : 0);
    setVariation(null);
    setReview(entry?.review || null);
    setCoachText(entry?.coachSummary || '');
    setOrientation(entry?.userColor || 'w');
  }, [entry, positions.length]);

  // review the game once when it's opened (results are saved with the game)
  useEffect(() => {
    if (!entry || entry.review || positions.length < 2) return;
    startReview();
    return () => abortRef.current?.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entry]);

  async function startReview() {
    abortRef.current?.abort();
    const ctl = new AbortController();
    abortRef.current = ctl;
    setProgress({ done: 0, total: positions.length });
    try {
      const r = await runReview(positions, analyze, {
        signal: ctl.signal,
        onProgress: (done, total) => setProgress({ done, total }),
      });
      setReview(r);
      if (entry) updateGame(entry.id, { review: r });
    } catch {
      /* aborted or engine failure — leave the partial state */
    } finally {
      if (abortRef.current === ctl) setProgress(null);
    }
  }

  const shownFen = variation ? variation.fens[variation.fens.length - 1] : positions[ply].fen;
  const shownLast = variation ? variation.lastMove : (ply > 0 ? { from: positions[ply].from, to: positions[ply].to } : null);
  const reviewMove = !variation && review && ply > 0 ? review.moves[ply - 1] : null;
  const storedEval = !variation && review ? review.evals[ply] : null;

  // live engine line for the shown position (skipped while the review runs)
  useEffect(() => {
    setLive(null);
    if (!engineOn || progress) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const r = await analyze(shownFen, { depth: 18, movetime: 700 });
        if (cancelled) return;
        const stm = shownFen.split(' ')[1] === 'w' ? 1 : -1;
        setLive({
          cp: r.cp === null ? null : r.cp * stm,
          mate: r.mate === null ? null : r.mate * stm,
          best: r.bestmove && r.bestmove !== '(none)' ? r.bestmove : null,
        });
      } catch { /* engine busy/unavailable */ }
    }, 120);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [shownFen, engineOn, progress]);

  const score = live || storedEval;
  const arrows = [];
  if (reviewMove && (reviewMove.cls === 'mistake' || reviewMove.cls === 'blunder' || reviewMove.cls === 'inaccuracy') && reviewMove.best) {
    arrows.push({ from: reviewMove.best.slice(0, 2), to: reviewMove.best.slice(2, 4), kind: 'best' });
  } else if (engineOn && live?.best) {
    arrows.push({ from: live.best.slice(0, 2), to: live.best.slice(2, 4), kind: 'best' });
  }

  function onMove(m) {
    const g = loadAnyFen(shownFen); // Chess960 positions keep 960 castling
    let moved;
    try { moved = g.move(m); } catch { return; }
    playMoveSound({ capture: Boolean(moved.captured) });
    // playing the mainline's next move just advances along the game
    if (!variation && ply + 1 < positions.length && positions[ply + 1].fen === g.fen()) {
      setPly(ply + 1);
      return;
    }
    setVariation((v) => ({
      basePly: v ? v.basePly : ply,
      fens: [...(v ? v.fens : [positions[ply].fen]), g.fen()],
      sans: [...(v ? v.sans : []), moved.san],
      lastMove: { from: moved.from, to: moved.to },
    }));
  }

  function go(p) {
    setVariation(null);
    setPly(Math.max(0, Math.min(positions.length - 1, p)));
  }
  function back() {
    if (variation) {
      if (variation.fens.length <= 2) { setVariation(null); return; }
      setVariation((v) => ({ ...v, fens: v.fens.slice(0, -1), sans: v.sans.slice(0, -1), lastMove: null }));
      return;
    }
    go(ply - 1);
  }
  function forward() { if (!variation) go(ply + 1); }

  // ←/→ step through the game (ignored while typing)
  useEffect(() => {
    function onKey(e) {
      const el = e.target;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable)) return;
      if (e.key === 'ArrowLeft') { e.preventDefault(); back(); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); forward(); }
      else if (e.key === 'Home') go(0);
      else if (e.key === 'End') go(positions.length - 1);
      else if (e.key === 'f') setOrientation((o) => (o === 'w' ? 'b' : 'w'));
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  useEffect(() => {
    moveListRef.current?.querySelector('.am.active')?.scrollIntoView({ block: 'nearest' });
  }, [ply]);

  async function askSummary() {
    if (!review) return;
    setCoachBusy(true);
    const km = keyMoments(review, 5).map((m) => ({
      move: `${Math.ceil(m.ply / 2)}${m.color === 'w' ? '.' : '...'} ${m.san}`,
      verdict: m.cls, bestWas: m.bestSan || m.best, winChanceLost: m.drop,
    }));
    const prompt = `Please review this finished game for me like a coach. Accuracy: White ${review.summary.w.accuracy}%, Black ${review.summary.b.accuracy}%. `
      + `Engine-flagged turning points: ${JSON.stringify(km)}. `
      + (entry?.userColor ? `I played ${entry.userColor === 'w' ? 'White' : 'Black'}. ` : '')
      + 'Explain the 2-3 most instructive moments in plain language, what I should have been thinking, and one concrete thing to practise.';
    try {
      const { reply, live: isLive } = await askCoach({
        messages: [{ role: 'user', content: prompt }],
        game: { pgn: entry?.pgn || '', fen: positions[positions.length - 1].fen, review: { summary: review.summary, keyMoments: km } },
      });
      const text = isLive && reply ? reply : localSummary(review, headers);
      setCoachText(text);
      if (entry) updateGame(entry.id, { coachSummary: text });
    } catch {
      setCoachText(localSummary(review, headers));
    } finally {
      setCoachBusy(false);
    }
  }

  function doImport() {
    const text = pgnText.trim();
    if (!text) return;
    // a lone FEN opens as a free-analysis position
    try {
      const g = loadAnyFen(text);
      setVariation({ basePly: 0, fens: [positions[0].fen, g.fen()], sans: [t('analysis.positionToken')], lastMove: null });
      setImportMsg(t('analysis.positionLoaded'));
      setPgnText('');
      return;
    } catch { /* not a FEN — try PGN */ }
    const before = listGames()[0]?.id;
    const { added, errors } = importPgn(text);
    if (!added) { setImportMsg(errors ? t('analysis.importFailedN', { count: errors }) : t('analysis.importFailed')); return; }
    setPgnText('');
    setImportMsg(errors ? t('analysis.importedSkipped', { added: t('analysis.nGames', { count: added }), skipped: errors }) : t('analysis.imported', { added: t('analysis.nGames', { count: added }) }));
    const first = listGames().find((g) => g.id !== before);
    if (first) onOpenGame(first.id);
  }

  const rows = [];
  for (let k = 1; k < positions.length; k += 2) {
    const cell = (i) => {
      if (i >= positions.length) return <span className="am empty" />;
      const m = review?.moves[i - 1];
      return (
        <button
          type="button"
          className={`am${!variation && ply === i ? ' active' : ''}${m ? ` cls-${m.cls}` : ''}`}
          onClick={() => go(i)}
          aria-label={`${localSan(positions[i].san)}${m && m.cls !== 'good' ? `, ${t(CLASS_KEYS[m.cls])}` : ''}`}
        >
          {localSan(positions[i].san)}{m && CLASS_SYMBOLS[m.cls] ? <sup>{CLASS_SYMBOLS[m.cls]}</sup> : null}
        </button>
      );
    };
    rows.push(
      <li key={k}><span className="am-num">{(k + 1) / 2}.</span>{cell(k)}{cell(k + 1)}</li>
    );
  }

  return (
    <div className="analysis">
      <div className="analysis-board">
        <div className="an-board-row">
          <EvalBar score={score} orientation={orientation} />
          <div className="an-board">
            <Board
              fen={shownFen}
              orientation={orientation}
              onMove={onMove}
              lastMove={shownLast}
              arrows={arrows}
            />
          </div>
        </div>
        <div className="an-nav" role="toolbar" aria-label={t('analysis.moveNav')}>
          <button type="button" className="icon-btn" onClick={() => go(0)} aria-label={t('analysis.first')} disabled={!variation && ply === 0}>«</button>
          <button type="button" className="icon-btn" onClick={back} aria-label={t('analysis.prev')} disabled={!variation && ply === 0}>‹</button>
          <button type="button" className="icon-btn" onClick={forward} aria-label={t('analysis.next')} disabled={!!variation || ply >= positions.length - 1}>›</button>
          <button type="button" className="icon-btn" onClick={() => go(positions.length - 1)} aria-label={t('analysis.last')} disabled={!variation && ply >= positions.length - 1}>»</button>
          <button type="button" className="icon-btn" onClick={() => setOrientation((o) => (o === 'w' ? 'b' : 'w'))} aria-label={t('analysis.flip')} title={t('analysis.flipTitle')}>⇅</button>
          <label className="an-toggle">
            <input type="checkbox" checked={engineOn} onChange={(e) => setEngineOn(e.target.checked)} />
            {t('analysis.engine')}
          </label>
        </div>
        <p className="an-status" aria-live="polite">
          {variation
            ? <>{t('analysis.exploring')} {variation.sans.join(' ')} <button type="button" className="linklike" onClick={() => setVariation(null)}>{t('analysis.backToGame')}</button></>
            : reviewMove
              ? <>
                  <strong>{Math.ceil(ply / 2)}{reviewMove.color === 'w' ? '.' : '...'} {localSan(reviewMove.san)}</strong>
                  {' — '}<span className={`cls-${reviewMove.cls}`}>{t(CLASS_KEYS[reviewMove.cls])}</span>
                  {reviewMove.cls !== 'best' && reviewMove.best && <> · {t('analysis.bestWas')} <strong>{localSan(reviewMove.bestSan) || reviewMove.best}</strong></>}
                </>
              : engineOn && live?.best ? <>{t('analysis.engineLabel')} <strong>{localSan(uciToSan(shownFen, live.best)) || live.best}</strong> ({evalLabel(live)})</> : ' '}
        </p>
      </div>

      <aside className="analysis-side panel">
        {loadError && <p className="online-error">{t('analysis.loadError', { error: loadError })}</p>}
        {entry ? (
          <div className="an-head">
            <h3>{t('analysis.vs', { white: headers.white, black: headers.black })}</h3>
            <p className="side-note">{entry.result || '*'} · {new Date(entry.date).toLocaleDateString()}{entry.event ? ` · ${entry.event}` : ''}</p>
          </div>
        ) : (
          <div className="an-head">
            <h3>{t('analysis.boardTitle')}</h3>
            <p className="side-note">{t('analysis.boardIntro')}</p>
          </div>
        )}

        {progress && (
          <div className="review-progress" role="status">
            <span>{t('analysis.reviewing', { done: progress.done, total: progress.total })}</span>
            <progress max={progress.total} value={progress.done} />
            <button type="button" className="mini" onClick={() => abortRef.current?.abort()}>{t('analysis.stop')}</button>
          </div>
        )}
        {entry && !review && !progress && positions.length > 1 && (
          <button type="button" className="primary" onClick={startReview}>{t('analysis.reviewGame')}</button>
        )}
        {review && (
          <>
            <SummaryCard review={review} white={headers.white} black={headers.black} />
            <EvalGraph evals={review.evals} ply={ply} onSelect={go} moves={review.moves} />
          </>
        )}

        {positions.length > 1 && (
          <ol className="an-moves" ref={moveListRef}>{rows}</ol>
        )}

        {review && (
          <div className="coach-summary">
            {coachText
              ? <p className="coach-summary-text">{coachText}</p>
              : <button type="button" className="mini" onClick={askSummary} disabled={coachBusy}>{coachBusy ? t('analysis.coachThinking') : t('analysis.askSummary')}</button>}
            {coachText && <button type="button" className="linklike" onClick={askSummary} disabled={coachBusy}>{coachBusy ? t('analysis.thinking') : t('analysis.askAgain')}</button>}
          </div>
        )}

        <details className="an-import" open={!entry}>
          <summary>{t('analysis.importTitle')}</summary>
          <textarea
            value={pgnText}
            onChange={(e) => setPgnText(e.target.value)}
            rows={4}
            placeholder={t('analysis.importPlaceholder')}
            aria-label={t('analysis.importAria')}
          />
          <div className="an-import-row">
            <button type="button" className="primary" onClick={doImport} disabled={!pgnText.trim()}>{t('analysis.import')}</button>
            <label className="mini file-btn">
              {t('analysis.openFile')}
              <input
                type="file"
                accept=".pgn,text/plain"
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  if (f) setPgnText(await f.text());
                  e.target.value = '';
                }}
              />
            </label>
          </div>
          {importMsg && <p className="side-note" role="status">{importMsg}</p>}
        </details>

        {!entry && recent.length > 0 && (
          <div className="an-recent">
            <h4>{t('analysis.recent')}</h4>
            {recent.map((g) => (
              <button key={g.id} type="button" className="an-recent-item" onClick={() => onOpenGame(g.id)}>
                {t('analysis.vs', { white: g.white, black: g.black })} <span className="side-note">{g.result}</span>
              </button>
            ))}
          </div>
        )}
      </aside>
    </div>
  );
}
