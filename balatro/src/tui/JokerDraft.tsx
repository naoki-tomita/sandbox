import { Box, Text } from 'ink';
import { JokerId } from '../game/jokers';
import { t } from '../i18n';

interface Props {
  choices: JokerId[];
}

/** The between-blind workshop offer: three jokers to take by number, or skip. */
export function JokerDraft({ choices }: Props) {
  return (
    <Box flexDirection="column" borderStyle="round" borderColor="yellow" paddingX={2} marginTop={1}>
      <Text color="red">{t.workshopOffers}</Text>
      <Text bold>{t.takeAJoker}</Text>
      <Box gap={2} marginTop={1}>
        {choices.map((id, i) => (
          <Box key={id} flexDirection="column" borderStyle="round" borderColor="gray" paddingX={1} width={26}>
            <Text>
              <Text color="yellow" bold>{i + 1}. </Text>
              <Text bold>{t.jokers[id].name}</Text>
            </Text>
            <Text dimColor wrap="wrap">{t.jokers[id].description}</Text>
          </Box>
        ))}
      </Box>
    </Box>
  );
}
