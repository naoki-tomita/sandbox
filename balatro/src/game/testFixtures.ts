import { Card, Rank, Suit } from './cards';

/** Build a card for tests; id mirrors createDeck's format. */
export function card(rank: Rank, suit: Suit = 'spades', selected = false): Card {
  return { id: `${rank}-${suit}`, suit, rank, selected };
}
