import { lazy, Suspense, useEffect, useState } from 'react';
import Play from './components/Play.jsx';
import Lessons from './components/Lessons.jsx';
import { setSoundMuted } from './sound.js';
import { useT, useLang, setLang, LANGUAGES } from './i18n.js';

// secondary screens load on demand to keep the first paint small
const Puzzles = lazy(() => import('./components/Puzzles.jsx'));
const Openings = lazy(() => import('./components/Openings.jsx'));
const Analysis = lazy(() => import('./components/Analysis.jsx'));
const Games = lazy(() => import('./components/Games.jsx'));
const Spectate = lazy(() => import('./components/Spectate.jsx'));

const TABS = [
  { id: 'play', label: 'app.tab.play', icon: 'M6 20h12v-2H6v2Zm2-3h8l-1-7 2-3-3-2V3h-4v2L7 7l2 3-1 7Z' },
  { id: 'learn', label: 'app.tab.learn', icon: 'M12 4 2 9l10 5 8-4v6h2V9L12 4Zm-6 9v4c0 1.7 2.7 3 6 3s6-1.3 6-3v-4l-6 3-6-3Z' },
  { id: 'puzzles', label: 'app.tab.puzzles', icon: 'M10 3a2 2 0 0 1 4 0v2h5v5h-2a2 2 0 0 0 0 4h2v5h-5v-2a2 2 0 0 0-4 0v2H5v-5h2a2 2 0 0 0 0-4H5V5h5V3Z' },
  { id: 'openings', label: 'app.tab.openings', icon: 'M4 5h7v14H4V5Zm9 0h7v14h-7V5Zm-7 3v2h3V8H6Zm9 0v2h3V8h-3Z' },
  { id: 'analysis', label: 'app.tab.analysis', icon: 'M4 19h16v2H4v-2Zm1-3 4-6 4 3 5-8 1.7 1-6.2 10-4-3-2.8 4.2L5 16Z' },
  { id: 'games', label: 'app.tab.games', icon: 'M5 4h14v2H5V4Zm0 4h14v2H5V8Zm0 4h14v2H5v-2Zm0 4h9v2H5v-2Z' },
];

/** Tab + optional argument from the URL hash: #/analysis/<gameId>, #/watch/<code> … */
function parseHash() {
  const [, tab = 'play', ...rest] = (window.location.hash || '').split('/');
  const known = TABS.some((t) => t.id === tab) || tab === 'watch';
  return { tab: known ? tab : 'play', arg: rest.join('/') || null };
}

const THEMES = [
  { id: 'walnut', label: 'app.theme.walnut' },
  { id: 'folio', label: 'app.theme.folio' },
  { id: 'ember', label: 'app.theme.ember' },
];

const SOUND_KEY = 'maestro-sound-muted';

export default function App() {
  const t = useT();
  const lang = useLang();
  const [route, setRoute] = useState(parseHash);
  const watching = route.tab === 'watch' && route.arg ? route.arg.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 12) : null;
  const tab = route.tab === 'watch' ? 'play' : route.tab;
  useEffect(() => {
    const onHash = () => setRoute(parseHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  function go(id, arg = null) {
    window.location.hash = arg ? `/${id}/${arg}` : `/${id}`;
  }
  const [theme, setTheme] = useState(() => localStorage.getItem('maestro-theme') || 'walnut');
  const [soundMuted, setSoundMutedState] = useState(() => {
    try { return localStorage.getItem(SOUND_KEY) === 'true'; } catch { return false; }
  });

  useEffect(() => {
    setSoundMuted(soundMuted);
    try { localStorage.setItem(SOUND_KEY, String(soundMuted)); } catch { /* ignore */ }
  }, [soundMuted]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('maestro-theme', theme);
  }, [theme]);

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">♞</span>
          <div>
            <h1>Maestro</h1>
            <span className="tagline">{t('app.tagline')}</span>
          </div>
        </div>
        <nav className="tabs" aria-label={t('app.sections')}>
          {TABS.map((item) => (
            <button
              key={item.id}
              type="button"
              className={tab === item.id ? 'active' : ''}
              aria-current={tab === item.id ? 'page' : undefined}
              onClick={() => go(item.id)}
            >
              <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path fill="currentColor" d={item.icon} /></svg>
              <span>{t(item.label)}</span>
            </button>
          ))}
        </nav>
        <label className="theme-picker">
          <span>{t('app.theme')}</span>
          <select value={theme} onChange={(e) => setTheme(e.target.value)}>
            {THEMES.map((th) => <option key={th.id} value={th.id}>{t(th.label)}</option>)}
          </select>
        </label>
        <label className="theme-picker lang-picker">
          <span>{t('app.language')}</span>
          <select value={lang} onChange={(e) => setLang(e.target.value)} aria-label={t('app.language')}>
            {LANGUAGES.map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}
          </select>
        </label>
        <button
          type="button"
          className="icon-btn sound-toggle"
          onClick={() => setSoundMutedState((m) => !m)}
          aria-label={soundMuted ? t('app.unmute') : t('app.mute')}
          title={soundMuted ? t('app.unmute') : t('app.mute')}
        >
          {soundMuted ? (
            <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
              <path fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" d="M11 5L6 9H3v6h3l5 4V5z" />
              <path fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" d="M16 9l5 6m0-6l-5 6" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
              <path fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" d="M11 5L6 9H3v6h3l5 4V5z" />
              <path fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" d="M15.5 9.5a4 4 0 0 1 0 5" />
              <path fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" d="M18 7a8 8 0 0 1 0 10" />
            </svg>
          )}
        </button>
      </header>
      <main>
        {/* Play stays mounted so a running game, clock or online connection survives tab switches */}
        <div className="tab-pane" hidden={tab !== 'play' || Boolean(watching)}>
          <Play active={tab === 'play' && !watching} onAnalyze={(id) => go('analysis', id)} />
        </div>
        {tab === 'learn' && <Lessons />}
        <Suspense fallback={<p className="loading-pane">{t('common.loading')}</p>}>
          {watching && <Spectate code={watching} onLeave={() => go('play')} />}
          {tab === 'puzzles' && <Puzzles />}
          {tab === 'openings' && <Openings />}
          {tab === 'analysis' && <Analysis gameId={route.arg} onOpenGame={(id) => go('analysis', id)} />}
          {tab === 'games' && <Games onOpen={(id) => go('analysis', id)} />}
        </Suspense>
      </main>
    </div>
  );
}
