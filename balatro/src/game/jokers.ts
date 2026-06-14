import { Suit, shuffle } from './cards';
import { HandResult, HandName } from './hands';

export type JokerId =
  | 'apprentice'
  | 'lacquer_pot'
  | 'vermilion_jar'
  | 'india_ink'
  | 'lamp_black'
  | 'twin_press'
  | 'short_run'
  | 'uncut_sheets'
  | 'last_scrap'
  | 'even_grain'
  | 'odd_lot'
  | 'court_painter'
  | 'collector'
  | 'engraver'
  | 'guilloche';

/** What one joker adds to the running tally; fields apply in this order. */
export interface JokerEffect {
  chips?: number;
  mult?: number;
  xmult?: number;
}

export interface ScoringContext {
  hand: HandResult;
  discardsLeft: number;
  jokerCount: number;
}

export interface JokerDef {
  id: JokerId;
  /** Returns the effect for this play, or null when it doesn't trigger. */
  effect: (ctx: ScoringContext) => JokerEffect | null;
}

export const MAX_JOKERS = 5;

const FACE_RANKS = new Set([11, 12, 13]);
const FLUSH_HANDS = new Set<HandName>(['flush', 'straight_flush', 'royal_flush']);

/** Parity uses the pip value: Ace counts as 1 (odd), not its internal rank 14. */
function pipValue(rank: number): number {
  return rank === 14 ? 1 : rank;
}

function perSuit(id: JokerId, suit: Suit): JokerDef {
  return {
    id,
    effect: ({ hand }) => {
      const n = hand.cards.filter(c => c.suit === suit).length;
      return n > 0 ? { mult: 3 * n } : null;
    },
  };
}

function hasPairOrBetter(hand: HandResult): boolean {
  const counts = new Map<number, number>();
  for (const c of hand.cards) counts.set(c.rank, (counts.get(c.rank) ?? 0) + 1);
  return [...counts.values()].some(n => n >= 2);
}

export const JOKERS: Record<JokerId, JokerDef> = {
  apprentice: {
    id: 'apprentice',
    effect: () => ({ mult: 4 }),
  },
  lacquer_pot: perSuit('lacquer_pot', 'hearts'),
  vermilion_jar: perSuit('vermilion_jar', 'diamonds'),
  india_ink: perSuit('india_ink', 'spades'),
  lamp_black: perSuit('lamp_black', 'clubs'),
  twin_press: {
    id: 'twin_press',
    effect: ({ hand }) => hasPairOrBetter(hand) ? { chips: 50 } : null,
  },
  short_run: {
    id: 'short_run',
    effect: ({ hand }) => hand.cards.length <= 3 ? { mult: 20 } : null,
  },
  uncut_sheets: {
    id: 'uncut_sheets',
    effect: ({ discardsLeft }) => discardsLeft > 0 ? { chips: 30 * discardsLeft } : null,
  },
  last_scrap: {
    id: 'last_scrap',
    effect: ({ discardsLeft }) => discardsLeft === 0 ? { mult: 15 } : null,
  },
  even_grain: {
    id: 'even_grain',
    effect: ({ hand }) => {
      const n = hand.cards.filter(c => pipValue(c.rank) % 2 === 0).length;
      return n > 0 ? { mult: 4 * n } : null;
    },
  },
  odd_lot: {
    id: 'odd_lot',
    effect: ({ hand }) => {
      const n = hand.cards.filter(c => pipValue(c.rank) % 2 === 1).length;
      return n > 0 ? { chips: 30 * n } : null;
    },
  },
  court_painter: {
    id: 'court_painter',
    effect: ({ hand }) => {
      const n = hand.cards.filter(c => FACE_RANKS.has(c.rank)).length;
      return n > 0 ? { chips: 30 * n } : null;
    },
  },
  collector: {
    id: 'collector',
    effect: ({ jokerCount }) => ({ mult: 3 * jokerCount }),
  },
  engraver: {
    id: 'engraver',
    effect: ({ hand }) => hand.cards.some(c => FACE_RANKS.has(c.rank)) ? { xmult: 2 } : null,
  },
  guilloche: {
    id: 'guilloche',
    effect: ({ hand }) => FLUSH_HANDS.has(hand.name) ? { xmult: 3 } : null,
  },
};

export const JOKER_IDS = Object.keys(JOKERS) as JokerId[];

/** Three random jokers the player doesn't own yet. */
export function drawJokerChoices(owned: JokerId[]): JokerId[] {
  const pool = JOKER_IDS.filter(id => !owned.includes(id));
  return shuffle(pool).slice(0, 3);
}
