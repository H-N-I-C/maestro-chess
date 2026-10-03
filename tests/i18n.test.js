import { describe, it, expect } from 'vitest';
import { translate } from '../src/i18n.js';
import en from '../src/locales/en.js';
import es from '../src/locales/es.js';
import { spokenSan } from '../src/gameUtils.js';

const placeholders = (v) => {
  const strs = typeof v === 'object' ? Object.values(v) : [v];
  return [...new Set(strs.flatMap((s) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1])))].sort();
};

describe('i18n', () => {
  it('interpolates {params} and leaves unknown ones intact', () => {
    expect(translate('en', 'app.tab.play')).toBe('Play');
    expect(translate('es', 'app.tab.play')).toBe('Jugar');
    en['__test.greet'] = 'Hi {name}, {missing}';
    expect(translate('en', '__test.greet', { name: 'Ana' })).toBe('Hi Ana, {missing}');
    delete en['__test.greet'];
  });

  it('picks plural forms by count', () => {
    en['__test.moves'] = { one: '{count} move', other: '{count} moves' };
    es['__test.moves'] = { one: '{count} jugada', other: '{count} jugadas' };
    expect(translate('en', '__test.moves', { count: 1 })).toBe('1 move');
    expect(translate('en', '__test.moves', { count: 0 })).toBe('0 moves');
    expect(translate('es', '__test.moves', { count: 3 })).toBe('3 jugadas');
    delete en['__test.moves'];
    delete es['__test.moves'];
  });

  it('falls back to English, then to the key', () => {
    en['__test.only'] = 'English only';
    expect(translate('es', '__test.only')).toBe('English only');
    delete en['__test.only'];
    expect(translate('es', 'no.such.key')).toBe('no.such.key');
  });

  it('en and es have the same keys, forms and placeholders', () => {
    expect(Object.keys(es).sort()).toEqual(Object.keys(en).sort());
    for (const k of Object.keys(en)) {
      expect(typeof es[k], k).toBe(typeof en[k]);
      if (typeof en[k] === 'object') expect(Object.keys(es[k]).sort(), k).toEqual(Object.keys(en[k]).sort());
      expect(placeholders(es[k]), k).toEqual(placeholders(en[k]));
    }
  });

  it('speaks SAN in Spanish', () => {
    expect(spokenSan('Nxe5+', 'es')).toBe('caballo captura e5, jaque');
    expect(spokenSan('O-O#', 'es')).toBe('enroque corto, jaque mate');
    expect(spokenSan('e8=Q', 'es')).toBe('peón a e8 corona dama');
  });
});

import { localSan } from '../src/i18n.js';
describe('localSan', () => {
  it('uses Spanish piece letters for display only', () => {
    expect(localSan('Nxe5+', 'es')).toBe('Cxe5+');
    expect(localSan('exd8=Q#', 'es')).toBe('exd8=D#');
    expect(localSan('Kf1', 'es')).toBe('Rf1');
    expect(localSan('Rad1', 'es')).toBe('Tad1');
    expect(localSan('O-O-O', 'es')).toBe('O-O-O');
    expect(localSan('Bb5', 'en')).toBe('Bb5');
    expect(localSan(null, 'es')).toBe(null);
  });
});
