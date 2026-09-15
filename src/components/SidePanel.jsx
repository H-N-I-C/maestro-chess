import { useEffect, useState } from 'react';
import { coachStatus } from '../api.js';
import {
  getCoachConfig, saveCoachConfig, clearCoachConfig,
  getCoachLog, clearCoachLog,
} from '../coachConfig.js';

const DEFAULT_BASE = 'https://api.moonshot.ai/v1';
const DEFAULT_MODEL = 'kimi-k2-0711-preview';

export default function SidePanel({ onClose }) {
  const [tab, setTab] = useState('settings');
  return (
    <aside className="side panel dropdown-panel">
      <div className="side-tabs">
        <button className={tab === 'settings' ? 'active' : ''} onClick={() => setTab('settings')}>Settings</button>
        <button className={tab === 'logs' ? 'active' : ''} onClick={() => setTab('logs')}>Logs</button>
        {onClose && (
          <button type="button" className="side-close" onClick={onClose} aria-label="Close settings">×</button>
        )}
      </div>
      {tab === 'settings' ? <Settings /> : <Logs />}
    </aside>
  );
}

function Settings() {
  const cfg = getCoachConfig();
  const [baseUrl, setBaseUrl] = useState(cfg.baseUrl || '');
  const [apiKey, setApiKey] = useState(cfg.apiKey || '');
  const [model, setModel] = useState(cfg.model || '');
  const [showKey, setShowKey] = useState(false);
  const [status, setStatus] = useState(null); // {live, model, base}
  const [test, setTest] = useState(null); // {state, message}

  useEffect(() => {
    coachStatus().then(setStatus);
  }, []);

  const effective = {
    base: baseUrl || status?.base || DEFAULT_BASE,
    model: model || status?.model || DEFAULT_MODEL,
    live: Boolean(apiKey || status?.envConfigured),
  };

  function save() {
    saveCoachConfig({ baseUrl: baseUrl.trim(), apiKey: apiKey.trim(), model: model.trim() });
    setTest({ state: 'ok', message: 'Saved. The next coach message uses this configuration.' });
  }

  function reset() {
    clearCoachConfig();
    setBaseUrl(''); setApiKey(''); setModel('');
    setTest({ state: 'ok', message: 'Cleared — falling back to the server configuration.' });
    coachStatus().then(setStatus);
  }

  async function testConnection() {
    setTest({ state: 'testing', message: 'Sending a test message to the coach…' });
    try {
      const res = await fetch('/api/coach', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          config: { baseUrl: baseUrl.trim(), apiKey: apiKey.trim(), model: model.trim() },
          messages: [{ role: 'user', content: 'Reply with exactly: connection ok' }],
        }),
      });
      const data = await res.json();
      if (data.ok) {
        setTest({ state: 'ok', message: `Connected — ${data.model} replied: "${(data.reply || '').slice(0, 60)}"` });
      } else if (data.offline) {
        setTest({ state: 'err', message: 'No API key. The offline engine coach would be used instead.' });
      } else {
        setTest({ state: 'err', message: 'Failed: ' + (data.error || 'unknown error') });
      }
    } catch (err) {
      setTest({ state: 'err', message: 'Failed: ' + String(err) });
    }
  }

  return (
    <div className="side-body">
      <h3>Coach configuration</h3>
      <div className={`coach-status ${effective.live ? 'live' : 'offline'}`}>
        <span className="dot" />
        {effective.live
          ? <>Live AI coach · <strong>{effective.model}</strong></>
          : <>Offline engine coach (Stockfish 16, local)</>}
      </div>
      <p className="side-note">
        Any OpenAI-compatible API works. Values are stored in this browser only; if left blank,
        the server's environment variables apply.
      </p>
      <label>
        Base URL
        <input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder={DEFAULT_BASE} autoComplete="off" />
      </label>
      <label>
        API key
        <span className="key-row">
          <input
            type={showKey ? 'text' : 'password'}
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder={status?.envConfigured ? '(set on server — leave blank)' : 'sk-…'}
            autoComplete="off"
          />
          <button className="mini" onClick={() => setShowKey((v) => !v)}>{showKey ? 'Hide' : 'Show'}</button>
        </span>
      </label>
      <label>
        Model
        <input value={model} onChange={(e) => setModel(e.target.value)} placeholder={DEFAULT_MODEL} autoComplete="off" />
      </label>
      <div className="side-actions">
        <button className="primary" onClick={save}>Save</button>
        <button onClick={testConnection}>Test connection</button>
        <button onClick={reset}>Reset</button>
      </div>
      {test && <p className={`test-result ${test.state}`}>{test.message}</p>}

      <h3>How good is the offline coach?</h3>
      <p className="side-note">
        It runs the same Stockfish 16 the opponents use, so its assessments are engine-accurate:
        position evaluation, pawn-unit grading of your last move, and hanging-piece alerts.
        What it can't do is free conversation — it answers questions about the position,
        not general chat. Add an API key above for the full conversational coach.
      </p>
    </div>
  );
}

function Logs() {
  const [log, setLog] = useState(getCoachLog());
  return (
    <div className="side-body">
      <div className="logs-head">
        <h3>Coach request log</h3>
        {log.length > 0 && <button className="mini" onClick={() => { clearCoachLog(); setLog([]); }}>Clear</button>}
      </div>
      {log.length === 0 && <p className="side-note">No coach requests yet.</p>}
      <ul className="log-list">
        {log.map((e, i) => (
          <li key={i} className={e.ok ? '' : 'err'}>
            <div className="log-meta">
              <span className={`badge ${e.mode === 'live' ? 'live' : 'offline'}`}>{e.mode}</span>
              <span className="log-model">{e.model || '—'}</span>
              <span>{new Date(e.t).toLocaleTimeString()}</span>
              <span>{e.latencyMs} ms</span>
            </div>
            <div className="log-q">{e.question || '(context block)'}</div>
            {e.error && <div className="log-err">{e.error}</div>}
          </li>
        ))}
      </ul>
    </div>
  );
}
