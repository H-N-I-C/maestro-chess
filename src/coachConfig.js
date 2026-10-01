/* Coach configuration + request logging.
   Config lives in the browser (this is a self-hosted app); server env vars act as fallback. */

const CONFIG_KEY = 'maestro-coach-config';
const LOG_KEY = 'maestro-coach-log';
const LOG_MAX = 100;

export function getCoachConfig() {
  try {
    const cfg = JSON.parse(localStorage.getItem(CONFIG_KEY)) || {};
    // legacy defaults are no longer served by the platform — treat them as unset
    if (cfg.model === 'kimi-k2-0711-preview') delete cfg.model;
    if (cfg.baseUrl === 'https://api.moonshot.ai/v1') delete cfg.baseUrl;
    return cfg;
  } catch {
    return {};
  }
}

export function saveCoachConfig(cfg) {
  localStorage.setItem(CONFIG_KEY, JSON.stringify(cfg));
}

export function clearCoachConfig() {
  localStorage.removeItem(CONFIG_KEY);
}

/* ---------------- request log ---------------- */

export function getCoachLog() {
  try {
    return JSON.parse(localStorage.getItem(LOG_KEY)) || [];
  } catch {
    return [];
  }
}

export function logCoachEntry(entry) {
  const log = getCoachLog();
  log.unshift({ t: Date.now(), ...entry });
  localStorage.setItem(LOG_KEY, JSON.stringify(log.slice(0, LOG_MAX)));
}

export function clearCoachLog() {
  localStorage.removeItem(LOG_KEY);
}
