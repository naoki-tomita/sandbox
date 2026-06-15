import { Box, Text } from 'ink';
import { JokerId } from '../game/jokers';
import { t } from '../i18n';
import { ui } from './strings';

interface Props {
  jokers: JokerId[];
}

/** Owned jokers as gilt-framed cards above the ledger, each with its effect. */
export function JokerShelf({ jokers }: Props) {
  if (jokers.length === 0) return null;

  return (
    <Box flexDirection="column" marginBottom={1}>
      <Text dimColor>{ui.jokersLabel}</Text>
      <Box gap={1} flexWrap="wrap">
        {jokers.map(id => (
          <Box key={id} flexDirection="column" borderStyle="round" borderColor="yellow" paddingX={1} width={24}>
            <Text color="yellow" bold>{t.jokers[id].name}</Text>
            <Text dimColor wrap="wrap">{t.jokers[id].description}</Text>
          </Box>
        ))}
      </Box>
    </Box>
  );
}
