import { describe, it, expect } from 'vitest';
import { JOKERS, JOKER_IDS, JokerId, ScoringContext, drawJokerChoices } from './jokers';
import { detectHand } from './hands';
import { Card } from './cards';
import { card } from './testFixtures';

function ctx(cards: Card[], overrides: Partial<Omit<ScoringContext, 'hand'>> = {}): ScoringContext {
  return { hand: detectHand(cards), discardsLeft: 3, jokerCount: 1, ...overrides };
}

const effect = (id: JokerId, c: ScoringContext) => JOKERS[id].effect(c);

describe('joker effects', () => {
  it('the apprentice always helps', () => {
    expect(effect('apprentice', ctx([card(2)]))).toEqual({ mult: 4 });
  });

  it('pigment jars count only their own suit', () => {
    const mixed = ctx([card(5, 'hearts'), card(9, 'hearts'), card(13, 'spades')]);
    expect(effect('lacquer_pot', mixed)).toEqual({ mult: 6 });
    expect(effect('india_ink', mixed)).toEqual({ mult: 3 });
    expect(effect('vermilion_jar', mixed)).toBeNull();
    expect(effect('lamp_black', mixed)).toBeNull();
  });

  it('twin press triggers on any matched rank, even inside a full house', () => {
    expect(effect('twin_press', ctx([card(8, 'spades'), card(8, 'hearts')]))).toEqual({ chips: 50 });
    expect(effect('twin_press', ctx([
      card(8, 'spades'), card(8, 'hearts'), card(8, 'clubs'),
      card(3, 'spades'), card(3, 'hearts'),
    ]))).toEqual({ chips: 50 });
    expect(effect('twin_press', ctx([card(8), card(9, 'hearts')]))).toBeNull();
  });

  it('short run wants three cards or fewer', () => {
    expect(effect('short_run', ctx([card(2), card(3, 'hearts'), card(4, 'clubs')]))).toEqual({ mult: 20 });
    expect(effect('short_run', ctx([card(2), card(3, 'hearts'), card(4, 'clubs'), card(5, 'diamonds')]))).toBeNull();
  });

  it('uncut sheets pays per remaining discard; last scrap wants none', () => {
    expect(effect('uncut_sheets', ctx([card(2)], { discardsLeft: 3 }))).toEqual({ chips: 90 });
    expect(effect('uncut_sheets', ctx([card(2)], { discardsLeft: 0 }))).toBeNull();
    expect(effect('last_scrap', ctx([card(2)], { discardsLeft: 0 }))).toEqual({ mult: 15 });
    expect(effect('last_scrap', ctx([card(2)], { discardsLeft: 1 }))).toBeNull();
  });

  it('parity uses pip values: ace is odd, queen is even', () => {
    // A (odd), Q (even), J (odd), 4 (even)
    const hand = ctx([card(14), card(12, 'hearts'), card(11, 'clubs'), card(4, 'diamonds')]);
    expect(effect('even_grain', hand)).toEqual({ mult: 8 });   // Q + 4
    expect(effect('odd_lot', hand)).toEqual({ chips: 60 });    // A + J
  });

  it('court painter counts faces only', () => {
    expect(effect('court_painter', ctx([card(11), card(12, 'hearts'), card(14, 'clubs')])))
      .toEqual({ chips: 60 }); // J + Q, not the ace
    expect(effect('court_painter', ctx([card(10), card(14, 'clubs')]))).toBeNull();
  });

  it('the collector scales with jokers owned', () => {
    expect(effect('collector', ctx([card(2)], { jokerCount: 4 }))).toEqual({ mult: 12 });
  });

  it('the engraver doubles only with a face card present', () => {
    expect(effect('engraver', ctx([card(12)]))).toEqual({ xmult: 2 });
    expect(effect('engraver', ctx([card(14), card(10, 'hearts')]))).toBeNull();
  });
});

describe('drawJokerChoices', () => {
  it('offers three unowned, distinct jokers', () => {
    const owned: JokerId[] = ['apprentice', 'engraver'];
    for (let i = 0; i < 20; i++) {
      const choices = drawJokerChoices(owned);
      expect(choices).toHaveLength(3);
      expect(new Set(choices).size).toBe(3);
      for (const id of choices) expect(owned).not.toContain(id);
    }
  });

  it('offers fewer when the pool runs dry', () => {
    const owned = JOKER_IDS.slice(0, JOKER_IDS.length - 2);
    expect(drawJokerChoices(owned)).toHaveLength(2);
    expect(drawJokerChoices(JOKER_IDS)).toHaveLength(0);
  });
});
