import { useState, useCallback } from 'react';
import { GameEngine } from './game/GameEngine';
import { BLIND_TARGETS } from './game/scoring';
import { JokerId } from './game/jokers';
import { Hand } from './components/Hand';
import { ScoreBoard } from './components/ScoreBoard';
import { PlayArea } from './components/PlayArea';
import { Celebration } from './components/Celebration';
import { ScoreOverlay } from './components/ScoreOverlay';
import { JokerShelf } from './components/JokerShelf';
import { JokerDraft } from './components/JokerDraft';
import { t } from './i18n';

/** How long to wait for the card fly-off animation before resolving the play. */
const FLY_DURATION_MS = 500;

export function App() {
  const [engine, setEngine] = useState(() => new GameEngine());

  const { state } = engine;
  const isPlaying = state.phase === 'playing';
  const selectedCount = engine.selectedCards.length;

  const toggleSelect = useCallback((id: string) => {
    setEngine(e => e.toggleSelect(id));
  }, []);

  const playHand = useCallback(() => {
    setEngine(e => e.startPlay());
    setTimeout(() => setEngine(e => e.resolvePlay()), FLY_DURATION_MS);
  }, []);

  // The overlay calls this once its presentation has fully finished;
  // only then does the game decide cleared / game over / keep playing.
  const advanceAfterScore = useCallback(() => {
    setEngine(e => e.advanceAfterScore());
  }, []);

  const discard = useCallback(() => {
    setEngine(e => e.discard());
  }, []);

  const startJokerDraft = useCallback(() => {
    setEngine(e => e.startJokerDraft());
  }, []);

  const pickJoker = useCallback((id: JokerId) => {
    setEngine(e => e.pickJoker(id));
  }, []);

  const skipDraft = useCallback(() => {
    setEngine(e => e.skipDraft());
  }, []);

  const restart = useCallback(() => {
    setEngine(e => e.restart());
  }, []);

  const blindTarget = engine.blindTarget;
  const hasNextBlind = state.blindIndex + 1 < BLIND_TARGETS.length;

  return (
    <>
      {state.phase === 'blind_cleared' && <Celebration />}
      {state.phase === 'scored' && state.lastPlay && (
        <ScoreOverlay play={state.lastPlay} onComplete={advanceAfterScore} />
      )}

      <div style={{ width: '100%', maxWidth: 720, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <header style={{ textAlign: 'center', marginBottom: 20 }}>
          <h1 style={{
            fontFamily: 'var(--font-display)',
            fontSize: 'clamp(32px, 9vw, 40px)',
            fontWeight: 700,
            letterSpacing: 6,
            color: 'var(--ink)',
            lineHeight: 1,
            textShadow: '-1px -1px 1px rgba(255,255,255,0.9), 2px 2px 3px rgba(168,180,200,0.8)',
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

        <JokerShelf jokers={state.jokers} />

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

        {(state.phase === 'selecting' || state.phase === 'playing' || state.phase === 'scored') && (
          <PlayArea
            selectedCount={selectedCount}
            discardsLeft={state.discardsLeft}
            onPlayHand={playHand}
            onDiscard={discard}
            disabled={state.phase !== 'selecting'}
          />
        )}

        {state.phase === 'blind_cleared' && (
          <div style={{
            marginTop: 24,
            textAlign: 'center',
            background: 'var(--paper)',
            color: 'var(--ink)',
            border: 'none',
            borderRadius: 24,
            boxShadow: 'var(--neu-raised-lg)',
            padding: '28px clamp(24px, 8vw, 44px)',
            animation: 'popIn 0.5s cubic-bezier(0.34,1.56,0.64,1) backwards',
          }}>
            <div style={{ fontSize: 11, letterSpacing: 3, color: 'var(--lacquer)', marginBottom: 6 }}>
              {t.blindSettled(state.blindIndex + 1)}
            </div>
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 30, marginBottom: 6 }}>
              {t.blindCleared}
            </div>
            <div style={{ opacity: 0.7, marginBottom: 18 }}>
              {state.currentScore.toLocaleString()} / {blindTarget.toLocaleString()}
            </div>
            <button
              onClick={hasNextBlind ? startJokerDraft : restart}
              style={{
                padding: '12px 36px', fontSize: 17, fontWeight: 700,
                background: 'var(--lacquer)', color: '#fff',
                borderRadius: 14,
              }}
            >
              {hasNextBlind ? t.nextBlind : t.playAgain}
            </button>
          </div>
        )}

        {state.phase === 'joker_draft' && state.jokerChoices && (
          <JokerDraft choices={state.jokerChoices} onPick={pickJoker} onSkip={skipDraft} />
        )}

        {state.phase === 'game_over' && (
          <div style={{
            marginTop: 24,
            textAlign: 'center',
            background: 'var(--paper)',
            color: 'var(--ink)',
            border: 'none',
            borderRadius: 24,
            boxShadow: 'var(--neu-raised-lg)',
            padding: '28px clamp(24px, 8vw, 44px)',
            animation: 'popIn 0.5s cubic-bezier(0.34,1.56,0.64,1) backwards',
          }}>
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 30, color: 'var(--lacquer)', marginBottom: 6 }}>
              {t.gameOver}
            </div>
            <div style={{ opacity: 0.7, marginBottom: 4 }}>
              {state.currentScore.toLocaleString()} / {blindTarget.toLocaleString()}
            </div>
            <div style={{ opacity: 0.5, fontSize: 14, marginBottom: 18 }}>
              {t.reachedBlind(state.blindIndex + 1)}
            </div>
            <button
              onClick={restart}
              style={{
                padding: '12px 36px', fontSize: 17, fontWeight: 700,
                background: 'var(--ink)', color: '#fff',
                borderRadius: 14,
              }}
            >
              {t.playAgain}
            </button>
          </div>
        )}

        <div style={{ marginTop: 16, fontSize: 13, letterSpacing: 1, color: 'var(--ink)', opacity: 0.5 }}>
          {t.selectHint(state.deck.length)}
        </div>
      </div>
    </>
  );
}
