import { describe, it, expect } from 'vitest';
import { Chess } from 'chess.js';
import { STAGES, LESSONS, lessonsForStage } from '../src/lessons.js';

describe('lessons data integrity', () => {
  it('every lesson belongs to a known stage and has content', () => {
    const stageIds = new Set(STAGES.map((s) => s.id));
    for (const lesson of LESSONS) {
      expect(stageIds.has(lesson.stage), `${lesson.id} stage`).toBe(true);
      expect(lesson.title).toBeTruthy();
      expect(lesson.intro).toBeTruthy();
      expect(Array.isArray(lesson.puzzles)).toBe(true);
    }
  });

  it('every stage has at least one lesson', () => {
    for (const stage of STAGES) {
      expect(lessonsForStage(stage.id).length, stage.id).toBeGreaterThan(0);
    }
  });

  it('demoFen and tryFen parse', () => {
    for (const lesson of LESSONS) {
      for (const field of ['demoFen', 'tryFen']) {
        if (lesson[field]) {
          expect(() => new Chess(lesson[field]), `${lesson.id}.${field}`).not.toThrow();
        }
      }
    }
  });

  it('every puzzle fen parses, every accept/solution line is legal', () => {
    for (const lesson of LESSONS) {
      for (const [i, puzzle] of lesson.puzzles.entries()) {
        const label = `${lesson.id} puzzle ${i}`;
        const game = new Chess(puzzle.fen); // throws if fen is invalid
        if (puzzle.solution) {
          for (const san of puzzle.solution) {
            expect(game.move(san), `${label}: ${san}`).toBeTruthy();
          }
          const last = puzzle.solution[puzzle.solution.length - 1];
          if (last.includes('#')) {
            expect(game.isCheckmate(), `${label} final move should be mate`).toBe(true);
          }
        }
        // accept entries are alternative moves, each from the puzzle start
        for (const san of puzzle.accept || []) {
          const fresh = new Chess(puzzle.fen);
          expect(fresh.move(san), `${label}: ${san}`).toBeTruthy();
        }
      }
    }
  });

  it('every puzzle has a prompt and a hint', () => {
    for (const lesson of LESSONS) {
      for (const [i, puzzle] of lesson.puzzles.entries()) {
        expect(puzzle.prompt, `${lesson.id} puzzle ${i}`).toBeTruthy();
        expect(puzzle.hint, `${lesson.id} puzzle ${i}`).toBeTruthy();
      }
    }
  });

  it('the two previously empty lessons now teach their themes', () => {
    const greek = LESSONS.find((l) => l.id === 'greek-gift');
    const plans = LESSONS.find((l) => l.id === 'plans');
    expect(greek.puzzles.length).toBeGreaterThanOrEqual(2);
    expect(plans.puzzles.length).toBeGreaterThanOrEqual(2);
  });
});
