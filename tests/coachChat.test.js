import { describe, it, expect, beforeEach } from 'vitest';
import {
  COACH_GREETING,
  getCoachChat,
  patchCoachChat,
  patchCoachMessages,
  resetCoachChat,
} from '../src/coachChat.js';

describe('coachChat', () => {
  beforeEach(() => resetCoachChat());

  it('starts with the greeting as the only message', () => {
    const { messages } = getCoachChat();
    expect(messages).toEqual([{ role: 'coach', greeting: true, text: COACH_GREETING }]);
  });

  it('trims to 200 messages when patching in more, keeping the greeting first', () => {
    patchCoachMessages((ms) => [...ms, ...Array.from({ length: 250 }, (_, i) => ({ role: 'user', text: `m${i}` }))]);
    const { messages } = getCoachChat();
    expect(messages.length).toBe(200);
    expect(messages[0].text).toBe(COACH_GREETING);
    expect(messages[1].text).toBe('m51'); // greeting + last 199 of the 250 additions
    expect(messages[199].text).toBe('m249');
  });

  it('trims without a greeting head when the greeting was cleared', () => {
    patchCoachMessages(() => Array.from({ length: 250 }, (_, i) => ({ role: 'user', text: `x${i}` })));
    const { messages } = getCoachChat();
    expect(messages.length).toBe(200);
    expect(messages[0].text).toBe('x50');
  });

  it('resetCoachChat restores the greeting and clears state', () => {
    patchCoachChat({ input: 'hello', busy: true, live: 'offline', model: 'm' });
    patchCoachMessages((ms) => [...ms, { role: 'user', text: 'q' }]);
    resetCoachChat();
    const state = getCoachChat();
    expect(state.messages).toEqual([{ role: 'coach', greeting: true, text: COACH_GREETING }]);
    expect(state.input).toBe('');
    expect(state.busy).toBe(false);
    expect(state.live).toBe(null);
    expect(state.model).toBe(null);
  });
});
