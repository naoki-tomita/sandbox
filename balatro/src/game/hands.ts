import { Card, Rank } from './cards';

export type HandName =
  | 'royal_flush'
  | 'straight_flush'
  | 'four_of_a_kind'
  | 'full_house'
  | 'flush'
  | 'straight'
  | 'three_of_a_kind'
  | 'two_pair'
  | 'pair'
  | 'high_card';

export interface HandResult {
  name: HandName;
  cards: Card[];
}

export const HAND_DISPLAY_NAMES: Record<HandName, string> = {
  royal_flush: 'Royal Flush',
  straight_flush: 'Straight Flush',
  four_of_a_kind: 'Four of a Kind',
  full_house: 'Full House',
  flush: 'Flush',
  straight: 'Straight',
  three_of_a_kind: 'Three of a Kind',
  two_pair: 'Two Pair',
  pair: 'Pair',
  high_card: 'High Card',
};

function rankCounts(cards: Card[]): Map<Rank, number> {
  const counts = new Map<Rank, number>();
  for (const card of cards) {
    counts.set(card.rank, (counts.get(card.rank) ?? 0) + 1);
  }
  return counts;
}

function isFlush(cards: Card[]): boolean {
  if (cards.length !== 5) return false;
  const suit = cards[0].suit;
  return cards.every(c => c.suit === suit);
}

function isStraight(cards: Card[]): boolean {
  if (cards.length !== 5) return false;
  const ranks = cards.map(c => c.rank).sort((a, b) => a - b);
  const hasNoDuplicates = new Set(ranks).size === 5;
  if (!hasNoDuplicates) return false;

  if (ranks[4] - ranks[0] === 4) return true;

  // Ace-low straight: A-2-3-4-5
  if (ranks[4] === 14 && ranks[0] === 2 && ranks[1] === 3 && ranks[2] === 4 && ranks[3] === 5) {
    return true;
  }

  return false;
}

function isRoyalStraight(cards: Card[]): boolean {
  const ranks = cards.map(c => c.rank).sort((a, b) => a - b);
  return ranks[0] === 10 && ranks[4] === 14;
}

export function detectHand(cards: Card[]): HandResult {
  if (cards.length === 0) {
    return { name: 'high_card', cards };
  }

  const counts = rankCounts(cards);
  const countValues = [...counts.values()].sort((a, b) => b - a);
  const flush = isFlush(cards);
  const straight = isStraight(cards);

  if (straight && flush) {
    if (isRoyalStraight(cards)) return { name: 'royal_flush', cards };
    return { name: 'straight_flush', cards };
  }
  if (countValues[0] === 4) return { name: 'four_of_a_kind', cards };
  if (countValues[0] === 3 && countValues[1] === 2) return { name: 'full_house', cards };
  if (flush) return { name: 'flush', cards };
  if (straight) return { name: 'straight', cards };
  if (countValues[0] === 3) return { name: 'three_of_a_kind', cards };
  if (countValues[0] === 2 && countValues[1] === 2) return { name: 'two_pair', cards };
  if (countValues[0] === 2) return { name: 'pair', cards };
  return { name: 'high_card', cards };
}
