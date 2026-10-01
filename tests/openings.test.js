import { describe, it, expect } from 'vitest';
import { openingName } from '../src/openings.js';

describe('openingName', () => {
  it('returns null for empty or missing input', () => {
    expect(openingName([])).toBe(null);
    expect(openingName(null)).toBe(null);
    expect(openingName(undefined)).toBe(null);
  });

  it('recognizes a full Italian Game', () => {
    expect(openingName(['e4', 'e5', 'Nf3', 'Nc6', 'Bc4'])).toBe('Italian Game');
  });

  it('prefers the longest match (Giuoco Piano over Italian)', () => {
    expect(openingName(['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Bc5'])).toBe('Italian Game: Giuoco Piano');
  });

  it('recognizes the Najdorf among Sicilians', () => {
    expect(openingName(['e4', 'c5', 'Nf3', 'd6', 'd4', 'cxd4', 'Nxd4', 'Nf6', 'Nc3', 'a6'])).toBe('Sicilian: Najdorf');
    expect(openingName(['e4', 'c5'])).toBe('Sicilian Defense');
  });

  it('recognizes Queen\'s Gambit and London lines', () => {
    expect(openingName(['d4', 'd5', 'c4'])).toBe('Queen\'s Gambit');
    expect(openingName(['d4', 'Nf6', 'Bf4'])).toBe('London System');
  });

  it('falls back to family names for short move lists', () => {
    expect(openingName(['e4', 'e5'])).toBe('Open Game (1.e4 e5)');
    expect(openingName(['e4'])).toBe('King\'s Pawn Opening');
    expect(openingName(['d4'])).toBe('Queen\'s Pawn Opening');
  });
});
