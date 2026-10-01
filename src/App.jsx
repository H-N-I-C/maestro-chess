import { useEffect, useState } from 'react';
import Play from './components/Play.jsx';
import Lessons from './components/Lessons.jsx';
import { setSoundMuted, isSoundMuted } from './sound.js';

const THEMES = [
  { id: 'walnut', label: 'Walnut Study' },
  { id: 'folio', label: 'Folio' },
  { id: 'ember', label: 'Ember Library' },
];

const SOUND_KEY = 'maestro-sound-muted';

export default function App() {
  const [tab, setTab] = useState('play');
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
            <span className="tagline">chess academy</span>
          </div>
        </div>
        <nav className="tabs">
          <button className={tab === 'play' ? 'active' : ''} onClick={() => setTab('play')}>Play</button>
          <button className={tab === 'learn' ? 'active' : ''} onClick={() => setTab('learn')}>Learn</button>
        </nav>
        <label className="theme-picker">
          <span>Theme</span>
          <select value={theme} onChange={(e) => setTheme(e.target.value)}>
            {THEMES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
          </select>
        </label>
        <button
          type="button"
          className="icon-btn sound-toggle"
          onClick={() => setSoundMutedState((m) => !m)}
          aria-label={soundMuted ? 'Unmute sounds' : 'Mute sounds'}
          title={soundMuted ? 'Unmute sounds' : 'Mute sounds'}
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
        {tab === 'play' ? <Play /> : <Lessons />}
      </main>
    </div>
  );
}
