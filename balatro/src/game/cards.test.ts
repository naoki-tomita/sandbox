import { describe, it, expect } from 'vitest';
import { createDeck, shuffle, cardChips } from './cards';

describe('createDeck', () => {
  it('has 52 cards with unique ids', () => {
    const deck = createDeck();
    expect(deck).toHaveLength(52);
    expect(new Set(deck.map(c => c.id)).size).toBe(52);
  });

  it('deals nothing selected', () => {
    expect(createDeck().every(c => !c.selected)).toBe(true);
  });
});

describe('shuffle', () => {
  it('returns a permutation without mutating the input', () => {
    const deck = createDeck();
    const before = [...deck];
    const shuffled = shuffle(deck);
    expect(deck).toEqual(before);
    expect(shuffled).toHaveLength(52);
    expect(new Set(shuffled.map(c => c.id))).toEqual(new Set(deck.map(c => c.id)));
  });
});

describe('cardChips', () => {
  it('numbers score their pip value', () => {
    expect(cardChips(2)).toBe(2);
    expect(cardChips(9)).toBe(9);
  });

  it('ten and faces score 10', () => {
    expect(cardChips(10)).toBe(10);
    expect(cardChips(11)).toBe(10);
    expect(cardChips(12)).toBe(10);
    expect(cardChips(13)).toBe(10);
  });

  it('ace scores 11', () => {
    expect(cardChips(14)).toBe(11);
  });
});
