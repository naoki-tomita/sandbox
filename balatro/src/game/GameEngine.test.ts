import { describe, it, expect } from 'vitest';
import { GameEngine, GameState, MAX_SELECTED } from './GameEngine';
import { BLIND_TARGETS } from './scoring';
import { JokerId, JOKER_IDS } from './jokers';
import { Card } from './cards';
import { card } from './testFixtures';

function eightCards(selected: Card[] = []): Card[] {
  const fillers: Card[] = [
    card(2, 'spades'), card(3, 'hearts'), card(4, 'clubs'), card(5, 'diamonds'),
    card(6, 'spades'), card(7, 'hearts'), card(8, 'clubs'), card(10, 'diamonds'),
  ];
  return [...selected, ...fillers.slice(0, 8 - selected.length)];
}

function makeEngine(overrides: Partial<GameState> = {}): GameEngine {
  return new GameEngine({
    deck: [],
    hand: eightCards(),
    discardPile: [],
    handsPlayed: 0,
    discardsLeft: 3,
    currentScore: 0,
    blindIndex: 0,
    phase: 'selecting',
    lastPlay: null,
    dealKey: 0,
    jokers: [],
    jokerChoices: null,
    ...overrides,
  });
}

describe('toggleSelect', () => {
  it('selects and deselects a card', () => {
    const engine = makeEngine();
    const id = engine.state.hand[0].id;
    const selected = engine.toggleSelect(id);
    expect(selected.selectedCards.map(c => c.id)).toEqual([id]);
    expect(selected.toggleSelect(id).selectedCards).toEqual([]);
  });

  it(`caps the selection at ${MAX_SELECTED}`, () => {
    let engine = makeEngine();
    for (const c of engine.state.hand.slice(0, MAX_SELECTED)) engine = engine.toggleSelect(c.id);
    const sixth = engine.toggleSelect(engine.state.hand[MAX_SELECTED].id);
    expect(sixth.selectedCards).toHaveLength(MAX_SELECTED);
  });

  it('only works while selecting', () => {
    const engine = makeEngine({ phase: 'scored' });
    expect(engine.toggleSelect(engine.state.hand[0].id)).toBe(engine);
  });

  it('never mutates the original engine', () => {
    const engine = makeEngine();
    engine.toggleSelect(engine.state.hand[0].id);
    expect(engine.selectedCards).toEqual([]);
  });
});

describe('play resolution', () => {
  const pairOfNines = [card(9, 'spades', true), card(9, 'hearts', true)];

  it('startPlay needs a selection', () => {
    const engine = makeEngine();
    expect(engine.startPlay()).toBe(engine);
    const armed = engine.toggleSelect(engine.state.hand[0].id).startPlay();
    expect(armed.state.phase).toBe('playing');
  });

  it('resolvePlay scores the hand, refills, and waits in scored', () => {
    const deck = [card(11, 'spades'), card(12, 'hearts'), card(13, 'clubs')];
    const engine = makeEngine({ phase: 'playing', hand: eightCards(pairOfNines), deck });

    const resolved = engine.resolvePlay();
    const s = resolved.state;
    expect(s.phase).toBe('scored');
    // pair of 9s: (10 + 9 + 9) × 2 = 56
    expect(s.currentScore).toBe(56);
    expect(s.lastPlay?.handName).toBe('pair');
    expect(s.handsPlayed).toBe(1);
    // 6 kept + 2 drawn from the top of the deck
    expect(s.hand).toHaveLength(8);
    expect(s.hand.map(c => c.id)).toContain('11-spades');
    expect(s.hand.map(c => c.id)).toContain('12-hearts');
    expect(s.deck.map(c => c.id)).toEqual(['13-clubs']);
    expect(s.discardPile.map(c => c.rank)).toEqual([9, 9]);
    expect(s.hand.every(c => !c.selected)).toBe(true);
  });

  it('resolvePlay feeds owned jokers and the current discards into scoring', () => {
    const engine = makeEngine({
      phase: 'playing',
      hand: eightCards(pairOfNines),
      discardsLeft: 2,
      jokers: ['uncut_sheets'],
    });
    const s = engine.resolvePlay().state;
    // (10 + 9 + 9 + 60) × 2 = 176
    expect(s.currentScore).toBe(176);
    expect(s.lastPlay?.jokerContributions).toEqual([{ jokerId: 'uncut_sheets', chips: 60 }]);
  });

  it('advanceAfterScore decides the outcome only from scored', () => {
    const target = BLIND_TARGETS[0];
    expect(makeEngine({ phase: 'scored', currentScore: target }).advanceAfterScore().state.phase)
      .toBe('blind_cleared');
    expect(makeEngine({ phase: 'scored', currentScore: 10, handsPlayed: 3 }).advanceAfterScore().state.phase)
      .toBe('game_over');
    expect(makeEngine({ phase: 'scored', currentScore: 10, handsPlayed: 1 }).advanceAfterScore().state.phase)
      .toBe('selecting');
    const idle = makeEngine({ phase: 'selecting' });
    expect(idle.advanceAfterScore()).toBe(idle);
  });
});

describe('discard', () => {
  it('swaps the selection for fresh cards and spends a discard', () => {
    const engine = makeEngine({
      hand: eightCards([card(9, 'spades', true)]),
      deck: [card(13, 'clubs')],
      discardsLeft: 1,
    });
    const s = engine.discard().state;
    expect(s.discardsLeft).toBe(0);
    expect(s.hand).toHaveLength(8);
    expect(s.hand.map(c => c.id)).toContain('13-clubs');
    expect(s.discardPile.map(c => c.id)).toEqual(['9-spades']);
  });

  it('refuses with no discards left or nothing selected', () => {
    const spent = makeEngine({ hand: eightCards([card(9, 'spades', true)]), discardsLeft: 0 });
    expect(spent.discard()).toBe(spent);
    const nothing = makeEngine();
    expect(nothing.discard()).toBe(nothing);
  });
});

describe('joker draft flow', () => {
  it('a cleared blind leads to a draft of three unowned jokers', () => {
    const owned: JokerId[] = ['apprentice'];
    const draft = makeEngine({ phase: 'blind_cleared', jokers: owned }).startJokerDraft();
    expect(draft.state.phase).toBe('joker_draft');
    expect(draft.state.jokerChoices).toHaveLength(3);
    expect(draft.state.jokerChoices).not.toContain('apprentice');
  });

  it('skips straight to the next blind when the shelf is full', () => {
    const full: JokerId[] = ['apprentice', 'engraver', 'collector', 'twin_press', 'short_run'];
    const next = makeEngine({ phase: 'blind_cleared', blindIndex: 1, jokers: full }).startJokerDraft();
    expect(next.state.phase).toBe('selecting');
    expect(next.state.blindIndex).toBe(2);
    expect(next.state.jokers).toEqual(full);
  });

  it('picking a joker carries it into the next blind', () => {
    const draft = makeEngine({ phase: 'blind_cleared', blindIndex: 0, currentScore: 400 }).startJokerDraft();
    const choice = draft.state.jokerChoices![0];
    const s = draft.pickJoker(choice).state;
    expect(s.jokers).toEqual([choice]);
    expect(s.blindIndex).toBe(1);
    expect(s.phase).toBe('selecting');
    expect(s.currentScore).toBe(0);
    expect(s.jokerChoices).toBeNull();
    expect(s.hand).toHaveLength(8);
  });

  it('rejects picks that were not offered', () => {
    const draft = makeEngine({ phase: 'blind_cleared' }).startJokerDraft();
    const notOffered = JOKER_IDS.find(id => !draft.state.jokerChoices!.includes(id))!;
    expect(draft.pickJoker(notOffered)).toBe(draft);
  });

  it('skipping moves on without a new joker', () => {
    const draft = makeEngine({ phase: 'blind_cleared', jokers: ['apprentice'] }).startJokerDraft();
    const s = draft.skipDraft().state;
    expect(s.jokers).toEqual(['apprentice']);
    expect(s.blindIndex).toBe(1);
    expect(s.phase).toBe('selecting');
  });

  it('restart clears the shelf', () => {
    const s = makeEngine({ phase: 'game_over', blindIndex: 3, jokers: ['apprentice'] }).restart().state;
    expect(s.jokers).toEqual([]);
    expect(s.blindIndex).toBe(0);
  });
});
