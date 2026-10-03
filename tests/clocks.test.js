import { describe, it, expect } from 'vitest';
import { formatClock, migrateTimeControl, timeControl } from '../src/hooks/useClocks.js';

describe('clock helpers', () => {
  it('formats minutes and tenths under ten seconds', () => {
    expect(formatClock(300_000)).toBe('5:00');
    expect(formatClock(61_500)).toBe('1:02');
    expect(formatClock(9_400)).toBe('0:09.4');
    expect(formatClock(0)).toBe('0:00');
  });

  it('migrates old minute-only saves', () => {
    expect(migrateTimeControl({ clockMinutes: 10 })).toBe('10+0');
    expect(migrateTimeControl({ clockId: '3+2' })).toBe('3+2');
    expect(migrateTimeControl({ clockId: 'bogus' })).toBe('off');
    expect(migrateTimeControl(null)).toBe('off');
  });

  it('looks up increments', () => {
    expect(timeControl('10+5')).toMatchObject({ base: 10, inc: 5 });
    expect(timeControl('x').base).toBe(0);
  });
});
