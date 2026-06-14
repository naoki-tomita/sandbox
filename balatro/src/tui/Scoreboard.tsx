import { Box, Text } from 'ink';
import { t } from '../i18n';
import { progressBar } from './format';

interface Props {
  currentScore: number;
  blindTarget: number;
  handsLeft: number;
  discardsLeft: number;
  blindIndex: number;
}

/** The ledger: blind, running score vs target, and resources left. */
export function Scoreboard({ currentScore, blindTarget, handsLeft, discardsLeft, blindIndex }: Props) {
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Text color="red">{t.blindNo(blindIndex + 1)}</Text>
      <Text>
        <Text bold>{currentScore.toLocaleString()}</Text>
        <Text dimColor> {t.ofTarget(blindTarget.toLocaleString())}</Text>
      </Text>
      <Text color="yellow">{progressBar(currentScore, blindTarget)}</Text>
      <Box gap={3}>
        <Text>
          <Text dimColor>{t.handsLeft} </Text>
          <Text bold>{handsLeft}</Text>
        </Text>
        <Text>
          <Text dimColor>{t.discards} </Text>
          <Text bold>{discardsLeft}</Text>
        </Text>
      </Box>
    </Box>
  );
}
