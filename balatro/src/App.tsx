import { useState, useCallback, useEffect, useRef } from 'react';
import { GameEngine } from './game/GameEngine';
import { PlayScore } from './game/scoring';
import { BLIND_TARGETS } from './game/scoring';
import { Hand } from './components/Hand';
import { ScoreBoard } from './components/ScoreBoard';
import { PlayArea } from './components/PlayArea';
import { Celebration } from './components/Celebration';
import { ScoreOverlay, OVERLAY_DURATION_MS } from './components/ScoreOverlay';

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
    overlayTimer.current = setTimeout(() => setOverlayPlay(null), OVERLAY_DURATION_MS);
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

      <div style={{ width: '100%', maxWidth: 720, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <header style={{ textAlign: 'center', marginBottom: 20 }}>
          <h1 style={{
            fontFamily: 'var(--font-display)',
            fontSize: 40,
            fontWeight: 'normal',
            letterSpacing: 6,
            color: 'var(--paper)',
            lineHeight: 1,
          }}>
            BALATRO
          </h1>
          <div style={{
            marginTop: 8,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 10,
            color: 'var(--gilt)',
            fontSize: 12,
            letterSpacing: 4,
          }}>
            <span style={{ flex: 1, minWidth: 48, borderTop: '1px solid var(--gilt-soft)' }} />
            <span aria-hidden="true">♠ ♥ ♦ ♣</span>
            <span style={{ flex: 1, minWidth: 48, borderTop: '1px solid var(--gilt-soft)' }} />
          </div>
        </header>

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
            background: 'var(--paper)',
            color: 'var(--ink)',
            border: '1px solid var(--paper-shade)',
            borderRadius: 10,
            boxShadow: 'inset 0 0 0 4px var(--paper), inset 0 0 0 5px var(--gilt), 0 8px 24px rgba(0,0,0,0.5)',
            padding: '28px 44px',
            animation: 'popIn 0.5s cubic-bezier(0.34,1.56,0.64,1) backwards',
          }}>
            <div style={{ fontSize: 11, letterSpacing: 3, color: 'var(--lacquer)', marginBottom: 6 }}>
              BLIND {state.blindIndex + 1} SETTLED
            </div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 30, marginBottom: 6 }}>
              Blind cleared
            </div>
            <div style={{ opacity: 0.7, marginBottom: 18 }}>
              {state.currentScore.toLocaleString()} / {blindTarget.toLocaleString()}
            </div>
            <button
              onClick={hasNextBlind ? nextBlind : restart}
              style={{
                padding: '12px 36px', fontSize: 17, fontWeight: 700,
                background: 'var(--lacquer)', color: 'var(--paper)',
                borderRadius: 8, boxShadow: 'inset 0 -2px 0 rgba(0,0,0,0.25), 0 4px 14px rgba(168,50,58,0.4)',
              }}
            >
              {hasNextBlind ? 'Next blind →' : 'Play again'}
            </button>
          </div>
        )}

        {state.phase === 'game_over' && (
          <div style={{
            marginTop: 24,
            textAlign: 'center',
            background: 'var(--paper)',
            color: 'var(--ink)',
            border: '1px solid var(--paper-shade)',
            borderRadius: 10,
            boxShadow: 'inset 0 0 0 4px var(--paper), inset 0 0 0 5px var(--lacquer), 0 8px 24px rgba(0,0,0,0.5)',
            padding: '28px 44px',
            animation: 'popIn 0.5s cubic-bezier(0.34,1.56,0.64,1) backwards',
          }}>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 30, color: 'var(--lacquer)', marginBottom: 6 }}>
              Game over
            </div>
            <div style={{ opacity: 0.7, marginBottom: 4 }}>
              {state.currentScore.toLocaleString()} / {blindTarget.toLocaleString()}
            </div>
            <div style={{ opacity: 0.5, fontSize: 14, marginBottom: 18 }}>
              Reached blind {state.blindIndex + 1}
            </div>
            <button
              onClick={restart}
              style={{
                padding: '12px 36px', fontSize: 17, fontWeight: 700,
                background: 'var(--ink)', color: 'var(--paper)',
                borderRadius: 8, boxShadow: 'inset 0 -2px 0 rgba(0,0,0,0.4), 0 4px 14px rgba(0,0,0,0.4)',
              }}
            >
              Play again
            </button>
          </div>
        )}

        <div style={{ marginTop: 16, fontSize: 13, letterSpacing: 1, color: 'var(--paper)', opacity: 0.35 }}>
          Select up to 5 cards · {state.deck.length} cards remaining
        </div>
      </div>
    </>
  );
}
