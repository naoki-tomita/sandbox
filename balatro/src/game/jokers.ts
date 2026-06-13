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
  name: string;
  description: string;
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

function perSuit(id: JokerId, name: string, suit: Suit, symbol: string): JokerDef {
  return {
    id,
    name,
    description: `+3 Mult for each ${symbol} played`,
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
    name: 'The Apprentice',
    description: '+4 Mult, always eager',
    effect: () => ({ mult: 4 }),
  },
  lacquer_pot: perSuit('lacquer_pot', 'Pot of Lacquer', 'hearts', '♥'),
  vermilion_jar: perSuit('vermilion_jar', 'Vermilion Jar', 'diamonds', '♦'),
  india_ink: perSuit('india_ink', 'India Ink', 'spades', '♠'),
  lamp_black: perSuit('lamp_black', 'Lamp Black', 'clubs', '♣'),
  twin_press: {
    id: 'twin_press',
    name: 'Twin Press',
    description: '+50 Chips if the hand contains a pair',
    effect: ({ hand }) => hasPairOrBetter(hand) ? { chips: 50 } : null,
  },
  short_run: {
    id: 'short_run',
    name: 'Short Run',
    description: '+20 Mult when playing 3 cards or fewer',
    effect: ({ hand }) => hand.cards.length <= 3 ? { mult: 20 } : null,
  },
  uncut_sheets: {
    id: 'uncut_sheets',
    name: 'Uncut Sheets',
    description: '+30 Chips per discard remaining',
    effect: ({ discardsLeft }) => discardsLeft > 0 ? { chips: 30 * discardsLeft } : null,
  },
  last_scrap: {
    id: 'last_scrap',
    name: 'Last Scrap',
    description: '+15 Mult when no discards remain',
    effect: ({ discardsLeft }) => discardsLeft === 0 ? { mult: 15 } : null,
  },
  even_grain: {
    id: 'even_grain',
    name: 'Even Grain',
    description: '+4 Mult for each even card (2,4,6,8,10,Q)',
    effect: ({ hand }) => {
      const n = hand.cards.filter(c => pipValue(c.rank) % 2 === 0).length;
      return n > 0 ? { mult: 4 * n } : null;
    },
  },
  odd_lot: {
    id: 'odd_lot',
    name: 'Odd Lot',
    description: '+30 Chips for each odd card (A,3,5,7,9,J,K)',
    effect: ({ hand }) => {
      const n = hand.cards.filter(c => pipValue(c.rank) % 2 === 1).length;
      return n > 0 ? { chips: 30 * n } : null;
    },
  },
  court_painter: {
    id: 'court_painter',
    name: 'Court Painter',
    description: '+30 Chips for each face card played',
    effect: ({ hand }) => {
      const n = hand.cards.filter(c => FACE_RANKS.has(c.rank)).length;
      return n > 0 ? { chips: 30 * n } : null;
    },
  },
  collector: {
    id: 'collector',
    name: 'The Collector',
    description: '+3 Mult for each joker owned',
    effect: ({ jokerCount }) => ({ mult: 3 * jokerCount }),
  },
  engraver: {
    id: 'engraver',
    name: 'The Engraver',
    description: '×2 Mult if the hand has a face card',
    effect: ({ hand }) => hand.cards.some(c => FACE_RANKS.has(c.rank)) ? { xmult: 2 } : null,
  },
  guilloche: {
    id: 'guilloche',
    name: 'The Guilloché',
    description: '×3 Mult on a flush',
    effect: ({ hand }) => FLUSH_HANDS.has(hand.name) ? { xmult: 3 } : null,
  },
};

export const JOKER_IDS = Object.keys(JOKERS) as JokerId[];

/** Three random jokers the player doesn't own yet. */
export function drawJokerChoices(owned: JokerId[]): JokerId[] {
  const pool = JOKER_IDS.filter(id => !owned.includes(id));
  return shuffle(pool).slice(0, 3);
}
