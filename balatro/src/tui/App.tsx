import { useState } from 'react';
import { Box, Text, useApp, useInput } from 'ink';
import { GameEngine } from '../game/GameEngine';
import { SortMode, sortCards } from '../game/cards';
import { BLIND_TARGETS } from '../game/scoring';
import { t } from '../i18n';
import { ui } from './strings';
import { Hand } from './Hand';
import { Scoreboard } from './Scoreboard';
import { JokerShelf } from './JokerShelf';
import { ScoreResult } from './ScoreResult';
import { JokerDraft } from './JokerDraft';

/** Mirrors GameEngine's MAX_HANDS (not exported); the web view hardcodes it too. */
const MAX_HANDS = 3;

const CONTROLS: Record<string, string> = {
  selecting: ui.selectingControls,
  playing: ui.selectingControls,
  scored: ui.scoredControls,
  blind_cleared: ui.clearedControls,
  joker_draft: ui.draftControls,
  game_over: ui.gameOverControls,
};

export function App() {
  const { exit } = useApp();
  const [engine, setEngine] = useState(() => new GameEngine());
  const [sortMode, setSortMode] = useState<SortMode>('rank');
  const { state } = engine;
  const blindTarget = engine.blindTarget;
  const sortedHand = sortCards(state.hand, sortMode);

  useInput((input, key) => {
    if (input === 'q' || key.escape || (key.ctrl && input === 'c')) {
      exit();
      return;
    }

    const digit = Number(input);
    const isDigit = Number.isInteger(digit) && input.trim() !== '';

    switch (state.phase) {
      case 'selecting':
        if (key.return) {
          setEngine(e => e.startPlay().resolvePlay());
        } else if (input === 'd') {
          setEngine(e => e.discard());
        } else if (input === 'r') {
          setSortMode('rank');
        } else if (input === 's') {
          setSortMode('suit');
        } else if (isDigit) {
          setEngine(e => {
            const card = sortCards(e.state.hand, sortMode)[digit - 1];
            return card ? e.toggleSelect(card.id) : e;
          });
        }
        return;

      case 'scored':
        if (key.return || input === ' ') setEngine(e => e.advanceAfterScore());
        return;

      case 'blind_cleared':
        if (key.return || input === ' ') {
          setEngine(e =>
            e.state.blindIndex + 1 < BLIND_TARGETS.length ? e.startJokerDraft() : e.restart(),
          );
        }
        return;

      case 'joker_draft':
        if (input === 's') {
          setEngine(e => e.skipDraft());
        } else if (isDigit) {
          setEngine(e => {
            const id = e.state.jokerChoices?.[digit - 1];
            return id ? e.pickJoker(id) : e;
          });
        }
        return;

      case 'game_over':
        if (key.return || input === ' ') setEngine(e => e.restart());
        return;
    }
  });

  const showHand = state.phase === 'selecting' || state.phase === 'scored';

  return (
    <Box flexDirection="column" padding={1}>
      <Box flexDirection="column" alignItems="center" marginBottom={1}>
        <Text bold>B A L A T R O</Text>
        <Text color="yellow">♠ ♥ ♦ ♣</Text>
      </Box>

      <JokerShelf jokers={state.jokers} />

      <Scoreboard
        currentScore={state.currentScore}
        blindTarget={blindTarget}
        handsLeft={MAX_HANDS - state.handsPlayed}
        discardsLeft={state.discardsLeft}
        blindIndex={state.blindIndex}
      />

      {showHand && <Hand cards={sortedHand} />}

      {state.phase === 'scored' && state.lastPlay && <ScoreResult play={state.lastPlay} />}

      {state.phase === 'blind_cleared' && (
        <Box flexDirection="column" alignItems="center" borderStyle="round" borderColor="yellow" paddingX={2} marginTop={1}>
          <Text color="red">{t.blindSettled(state.blindIndex + 1)}</Text>
          <Text bold>{t.blindCleared}</Text>
          <Text dimColor>{state.currentScore.toLocaleString()} / {blindTarget.toLocaleString()}</Text>
        </Box>
      )}

      {state.phase === 'joker_draft' && state.jokerChoices && (
        <JokerDraft choices={state.jokerChoices} />
      )}

      {state.phase === 'game_over' && (
        <Box flexDirection="column" alignItems="center" borderStyle="round" borderColor="red" paddingX={2} marginTop={1}>
          <Text color="red" bold>{t.gameOver}</Text>
          <Text dimColor>{state.currentScore.toLocaleString()} / {blindTarget.toLocaleString()}</Text>
          <Text dimColor>{t.reachedBlind(state.blindIndex + 1)}</Text>
        </Box>
      )}

      <Box flexDirection="column" marginTop={1}>
        {state.phase === 'selecting' && <Text dimColor>{t.selectHint(state.deck.length)}</Text>}
        <Text color="cyan">{CONTROLS[state.phase]}</Text>
      </Box>
    </Box>
  );
}
