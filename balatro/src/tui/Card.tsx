import { Box, Text } from 'ink';
import { Card as CardType } from '../game/cards';
import { cardLabel, suitColor } from './format';

interface Props {
  card: CardType;
  /** True when the selection cursor is currently on this card. */
  cursor: boolean;
}

/**
 * One card as a small framed cell. Selected cards get a gilt frame and lift
 * up a line; the cursor is a cyan caret beneath the card it rests on.
 */
export function Card({ card, cursor }: Props) {
  const selected = card.selected;
  return (
    <Box flexDirection="column" alignItems="center">
      <Text color="green">{selected ? '▲' : ' '}</Text>
      <Box
        borderStyle="round"
        borderColor={selected ? 'green' : cursor ? 'cyan' : 'gray'}
        paddingX={1}
      >
        <Text color={suitColor(card.suit)} bold={selected || cursor}>
          {cardLabel(card)}
        </Text>
      </Box>
      <Text color="cyan">{cursor ? '▲' : ' '}</Text>
    </Box>
  );
}
