import { describe, it, expect } from 'vitest';
import { setSoundMuted, isSoundMuted, playMoveSound } from '../src/sound.js';

describe('sound', () => {
  it('setSoundMuted updates isSoundMuted', () => {
    setSoundMuted(true);
    expect(isSoundMuted()).toBe(true);
    setSoundMuted(false);
    expect(isSoundMuted()).toBe(false);
    setSoundMuted(1);
    expect(isSoundMuted()).toBe(true);
    setSoundMuted(false);
  });

  it('playMoveSound is a no-op (no AudioContext access) when muted', () => {
    setSoundMuted(true);
    expect(() => playMoveSound()).not.toThrow();
    expect(() => playMoveSound({ capture: true })).not.toThrow();
    setSoundMuted(false);
  });
});
