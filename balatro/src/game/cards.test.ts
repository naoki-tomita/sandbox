import { describe, it, expect } from 'vitest';
import { createDeck, shuffle, cardChips, sortCards, Card } from './cards';

const card = (rank: number, suit: Card['suit'] = 'spades'): Card =>
  ({ id: `${rank}-${suit}`, rank: rank as Card['rank'], suit, selected: false });

describe('createDeck: デッキ生成', () => {
  it('52枚で、IDはすべてユニーク', () => {
    const deck = createDeck();
    expect(deck).toHaveLength(52);
    expect(new Set(deck.map(c => c.id)).size).toBe(52);
  });

  it('配られた時点では1枚も選択されていない', () => {
    expect(createDeck().every(c => !c.selected)).toBe(true);
  });
});

describe('shuffle: シャッフル', () => {
  it('元の配列を壊さず、同じ52枚の並べ替えを返す', () => {
    const deck = createDeck();
    const before = [...deck];
    const shuffled = shuffle(deck);
    expect(deck).toEqual(before);
    expect(shuffled).toHaveLength(52);
    expect(new Set(shuffled.map(c => c.id))).toEqual(new Set(deck.map(c => c.id)));
  });
});

describe('cardChips: カードのチップ価値', () => {
  it('数札(2〜9)は数字どおり', () => {
    expect(cardChips(2)).toBe(2);
    expect(cardChips(9)).toBe(9);
  });

  it('10と絵札(J,Q,K)は10', () => {
    expect(cardChips(10)).toBe(10);
    expect(cardChips(11)).toBe(10);
    expect(cardChips(12)).toBe(10);
    expect(cardChips(13)).toBe(10);
  });

  it('Aは11', () => {
    expect(cardChips(14)).toBe(11);
  });
});

describe('sortCards: 手札の並べ替え', () => {
  it('ランク順は高い順（A→2）', () => {
    const hand = [card(2, 'hearts'), card(14, 'clubs'), card(10, 'spades')];
    expect(sortCards(hand, 'rank').map(c => c.rank)).toEqual([14, 10, 2]);
  });

  it('スート順はスートでまとめ、その中はランク高い順', () => {
    const hand = [card(5, 'hearts'), card(9, 'spades'), card(2, 'spades'), card(7, 'hearts')];
    const sorted = sortCards(hand, 'suit');
    expect(sorted.map(c => c.id)).toEqual(['9-spades', '2-spades', '7-hearts', '5-hearts']);
  });

  it('元の配列を壊さない', () => {
    const hand = [card(2), card(14)];
    const before = [...hand];
    sortCards(hand, 'rank');
    expect(hand).toEqual(before);
  });
});
