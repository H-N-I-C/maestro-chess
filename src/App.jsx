import { useEffect, useState } from 'react';
import Play from './components/Play.jsx';
import Lessons from './components/Lessons.jsx';

const THEMES = [
  { id: 'walnut', label: 'Walnut Study' },
  { id: 'folio', label: 'Folio' },
  { id: 'ember', label: 'Ember Library' },
];

export default function App() {
  const [tab, setTab] = useState('play');
  const [theme, setTheme] = useState(() => localStorage.getItem('maestro-theme') || 'walnut');
  const [stageTitle, setStageTitle] = useState('General play');

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
      </header>
      <main>
        {tab === 'play' ? <Play stageTitle={stageTitle} /> : <Lessons />}
      </main>
    </div>
  );
}
