import { describe, it, expect, afterEach } from 'vitest';
import { STAGES, LESSONS, localizeLesson, localizeStage, puzzleId } from '../src/lessons.js';
import { STAGES_ES, LESSONS_ES, PUZZLES_ES } from '../src/locales/lessons.es.js';
import { IDEAS_ES, NAMES_ES, openingKey, localizeOpening } from '../src/locales/openings.es.js';
import { THEME_NAMES_ES } from '../src/locales/themes.es.js';
import { humanizeTheme, normalizePuzzle } from '../src/puzzleEngine.js';
import openingsData from '../src/data/openings.json';
import puzzlesData from '../src/data/puzzles.json';
import { setLang, translate } from '../src/i18n.js';
import {
  COACH_GREETING, getCoachChat, patchCoachMessages, resetCoachChat, coachMessageText, isGreeting,
} from '../src/coachChat.js';

const nonEmpty = (s) => typeof s === 'string' && s.trim().length > 0;

describe('lesson curriculum (es)', () => {
  it('every stage has a Spanish title and blurb', () => {
    for (const s of STAGES) {
      expect(nonEmpty(STAGES_ES[s.id]?.title), s.id).toBe(true);
      expect(nonEmpty(STAGES_ES[s.id]?.blurb), s.id).toBe(true);
    }
  });

  it('every lesson and puzzle has Spanish text, with no empty strings', () => {
    for (const l of LESSONS) {
      const tr = LESSONS_ES[l.id];
      expect(tr, l.id).toBeTruthy();
      for (const f of ['title', 'intro', 'demoNote', 'coachFocus']) {
        if (l[f]) expect(nonEmpty(tr[f]), `${l.id}.${f}`).toBe(true);
      }
      l.puzzles.forEach((p, i) => {
        const pt = PUZZLES_ES[puzzleId(l.id, i)];
        expect(nonEmpty(pt?.prompt), `${l.id}:${i} prompt`).toBe(true);
        expect(nonEmpty(pt?.hint), `${l.id}:${i} hint`).toBe(true);
      });
    }
  });

  it('has no stale translations for removed items', () => {
    const ids = new Set(LESSONS.flatMap((l) => l.puzzles.map((_, i) => puzzleId(l.id, i))));
    for (const k of Object.keys(PUZZLES_ES)) expect(ids.has(k), k).toBe(true);
    for (const k of Object.keys(LESSONS_ES)) expect(LESSONS.some((l) => l.id === k), k).toBe(true);
  });

  it('localizeLesson swaps text only — fens, moves and solutions are untouched', () => {
    for (const l of LESSONS) {
      const es = localizeLesson(l, 'es');
      expect(es.title).toBe(LESSONS_ES[l.id].title);
      expect(es.demoFen).toBe(l.demoFen);
      expect(es.tryFen).toBe(l.tryFen);
      es.puzzles.forEach((p, i) => {
        expect(p.fen).toBe(l.puzzles[i].fen);
        expect(p.accept).toEqual(l.puzzles[i].accept);
        expect(p.solution).toEqual(l.puzzles[i].solution);
      });
      expect(localizeLesson(l, 'en')).toBe(l);
    }
    expect(localizeStage(STAGES[0], 'es').num).toBe(STAGES[0].num);
  });
});

describe('opening ideas (es)', () => {
  const named = [];
  (function walk(n) {
    if (n.name) named.push(n);
    (n.children || []).forEach(walk);
  }(openingsData.tree));

  it('every named node has a unique key and a Spanish idea', () => {
    const keys = named.map(openingKey);
    expect(new Set(keys).size).toBe(keys.length);
    for (const n of named) if (n.idea) expect(nonEmpty(IDEAS_ES[openingKey(n)]), openingKey(n)).toBe(true);
    for (const k of [...Object.keys(IDEAS_ES), ...Object.keys(NAMES_ES)]) expect(keys.includes(k), k).toBe(true);
  });

  it('localizeOpening uses Spanish only for es', () => {
    const n = named.find((x) => x.name === 'Sicilian Defense');
    expect(localizeOpening(n, 'es').name).toBe('Defensa Siciliana');
    expect(localizeOpening(n, 'en')).toBe(n);
  });
});

describe('puzzle theme names (es)', () => {
  it('every theme in puzzles.json has a Spanish name', () => {
    const rows = Array.isArray(puzzlesData) ? puzzlesData : puzzlesData.puzzles;
    const themes = new Set(rows.flatMap((r) => normalizePuzzle(r).themes));
    expect(themes.size).toBeGreaterThan(0);
    for (const th of themes) {
      expect(nonEmpty(THEME_NAMES_ES[th]), th).toBe(true);
      expect(humanizeTheme(th, 'es')).toBe(THEME_NAMES_ES[th]);
    }
    expect(humanizeTheme('fork', 'es')).toBe('ataque doble');
    expect(humanizeTheme('mateIn2', 'en')).toBe('mate in 2');
    expect(humanizeTheme('someNewTheme', 'es')).toBe('some new theme'); // deliberate English fallback
  });
});

describe('coach greeting', () => {
  afterEach(() => { setLang('en'); resetCoachChat(); });

  it('translates at display time', () => {
    resetCoachChat();
    const [g] = getCoachChat().messages;
    expect(isGreeting(g)).toBe(true);
    setLang('es');
    expect(coachMessageText(g)).toBe(translate('es', 'coach.greeting'));
    expect(coachMessageText(g)).toMatch(/^Soy Maestro/);
    setLang('en');
    expect(coachMessageText(g)).toBe(COACH_GREETING);
  });

  it('trimming still keeps the greeting first (in any language)', () => {
    setLang('es');
    resetCoachChat();
    patchCoachMessages((ms) => [...ms, ...Array.from({ length: 250 }, (_, i) => ({ role: 'user', text: `m${i}` }))]);
    const { messages } = getCoachChat();
    expect(messages.length).toBe(200);
    expect(isGreeting(messages[0])).toBe(true);
    expect(coachMessageText(messages[0])).toBe(translate('es', 'coach.greeting'));
  });
});
