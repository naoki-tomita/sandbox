import { Box, Text } from 'ink';
import { PlayScore } from '../game/scoring';
import { t } from '../i18n';
import { jokerEffectText } from './format';

interface Props {
  play: PlayScore;
}

/** The stamped result: hand, the chips × mult = total formula, and jokers. */
export function ScoreResult({ play }: Props) {
  return (
    <Box
      flexDirection="column"
      alignItems="center"
      borderStyle="double"
      borderColor="yellow"
      paddingX={2}
      marginTop={1}
    >
      <Text color="red">{t.scoredStamp}</Text>
      <Text bold>{t.handNames[play.handName]}</Text>

      <Box gap={1} marginTop={1}>
        <Text color="blue" bold>{play.chips.toLocaleString()}</Text>
        <Text dimColor>{t.chips}</Text>
        <Text dimColor>×</Text>
        <Text color="red" bold>{play.mult.toLocaleString()}</Text>
        <Text dimColor>{t.mult}</Text>
        <Text dimColor>=</Text>
        <Text bold>{play.total.toLocaleString()}</Text>
        <Text dimColor>{t.score}</Text>
      </Box>

      {play.jokerContributions.length > 0 && (
        <Box flexDirection="column" alignItems="center" marginTop={1}>
          {play.jokerContributions.map(c => (
            <Text key={c.jokerId} color="yellow">
              {t.jokers[c.jokerId].name} <Text color="red">{jokerEffectText(c)}</Text>
            </Text>
          ))}
        </Box>
      )}
    </Box>
  );
}
