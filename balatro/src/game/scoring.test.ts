import { describe, it, expect } from 'vitest';
import { calculateScore } from './scoring';
import { detectHand } from './hands';
import { card } from './testFixtures';

describe('calculateScore without jokers', () => {
  it('high card: base 5 + card chips, ×1', () => {
    const score = calculateScore(detectHand([card(14)]));
    expect(score.chips).toBe(5 + 11);
    expect(score.mult).toBe(1);
    expect(score.total).toBe(16);
    expect(score.baseMult).toBe(1);
    expect(score.jokerContributions).toEqual([]);
  });

  it('pair of kings: (10 + 10 + 10) × 2', () => {
    const score = calculateScore(detectHand([card(13, 'spades'), card(13, 'hearts')]));
    expect(score.total).toBe(60);
  });

  it('records one contribution per played card', () => {
    const score = calculateScore(detectHand([card(2), card(5, 'hearts'), card(9, 'clubs')]));
    expect(score.cardContributions.map(c => c.chips)).toEqual([2, 5, 9]);
  });
});

describe('joker pipeline', () => {
  const ctx = { discardsLeft: 2 };
  const faceHigh = detectHand([card(13)]); // K: 5 + 10 = 15 chips, ×1

  it('chips jokers add before the multiplication', () => {
    const score = calculateScore(faceHigh, ['court_painter'], ctx);
    expect(score.chips).toBe(15 + 30);
    expect(score.total).toBe(45);
  });

  it('applies effects left to right: additive then ×2', () => {
    // (1 + 4) × 2 = 10
    const score = calculateScore(faceHigh, ['apprentice', 'engraver'], ctx);
    expect(score.mult).toBe(10);
    expect(score.total).toBe(150);
  });

  it('applies effects left to right: ×2 then additive', () => {
    // 1 × 2 + 4 = 6
    const score = calculateScore(faceHigh, ['engraver', 'apprentice'], ctx);
    expect(score.mult).toBe(6);
    expect(score.total).toBe(90);
  });

  it('non-triggering jokers are skipped and leave no contribution', () => {
    const noFace = detectHand([card(7)]);
    const score = calculateScore(noFace, ['engraver', 'last_scrap'], ctx);
    expect(score.jokerContributions).toEqual([]);
    expect(score.mult).toBe(1);
  });

  it('uses the discards left in the context', () => {
    const score = calculateScore(faceHigh, ['uncut_sheets'], { discardsLeft: 2 });
    expect(score.jokerContributions).toEqual([{ jokerId: 'uncut_sheets', chips: 60 }]);
  });

  it('the collector counts all owned jokers, itself included', () => {
    const score = calculateScore(faceHigh, ['apprentice', 'collector'], ctx);
    expect(score.jokerContributions).toContainEqual({ jokerId: 'collector', mult: 6 });
  });

  it('total always equals chips × mult', () => {
    const hand = detectHand([card(11, 'hearts'), card(11, 'clubs')]);
    const score = calculateScore(hand, ['twin_press', 'lacquer_pot', 'engraver'], { discardsLeft: 0 });
    expect(score.total).toBe(score.chips * score.mult);
  });
});
