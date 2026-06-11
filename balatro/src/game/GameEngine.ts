import { Card, createDeck, shuffle } from './cards';
import { detectHand } from './hands';
import { calculateScore, PlayScore, BLIND_TARGETS } from './scoring';

export type Phase = 'selecting' | 'playing' | 'blind_cleared' | 'game_over';

export interface GameState {
  deck: Card[];
  hand: Card[];
  discardPile: Card[];
  handsPlayed: number;
  discardsLeft: number;
  currentScore: number;
  blindIndex: number;
  phase: Phase;
  lastPlay: PlayScore | null;
  dealKey: number;
}

const HAND_SIZE = 8;
const MAX_HANDS = 3;
const MAX_DISCARDS = 3;
export const MAX_SELECTED = 5;

function newBlindState(blindIndex: number, dealKey: number): GameState {
  const deck = shuffle(createDeck());
  return {
    deck: deck.slice(HAND_SIZE),
    hand: deck.slice(0, HAND_SIZE),
    discardPile: [],
    handsPlayed: 0,
    discardsLeft: MAX_DISCARDS,
    currentScore: 0,
    blindIndex,
    phase: 'selecting',
    lastPlay: null,
    dealKey,
  };
}

export class GameEngine {
  readonly state: Readonly<GameState>;

  constructor(state?: GameState) {
    this.state = state ?? newBlindState(0, 0);
  }

  private evolve(patch: Partial<GameState>): GameEngine {
    return new GameEngine({ ...this.state, ...patch });
  }

  get blindTarget(): number {
    return BLIND_TARGETS[Math.min(this.state.blindIndex, BLIND_TARGETS.length - 1)];
  }

  get selectedCards(): Card[] {
    return this.state.hand.filter(c => c.selected);
  }

  toggleSelect(id: string): GameEngine {
    if (this.state.phase !== 'selecting') return this;
    const card = this.state.hand.find(c => c.id === id);
    if (!card) return this;
    if (!card.selected && this.selectedCards.length >= MAX_SELECTED) return this;
    return this.evolve({
      hand: this.state.hand.map(c => c.id === id ? { ...c, selected: !c.selected } : c),
    });
  }

  /** Mark selected cards as "in-flight"; call resolvePlay() after the animation. */
  startPlay(): GameEngine {
    if (this.state.phase !== 'selecting' || this.selectedCards.length === 0) return this;
    return this.evolve({ phase: 'playing' });
  }

  /** Apply score and draw replacement cards. Call after fly-off animation completes. */
  resolvePlay(): GameEngine {
    if (this.state.phase !== 'playing') return this;

    const selected = this.selectedCards;
    const play = calculateScore(detectHand(selected));
    const newScore = this.state.currentScore + play.total;
    const newHandsPlayed = this.state.handsPlayed + 1;

    const remaining = this.state.hand.filter(c => !c.selected).map(c => ({ ...c, selected: false }));
    const draw = this.state.deck.slice(0, HAND_SIZE - remaining.length);

    let phase: Phase = 'selecting';
    if (newScore >= this.blindTarget) phase = 'blind_cleared';
    else if (newHandsPlayed >= MAX_HANDS) phase = 'game_over';

    return this.evolve({
      deck: this.state.deck.slice(draw.length),
      hand: [...remaining, ...draw],
      discardPile: [...this.state.discardPile, ...selected],
      handsPlayed: newHandsPlayed,
      currentScore: newScore,
      lastPlay: play,
      phase,
    });
  }

  discard(): GameEngine {
    if (this.state.phase !== 'selecting' || this.state.discardsLeft === 0) return this;
    const selected = this.selectedCards;
    if (selected.length === 0) return this;

    const remaining = this.state.hand.filter(c => !c.selected).map(c => ({ ...c, selected: false }));
    const draw = this.state.deck.slice(0, HAND_SIZE - remaining.length);

    return this.evolve({
      deck: this.state.deck.slice(draw.length),
      hand: [...remaining, ...draw],
      discardPile: [...this.state.discardPile, ...selected],
      discardsLeft: this.state.discardsLeft - 1,
      lastPlay: null,
    });
  }

  nextBlind(): GameEngine {
    return new GameEngine(newBlindState(this.state.blindIndex + 1, this.state.dealKey + 1));
  }

  restart(): GameEngine {
    return new GameEngine(newBlindState(0, this.state.dealKey + 1));
  }
}
