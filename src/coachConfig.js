/* Coach configuration + request logging.
   Config lives in the browser (this is a self-hosted app); server env vars act as fallback. */

const CONFIG_KEY = 'maestro-coach-config';
const LOG_KEY = 'maestro-coach-log';
const LOG_MAX = 100;

export function getCoachConfig() {
  try {
    return JSON.parse(localStorage.getItem(CONFIG_KEY)) || {};
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
