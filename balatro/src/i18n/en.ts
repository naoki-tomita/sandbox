import type { Suit } from '../game/cards';
import type { Translations } from './types';

const suitNames: Record<Suit, string> = {
  spades: 'spades',
  hearts: 'hearts',
  diamonds: 'diamonds',
  clubs: 'clubs',
};

export const en: Translations = {
  blindSettled: n => `BLIND ${n} SETTLED`,
  blindCleared: 'Blind cleared',
  nextBlind: 'Next blind →',
  playAgain: 'Play again',
  gameOver: 'Game over',
  reachedBlind: n => `Reached blind ${n}`,
  selectHint: remaining => `Select up to 5 cards · ${remaining} cards remaining`,

  blindNo: n => `Blind No. ${n}`,
  ofTarget: target => `of ${target}`,
  handsLeft: 'Hands',
  discards: 'Discards',
  scoredPlus: total => `scored +${total}`,

  playHand: 'Play hand',
  discard: 'Discard',

  workshopOffers: 'THE WORKSHOP OFFERS',
  takeAJoker: 'Take a joker',
  continueWithout: 'Continue without',

  scoredStamp: 'SCORED',
  baseTag: 'BASE',
  chips: 'CHIPS',
  mult: 'MULT',
  score: 'SCORE',
  multUnit: 'Mult',

  handNames: {
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
  },

  jokers: {
    apprentice: { name: 'The Apprentice', description: '+4 Mult, always eager' },
    lacquer_pot: { name: 'Pot of Lacquer', description: '+3 Mult for each ♥ played' },
    vermilion_jar: { name: 'Vermilion Jar', description: '+3 Mult for each ♦ played' },
    india_ink: { name: 'India Ink', description: '+3 Mult for each ♠ played' },
    lamp_black: { name: 'Lamp Black', description: '+3 Mult for each ♣ played' },
    twin_press: { name: 'Twin Press', description: '+50 Chips if the hand contains a pair' },
    short_run: { name: 'Short Run', description: '+20 Mult when playing 3 cards or fewer' },
    uncut_sheets: { name: 'Uncut Sheets', description: '+30 Chips per discard remaining' },
    last_scrap: { name: 'Last Scrap', description: '+15 Mult when no discards remain' },
    even_grain: { name: 'Even Grain', description: '+4 Mult for each even card (2,4,6,8,10,Q)' },
    odd_lot: { name: 'Odd Lot', description: '+30 Chips for each odd card (A,3,5,7,9,J,K)' },
    court_painter: { name: 'Court Painter', description: '+30 Chips for each face card played' },
    collector: { name: 'The Collector', description: '+3 Mult for each joker owned' },
    engraver: { name: 'The Engraver', description: '×2 Mult if the hand has a face card' },
    guilloche: { name: 'The Guilloché', description: '×3 Mult on a flush' },
  },

  suitNames,
  cardLabel: (rank, suit) => `${rank} of ${suitNames[suit]}`,
};
