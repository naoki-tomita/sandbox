import { Box, Text } from 'ink';
import { Card as CardType } from '../game/cards';
import { cardLabel, suitColor } from './format';

interface Props {
  card: CardType;
  /** 1-based key the player presses to toggle this card. */
  index: number;
}

/**
 * One card as a small framed cell with its select key beneath it. Selected
 * cards get a gilt frame and lift up a line; the rest sit flush.
 */
export function Card({ card, index }: Props) {
  const selected = card.selected;
  return (
    <Box flexDirection="column" alignItems="center">
      <Text color="green">{selected ? '▲' : ' '}</Text>
      <Box
        borderStyle="round"
        borderColor={selected ? 'green' : 'gray'}
        paddingX={1}
      >
        <Text color={suitColor(card.suit)} bold={selected}>
          {cardLabel(card)}
        </Text>
      </Box>
      <Text dimColor>{index}</Text>
    </Box>
  );
}
