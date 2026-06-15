import { Box, Text } from 'ink';
import { JokerId } from '../game/jokers';
import { t } from '../i18n';
import { ui } from './strings';

interface Props {
  jokers: JokerId[];
}

/** Owned jokers as gilt-framed chips above the ledger; hidden when empty. */
export function JokerShelf({ jokers }: Props) {
  if (jokers.length === 0) return null;

  return (
    <Box flexDirection="column" marginBottom={1}>
      <Text dimColor>{ui.jokersLabel}</Text>
      <Box gap={1} flexWrap="wrap">
        {jokers.map(id => (
          <Box key={id} borderStyle="round" borderColor="yellow" paddingX={1}>
            <Text color="yellow">{t.jokers[id].name}</Text>
          </Box>
        ))}
      </Box>
    </Box>
  );
}
