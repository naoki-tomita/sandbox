import { useState, useCallback, useEffect, useRef } from 'react';
import { GameEngine } from './game/GameEngine';
import { PlayScore } from './game/scoring';
import { BLIND_TARGETS } from './game/scoring';
import { Hand } from './components/Hand';
import { ScoreBoard } from './components/ScoreBoard';
import { PlayArea } from './components/PlayArea';
import { Celebration } from './components/Celebration';
import { ScoreOverlay } from './components/ScoreOverlay';

/** How long to wait for the card fly-off animation before resolving the play. */
const FLY_DURATION_MS = 500;

export function App() {
  const [engine, setEngine] = useState(() => new GameEngine());
  const [overlayPlay, setOverlayPlay] = useState<PlayScore | null>(null);
  const overlayTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { state } = engine;
  const isPlaying = state.phase === 'playing';
  const selectedCount = engine.selectedCards.length;

  // Show score overlay briefly after each hand
  useEffect(() => {
    if (!state.lastPlay) return;
    if (overlayTimer.current) clearTimeout(overlayTimer.current);
    setOverlayPlay(state.lastPlay);
    overlayTimer.current = setTimeout(() => setOverlayPlay(null), 1800);
    return () => { if (overlayTimer.current) clearTimeout(overlayTimer.current); };
  }, [state.lastPlay]);

  const toggleSelect = useCallback((id: string) => {
    setEngine(e => e.toggleSelect(id));
  }, []);

  const playHand = useCallback(() => {
    setEngine(e => e.startPlay());
    setTimeout(() => setEngine(e => e.resolvePlay()), FLY_DURATION_MS);
  }, []);

  const discard = useCallback(() => {
    setEngine(e => e.discard());
  }, []);

  const nextBlind = useCallback(() => {
    setEngine(e => e.nextBlind());
  }, []);

  const restart = useCallback(() => {
    setEngine(e => e.restart());
  }, []);

  const blindTarget = engine.blindTarget;
  const hasNextBlind = state.blindIndex + 1 < BLIND_TARGETS.length;

  return (
    <>
      {state.phase === 'blind_cleared' && <Celebration />}
      {overlayPlay && (
        <ScoreOverlay key={overlayPlay.handName + overlayPlay.total} play={overlayPlay} />
      )}

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
          maxHands={3}
          discardsLeft={state.discardsLeft}
          lastPlay={state.lastPlay}
          blindIndex={state.blindIndex}
        />

        <Hand
          cards={state.hand}
          onToggleSelect={toggleSelect}
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
              onClick={hasNextBlind ? nextBlind : restart}
              style={{
                padding: '12px 36px', fontSize: 16, fontWeight: 'bold',
                background: 'linear-gradient(135deg, #27ae60, #1e8449)',
                color: '#fff', borderRadius: 8, boxShadow: '0 4px 14px rgba(39,174,96,0.5)',
              }}
            >
              {hasNextBlind ? 'Next Blind →' : 'Play Again'}
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
                padding: '12px 36px', fontSize: 16, fontWeight: 'bold',
                background: 'linear-gradient(135deg, #e74c3c, #c0392b)',
                color: '#fff', borderRadius: 8, boxShadow: '0 4px 14px rgba(192,57,43,0.5)',
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
