import { useState, useCallback } from 'react';
import { Card, createDeck, shuffle } from './game/cards';
import { detectHand } from './game/hands';
import { calculateScore, PlayScore, BLIND_TARGETS } from './game/scoring';
import { Hand } from './components/Hand';
import { ScoreBoard } from './components/ScoreBoard';
import { PlayArea } from './components/PlayArea';

const MAX_HAND_SIZE = 8;
const MAX_HANDS = 3;
const MAX_DISCARDS = 3;

type Phase = 'selecting' | 'blind_cleared' | 'game_over';

interface GameState {
  deck: Card[];
  hand: Card[];
  discardPile: Card[];
  handsPlayed: number;
  discardsLeft: number;
  currentScore: number;
  blindIndex: number;
  phase: Phase;
  lastPlay: PlayScore | null;
}

function dealInitialState(blindIndex: number): GameState {
  const deck = shuffle(createDeck());
  const hand = deck.slice(0, MAX_HAND_SIZE);
  return {
    deck: deck.slice(MAX_HAND_SIZE),
    hand,
    discardPile: [],
    handsPlayed: 0,
    discardsLeft: MAX_DISCARDS,
    currentScore: 0,
    blindIndex,
    phase: 'selecting',
    lastPlay: null,
  };
}

export function App() {
  const [state, setState] = useState<GameState>(() => dealInitialState(0));

  const blindTarget = BLIND_TARGETS[Math.min(state.blindIndex, BLIND_TARGETS.length - 1)];

  const toggleSelect = useCallback((id: string) => {
    setState(prev => ({
      ...prev,
      hand: prev.hand.map(c => c.id === id ? { ...c, selected: !c.selected } : c),
    }));
  }, []);

  const playHand = useCallback(() => {
    setState(prev => {
      const selected = prev.hand.filter(c => c.selected);
      if (selected.length === 0) return prev;

      const handResult = detectHand(selected);
      const play = calculateScore(handResult);
      const newScore = prev.currentScore + play.total;
      const newHandsPlayed = prev.handsPlayed + 1;

      const remaining = prev.hand.filter(c => !c.selected);
      const needed = MAX_HAND_SIZE - remaining.length;
      const drawn = prev.deck.slice(0, needed);
      const newDeck = prev.deck.slice(needed);
      const newHand = [...remaining.map(c => ({ ...c, selected: false })), ...drawn];

      const target = BLIND_TARGETS[Math.min(prev.blindIndex, BLIND_TARGETS.length - 1)];
      let phase: Phase = 'selecting';
      if (newScore >= target) phase = 'blind_cleared';
      else if (newHandsPlayed >= MAX_HANDS) phase = 'game_over';

      return {
        ...prev,
        deck: newDeck,
        hand: newHand,
        discardPile: [...prev.discardPile, ...selected],
        handsPlayed: newHandsPlayed,
        currentScore: newScore,
        lastPlay: play,
        phase,
      };
    });
  }, []);

  const discard = useCallback(() => {
    setState(prev => {
      if (prev.discardsLeft === 0) return prev;
      const selected = prev.hand.filter(c => c.selected);
      if (selected.length === 0) return prev;

      const remaining = prev.hand.filter(c => !c.selected);
      const needed = MAX_HAND_SIZE - remaining.length;
      const drawn = prev.deck.slice(0, needed);
      const newDeck = prev.deck.slice(needed);
      const newHand = [...remaining.map(c => ({ ...c, selected: false })), ...drawn];

      return {
        ...prev,
        deck: newDeck,
        hand: newHand,
        discardPile: [...prev.discardPile, ...selected],
        discardsLeft: prev.discardsLeft - 1,
        lastPlay: null,
      };
    });
  }, []);

  const nextBlind = useCallback(() => {
    setState(prev => dealInitialState(prev.blindIndex + 1));
  }, []);

  const restart = useCallback(() => {
    setState(dealInitialState(0));
  }, []);

  const selectedCount = state.hand.filter(c => c.selected).length;

  return (
    <div style={{ width: '100%', maxWidth: 600, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <h1 style={{ fontSize: 32, letterSpacing: 3, marginBottom: 20, color: '#f1c40f', textShadow: '0 2px 8px rgba(0,0,0,0.5)' }}>
        BALATRO
      </h1>

      <ScoreBoard
        currentScore={state.currentScore}
        blindTarget={blindTarget}
        handsPlayed={state.handsPlayed}
        maxHands={MAX_HANDS}
        discardsLeft={state.discardsLeft}
        lastPlay={state.lastPlay}
        blindIndex={state.blindIndex}
      />

      <Hand
        cards={state.hand}
        onToggleSelect={toggleSelect}
        maxSelected={5}
      />

      {state.phase === 'selecting' && (
        <PlayArea
          selectedCount={selectedCount}
          discardsLeft={state.discardsLeft}
          onPlayHand={playHand}
          onDiscard={discard}
          disabled={false}
        />
      )}

      {state.phase === 'blind_cleared' && (
        <div style={{
          marginTop: 24,
          textAlign: 'center',
          background: 'rgba(39, 174, 96, 0.2)',
          border: '2px solid #27ae60',
          borderRadius: 12,
          padding: '20px 32px',
        }}>
          <div style={{ fontSize: 28, fontWeight: 'bold', color: '#2ecc71', marginBottom: 8 }}>
            Blind Cleared!
          </div>
          <div style={{ opacity: 0.8, marginBottom: 16 }}>
            Score: {state.currentScore.toLocaleString()} / {blindTarget.toLocaleString()}
          </div>
          <button
            onClick={state.blindIndex + 1 < BLIND_TARGETS.length ? nextBlind : restart}
            style={{
              padding: '12px 32px',
              fontSize: 16,
              fontWeight: 'bold',
              background: 'linear-gradient(135deg, #27ae60, #1e8449)',
              color: '#fff',
              borderRadius: 8,
            }}
          >
            {state.blindIndex + 1 < BLIND_TARGETS.length ? 'Next Blind →' : 'Play Again'}
          </button>
        </div>
      )}

      {state.phase === 'game_over' && (
        <div style={{
          marginTop: 24,
          textAlign: 'center',
          background: 'rgba(192, 57, 43, 0.2)',
          border: '2px solid #c0392b',
          borderRadius: 12,
          padding: '20px 32px',
        }}>
          <div style={{ fontSize: 28, fontWeight: 'bold', color: '#e74c3c', marginBottom: 8 }}>
            Game Over
          </div>
          <div style={{ opacity: 0.8, marginBottom: 4 }}>
            Score: {state.currentScore.toLocaleString()} / {blindTarget.toLocaleString()}
          </div>
          <div style={{ opacity: 0.5, fontSize: 13, marginBottom: 16 }}>
            Reached Blind {state.blindIndex + 1}
          </div>
          <button
            onClick={restart}
            style={{
              padding: '12px 32px',
              fontSize: 16,
              fontWeight: 'bold',
              background: 'linear-gradient(135deg, #e74c3c, #c0392b)',
              color: '#fff',
              borderRadius: 8,
            }}
          >
            Play Again
          </button>
        </div>
      )}

      <div style={{ marginTop: 16, fontSize: 12, opacity: 0.35 }}>
        Select up to 5 cards · {state.deck.length} cards remaining in deck
      </div>
    </div>
  );
}
