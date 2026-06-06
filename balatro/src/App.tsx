import { useState, useCallback, useEffect, useRef } from 'react';
import { Card, createDeck, shuffle } from './game/cards';
import { detectHand } from './game/hands';
import { calculateScore, PlayScore, BLIND_TARGETS } from './game/scoring';
import { Hand } from './components/Hand';
import { ScoreBoard } from './components/ScoreBoard';
import { PlayArea } from './components/PlayArea';
import { Celebration } from './components/Celebration';
import { ScoreOverlay } from './components/ScoreOverlay';

const MAX_HAND_SIZE = 8;
const MAX_HANDS = 3;
const MAX_DISCARDS = 3;
const FLY_DURATION_MS = 500;

type Phase = 'selecting' | 'playing' | 'blind_cleared' | 'game_over';

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
  dealKey: number;
}

function dealInitialState(blindIndex: number, dealKey: number): GameState {
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
    dealKey,
  };
}

export function App() {
  const [state, setState] = useState<GameState>(() => dealInitialState(0, 0));
  const [overlayPlay, setOverlayPlay] = useState<PlayScore | null>(null);
  const overlayTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const blindTarget = BLIND_TARGETS[Math.min(state.blindIndex, BLIND_TARGETS.length - 1)];

  // Show overlay for 1.6s after each hand played
  useEffect(() => {
    if (!state.lastPlay) return;
    if (overlayTimer.current) clearTimeout(overlayTimer.current);
    setOverlayPlay(state.lastPlay);
    overlayTimer.current = setTimeout(() => setOverlayPlay(null), 1800);
    return () => { if (overlayTimer.current) clearTimeout(overlayTimer.current); };
  }, [state.lastPlay]);

  const toggleSelect = useCallback((id: string) => {
    setState(prev => ({
      ...prev,
      hand: prev.hand.map(c => c.id === id ? { ...c, selected: !c.selected } : c),
    }));
  }, []);

  const playHand = useCallback(() => {
    setState(prev => {
      if (prev.phase !== 'selecting') return prev;
      if (prev.hand.filter(c => c.selected).length === 0) return prev;
      return { ...prev, phase: 'playing' };
    });

    setTimeout(() => {
      setState(prev => {
        if (prev.phase !== 'playing') return prev;

        const selected = prev.hand.filter(c => c.selected);
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
    }, FLY_DURATION_MS);
  }, []);

  const discard = useCallback(() => {
    setState(prev => {
      if (prev.discardsLeft === 0 || prev.phase !== 'selecting') return prev;
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
    setState(prev => dealInitialState(prev.blindIndex + 1, prev.dealKey + 1));
  }, []);

  const restart = useCallback(() => {
    setState(prev => dealInitialState(0, prev.dealKey + 1));
  }, []);

  const selectedCount = state.hand.filter(c => c.selected).length;
  const isPlaying = state.phase === 'playing';

  return (
    <>
      {state.phase === 'blind_cleared' && <Celebration />}
      {overlayPlay && <ScoreOverlay key={overlayPlay.total + overlayPlay.handName} play={overlayPlay} />}

      <div style={{ width: '100%', maxWidth: 600, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <h1 style={{
          fontSize: 36,
          letterSpacing: 4,
          marginBottom: 20,
          color: '#f1c40f',
          animation: 'titlePulse 3s ease-in-out infinite',
        }}>
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
          isPlaying={isPlaying}
          dealKey={state.dealKey}
        />

        {(state.phase === 'selecting' || isPlaying) && (
          <PlayArea
            selectedCount={selectedCount}
            discardsLeft={state.discardsLeft}
            onPlayHand={playHand}
            onDiscard={discard}
            disabled={isPlaying}
          />
        )}

        {state.phase === 'blind_cleared' && (
          <div style={{
            marginTop: 24,
            textAlign: 'center',
            background: 'rgba(39,174,96,0.2)',
            border: '2px solid #27ae60',
            borderRadius: 12,
            padding: '24px 40px',
            animation: 'popIn 0.5s cubic-bezier(0.34,1.56,0.64,1) backwards',
          }}>
            <div style={{ fontSize: 32, fontWeight: 'bold', color: '#2ecc71', marginBottom: 6 }}>
              Blind Cleared!
            </div>
            <div style={{ opacity: 0.8, marginBottom: 18 }}>
              {state.currentScore.toLocaleString()} / {blindTarget.toLocaleString()}
            </div>
            <button
              onClick={state.blindIndex + 1 < BLIND_TARGETS.length ? nextBlind : restart}
              style={{
                padding: '12px 36px',
                fontSize: 16,
                fontWeight: 'bold',
                background: 'linear-gradient(135deg, #27ae60, #1e8449)',
                color: '#fff',
                borderRadius: 8,
                boxShadow: '0 4px 14px rgba(39,174,96,0.5)',
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
            background: 'rgba(192,57,43,0.2)',
            border: '2px solid #c0392b',
            borderRadius: 12,
            padding: '24px 40px',
            animation: 'popIn 0.5s cubic-bezier(0.34,1.56,0.64,1) backwards',
          }}>
            <div style={{ fontSize: 32, fontWeight: 'bold', color: '#e74c3c', marginBottom: 6 }}>
              Game Over
            </div>
            <div style={{ opacity: 0.8, marginBottom: 4 }}>
              {state.currentScore.toLocaleString()} / {blindTarget.toLocaleString()}
            </div>
            <div style={{ opacity: 0.45, fontSize: 13, marginBottom: 18 }}>
              Reached Blind {state.blindIndex + 1}
            </div>
            <button
              onClick={restart}
              style={{
                padding: '12px 36px',
                fontSize: 16,
                fontWeight: 'bold',
                background: 'linear-gradient(135deg, #e74c3c, #c0392b)',
                color: '#fff',
                borderRadius: 8,
                boxShadow: '0 4px 14px rgba(192,57,43,0.5)',
              }}
            >
              Play Again
            </button>
          </div>
        )}

        <div style={{ marginTop: 16, fontSize: 12, opacity: 0.3 }}>
          Select up to 5 cards · {state.deck.length} cards remaining
        </div>
      </div>
    </>
  );
}
