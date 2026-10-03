import { useEffect, useState } from 'react';
import { coachStatus } from '../api.js';
import {
  getCoachConfig, saveCoachConfig, clearCoachConfig,
  getCoachLog, clearCoachLog,
} from '../coachConfig.js';
import { useT } from '../i18n.js';

const DEFAULT_BASE = 'https://api.moonshot.cn/v1';
const DEFAULT_MODEL = 'kimi-k3';

export default function SidePanel({ onClose }) {
  const t = useT();
  const [tab, setTab] = useState('settings');
  return (
    <aside className="side panel dropdown-panel">
      <div className="side-tabs">
        <button className={tab === 'settings' ? 'active' : ''} onClick={() => setTab('settings')}>{t('side.settings')}</button>
        <button className={tab === 'logs' ? 'active' : ''} onClick={() => setTab('logs')}>{t('side.logs')}</button>
        {onClose && (
          <button type="button" className="side-close" onClick={onClose} aria-label={t('side.closeSettings')}>×</button>
        )}
      </div>
      {tab === 'settings' ? <Settings /> : <Logs />}
    </aside>
  );
}

function Settings() {
  const t = useT();
  const cfg = getCoachConfig();
  const [baseUrl, setBaseUrl] = useState(cfg.baseUrl || '');
  const [apiKey, setApiKey] = useState(cfg.apiKey || '');
  const [model, setModel] = useState(cfg.model || '');
  const [effort, setEffort] = useState(cfg.effort || '');
  const [showKey, setShowKey] = useState(false);
  const [status, setStatus] = useState(null); // {live, model, base}
  const [test, setTest] = useState(null); // {state, message}
  const [models, setModels] = useState(null); // string[] | null
  const [fetchingModels, setFetchingModels] = useState(false);

  useEffect(() => {
    coachStatus().then(setStatus);
  }, []);

  const effective = {
    base: baseUrl || status?.base || DEFAULT_BASE,
    model: model || status?.model || DEFAULT_MODEL,
    // the server key is only used with the server's own base URL
    live: !status?.serverless && Boolean(apiKey || (status?.envConfigured && (!baseUrl || baseUrl.replace(/\/$/, '') === status?.base))),
  };

  function save() {
    saveCoachConfig({ baseUrl: baseUrl.trim(), apiKey: apiKey.trim(), model: model.trim(), effort });
    setTest({ state: 'ok', message: t('side.saved') });
  }

  function reset() {
    clearCoachConfig();
    setBaseUrl(''); setApiKey(''); setModel(''); setEffort('');
    setModels(null);
    setTest({ state: 'ok', message: t('side.cleared') });
    coachStatus().then(setStatus);
  }

  async function testConnection() {
    setTest({ state: 'testing', message: t('side.testing') });
    try {
      const res = await fetch('/api/coach', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          config: { baseUrl: baseUrl.trim(), apiKey: apiKey.trim(), model: model.trim(), effort },
          messages: [{ role: 'user', content: 'Reply with exactly: connection ok' }],
        }),
      });
      const data = await res.json();
      if (data.ok) {
        setTest({ state: 'ok', message: t('side.connected', { model: data.model, reply: (data.reply || '').slice(0, 60) }) });
      } else if (data.offline) {
        setTest({ state: 'err', message: t('side.noKey') });
      } else {
        setTest({ state: 'err', message: t('side.failed', { error: data.error || t('side.unknownError') }) });
      }
    } catch (err) {
      setTest({ state: 'err', message: t('side.failed', { error: String(err) }) });
    }
  }

  async function fetchModels() {
    setFetchingModels(true);
    setModels(null);
    try {
      // POST so the key never lands in a URL (proxy/access logs)
      const res = await fetch('/api/coach/models', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ config: { baseUrl: baseUrl.trim(), apiKey: apiKey.trim() } }),
      });
      const data = await res.json();
      if (data.ok && data.models?.length) {
        setModels(data.models);
        setTest({ state: 'ok', message: t('side.fetchedModels', { count: data.models.length }) });
      } else {
        setTest({ state: 'err', message: t('side.fetchModelsFailed', { error: data.error || t('side.noneReturned') }) });
      }
    } catch (err) {
      setTest({ state: 'err', message: t('side.fetchModelsFailed', { error: String(err) }) });
    } finally {
      setFetchingModels(false);
    }
  }

  return (
    <div className="side-body">
      <h3>{t('side.coachConfig')}</h3>
      <div className={`coach-status ${effective.live ? 'live' : 'offline'}`}>
        <span className="dot" />
        {effective.live
          ? <>{t('side.liveCoach')} · <strong>{effective.model}</strong></>
          : <>{t('side.offlineCoach')}</>}
      </div>
      {status?.serverless && (
        <p className="side-note warn">
          {t('side.serverless')}
        </p>
      )}
      <p className="side-note">
        {t('side.apiNote')}
      </p>
      <label>
        {t('side.baseUrl')}
        <input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder={DEFAULT_BASE} autoComplete="off" />
      </label>
      <p className="side-note">
        {t('side.kimiKey')} (<code>sk-kimi-…</code>)? {t('side.kimiUse')} <code>https://api.kimi.com/coding/v1</code>{' '}
        {t('side.kimiWithModel')} <code>kimi-for-coding</code> —{' '}
        <button
          type="button"
          className="linklike"
          onClick={() => { setBaseUrl('https://api.kimi.com/coding/v1'); setModel('kimi-for-coding'); }}
        >
          {t('side.fillIn')}
        </button>
      </p>
      <label>
        {t('side.apiKey')}
        <span className="key-row">
          <input
            type={showKey ? 'text' : 'password'}
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder={status?.envConfigured ? t('side.keyOnServer') : 'sk-…'}
            autoComplete="off"
          />
          <button className="mini" onClick={() => setShowKey((v) => !v)}>{showKey ? t('side.hide') : t('side.show')}</button>
        </span>
      </label>
      <label>
        {t('side.model')}
        <span className="key-row">
          <input value={model} onChange={(e) => { setModel(e.target.value); setModels(null); }} placeholder={DEFAULT_MODEL} autoComplete="off" />
          <button className="mini" onClick={fetchModels} disabled={fetchingModels || (!apiKey.trim() && !status?.envConfigured)}>
            {fetchingModels ? t('side.fetching') : t('side.fetch')}
          </button>
        </span>
        {models && (
          <select
            className="model-picker"
            value={models.includes(model) ? model : ''}
            onChange={(e) => setModel(e.target.value)}
          >
            {!models.includes(model) && <option value="">{t('side.chooseModel')}</option>}
            {models.map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
        )}
      </label>
      <label>
        {t('side.effort')}
        <select className="model-picker" value={effort} onChange={(e) => setEffort(e.target.value)}>
          <option value="">{t('side.effortDefault')}</option>
          <option value="low">{t('side.effortLow')}</option>
          <option value="high">{t('side.effortHigh')}</option>
          <option value="max">{t('side.effortMax')}</option>
        </select>
      </label>
      <div className="side-actions">
        <button className="primary" onClick={save}>{t('side.save')}</button>
        <button onClick={testConnection}>{t('side.testConnection')}</button>
        <button onClick={reset}>{t('side.reset')}</button>
      </div>
      {test && <p className={`test-result ${test.state}`}>{test.message}</p>}

      <h3>{t('side.offlineHowGood')}</h3>
      <p className="side-note">
        {t('side.offlineExplain')}
      </p>
    </div>
  );
}

function Logs() {
  const t = useT();
  const [log, setLog] = useState(getCoachLog());
  return (
    <div className="side-body">
      <div className="logs-head">
        <h3>{t('side.requestLog')}</h3>
        {log.length > 0 && <button className="mini" onClick={() => { clearCoachLog(); setLog([]); }}>{t('side.clear')}</button>}
      </div>
      {log.length === 0 && <p className="side-note">{t('side.noRequests')}</p>}
      <ul className="log-list">
        {log.map((e, i) => (
          <li key={i} className={e.ok ? '' : 'err'}>
            <div className="log-meta">
              <span className={`badge ${e.mode === 'live' ? 'live' : 'offline'}`}>{e.mode === 'live' ? t('side.modeLive') : t('side.modeOffline')}</span>
              <span className="log-model">{e.model || '—'}</span>
              <span>{new Date(e.t).toLocaleTimeString()}</span>
              <span>{e.latencyMs} ms</span>
            </div>
            <div className="log-q">{e.question || t('side.contextBlock')}</div>
            {e.error && <div className="log-err">{e.error}</div>}
          </li>
        ))}
      </ul>
    </div>
  );
}
