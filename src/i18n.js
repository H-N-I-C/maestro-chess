/* Tiny dependency-free i18n: flat dotted keys, {name} interpolation and
   plural forms ({ one, other }) picked by params.count. */
import { useSyncExternalStore } from 'react';
import en from './locales/en.js';
import es from './locales/es.js';

export const DICTS = { en, es };
export const LANGUAGES = [
  { id: 'en', label: 'English', short: 'EN' },
  { id: 'es', label: 'Español', short: 'ES' },
];
const LANG_KEY = 'maestro-lang';

function detect() {
  try {
    const saved = localStorage.getItem(LANG_KEY);
    if (saved && DICTS[saved]) return saved;
  } catch { /* storage blocked */ }
  const nav = typeof navigator !== 'undefined' ? (navigator.languages?.[0] || navigator.language || '') : '';
  const base = nav.toLowerCase().split('-')[0];
  return DICTS[base] ? base : 'en';
}

let lang = detect();
const listeners = new Set();

function syncDocument() {
  if (typeof document !== 'undefined') document.documentElement.lang = lang;
}
syncDocument();

export function getLang() { return lang; }

export function setLang(next) {
  if (!DICTS[next] || next === lang) return;
  lang = next;
  try { localStorage.setItem(LANG_KEY, next); } catch { /* ignore */ }
  syncDocument();
  for (const fn of listeners) fn();
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function interpolate(str, params) {
  if (!params) return str;
  return str.replace(/\{(\w+)\}/g, (m, k) => (params[k] !== undefined && params[k] !== null ? String(params[k]) : m));
}

/** Translate `key` in language `lng`, falling back to English, then to the key itself. */
export function translate(lng, key, params) {
  let v = DICTS[lng]?.[key];
  if (v === undefined) v = en[key];
  if (v === undefined) return key;
  if (typeof v === 'object') {
    const n = Number(params?.count);
    let form;
    try { form = new Intl.PluralRules(lng).select(n); } catch { form = n === 1 ? 'one' : 'other'; }
    v = v[form] ?? v.other;
  }
  return interpolate(v, params);
}

/** Translate in the current language. */
export function t(key, params) { return translate(lang, key, params); }

/** Subscribe a component to language changes; returns t. */
export function useT() {
  useSyncExternalStore(subscribe, getLang, getLang);
  return t;
}

/** Current language code, re-rendering on change. */
export function useLang() {
  return useSyncExternalStore(subscribe, getLang, getLang);
}

/* Piece letters per language for DISPLAY only — PGN, the engine and stored
   moves always use international SAN (K Q R B N). */
const PIECE_LETTERS = { es: { K: 'R', Q: 'D', R: 'T', B: 'A', N: 'C' } };

/** SAN in the UI language's piece letters, e.g. es: "Nxe5+" → "Cxe5+", "e8=Q" → "e8=D". */
export function localSan(san, lng = lang) {
  const map = PIECE_LETTERS[lng];
  if (!san || !map) return san;
  // only uppercase piece letters change; castling (O-O) and squares stay
  return String(san).replace(/[KQRBN]/g, (c) => map[c]);
}
