import { Card, cardChips } from './cards';
import { HandName, HandResult } from './hands';
import { JokerId, JOKERS } from './jokers';

export interface ScoreEntry {
  baseChips: number;
  baseMult: number;
}

export interface CardContribution {
  card: Card;
  chips: number;
}

export interface JokerContribution {
  jokerId: JokerId;
  chips?: number;
  mult?: number;
  xmult?: number;
}

export interface PlayScore {
  chips: number;
  mult: number;
  total: number;
  handName: HandName;
  baseChips: number;
  baseMult: number;
  cardContributions: CardContribution[];
  /** Triggered jokers in owned order; effects were applied left to right. */
  jokerContributions: JokerContribution[];
}

export const HAND_SCORES: Record<HandName, ScoreEntry> = {
  high_card:       { baseChips:   5, baseMult: 1 },
  pair:            { baseChips:  10, baseMult: 2 },
  two_pair:        { baseChips:  20, baseMult: 2 },
  three_of_a_kind: { baseChips:  30, baseMult: 3 },
  straight:        { baseChips:  30, baseMult: 4 },
  flush:           { baseChips:  35, baseMult: 4 },
  full_house:      { baseChips:  40, baseMult: 4 },
  four_of_a_kind:  { baseChips:  60, baseMult: 7 },
  straight_flush:  { baseChips: 100, baseMult: 8 },
  royal_flush:     { baseChips: 100, baseMult: 8 },
};

export const BLIND_TARGETS = [300, 800, 2000, 5000, 12000, 30000];

export function calculateScore(
  hand: HandResult,
  jokers: JokerId[] = [],
  ctx: { discardsLeft: number } = { discardsLeft: 0 },
): PlayScore {
  const { baseChips, baseMult } = HAND_SCORES[hand.name];
  const cardContributions = hand.cards.map(card => ({ card, chips: cardChips(card.rank) }));
  const cardTotal = cardContributions.reduce((sum, c) => sum + c.chips, 0);

  let chips = baseChips + cardTotal;
  let mult = baseMult;
  const jokerContributions: JokerContribution[] = [];
  for (const jokerId of jokers) {
    const effect = JOKERS[jokerId].effect({ hand, discardsLeft: ctx.discardsLeft, jokerCount: jokers.length });
    if (!effect) continue;
    chips += effect.chips ?? 0;
    mult += effect.mult ?? 0;
    mult *= effect.xmult ?? 1;
    jokerContributions.push({ jokerId, ...effect });
  }

  return {
    chips, mult, total: chips * mult,
    handName: hand.name, baseChips, baseMult,
    cardContributions, jokerContributions,
  };
}
