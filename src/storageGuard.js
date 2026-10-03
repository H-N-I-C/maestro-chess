/* Imported first by main.jsx. When the browser blocks storage (privacy
   settings, some embedded or private contexts), every localStorage access
   throws a SecurityError. Rather than guard each of the app's many accesses,
   swap in an in-memory Storage for the session: the app works normally, it
   just doesn't remember anything after the tab closes. */
function memoryStorage() {
  const data = new Map();
  return {
    get length() { return data.size; },
    key: (i) => [...data.keys()][i] ?? null,
    getItem: (k) => (data.has(String(k)) ? data.get(String(k)) : null),
    setItem: (k, v) => { data.set(String(k), String(v)); },
    removeItem: (k) => { data.delete(String(k)); },
    clear: () => { data.clear(); },
  };
}

export function ensureStorage(win = globalThis) {
  try {
    const probe = '__maestro_probe__';
    win.localStorage.setItem(probe, '1');
    win.localStorage.removeItem(probe);
    return false;
  } catch {
    for (const name of ['localStorage', 'sessionStorage']) {
      try {
        Object.defineProperty(win, name, { value: memoryStorage(), configurable: true });
      } catch { /* leave as is */ }
    }
    return true;
  }
}

ensureStorage();
