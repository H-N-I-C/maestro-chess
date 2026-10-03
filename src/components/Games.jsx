import { useEffect, useMemo, useState } from 'react';
import { listGames, deleteGame, subscribeLibrary, getRating, importPgn, suggestedLevel } from '../library.js';
import { DIFFICULTIES } from '../engine.js';
import './analysis.css';

const FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'engine', label: 'vs Maestro' },
  { id: 'online', label: 'Online' },
  { id: 'import', label: 'Imported' },
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
  if (!history || history.length < 2) return null;
  const w = 300, h = 60;
  const vals = history.map((p) => p.rating);
  const min = Math.min(...vals) - 20, max = Math.max(...vals) + 20;
  const pts = vals.map((v, i) => `${(i / (vals.length - 1)) * w},${h - ((v - min) / (max - min)) * h}`);
  return (
    <svg className="rating-chart" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" role="img" aria-label={`Rating history from ${vals[0]} to ${vals[vals.length - 1]}`}>
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
  const [games, setGames] = useState(listGames);
  const [rating, setRating] = useState(getRating);
  const [filter, setFilter] = useState('all');
  const [msg, setMsg] = useState('');
  useEffect(() => subscribeLibrary(() => { setGames(listGames()); setRating(getRating()); }), []);

  const shown = useMemo(() => games.filter((g) => filter === 'all' || g.source === filter), [games, filter]);
  const tally = useMemo(() => {
    const t = { w: 0, l: 0, d: 0 };
    for (const g of games) { const o = outcomeFor(g); if (o) t[o] += 1; }
    return t;
  }, [games]);
  const next = rating.games >= 5 ? suggestedLevel(DIFFICULTIES, rating.rating) : null;

  async function onFile(e) {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    const { added, errors } = importPgn(await f.text());
    setMsg(added ? `Imported ${added} game${added > 1 ? 's' : ''}${errors ? `, ${errors} skipped` : ''}.` : "Couldn't read any games from that file.");
  }

  return (
    <div className="games-screen">
      <section className="panel rating-card" aria-label="Your rating">
        <div>
          <p className="rating-label">Estimated rating</p>
          <p className="rating-value">
            {rating.rating}
            {rating.games < 10 && <span className="rating-prov" title="Provisional until 10 rated games">?</span>}
          </p>
          <p className="side-note">
            {rating.games} rated game{rating.games === 1 ? '' : 's'} vs Maestro · {tally.w}W {tally.l}L {tally.d}D overall
          </p>
          {next && <p className="side-note">Suggested next opponent: <strong>{next.label} (~{next.elo})</strong></p>}
          {!next && <p className="side-note">Play a few games against Maestro to calibrate your rating.</p>}
        </div>
        <RatingChart history={rating.history} />
      </section>

      <div className="games-toolbar">
        <div className="seg" role="tablist" aria-label="Filter games">
          {FILTERS.map((f) => (
            <button key={f.id} type="button" role="tab" aria-selected={filter === f.id} className={filter === f.id ? 'active' : ''} onClick={() => setFilter(f.id)}>{f.label}</button>
          ))}
        </div>
        <div className="games-actions">
          <label className="mini file-btn">
            Import .pgn
            <input type="file" accept=".pgn,text/plain" onChange={onFile} />
          </label>
          <button type="button" className="mini" disabled={!games.length} onClick={() => download('maestro-games.pgn', games.map((g) => g.pgn).join('\n\n'))}>Export all</button>
        </div>
      </div>
      {msg && <p className="side-note" role="status">{msg}</p>}

      {shown.length === 0 ? (
        <p className="empty-note">No games yet. Finished games are saved here automatically so you can review them.</p>
      ) : (
        <ul className="games-list">
          {shown.map((g) => {
            const o = outcomeFor(g);
            const acc = g.review && g.userColor ? g.review.summary[g.userColor]?.accuracy : null;
            return (
              <li key={g.id} className="panel game-row">
                <button type="button" className="game-open" onClick={() => onOpen(g.id)}>
                  <span className={`game-outcome ${o || 'n'}`} aria-label={o === 'w' ? 'Win' : o === 'l' ? 'Loss' : o === 'd' ? 'Draw' : 'Result'}>
                    {o === 'w' ? 'W' : o === 'l' ? 'L' : o === 'd' ? '½' : '·'}
                  </span>
                  <span className="game-players">
                    <strong>{g.white}</strong> vs <strong>{g.black}</strong>
                    <span className="side-note">
                      {g.result} · {new Date(g.date).toLocaleDateString()}
                      {g.timeControl ? ` · ${g.timeControl}` : ''}
                      {acc != null ? ` · ${acc}% accuracy` : ''}
                    </span>
                  </span>
                </button>
                <button type="button" className="icon-btn" aria-label="Download PGN" title="Download PGN" onClick={() => download(`maestro-${g.id}.pgn`, g.pgn)}>⤓</button>
                <button
                  type="button"
                  className="icon-btn"
                  aria-label="Delete game"
                  title="Delete"
                  onClick={() => { if (window.confirm('Delete this game?')) deleteGame(g.id); }}
                >✕</button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
