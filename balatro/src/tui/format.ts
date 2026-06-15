import { Card, RANK_LABELS, SUIT_SYMBOLS } from '../game/cards';
import { JokerContribution } from '../game/scoring';
import { t } from '../i18n';

const RED_SUITS = new Set<Card['suit']>(['hearts', 'diamonds']);

/** Ink color name for a card's suit — red ink vs black. */
export function suitColor(suit: Card['suit']): string {
  return RED_SUITS.has(suit) ? 'red' : 'white';
}

/** e.g. "A♠", "10♦". */
export function cardLabel(card: Card): string {
  return `${RANK_LABELS[card.rank]}${SUIT_SYMBOLS[card.suit]}`;
}

/** A joker's effect as it reads on the tally, mirroring the web overlay. */
export function jokerEffectText(c: JokerContribution): string {
  if (c.xmult) return `×${c.xmult} ${t.multUnit}`;
  if (c.mult) return `+${c.mult} ${t.multUnit}`;
  return `+${c.chips}`;
}

/** A fixed-width gilt progress bar: filled blocks over the blind target. */
export function progressBar(value: number, target: number, width = 24): string {
  const ratio = target > 0 ? Math.min(value / target, 1) : 0;
  const filled = Math.round(ratio * width);
  return '█'.repeat(filled) + '░'.repeat(width - filled);
}
