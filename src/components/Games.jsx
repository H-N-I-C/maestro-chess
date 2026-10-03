import { useEffect, useMemo, useState } from 'react';
import { listGames, deleteGame, subscribeLibrary, getRating, importPgn, suggestedLevel } from '../library.js';
import { DIFFICULTIES } from '../engine.js';
import { useT } from '../i18n.js';
import './analysis.css';

const FILTERS = [
  { id: 'all', label: 'games.filter.all' },
  { id: 'engine', label: 'games.filter.engine' },
  { id: 'online', label: 'games.filter.online' },
  { id: 'import', label: 'games.filter.import' },
];

function outcomeFor(g) {
  if (!g.userColor) return null;
  if (g.result === '1/2-1/2') return 'd';
  if (g.result === '1-0') return g.userColor === 'w' ? 'w' : 'l';
  if (g.result === '0-1') return g.userColor === 'b' ? 'w' : 'l';
  return null;
}

/** Rating history as a small sparkline. */
function RatingChart({ history }) {
  const t = useT();
  if (!history || history.length < 2) return null;
  const w = 300, h = 60;
  const vals = history.map((p) => p.rating);
  const min = Math.min(...vals) - 20, max = Math.max(...vals) + 20;
  const pts = vals.map((v, i) => `${(i / (vals.length - 1)) * w},${h - ((v - min) / (max - min)) * h}`);
  return (
    <svg className="rating-chart" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" role="img" aria-label={t('games.ratingHistory', { from: vals[0], to: vals[vals.length - 1] })}>
      <polyline points={pts.join(' ')} />
    </svg>
  );
}

function download(name, text) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/x-chess-pgn' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function Games({ onOpen }) {
  const t = useT();
  const [games, setGames] = useState(listGames);
  const [rating, setRating] = useState(getRating);
  const [filter, setFilter] = useState('all');
  const [msg, setMsg] = useState('');
  useEffect(() => subscribeLibrary(() => { setGames(listGames()); setRating(getRating()); }), []);

  const shown = useMemo(() => games.filter((g) => filter === 'all' || g.source === filter), [games, filter]);
  const tally = useMemo(() => {
    const n = { w: 0, l: 0, d: 0 };
    for (const g of games) { const o = outcomeFor(g); if (o) n[o] += 1; }
    return n;
  }, [games]);
  const next = rating.games >= 5 ? suggestedLevel(DIFFICULTIES, rating.rating) : null;

  async function onFile(e) {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    const { added, errors } = importPgn(await f.text());
    setMsg(added
      ? (errors ? t('analysis.importedSkipped', { added: t('analysis.nGames', { count: added }), skipped: errors }) : t('analysis.imported', { added: t('analysis.nGames', { count: added }) }))
      : t('games.importNone'));
  }

  return (
    <div className="games-screen">
      <section className="panel rating-card" aria-label={t('games.yourRating')}>
        <div>
          <p className="rating-label">{t('games.estimated')}</p>
          <p className="rating-value">
            {rating.rating}
            {rating.games < 10 && <span className="rating-prov" title={t('games.provisional')}>?</span>}
          </p>
          <p className="side-note">
            {t('games.ratedGames', { count: rating.games })} · {t('games.tally', { w: tally.w, l: tally.l, d: tally.d })}
          </p>
          {next && <p className="side-note">{t('games.suggested')} <strong>{t(`level.${next.id}`)} (~{next.elo})</strong></p>}
          {!next && <p className="side-note">{t('games.calibrate')}</p>}
        </div>
        <RatingChart history={rating.history} />
      </section>

      <div className="games-toolbar">
        <div className="seg" role="tablist" aria-label={t('games.filterAria')}>
          {FILTERS.map((f) => (
            <button key={f.id} type="button" role="tab" aria-selected={filter === f.id} className={filter === f.id ? 'active' : ''} onClick={() => setFilter(f.id)}>{t(f.label)}</button>
          ))}
        </div>
        <div className="games-actions">
          <label className="mini file-btn">
            {t('games.importPgn')}
            <input type="file" accept=".pgn,text/plain" onChange={onFile} />
          </label>
          <button type="button" className="mini" disabled={!games.length} onClick={() => download('maestro-games.pgn', games.map((g) => g.pgn).join('\n\n'))}>{t('games.exportAll')}</button>
        </div>
      </div>
      {msg && <p className="side-note" role="status">{msg}</p>}

      {shown.length === 0 ? (
        <p className="empty-note">{t('games.empty')}</p>
      ) : (
        <ul className="games-list">
          {shown.map((g) => {
            const o = outcomeFor(g);
            const acc = g.review && g.userColor ? g.review.summary[g.userColor]?.accuracy : null;
            return (
              <li key={g.id} className="panel game-row">
                <button type="button" className="game-open" onClick={() => onOpen(g.id)}>
                  <span className={`game-outcome ${o || 'n'}`} aria-label={t(o === 'w' ? 'games.win' : o === 'l' ? 'games.loss' : o === 'd' ? 'games.draw' : 'games.result')}>
                    {o === 'w' ? t('games.winShort') : o === 'l' ? t('games.lossShort') : o === 'd' ? '½' : '·'}
                  </span>
                  <span className="game-players">
                    <strong>{g.white}</strong> {t('games.vs')} <strong>{g.black}</strong>
                    <span className="side-note">
                      {g.result} · {new Date(g.date).toLocaleDateString()}
                      {g.timeControl ? ` · ${g.timeControl}` : ''}
                      {acc != null ? ` · ${t('games.accuracy', { acc })}` : ''}
                    </span>
                  </span>
                </button>
                <button type="button" className="icon-btn" aria-label={t('games.download')} title={t('games.download')} onClick={() => download(`maestro-${g.id}.pgn`, g.pgn)}>⤓</button>
                <button
                  type="button"
                  className="icon-btn"
                  aria-label={t('games.delete')}
                  title={t('games.deleteShort')}
                  onClick={() => { if (window.confirm(t('games.confirmDelete'))) deleteGame(g.id); }}
                >✕</button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
