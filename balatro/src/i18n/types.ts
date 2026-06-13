import type { HandName } from '../game/hands';
import type { JokerId } from '../game/jokers';
import type { Suit } from '../game/cards';

/** Display name + effect blurb for one joker. */
export interface JokerText {
  name: string;
  description: string;
}

/**
 * Every user-facing string in one place, keyed by language. Stable game IDs
 * (HandName, JokerId, Suit) map to their localized labels; strings that embed
 * runtime values are functions so each language controls word order.
 */
export interface Translations {
  /** "BLIND {n} SETTLED" banner above the cleared card. */
  blindSettled: (n: number) => string;
  blindCleared: string;
  nextBlind: string;
  playAgain: string;
  gameOver: string;
  reachedBlind: (n: number) => string;
  /** Footer hint, e.g. "Select up to 5 cards · {n} cards remaining". */
  selectHint: (remaining: number) => string;

  blindNo: (n: number) => string;
  /** The "/ target" shown next to the running score. */
  ofTarget: (target: string) => string;
  handsLeft: string;
  discards: string;
  scoredPlus: (total: string) => string;

  playHand: string;
  discard: string;

  workshopOffers: string;
  takeAJoker: string;
  continueWithout: string;

  scoredStamp: string;
  baseTag: string;
  chips: string;
  mult: string;
  score: string;
  /** Unit appended to a joker's running-tally effect, e.g. "×3 {multUnit}". */
  multUnit: string;

  handNames: Record<HandName, string>;
  jokers: Record<JokerId, JokerText>;
  suitNames: Record<Suit, string>;
  /** Card accessibility label, e.g. "K of hearts". */
  cardLabel: (rank: string, suit: Suit) => string;
}
