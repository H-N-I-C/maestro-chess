import { describe, it, expect } from 'vitest';
import { ensureStorage } from '../src/storageGuard.js';

describe('storage guard', () => {
  it('replaces a throwing localStorage with working in-memory storage', () => {
    const win = {};
    Object.defineProperty(win, 'localStorage', { get() { throw new Error('SecurityError'); }, configurable: true });
    expect(ensureStorage(win)).toBe(true);
    win.localStorage.setItem('a', 1);
    expect(win.localStorage.getItem('a')).toBe('1');
    expect(win.localStorage.getItem('missing')).toBe(null);
  });

  it('leaves working storage alone', () => {
    const store = new Map();
    const win = { localStorage: { setItem: (k, v) => store.set(k, v), removeItem: (k) => store.delete(k) } };
    const before = win.localStorage;
    expect(ensureStorage(win)).toBe(false);
    expect(win.localStorage).toBe(before);
  });
});
